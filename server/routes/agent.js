const router = require('express').Router();
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { generateLLMResponse, streamLLMResponse } = require('../utils/llmProviders');

const JWT_SECRET = process.env.JWT_SECRET || 'shaheen_school_jwt_secret_key_2026_secure';
const AGENT_BACKEND_URL = process.env.AGENT_BACKEND_URL || 'http://127.0.0.1:8000';

// ── In-Memory Knowledge Base Chunks (Synchronized with Python Knowledge Catalog) ──
const KNOWLEDGE_CHUNKS = [
    {
        id: 'academic.priority',
        module: 'academic.classes',
        minRoleLevel: 50,
        title: 'Priority Setting Workflow',
        content: "To set display order of classes and sections, navigate to Academic -> Priority Setting (/academic/priority). Drag classes to order from lowest (Reception/Nursery) to highest (Class 10), expand classes to reorder sections, and click Save Priority Order."
    },
    {
        id: 'academic.classes',
        module: 'academic.classes',
        minRoleLevel: 50,
        title: 'Managing Classes & Sections',
        content: "Navigate to Academic -> Classes (/academic/classes) to add classes or configure section capacities and assign designated Class Incharges."
    },
    {
        id: 'attendance.students',
        module: 'attendance.students',
        minRoleLevel: 50,
        title: 'Student Attendance Marking',
        content: "Navigate to Attendance -> Student Attendance (/attendance/students). Select Date, Class, Section. By default students are Present; toggle badges for Absent/Leave and click Save Attendance."
    },
    {
        id: 'fees.generate',
        module: 'fees.generate',
        minRoleLevel: 30,
        title: 'Monthly Fee Slips Generation',
        content: "Navigate to Fees -> Generate Slips (/fee-slips). Select Academic Year, Month, and Classes to generate monthly billing vouchers with past arrears."
    },
    {
        id: 'fees.collect',
        module: 'fees.collect',
        minRoleLevel: 30,
        title: 'Fee Payment Collection',
        content: "Navigate to Fees -> Collect Fee (/fees/collect). Search student by Admission No or Family ID, enter received amount, select payment method, and print 3-part bank voucher."
    },
    {
        id: 'exams.test-marking',
        module: 'academic.examination.test-marking',
        minRoleLevel: 50,
        title: 'Test Papers & Marks Entry',
        content: "Navigate to Exams -> Test Papers (/exams/test-papers) to create tests, enter student marks, lock marksheets, and submit for Coordinator/Principal approval."
    },
    {
        id: 'hrm.employees',
        module: 'hrm.employees',
        minRoleLevel: 65,
        title: 'HRM Staff Registration & Payroll',
        content: "Navigate to HRM (/hrm) to register employees, assign departments, designations, basic pay, and link to portal login accounts."
    },
    {
        id: 'settings.roles',
        module: 'settings.roles',
        minRoleLevel: 90,
        title: 'Dynamic Roles & RBAC Matrix',
        content: "Navigate to Settings -> Roles (/settings/roles) to create custom roles, clone existing roles, and dynamically toggle Read/Write/Delete permissions for any module."
    }
];

// Helper: Fetch Dynamic Permissions from PostgreSQL
async function fetchUserPermissions(userId) {
    const userRes = await pool.query(`
        SELECT 
            u.id, u.username, u.full_name, u.email, u.is_active, u.role_id,
            COALESCE(r.role_name, 'Unknown') AS role_name,
            COALESCE(r.role_level, 0) AS role_level,
            COALESCE(r.dashboard_access, 'student') AS dashboard_access
        FROM app_users u
        LEFT JOIN app_roles r ON u.role_id = r.id
        WHERE u.id = $1
    `, [userId]);

    if (userRes.rows.length === 0) return null;
    const user = userRes.rows[0];

    const rolePermsRes = await pool.query(`
        SELECT module_name, can_read, can_write, can_delete 
        FROM role_permissions 
        WHERE role_id = $1
    `, [user.role_id]);

    const directPermsRes = await pool.query(`
        SELECT module_name, can_read, can_write, can_delete 
        FROM user_direct_permissions 
        WHERE user_id = $1
    `, [userId]).catch(() => ({ rows: [] }));

    const effective = {};
    rolePermsRes.rows.forEach(r => {
        if (r.module_name) effective[r.module_name.trim()] = { can_read: !!r.can_read, can_write: !!r.can_write, can_delete: !!r.can_delete };
    });
    directPermsRes.rows.forEach(r => {
        if (r.module_name) effective[r.module_name.trim()] = { can_read: !!r.can_read, can_write: !!r.can_write, can_delete: !!r.can_delete };
    });

    const allowedModules = Object.keys(effective).filter(m => effective[m].can_read);
    const isSuperAdmin = user.role_level >= 90;

    return {
        ...user,
        is_super_admin: isSuperAdmin,
        effective_permissions: effective,
        allowed_modules: allowedModules
    };
}

// Helper: Check Module Access
function checkModuleAccess(userCtx, requiredModule) {
    if (!userCtx || !userCtx.is_active) return false;
    if (userCtx.is_super_admin) return true;
    if (!requiredModule || ['public', 'general', 'dashboard'].includes(requiredModule)) return true;

    const allowed = new Set(userCtx.allowed_modules || []);
    if (allowed.has(requiredModule)) return true;

    const parts = requiredModule.split('.');
    for (let i = 1; i < parts.length; i++) {
        const parent = parts.slice(0, i).join('.');
        if (allowed.has(parent)) return true;
    }
    return false;
}

// Helper: Detect Injection
function detectInjection(msg) {
    const patterns = [
        /ignore\s+(all\s+)?(previous|prior)\s+instructions/i,
        /you\s+are\s+now\s+(an?\s+)?admin/i,
        /pretend\s+(you\s+are|to\s+be)/i,
        /bypass\s+(rbac|security|permissions)/i,
        /reveal\s+(your\s+)?(system\s+prompt|instructions)/i,
        /dump\s+(the\s+)?database/i,
        /select\s+\*\s+from/i,
        /show\s+me\s+all\s+(passwords|hashes|tokens|secret)/i
    ];
    return patterns.some(p => p.test(msg));
}

// Helper: Detect Topic & Sub-module
function detectRequestedModule(msg) {
    const lower = msg.toLowerCase();
    const map = {
        'settings.roles': ['roles', 'role management', 'permissions', 'clone role'],
        'settings.users': ['user management', 'app users', 'create user', 'reset password'],
        'settings.system': ['system settings', 'database backup', 'restore backup'],
        'hrm.employees': ['salary', 'salaries', 'payroll', 'employee list', 'designation', 'basic pay'],
        'hrm.departments': ['department', 'departments'],
        'fees.generate': ['generate fee', 'generate slips', 'monthly fee slips', 'fee generation'],
        'fees.collect': ['collect fee', 'fee collection', 'receive payment', 'challan payment', 'family balance'],
        'academic.examination.test-marking': ['test marks', 'enter marks', 'mark entry', 'test paper', 'test papers'],
        'academic.result-card': ['result card', 'result cards', 'marks sheet', 'marksheet'],
        'academic.classes': ['priority setting', 'priority', 'reorder classes', 'classes', 'sections'],
        'attendance.students': ['student attendance', 'mark attendance', 'daily attendance'],
        'attendance.staff': ['staff attendance', 'teacher attendance']
    };

    for (const [mod, words] of Object.entries(map)) {
        for (const w of words) {
            const reg = new RegExp(`\\b${w}\\b`, 'i');
            if (reg.test(lower)) return mod;
        }
    }
    return 'general';
}

// Helper: Log Denial to role_audit_log
async function logAuditDenial(userId, roleName, roleLevel, reqMod, msg, reason) {
    try {
        await pool.query(`
            INSERT INTO role_audit_log (performed_by, action, details, ip_address, created_at)
            VALUES ($1, 'AGENT_ACCESS_DENIED', $2, '127.0.0.1', NOW())
        `, [
            userId,
            JSON.stringify({
                user_id: userId,
                role_name: roleName,
                role_level: roleLevel,
                requested_module: reqMod,
                user_message: msg.slice(0, 200),
                refusal_reason: reason,
                timestamp: new Date().toISOString()
            })
        ]);
    } catch (e) {
        console.error('[AUDIT LOG ERROR]:', e.message);
    }
}

// ── Main Route: POST /agent/chat ──
router.post('/chat', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'Unauthorized: Missing Authorization header' });
        }

        const token = authHeader.replace('Bearer ', '').trim();
        let decoded;
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (jwtErr) {
            return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
        }

        const { message, history } = req.body;
        if (!message || typeof message !== 'string' || !message.trim()) {
            return res.status(400).json({ error: 'Message is required' });
        }
        const cleanMsg = message.trim();

        // ── 1. Attempt Python Agent Service first (if configured and running) ──
        if (AGENT_BACKEND_URL) {
            try {
                const pyRes = await fetch(`${AGENT_BACKEND_URL}/api/chat`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ message: cleanMsg, history: Array.isArray(history) ? history : [] }),
                    signal: AbortSignal.timeout(6000)
                });
                if (pyRes.ok) {
                    const data = await pyRes.json();
                    return res.json(data);
                }
            } catch (pyErr) {
                // Python service offline -> continue seamlessly to Native Express LLM Execution
            }
        }

        // ── 2. Native Express LLM Execution (Zero-dependency for Render) ──
        const userId = decoded.id;
        const userCtx = await fetchUserPermissions(userId);
        if (!userCtx || !userCtx.is_active) {
            return res.status(403).json({
                response: '🔒 Your user account is inactive or disabled. Please contact the administrator.',
                access_granted: false,
                role_name: userCtx?.role_name || 'Unknown',
                user_id: userId
            });
        }

        // Check Isaac AI Agent Access Permission (Higher roles >= 80 default, < 80 requires support.agent permission)
        const isHigherRole = (userCtx.role_level || 0) >= 80;
        const hasAgentAccess = isHigherRole || (
            userCtx.effective_permissions && (
                userCtx.effective_permissions['support.agent']?.can_read ||
                userCtx.effective_permissions['ai.support']?.can_read ||
                userCtx.effective_permissions['support_agent']?.can_read
            )
        );

        if (!hasAgentAccess) {
            await logAuditDenial(userId, userCtx.role_name, userCtx.role_level, 'support.agent', cleanMsg, `Role '${userCtx.role_name}' lacks support.agent permission`);
            return res.status(403).json({
                response: `🔒 Access Restricted: Isaac AI has not been enabled for your role (${userCtx.role_name}). Please contact your School Administrator to grant you Isaac AI access in Roles & Permissions.`,
                access_granted: false,
                requested_module: 'support.agent',
                role_name: userCtx.role_name,
                user_id: userId
            });
        }

        // Check Prompt Injection
        if (detectInjection(cleanMsg)) {
            await logAuditDenial(userId, userCtx.role_name, userCtx.role_level, 'security_violation', cleanMsg, 'Prompt injection pattern detected');
            return res.json({
                response: '⚠️ Request Denied: Your input contains unauthorized instructions or security violation patterns. All queries are audited according to School IT Policy.',
                access_granted: false,
                requested_module: 'security_violation',
                role_name: userCtx.role_name,
                user_id: userId
            });
        }

        const lower = cleanMsg.toLowerCase();

        // ── 3. Check Live DB Tool Intents ──
        // (A) My Classes
        if (lower.includes('which class') || lower.includes('my class') || lower.includes('what class do i teach') || lower.includes('incharge')) {
            const empRes = await pool.query('SELECT employee_id, first_name, last_name, designation FROM employees WHERE app_user_id = $1', [userId]);
            if (empRes.rows.length > 0) {
                const emp = empRes.rows[0];
                const classesRes = await pool.query(`
                    SELECT c.class_name, sec.section_name, tca.is_class_teacher
                    FROM teacher_class_assignment tca
                    JOIN classes c ON tca.class_id = c.class_id
                    JOIN sections sec ON tca.section_id = sec.section_id
                    WHERE tca.employee_id = $1
                    ORDER BY c.class_name, sec.section_name
                `, [emp.employee_id]);

                const assigned = classesRes.rows.map(r => `${r.class_name} - Section ${r.section_name}`);
                const incharge = classesRes.rows.filter(r => r.is_class_teacher).map(r => `${r.class_name} - Section ${r.section_name}`);

                let text = `Hello ${emp.first_name} ${emp.last_name} (${emp.designation || userCtx.role_name}),\n\n`;
                text += `Here are your live class teaching assignments from the school database:\n\n`;
                text += `📋 **Total Assigned Classes:** ${assigned.length}\n\n`;
                if (assigned.length > 0) text += `**Assigned Classes & Sections:**\n` + assigned.map(c => `• ${c}`).join('\n') + `\n\n`;
                if (incharge.length > 0) text += `⭐ **Designated Class Incharge:**\n` + incharge.map(c => `• ${c} *(Daily attendance & marksheet privileges active)*`).join('\n') + `\n`;
                else text += `ℹ️ *You are currently not designated as a Class Incharge for any section.*\n`;

                return res.json({ response: text, access_granted: true, requested_module: 'my_classes', role_name: userCtx.role_name, user_id: userId });
            }
        }

        // (B) My Notifications
        if (lower.includes('notification') || lower.includes('alerts') || lower.includes('what do my notifications mean')) {
            const roleTags = userCtx.role_level >= 90 ? ['admin', 'principal'] : ['staff', 'teacher'];
            const notifsRes = await pool.query(`
                SELECT title, message, created_at FROM notifications 
                WHERE user_id = $1 OR LOWER(role) = ANY($2)
                ORDER BY created_at DESC LIMIT 5
            `, [userId, roleTags]);

            let text = `Hello ${userCtx.full_name || userCtx.username},\n\nHere are your latest role-scoped notifications from the system:\n\n`;
            if (notifsRes.rows.length === 0) {
                text += '✅ You currently have no unread notifications or announcements.';
            } else {
                notifsRes.rows.forEach((n, i) => {
                    text += `**${i + 1}. ✔️ ${n.title}**\n${n.message}\n\n`;
                });
            }
            return res.json({ response: text, access_granted: true, requested_module: 'my_notifications', role_name: userCtx.role_name, user_id: userId });
        }

        // (C) My Permissions
        if (lower.includes('which pages can i access') || lower.includes('my permissions') || lower.includes('what can i access')) {
            let text = `Hello ${userCtx.full_name || userCtx.username},\n\nHere is your active permissions matrix from PostgreSQL:\n\n`;
            text += `• **Assigned Role:** ${userCtx.role_name} (Level ${userCtx.role_level})\n`;
            text += `• **Total Accessible Modules:** ${userCtx.is_super_admin ? 'Full System' : userCtx.allowed_modules.length}\n\n`;
            text += `**Permitted Modules:**\n`;
            if (userCtx.is_super_admin) {
                text += `• All system modules (Full Administrative & Executive Access)\n`;
            } else {
                userCtx.allowed_modules.slice(0, 15).forEach(m => { text += `• \`${m}\`\n`; });
                if (userCtx.allowed_modules.length > 15) text += `• ... and ${userCtx.allowed_modules.length - 15} additional sub-modules.\n`;
            }
            return res.json({ response: text, access_granted: true, requested_module: 'my_permissions', role_name: userCtx.role_name, user_id: userId });
        }

        // (D) Academic Session
        if (lower.includes('academic year') || lower.includes('academic session') || lower.includes('which term')) {
            const yrRes = await pool.query('SELECT year_name, start_date, end_date FROM academic_years WHERE is_active = true LIMIT 1');
            const yr = yrRes.rows[0];
            let text = `📅 **Active Academic Session:** ${yr ? yr.year_name : '2026-2027'}\n`;
            if (yr && yr.start_date) text += `*Duration:* ${yr.start_date} to ${yr.end_date}\n\n`;
            text += `**Configured Terms:**\n• First Term\n• Second Term\n• Final Term\n`;
            return res.json({ response: text, access_granted: true, requested_module: 'academic_session', role_name: userCtx.role_name, user_id: userId });
        }

        // (E) School Stats (role_level >= 75 only)
        if (lower.includes('how many students') || lower.includes('school stats') || lower.includes('overview stats')) {
            if (userCtx.role_level < 75) {
                return res.json({
                    response: `🔒 Access Restricted: You don't have permission to access school-wide operational statistics with your current role (${userCtx.role_name}).`,
                    access_granted: false,
                    requested_module: 'school_stats',
                    role_name: userCtx.role_name,
                    user_id: userId
                });
            }
            const stuCount = await pool.query("SELECT COUNT(*) FROM students WHERE status = 'Active' OR status IS NULL");
            const empCount = await pool.query("SELECT COUNT(*) FROM employees WHERE status = 'Active' OR status IS NULL");
            const clsCount = await pool.query("SELECT COUNT(*) FROM classes");
            const secCount = await pool.query("SELECT COUNT(*) FROM sections");

            const text = `📊 **School Operational Directory Summary:**\n\n` +
                `• **Active Enrolled Students:** ${Number(stuCount.rows[0].count).toLocaleString()}\n` +
                `• **Active Teaching & Admin Staff:** ${Number(empCount.rows[0].count).toLocaleString()}\n` +
                `• **Total Academic Classes:** ${clsCount.rows[0].count}\n` +
                `• **Total Active Sections:** ${secCount.rows[0].count}\n`;
            return res.json({ response: text, access_granted: true, requested_module: 'school_stats', role_name: userCtx.role_name, user_id: userId });
        }

        // ── 4. Deterministic RBAC Check on General Module Intent ──
        const reqModule = detectRequestedModule(cleanMsg);
        const hasAccess = checkModuleAccess(userCtx, reqModule);

        if (!hasAccess) {
            await logAuditDenial(userId, userCtx.role_name, userCtx.role_level, reqModule, cleanMsg, `Role '${userCtx.role_name}' lacks read permission for module '${reqModule}'`);
            return res.json({
                response: `🔒 Access Restricted: You don't have permission to access the **${reqModule.replace('.', ' > ')}** module with your current role (${userCtx.role_name}).\n\nIf you require access to this feature for your duties, please contact your School Administrator to update your role permissions.`,
                access_granted: false,
                requested_module: reqModule,
                role_name: userCtx.role_name,
                user_id: userId
            });
        }

        // ── 5. Retrieve Permitted Knowledge Chunks ──
        const permittedChunks = KNOWLEDGE_CHUNKS.filter(c => checkModuleAccess(userCtx, c.module));
        const matchedChunks = permittedChunks.filter(c => {
            const queryWords = cleanMsg.toLowerCase().split(/\s+/).filter(w => w.length > 2);
            const content = (c.title + ' ' + c.content).toLowerCase();
            return queryWords.some(w => content.includes(w));
        });
        const finalChunks = matchedChunks.length > 0 ? matchedChunks.slice(0, 3) : permittedChunks.slice(0, 2);

        // ── 6. LLM Completion via Configured Provider in system_settings ──
        const llmSettingsRes = await pool.query(`
            SELECT setting_key, setting_value 
            FROM system_settings 
            WHERE setting_key IN ('llm_provider', 'llm_api_key', 'llm_model', 'llm_temperature', 'llm_base_url', 'llm_is_enabled')
        `);
        const llmConfig = {};
        llmSettingsRes.rows.forEach(r => { llmConfig[r.setting_key] = r.setting_value; });

        const isLLMEnabled = llmConfig.llm_is_enabled === 'true';
        const apiKey = llmConfig.llm_api_key;

        if (isLLMEnabled && apiKey && apiKey.trim() !== '') {
            try {
                const systemPrompt = `You are the official Role-Aware AI Support Assistant for the School Management System.
You are assisting user "${userCtx.full_name || userCtx.username}" whose active role is "${userCtx.role_name}" (Level ${userCtx.role_level}).
STRICT RULES:
1. Only provide instructions, workflows, and assistance permitted by the user's role and the following permitted context.
2. NEVER mention or leak passwords, password hashes, secrets, or financial data outside their role.
3. Be professional, concise, polite, and structure your answer with clear bullet points.

PERMITTED CONTEXT:
${finalChunks.map(c => `[${c.title}]: ${c.content}`).join('\n\n')}`;

                const llmResult = await generateLLMResponse({
                    provider: llmConfig.llm_provider || 'gemini',
                    apiKey: apiKey.trim(),
                    model: llmConfig.llm_model,
                    customBaseUrl: llmConfig.llm_base_url,
                    temperature: Number(llmConfig.llm_temperature) || 0.3,
                    systemPrompt,
                    userMessage: cleanMsg,
                    conversationHistory: Array.isArray(history) ? history : []
                });

                return res.json({
                    response: llmResult.text,
                    access_granted: true,
                    requested_module: reqModule,
                    role_name: userCtx.role_name,
                    user_id: userId,
                    llm_used: `${llmResult.provider} (${llmResult.model})`
                });

            } catch (llmErr) {
                console.error('[NATIVE LLM CALL FAILED]:', llmErr.message);
                // Fallback gracefully to deterministic structured response
            }
        }

        // ── 7. Deterministic Structured Fallback (When LLM is disabled or key not added) ──
        let fallbackText = `Hello ${userCtx.full_name || userCtx.username} (${userCtx.role_name}),\n\n`;
        fallbackText += `Here is the verified guidance for your query:\n\n`;
        finalChunks.forEach(c => {
            fallbackText += `### ${c.title}\n${c.content}\n\n`;
        });
        fallbackText += `If you need step-by-step assistance with another feature, let me know!`;

        return res.json({
            response: fallbackText,
            access_granted: true,
            requested_module: reqModule,
            role_name: userCtx.role_name,
            user_id: userId
        });

    } catch (err) {
        console.error('[AGENT CHAT FATAL ERROR]:', err);
        return res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
});

// ── SSE Streaming Route: POST /agent/chat/stream ──
router.post('/chat/stream', async (req, res) => {
    // 1. Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sendEvent = (obj) => {
        res.write(`data: ${JSON.stringify(obj)}\n\n`);
    };

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            sendEvent({ error: 'Unauthorized: Missing Authorization header', done: true });
            return res.end();
        }

        const token = authHeader.replace('Bearer ', '').trim();
        let decoded;
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (jwtErr) {
            sendEvent({ error: 'Unauthorized: Invalid or expired token', done: true });
            return res.end();
        }

        const { message, history } = req.body;
        if (!message || typeof message !== 'string' || !message.trim()) {
            sendEvent({ error: 'Message is required', done: true });
            return res.end();
        }
        const cleanMsg = message.trim();
        const userId = decoded.id;
        const userCtx = await fetchUserPermissions(userId);

        if (!userCtx || !userCtx.is_active) {
            sendEvent({
                chunk: '🔒 Your user account is inactive or disabled. Please contact the administrator.',
                access_granted: false,
                isRefusal: true,
                done: true
            });
            return res.end();
        }

        // Check Isaac AI Agent Access Permission (Higher roles >= 80 default, < 80 requires support.agent permission)
        const isHigherRole = (userCtx.role_level || 0) >= 80;
        const hasAgentAccess = isHigherRole || (
            userCtx.effective_permissions && (
                userCtx.effective_permissions['support.agent']?.can_read ||
                userCtx.effective_permissions['ai.support']?.can_read ||
                userCtx.effective_permissions['support_agent']?.can_read
            )
        );

        if (!hasAgentAccess) {
            await logAuditDenial(userId, userCtx.role_name, userCtx.role_level, 'support.agent', cleanMsg, `Role '${userCtx.role_name}' lacks support.agent permission`);
            sendEvent({
                chunk: `🔒 Access Restricted: Isaac AI has not been enabled for your role (${userCtx.role_name}). Please contact your School Administrator to grant you Isaac AI access in Roles & Permissions.`,
                access_granted: false,
                isRefusal: true,
                done: true
            });
            return res.end();
        }

        // Check Prompt Injection
        if (detectInjection(cleanMsg)) {
            await logAuditDenial(userId, userCtx.role_name, userCtx.role_level, 'security_violation', cleanMsg, 'Prompt injection pattern detected');
            sendEvent({
                chunk: '⚠️ Request Denied: Your input contains unauthorized instructions or security violation patterns. All queries are audited according to School IT Policy.',
                access_granted: false,
                isRefusal: true,
                done: true
            });
            return res.end();
        }

        const lower = cleanMsg.toLowerCase();

        // Helper to stream text smoothly in word bursts with short delays
        const streamStaticText = async (text, meta = {}) => {
            const words = text.split(/(\s+)/);
            for (let i = 0; i < words.length; i += 4) {
                const slice = words.slice(i, i + 4).join('');
                sendEvent({ chunk: slice, access_granted: true, ...meta });
                await new Promise(r => setTimeout(r, 12));
            }
            sendEvent({ done: true, access_granted: true, ...meta });
            res.end();
        };

        // Live DB Tool Intents
        // (A) My Classes
        if (lower.includes('which class') || lower.includes('my class') || lower.includes('what class do i teach') || lower.includes('incharge')) {
            const empRes = await pool.query('SELECT employee_id, first_name, last_name, designation FROM employees WHERE app_user_id = $1', [userId]);
            if (empRes.rows.length > 0) {
                const emp = empRes.rows[0];
                const classesRes = await pool.query(`
                    SELECT c.class_name, sec.section_name, tca.is_class_teacher
                    FROM teacher_class_assignment tca
                    JOIN classes c ON tca.class_id = c.class_id
                    JOIN sections sec ON tca.section_id = sec.section_id
                    WHERE tca.employee_id = $1
                    ORDER BY c.class_name, sec.section_name
                `, [emp.employee_id]);

                const assigned = classesRes.rows.map(r => `${r.class_name} - Section ${r.section_name}`);
                const incharge = classesRes.rows.filter(r => r.is_class_teacher).map(r => `${r.class_name} - Section ${r.section_name}`);

                let text = `Hello **${emp.first_name} ${emp.last_name}** (${emp.designation || userCtx.role_name}),\n\n`;
                text += `Here are your live class teaching assignments from the school database:\n\n`;
                text += `📋 **Total Assigned Classes:** ${assigned.length}\n\n`;
                if (assigned.length > 0) text += `**Assigned Classes & Sections:**\n` + assigned.map(c => `• ${c}`).join('\n') + `\n\n`;
                if (incharge.length > 0) text += `⭐ **Designated Class Incharge:**\n` + incharge.map(c => `• ${c} *(Daily attendance & marksheet privileges active)*`).join('\n') + `\n`;
                else text += `ℹ️ *You are currently not designated as a Class Incharge for any section.*\n`;

                return streamStaticText(text, { requested_module: 'my_classes', role_name: userCtx.role_name });
            }
        }

        // (B) My Notifications
        if (lower.includes('notification') || lower.includes('alerts') || lower.includes('what do my notifications mean')) {
            const roleTags = userCtx.role_level >= 90 ? ['admin', 'principal'] : ['staff', 'teacher'];
            const notifsRes = await pool.query(`
                SELECT title, message, created_at FROM notifications 
                WHERE user_id = $1 OR LOWER(role) = ANY($2)
                ORDER BY created_at DESC LIMIT 5
            `, [userId, roleTags]);

            let text = `Hello **${userCtx.full_name || userCtx.username}**,\n\nHere are your latest role-scoped notifications from the system:\n\n`;
            if (notifsRes.rows.length === 0) {
                text += '✅ You currently have no unread notifications or announcements.';
            } else {
                notifsRes.rows.forEach((n, i) => {
                    text += `**${i + 1}. ✔️ ${n.title}**\n${n.message}\n\n`;
                });
            }
            return streamStaticText(text, { requested_module: 'my_notifications', role_name: userCtx.role_name });
        }

        // (C) My Permissions
        if (lower.includes('which pages can i access') || lower.includes('my permissions') || lower.includes('what can i access')) {
            let text = `Hello **${userCtx.full_name || userCtx.username}**,\n\nHere is your active permissions matrix from PostgreSQL:\n\n`;
            text += `• **Assigned Role:** ${userCtx.role_name} (Level ${userCtx.role_level})\n`;
            text += `• **Total Accessible Modules:** ${userCtx.is_super_admin ? 'Full System' : userCtx.allowed_modules.length}\n\n`;
            text += `**Permitted Modules:**\n`;
            if (userCtx.is_super_admin) {
                text += `• All system modules (Full Administrative & Executive Access)\n`;
            } else {
                userCtx.allowed_modules.slice(0, 15).forEach(m => { text += `• \`${m}\`\n`; });
                if (userCtx.allowed_modules.length > 15) text += `• ... and ${userCtx.allowed_modules.length - 15} additional sub-modules.\n`;
            }
            return streamStaticText(text, { requested_module: 'my_permissions', role_name: userCtx.role_name });
        }

        // (D) Academic Session
        if (lower.includes('academic year') || lower.includes('academic session') || lower.includes('which term')) {
            const yrRes = await pool.query('SELECT year_name, start_date, end_date FROM academic_years WHERE is_active = true LIMIT 1');
            const yr = yrRes.rows[0];
            let text = `📅 **Active Academic Session:** ${yr ? yr.year_name : '2026-2027'}\n`;
            if (yr && yr.start_date) text += `*Duration:* ${yr.start_date} to ${yr.end_date}\n\n`;
            text += `**Configured Terms:**\n• First Term\n• Second Term\n• Final Term\n`;
            return streamStaticText(text, { requested_module: 'academic_session', role_name: userCtx.role_name });
        }

        // (E) School Stats
        if (lower.includes('how many students') || lower.includes('school stats') || lower.includes('overview stats')) {
            if (userCtx.role_level < 75) {
                sendEvent({
                    chunk: `🔒 Access Restricted: You don't have permission to access school-wide operational statistics with your current role (${userCtx.role_name}).`,
                    access_granted: false,
                    isRefusal: true,
                    done: true
                });
                return res.end();
            }
            const stuCount = await pool.query("SELECT COUNT(*) FROM students WHERE status = 'Active' OR status IS NULL");
            const empCount = await pool.query("SELECT COUNT(*) FROM employees WHERE status = 'Active' OR status IS NULL");
            const clsCount = await pool.query("SELECT COUNT(*) FROM classes");
            const secCount = await pool.query("SELECT COUNT(*) FROM sections");

            const text = `📊 **School Operational Directory Summary:**\n\n` +
                `• **Active Enrolled Students:** ${Number(stuCount.rows[0].count).toLocaleString()}\n` +
                `• **Active Teaching & Admin Staff:** ${Number(empCount.rows[0].count).toLocaleString()}\n` +
                `• **Total Academic Classes:** ${clsCount.rows[0].count}\n` +
                `• **Total Active Sections:** ${secCount.rows[0].count}\n`;
            return streamStaticText(text, { requested_module: 'school_stats', role_name: userCtx.role_name });
        }

        // RBAC Module Access Check
        const reqModule = detectRequestedModule(cleanMsg);
        const hasAccess = checkModuleAccess(userCtx, reqModule);

        if (!hasAccess) {
            await logAuditDenial(userId, userCtx.role_name, userCtx.role_level, reqModule, cleanMsg, `Role '${userCtx.role_name}' lacks read permission for module '${reqModule}'`);
            sendEvent({
                chunk: `🔒 Access Restricted: You don't have permission to access the **${reqModule.replace('.', ' > ')}** module with your current role (${userCtx.role_name}).\n\nIf you require access to this feature for your duties, please contact your School Administrator to update your role permissions.`,
                access_granted: false,
                isRefusal: true,
                done: true
            });
            return res.end();
        }

        // Retrieve Permitted Knowledge Chunks
        const permittedChunks = KNOWLEDGE_CHUNKS.filter(c => checkModuleAccess(userCtx, c.module));
        const matchedChunks = permittedChunks.filter(c => {
            const queryWords = cleanMsg.toLowerCase().split(/\s+/).filter(w => w.length > 2);
            const content = (c.title + ' ' + c.content).toLowerCase();
            return queryWords.some(w => content.includes(w));
        });
        const finalChunks = matchedChunks.length > 0 ? matchedChunks.slice(0, 3) : permittedChunks.slice(0, 2);

        // Fetch LLM Settings
        const llmSettingsRes = await pool.query(`
            SELECT setting_key, setting_value 
            FROM system_settings 
            WHERE setting_key IN ('llm_provider', 'llm_api_key', 'llm_model', 'llm_temperature', 'llm_base_url', 'llm_is_enabled')
        `);
        const llmConfig = {};
        llmSettingsRes.rows.forEach(r => { llmConfig[r.setting_key] = r.setting_value; });

        const isLLMEnabled = llmConfig.llm_is_enabled === 'true';
        const apiKey = llmConfig.llm_api_key;

        if (isLLMEnabled && apiKey && apiKey.trim() !== '') {
            try {
                const systemPrompt = `You are the official Role-Aware AI Support Assistant for the School Management System.
You are assisting user "${userCtx.full_name || userCtx.username}" whose active role is "${userCtx.role_name}" (Level ${userCtx.role_level}).
STRICT RULES:
1. Only provide instructions, workflows, and assistance permitted by the user's role and the following permitted context.
2. NEVER mention or leak passwords, password hashes, secrets, or financial data outside their role.
3. Be professional, concise, polite, and structure your answer with clear bullet points.

PERMITTED CONTEXT:
${finalChunks.map(c => `[${c.title}]: ${c.content}`).join('\n\n')}`;

                for await (const chunk of streamLLMResponse({
                    provider: llmConfig.llm_provider || 'gemini',
                    apiKey: apiKey.trim(),
                    model: llmConfig.llm_model,
                    customBaseUrl: llmConfig.llm_base_url,
                    temperature: Number(llmConfig.llm_temperature) || 0.3,
                    systemPrompt,
                    userMessage: cleanMsg,
                    conversationHistory: Array.isArray(history) ? history : []
                })) {
                    sendEvent({ chunk, access_granted: true });
                }

                sendEvent({
                    done: true,
                    access_granted: true,
                    requested_module: reqModule,
                    role_name: userCtx.role_name,
                    llm_used: `${llmConfig.llm_provider} (${llmConfig.llm_model})`
                });
                return res.end();

            } catch (streamErr) {
                console.error('[STREAMING LLM ERROR]:', streamErr.message);
                // Fallback to static text streaming
            }
        }

        // Fallback Structured Response (Streamed in bursts)
        let fallbackText = `Hello **${userCtx.full_name || userCtx.username}** (${userCtx.role_name}),\n\n`;
        fallbackText += `Here is the verified guidance for your query:\n\n`;
        finalChunks.forEach(c => {
            fallbackText += `### ${c.title}\n${c.content}\n\n`;
        });
        fallbackText += `If you need step-by-step assistance with another feature, let me know!`;

        return streamStaticText(fallbackText, { requested_module: reqModule, role_name: userCtx.role_name });

    } catch (err) {
        console.error('[AGENT CHAT STREAM FATAL ERROR]:', err);
        sendEvent({ error: 'Internal Server Error during stream: ' + err.message, done: true });
        res.end();
    }
});

// GET /agent/health
router.get('/health', async (req, res) => {
    try {
        const check = await fetch(`${AGENT_BACKEND_URL}/health`, { signal: AbortSignal.timeout(2000) }).catch(() => null);
        const pyStatus = check && check.ok ? 'connected' : 'offline (native mode active)';

        const llmKeyRes = await pool.query("SELECT setting_value FROM system_settings WHERE setting_key = 'llm_api_key' LIMIT 1");
        const hasKey = llmKeyRes.rows.length > 0 && !!llmKeyRes.rows[0].setting_value;

        res.json({
            status: 'online',
            service: 'SMS Role-Aware AI Support Agent',
            python_backend: pyStatus,
            native_llm_ready: hasKey
        });
    } catch (e) {
        res.json({ status: 'online', native_mode: true });
    }
});

module.exports = router;
