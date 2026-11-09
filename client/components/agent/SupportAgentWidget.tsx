'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAuth, AuthUser } from '@/contexts/AuthContext';
import { usePathname, useRouter } from 'next/navigation';
import IsaacBotVector from './IsaacBotVector';

// ─── Types ───────────────────────────────────────────────────────────────────
interface ChatMessage {
    id: string;
    sender: 'user' | 'agent' | 'system';
    text: string;
    timestamp: string;
    isRefusal?: boolean;
    pageLinks?: { label: string; href: string }[];
    roleTag?: string;
    isStreaming?: boolean;
}

// ─── Route Knowledge Dictionary ──────────────────────────────────────────────
const PAGE_GUIDES: Record<string, { title: string; summary: string; allowedRoles: string[]; guide: string }> = {
    '/dashboard': {
        title: 'Executive Dashboard',
        summary: 'Provides real-time operational KPIs, fee collection charts, student attendance statistics, and recent activity.',
        allowedRoles: ['Administrator', 'Principal', 'Vice Principal', 'Coordinator', 'Head Teacher', 'Teacher', 'Accountant', 'Student'],
        guide: 'This page shows quick KPIs tailored to your role. You can review today’s attendance metrics, collection milestones, and quick action shortcuts.'
    },
    '/academic/priority': {
        title: 'Priority Setting',
        summary: 'Configure hierarchical order of classes and sections using drag-and-drop ordering.',
        allowedRoles: ['Administrator', 'Principal', 'Vice Principal'],
        guide: 'Drag classes up/down to set the grade seniority (e.g. Reception → Nursery → Class 1 → Class 10). Expand any class to drag and reorder its sections. Click "Save Order" to apply system-wide.'
    },
    '/academic/classes': {
        title: 'Class Settings',
        summary: 'Manage official school grades and class definitions.',
        allowedRoles: ['Administrator', 'Principal', 'Vice Principal'],
        guide: 'Add new academic classes, edit existing names, or view student strength distribution.'
    },
    '/academic/sections': {
        title: 'Section Settings',
        summary: 'Manage classroom sections under each grade with capacity constraints.',
        allowedRoles: ['Administrator', 'Principal', 'Vice Principal'],
        guide: 'Create sections (A, B, C, etc.) linked to classes. Ensure correct room capacities are assigned.'
    },
    '/academic/teachers': {
        title: 'Teacher Assignments',
        summary: 'Assign staff members as Class Incharge or Subject Teachers across classes and sections.',
        allowedRoles: ['Administrator', 'Principal', 'Vice Principal'],
        guide: 'Select a teacher card, click "Manage Assignments", choose classes and assign specific curriculum subjects or designate Class Incharge status.'
    },
    '/attendance/students': {
        title: 'Student Daily Attendance',
        summary: 'Register daily presence, absences, and leaves for enrolled students.',
        allowedRoles: ['Administrator', 'Principal', 'Vice Principal', 'Coordinator', 'Head Teacher', 'Teacher'],
        guide: 'Select your assigned class and section, choose the date, and mark Present/Absent/Late/Leave. Holidays are automatically locked.'
    },
    '/attendance/students/history': {
        title: 'Student Attendance History',
        summary: 'View date-range attendance records, monthly totals, and trends.',
        allowedRoles: ['Administrator', 'Principal', 'Vice Principal', 'Coordinator', 'Head Teacher', 'Teacher'],
        guide: 'Filter past records by academic year, month, and class to inspect student attendance rates.'
    },
    '/attendance/settings/students': {
        title: 'Attendance Settings & Coordinators',
        summary: 'Configure automated parent SMS alerts, holiday calendar, and coordinator delegations.',
        allowedRoles: ['Administrator', 'Principal'],
        guide: 'Enable or disable parent alert policies, assign staff members as attendance coordinators for multiple classes, and define student holiday schedules.'
    },
    '/examination/marks': {
        title: 'Term Marks Entry',
        summary: 'Submit student examination marks per term and subject.',
        allowedRoles: ['Administrator', 'Principal', 'Vice Principal', 'Teacher', 'Head Teacher'],
        guide: 'Select Term, Class, Section, and Subject. Enter scored marks. Changes can be saved as draft or submitted for administrative approval.'
    },
    '/examination/approvals': {
        title: 'Marks Approval & Publishing',
        summary: 'Review submitted marksheets, approve grades, and publish to the Student & Family Portal.',
        allowedRoles: ['Administrator', 'Principal', 'Vice Principal'],
        guide: 'Inspect submitted class test and term exam marks sheets. Click "Approve" to lock marks and "Publish" to make report cards accessible to parents.'
    },
    '/fees/collect': {
        title: 'Fee Collection',
        summary: 'Receive student and family fee payments with support for advance balances, partial receipts, and family settlements.',
        allowedRoles: ['Administrator', 'Accountant', 'Cashier'],
        guide: 'Search by Admission Number, Student Name, or Family ID. Review unpaid fee slips, record payment mode (Cash/Bank), enter received amount, and generate receipt.'
    },
    '/fees/generate': {
        title: 'Generate Monthly Slips',
        summary: 'Batch-generate monthly tuition fee slips for single or multiple months across selected classes.',
        allowedRoles: ['Administrator', 'Accountant'],
        guide: 'Select Academic Year, target Month(s), due date, and applicable classes. Click Generate to build ledger billing.'
    },
    '/fees/print': {
        title: 'Print Fee Slips',
        summary: 'Generate standardized 3-copy bank vouchers for batch printing.',
        allowedRoles: ['Administrator', 'Accountant'],
        guide: 'Filter fee slips by month and class, select slips to print, and preview the 3-part bank/school/student voucher template.'
    },
    '/students/admission': {
        title: 'New Student Admission',
        summary: 'Comprehensive 3-stage enrollment wizard with automated sibling detection.',
        allowedRoles: ['Administrator', 'Principal', 'Vice Principal', 'Accountant'],
        guide: 'Fill Student Biodata, Parent Information (system automatically links existing siblings sharing Father CNIC), and assign Academic Class/Section with fee concessions.'
    },
    '/students/details': {
        title: 'Student Directory',
        summary: 'Search, filter, view and manage all student profiles and statuses.',
        allowedRoles: ['Administrator', 'Principal', 'Vice Principal', 'Accountant', 'Teacher'],
        guide: 'Browse the active student body. Use column filters to display specific contact, family, or academic details.'
    },
    '/reports/monthly': {
        title: 'Monthly Collection Reports',
        summary: 'Detailed financial collection reconciliations and ledger breakdowns.',
        allowedRoles: ['Administrator', 'Accountant'],
        guide: 'View total billed tuition, total cash/bank received, pending arrears, and breakdown by fee heads.'
    }
};

const API = process.env.NEXT_PUBLIC_API_URL || 'https://demo-private-school.onrender.com';

// ─── Component ───────────────────────────────────────────────────────────────
export default function SupportAgentWidget({ user: propUser }: { user?: AuthUser | null }) {
    const { user: authUser } = useAuth();
    const user = propUser || authUser;
    const pathname = usePathname();
    const router = useRouter();

    const userRole = (user?.role_name || 'Staff').trim();
    const roleLevel = user?.role_level || 50;

    // ── RBAC Visibility Gate ──
    // Higher roles (role_level >= 80) have default access.
    // Roles with level < 80 ONLY see the widget if explicit 'support.agent' permission is assigned.
    const hasAgentAccess = useMemo(() => {
        if (!user) return false;
        if ((user.role_level || 0) >= 80) return true;
        const perms = user.permissions || [];
        return perms.some(p =>
            (p.module_name === 'support.agent' || p.module_name === 'ai.support' || p.module_name === 'support_agent') && p.can_read
        );
    }, [user]);

    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [hasUnread, setHasUnread] = useState(false);

    // Draggable position state for floating button
    const [btnPos, setBtnPos] = useState<{ x?: number; y?: number }>({});
    const dragInfoRef = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);

    // Dynamic resizable dimensions for the chat card
    const [boxDimensions, setBoxDimensions] = useState<{ width: number; height: number }>({ width: 430, height: 610 });
    const resizeInfoRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Load saved button position & box dimensions from localStorage
    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const savedPos = localStorage.getItem('sms_isaac_btn_pos');
            if (savedPos) setBtnPos(JSON.parse(savedPos));

            const savedSize = localStorage.getItem('sms_isaac_box_size');
            if (savedSize) {
                const parsed = JSON.parse(savedSize);
                if (parsed.width && parsed.height) {
                    setBoxDimensions({
                        width: Math.max(340, Math.min(window.innerWidth - 30, parsed.width)),
                        height: Math.max(460, Math.min(window.innerHeight - 30, parsed.height))
                    });
                }
            }
        } catch { }
    }, []);

    // ── Initial Welcome Message ──
    useEffect(() => {
        if (!user || messages.length > 0 || !hasAgentAccess) return;

        const roleGreeting = getRoleGreeting(userRole, user.full_name || user.username || 'User');
        setMessages([
            {
                id: 'welcome-1',
                sender: 'agent',
                text: roleGreeting.text,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                roleTag: userRole
            }
        ]);
    }, [user, userRole, messages.length, hasAgentAccess]);

    // ── Scroll to bottom ──
    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    useEffect(() => {
        if (isOpen && !isMinimized) {
            scrollToBottom();
            setHasUnread(false);
        }
    }, [isOpen, isMinimized, messages, scrollToBottom]);

    useEffect(() => {
        if (isOpen && !isMinimized) {
            setTimeout(() => inputRef.current?.focus(), 200);
        }
    }, [isOpen, isMinimized]);

    // ── Context-Aware & Rich Role-Tailored Prompt Suggestions ──
    const quickPrompts = useMemo(() => {
        const basePrompts: { label: string; query: string }[] = [];

        // 1. Current Page Guide Prompt
        const currentGuide = PAGE_GUIDES[pathname];
        if (currentGuide) {
            basePrompts.push({
                label: `📌 What does this page do?`,
                query: `What is the purpose of this page (${currentGuide.title}) and how do I use it?`
            });
        }

        // 2. High-volume role-tailored prompt banks
        if (roleLevel >= 80) {
            // Administrator / Principal / Vice Principal
            basePrompts.push(
                { label: '⚡ How to set class priority?', query: 'How does the Priority Setting page work for classes and sections?' },
                { label: '📊 System overview', query: 'What modules and management features can I access as Administrator?' },
                { label: '👥 Role permissions setup', query: 'How do I configure roles and dynamic permissions in Settings > Roles?' },
                { label: '🎯 Exam marks approval', query: 'How do marks sheet approvals and publishing to parent portal work?' },
                { label: '💵 Monthly fee slip rules', query: 'How do batch fee slip generation and arrear calculations work?' },
                { label: '🔔 Notification alert rules', query: 'Which notifications do I receive and how do approval alerts work?' },
                { label: '📅 Academic session setup', query: 'How do I configure academic years, terms, and promotion cycles?' },
                { label: '📋 Staff attendance review', query: 'How do I track staff attendance and biometric logs?' },
                { label: '📈 School directory stats', query: 'How many active students and teaching staff are currently in the school?' }
            );
        } else if (roleLevel >= 65) {
            // Coordinator / Head Teacher
            basePrompts.push(
                { label: '📝 Review student attendance', query: 'How do I view student attendance history for my coordinated classes?' },
                { label: '🎯 Exam approval workflow', query: 'How do exam sheet submissions and publishing approvals work?' },
                { label: '📋 My assigned classes', query: 'Which classes and sections am I assigned to coordinate or teach?' },
                { label: '✍️ Test papers & marking', query: 'How do class test creation and test marking procedures work?' },
                { label: '🔔 My notifications', query: 'What do my latest role notifications mean?' },
                { label: '🔒 My role permissions', query: 'Which modules and pages can I access with my current role?' },
                { label: '📆 Active academic session', query: 'What is the active academic year and current term schedule?' }
            );
        } else if (roleLevel === 50) {
            // Teacher / Class Incharge
            basePrompts.push(
                { label: '📋 What classes do I teach?', query: 'Which classes and sections do I teach and am I a Class Incharge?' },
                { label: '📅 Mark daily attendance', query: 'How do I mark daily student attendance for my assigned class?' },
                { label: '✍️ Enter term exam marks', query: 'How do I enter and submit term exam marks for my subjects?' },
                { label: '📝 Enter class test marks', query: 'How do I enter and record marks for weekly class tests?' },
                { label: '📜 View marks sheet', query: 'How can a Class Incharge view class marks sheets and result cards?' },
                { label: '🔔 Check my notifications', query: 'What are my latest notifications from the school administration?' },
                { label: '🔒 Permitted pages', query: 'Which pages and features can I access with my Teacher role?' },
                { label: '📆 Active academic term', query: 'What is the active academic year and term duration?' }
            );
        } else if (roleLevel >= 20 && roleLevel <= 35) {
            // Accountant / Cashier
            basePrompts.push(
                { label: '💵 Collect student fees', query: 'How do I collect student tuition fees and print receipts?' },
                { label: '📄 Print 3-copy fee slips', query: 'How do I batch print standardized 3-copy fee vouchers?' },
                { label: '📑 Advance balance adjustment', query: 'How does family advance balance settlement work in fee collection?' },
                { label: '🗓️ Generate monthly slips', query: 'How do I batch generate monthly fee slips across selected classes?' },
                { label: '💰 Opening balance setup', query: 'How do I set student opening dues and prior balances?' },
                { label: '📊 Monthly collection report', query: 'How do I view monthly financial collection reconciliations?' },
                { label: '🔔 Financial notifications', query: 'Which notifications do I receive for fee payments and adjustments?' },
                { label: '🔒 My access permissions', query: 'Which financial modules can I access with my role?' }
            );
        } else if (roleLevel === 10) {
            // Student / Parent
            basePrompts.push(
                { label: '💳 View fee vouchers', query: 'How can I view my monthly fee voucher and payment status?' },
                { label: '📜 Exam result cards', query: 'When and how will my term exam result card be visible?' },
                { label: '📅 View attendance history', query: 'How can I check my daily attendance record and absent days?' },
                { label: '🔔 Check announcements', query: 'What are the latest announcements and notices for my family?' },
                { label: '🏫 Academic session info', query: 'What is the active academic session and holiday schedule?' }
            );
        } else {
            basePrompts.push(
                { label: '🔒 What can I access?', query: 'Which modules and pages can I access with my current role?' },
                { label: '🔔 Check my notifications', query: 'What are my latest notifications from the system?' },
                { label: '📅 Attendance marking', query: 'How do daily attendance procedures work?' }
            );
        }

        return basePrompts;
    }, [pathname, roleLevel]);

    // ── Token Resolver ──
    const getSessionToken = () => {
        if (user?.token) return user.token;
        if (typeof window !== 'undefined') {
            try {
                const s = sessionStorage.getItem('sms_user_session') || localStorage.getItem('sms_remember_session') || localStorage.getItem('sms_offline_user_session');
                if (s) {
                    const parsed = JSON.parse(s);
                    return parsed.token || '';
                }
            } catch { }
        }
        return '';
    };

    // ── Handle Sending Message with Deep Streaming ──
    const handleSend = async (queryText?: string) => {
        const textToSend = (queryText || input).trim();
        if (!textToSend || isTyping) return;

        const userMsg: ChatMessage = {
            id: 'u-' + Date.now(),
            sender: 'user',
            text: textToSend,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        const agentMsgId = 'agent-' + Date.now();
        const placeholderAgentMsg: ChatMessage = {
            id: agentMsgId,
            sender: 'agent',
            text: '',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            roleTag: userRole,
            isStreaming: true
        };

        setMessages(prev => [...prev, userMsg, placeholderAgentMsg]);
        setInput('');
        setIsTyping(true);

        const token = getSessionToken();
        let accumulatedText = '';
        let streamDone = false;

        try {
            // ── Connect to Deep Streaming SSE Endpoint ──
            const res = await fetch(`${API}/agent/chat/stream`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                    message: textToSend,
                    history: messages.slice(-6).map(m => ({
                        sender: m.sender,
                        text: m.text
                    }))
                })
            });

            if (res.ok && res.body) {
                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (trimmed.startsWith('data: ')) {
                            const jsonStr = trimmed.slice(6).trim();
                            if (!jsonStr) continue;
                            try {
                                const parsed = JSON.parse(jsonStr);
                                if (parsed.chunk) {
                                    accumulatedText += parsed.chunk;
                                    setMessages(prev => prev.map(m => m.id === agentMsgId ? {
                                        ...m,
                                        text: accumulatedText,
                                        isRefusal: parsed.isRefusal || m.isRefusal
                                    } : m));
                                    scrollToBottom();
                                }
                                if (parsed.done) {
                                    streamDone = true;
                                    const detectedLinks = extractPageLinks(accumulatedText);
                                    setMessages(prev => prev.map(m => m.id === agentMsgId ? {
                                        ...m,
                                        isStreaming: false,
                                        roleTag: parsed.role_name || m.roleTag,
                                        pageLinks: detectedLinks.length > 0 ? detectedLinks : m.pageLinks
                                    } : m));
                                }
                            } catch (e) { }
                        }
                    }
                }
            }

            // Fallback if streaming produced empty content
            if (!accumulatedText.trim()) {
                const fallbackRes = await fetch(`${API}/agent/chat`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                    },
                    body: JSON.stringify({
                        message: textToSend,
                        history: messages.slice(-6).map(m => ({ sender: m.sender, text: m.text }))
                    })
                });

                if (fallbackRes.ok) {
                    const data = await fallbackRes.json();
                    accumulatedText = data.response || "No response received.";
                    const links = extractPageLinks(accumulatedText);
                    setMessages(prev => prev.map(m => m.id === agentMsgId ? {
                        ...m,
                        text: accumulatedText,
                        isStreaming: false,
                        roleTag: data.role_name || userRole,
                        pageLinks: links.length > 0 ? links : m.pageLinks
                    } : m));
                } else {
                    const mock = generateMockResponse(textToSend, userRole, roleLevel, pathname);
                    setMessages(prev => prev.map(m => m.id === agentMsgId ? {
                        ...m,
                        text: mock.text,
                        isStreaming: false,
                        pageLinks: mock.pageLinks,
                        isRefusal: mock.isRefusal
                    } : m));
                }
            } else if (!streamDone) {
                const links = extractPageLinks(accumulatedText);
                setMessages(prev => prev.map(m => m.id === agentMsgId ? {
                    ...m,
                    isStreaming: false,
                    pageLinks: links.length > 0 ? links : m.pageLinks
                } : m));
            }

        } catch (err) {
            if (!accumulatedText.trim()) {
                const mock = generateMockResponse(textToSend, userRole, roleLevel, pathname);
                setMessages(prev => prev.map(m => m.id === agentMsgId ? {
                    ...m,
                    text: mock.text,
                    isStreaming: false,
                    pageLinks: mock.pageLinks,
                    isRefusal: mock.isRefusal
                } : m));
            } else {
                setMessages(prev => prev.map(m => m.id === agentMsgId ? { ...m, isStreaming: false } : m));
            }
        } finally {
            setIsTyping(false);
            if (!isOpen) setHasUnread(true);
            setTimeout(scrollToBottom, 50);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const clearChat = () => {
        if (!confirm('Clear chat history with Isaac AI?')) return;
        setMessages([]);
        const roleGreeting = getRoleGreeting(userRole, user?.full_name || user?.username || 'User');
        setMessages([
            {
                id: 'welcome-reset',
                sender: 'agent',
                text: roleGreeting.text,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                roleTag: userRole
            }
        ]);
    };

    // ── Draggable Floating Button Mouse/Touch Handlers ──
    const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

        const currentX = btnPos.x !== undefined ? btnPos.x : (window.innerWidth - 80);
        const currentY = btnPos.y !== undefined ? btnPos.y : (window.innerHeight - 80);

        dragInfoRef.current = {
            startX: clientX,
            startY: clientY,
            origX: currentX,
            origY: currentY,
            moved: false
        };

        const handleMove = (moveEvt: MouseEvent | TouchEvent) => {
            if (!dragInfoRef.current) return;
            const cx = 'touches' in moveEvt ? moveEvt.touches[0].clientX : moveEvt.clientX;
            const cy = 'touches' in moveEvt ? moveEvt.touches[0].clientY : moveEvt.clientY;

            const dx = cx - dragInfoRef.current.startX;
            const dy = cy - dragInfoRef.current.startY;

            if (Math.hypot(dx, dy) > 5) {
                dragInfoRef.current.moved = true;
            }

            const clampedX = Math.max(12, Math.min(window.innerWidth - 76, dragInfoRef.current.origX + dx));
            const clampedY = Math.max(12, Math.min(window.innerHeight - 76, dragInfoRef.current.origY + dy));

            setBtnPos({ x: clampedX, y: clampedY });
        };

        const handleEnd = () => {
            if (dragInfoRef.current) {
                if (!dragInfoRef.current.moved) {
                    // It was a tap/click -> toggle chat
                    setIsOpen(prev => !prev);
                    setIsMinimized(false);
                } else if (btnPos.x !== undefined && btnPos.y !== undefined) {
                    try {
                        localStorage.setItem('sms_isaac_btn_pos', JSON.stringify(btnPos));
                    } catch { }
                }
            }
            dragInfoRef.current = null;
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleEnd);
            window.removeEventListener('touchmove', handleMove);
            window.removeEventListener('touchend', handleEnd);
        };

        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleEnd);
        window.addEventListener('touchmove', handleMove, { passive: false });
        window.addEventListener('touchend', handleEnd);
    };

    // ── Resizable Chat Box Top-Left Corner Handle ──
    const handleResizeStart = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        resizeInfoRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            startW: boxDimensions.width,
            startH: boxDimensions.height
        };

        const handleMouseMove = (moveEvt: MouseEvent) => {
            if (!resizeInfoRef.current) return;
            const deltaX = resizeInfoRef.current.startX - moveEvt.clientX;
            const deltaY = resizeInfoRef.current.startY - moveEvt.clientY;

            const maxW = Math.min(940, window.innerWidth - 32);
            const maxH = Math.min(940, window.innerHeight - 32);

            const newW = Math.max(340, Math.min(maxW, resizeInfoRef.current.startW + deltaX));
            const newH = Math.max(460, Math.min(maxH, resizeInfoRef.current.startH + deltaY));

            setBoxDimensions({ width: newW, height: newH });
        };

        const handleMouseUp = () => {
            resizeInfoRef.current = null;
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            try {
                localStorage.setItem('sms_isaac_box_size', JSON.stringify(boxDimensions));
            } catch { }
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    // If role does not have access, hide completely
    if (!hasAgentAccess) return null;

    return (
        <aside aria-label="Isaac AI Support Assistant">
            {/* ── 1. Moveable Floating Launcher Button (With Cute Isaac Vector & Specular Glims) ── */}
            {!isOpen && (
                <div
                    className="isaac-launcher-container"
                    style={btnPos.x !== undefined && btnPos.y !== undefined ? {
                        left: `${btnPos.x}px`,
                        top: `${btnPos.y}px`,
                        bottom: 'auto',
                        right: 'auto'
                    } : undefined}
                >
                    <button
                        type="button"
                        className="isaac-floating-btn"
                        onMouseDown={handleDragStart}
                        onTouchStart={handleDragStart}
                        title="Isaac AI (Drag to move, click to chat)"
                        aria-label="Open Isaac AI"
                    >
                        {/* Shimmer Glim Ring */}
                        <div className="isaac-glim-halo"></div>

                        {/* Vector Graphic */}
                        <IsaacBotVector size={54} showGlim={true} />

                        {/* Unread Message Dot */}
                        {hasUnread && <span className="isaac-unread-dot" />}
                    </button>
                    <div className="isaac-pill-label">Isaac AI</div>
                </div>
            )}

            {/* ── 2. Super Compact Minimized Floating Pill ── */}
            {isOpen && isMinimized && (
                <div
                    className="isaac-minimized-pill shadow-lg"
                    style={btnPos.x !== undefined && btnPos.y !== undefined ? {
                        left: `${Math.min(btnPos.x, window.innerWidth - 200)}px`,
                        top: `${btnPos.y}px`,
                        bottom: 'auto',
                        right: 'auto'
                    } : undefined}
                    onClick={() => setIsMinimized(false)}
                    title="Click to expand Isaac AI"
                >
                    <IsaacBotVector size={30} showGlim={true} />
                    <div className="minimized-pill-info">
                        <span className="minimized-pill-title">Isaac AI</span>
                        <span className="minimized-pill-status">
                            <span className="minimized-live-dot"></span> Online
                        </span>
                    </div>
                    <div className="minimized-pill-actions">
                        <button
                            type="button"
                            className="minimized-action-btn"
                            onClick={(e) => { e.stopPropagation(); setIsMinimized(false); }}
                            title="Expand Isaac AI"
                        >
                            <i className="bi bi-arrows-angle-expand"></i>
                        </button>
                        <button
                            type="button"
                            className="minimized-action-btn"
                            onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
                            title="Close"
                        >
                            <i className="bi bi-x-lg"></i>
                        </button>
                    </div>
                </div>
            )}

            {/* ── 3. Dynamic Resizable Chat Card Container ── */}
            {isOpen && !isMinimized && (
                <div
                    className="agent-chat-card shadow-2xl"
                    style={{
                        width: `${boxDimensions.width}px`,
                        height: `${boxDimensions.height}px`
                    }}
                >
                    {/* Interactive Resize Handle (Top-Left Grip for desktop) */}
                    <div
                        className="agent-resize-handle"
                        onMouseDown={handleResizeStart}
                        title="Click and drag to resize Isaac AI chat window"
                    >
                        <i className="bi bi-arrows-angle-expand"></i>
                    </div>

                    {/* Header */}
                    <div className="agent-header">
                        <div className="agent-header-left">
                            <div className="agent-avatar-wrap">
                                <IsaacBotVector size={36} showGlim={true} />
                                <span className="agent-online-dot"></span>
                            </div>
                            <div className="agent-header-info">
                                <h2 className="agent-title">Isaac AI</h2>
                                <span className="agent-status-badge">
                                    <span className="agent-live-dot"></span> Active Assistant
                                </span>
                            </div>
                        </div>

                        <div className="agent-header-actions">
                            <button
                                type="button"
                                className="agent-btn-icon"
                                onClick={() => setIsMinimized(true)}
                                title="Minimize to compact pill"
                            >
                                <i className="bi bi-dash-lg"></i>
                            </button>
                            <button
                                type="button"
                                className="agent-btn-icon"
                                onClick={clearChat}
                                title="Clear conversation"
                            >
                                <i className="bi bi-trash3"></i>
                            </button>
                            <button
                                type="button"
                                className="agent-btn-icon"
                                onClick={() => setIsOpen(false)}
                                title="Close"
                            >
                                <i className="bi bi-x-lg"></i>
                            </button>
                        </div>
                    </div>

                    {/* Body */}
                    <div className="agent-body">
                        {/* Dynamic Personalized Role Permission Banner */}
                        <div className="agent-intro-banner">
                            <i className="bi bi-shield-check me-1 text-teal"></i>
                            <span>
                                Responses are strictly personalized to your permissions as <strong>{userRole}</strong>.
                            </span>
                        </div>

                        {/* Messages Stream */}
                        <div className="agent-messages-list">
                            {messages.map(msg => (
                                <div
                                    key={msg.id}
                                    className={`agent-message-row ${msg.sender === 'user' ? 'msg-user' : 'msg-agent'}`}
                                >
                                    {msg.sender === 'agent' && (
                                        <div className="msg-avatar-icon">
                                            <IsaacBotVector size={26} showGlim={false} />
                                        </div>
                                    )}
                                    <div className={`agent-message-bubble ${msg.isRefusal ? 'msg-refusal' : ''}`}>
                                        {msg.isStreaming && !msg.text ? (
                                            <div className="d-flex align-items-center py-1">
                                                <span className="typing-dot me-1"></span>
                                                <span className="typing-dot me-1"></span>
                                                <span className="typing-dot"></span>
                                            </div>
                                        ) : (
                                            <div className="msg-text-content">{renderFormattedText(msg.text, msg.isStreaming)}</div>
                                        )}

                                        {msg.pageLinks && msg.pageLinks.length > 0 && (
                                            <div className="msg-links-container">
                                                {msg.pageLinks.map((link, idx) => (
                                                    <button
                                                        key={idx}
                                                        type="button"
                                                        className="msg-link-pill"
                                                        onClick={() => {
                                                            router.push(link.href);
                                                            if (window.innerWidth < 640) setIsOpen(false);
                                                        }}
                                                    >
                                                        <i className="bi bi-arrow-right-circle me-1"></i>
                                                        {link.label}
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        <span className="msg-timestamp">{msg.timestamp}</span>
                                    </div>
                                </div>
                            ))}

                            {isTyping && !messages.some(m => m.isStreaming) && (
                                <div className="agent-message-row msg-agent">
                                    <div className="msg-avatar-icon">
                                        <IsaacBotVector size={26} showGlim={false} />
                                    </div>
                                    <div className="agent-message-bubble msg-typing">
                                        <span className="typing-dot"></span>
                                        <span className="typing-dot"></span>
                                        <span className="typing-dot"></span>
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Rich Role-Tailored Quick Suggestions */}
                        {quickPrompts.length > 0 && (
                            <div className="agent-prompts-bar">
                                <span className="prompts-label">Quick Suggestions for {userRole}:</span>
                                <div className="prompts-scroll-box">
                                    {quickPrompts.map((p, idx) => (
                                        <button
                                            key={idx}
                                            type="button"
                                            className="prompt-chip-btn"
                                            onClick={() => handleSend(p.query)}
                                        >
                                            {p.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer Input Area (Clean, no extra footer note) */}
                    <div className="agent-footer">
                        <div className="agent-input-wrap">
                            <input
                                ref={inputRef}
                                type="text"
                                className="agent-text-input"
                                placeholder={`Ask anything as ${userRole}…`}
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                disabled={isTyping}
                            />
                            <button
                                type="button"
                                className="agent-send-btn"
                                onClick={() => handleSend()}
                                disabled={!input.trim() || isTyping}
                                title="Send question to Isaac AI"
                            >
                                <i className="bi bi-send-fill"></i>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Scoped Styling ── */}
            <style>{`
                /* ─ Moveable Floating Launcher ─ */
                .isaac-launcher-container {
                    position: fixed;
                    bottom: 1.5rem;
                    right: 1.5rem;
                    z-index: 99999;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    cursor: grab;
                    user-select: none;
                    touch-action: none;
                }
                .isaac-launcher-container:active {
                    cursor: grabbing;
                }
                .isaac-floating-btn {
                    width: 64px;
                    height: 64px;
                    border-radius: 50%;
                    background: transparent;
                    border: none;
                    outline: none;
                    position: relative;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0;
                    cursor: pointer;
                    transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
                }
                .isaac-floating-btn:hover {
                    transform: scale(1.08) translateY(-3px);
                }
                .isaac-glim-halo {
                    position: absolute;
                    inset: -3px;
                    border-radius: 50%;
                    background: radial-gradient(circle, rgba(255, 82, 82, 0.4) 0%, rgba(229, 57, 53, 0) 70%);
                    animation: glimHaloPulse 2.8s infinite ease-in-out;
                    z-index: -1;
                }
                .isaac-unread-dot {
                    position: absolute;
                    top: 2px;
                    right: 2px;
                    width: 13px;
                    height: 13px;
                    background: #00e5ff;
                    border: 2px solid #ffffff;
                    border-radius: 50%;
                    box-shadow: 0 0 8px #00e5ff;
                }
                .isaac-pill-label {
                    margin-top: 4px;
                    font-size: 0.68rem;
                    font-weight: 700;
                    color: #fff;
                    background: rgba(35, 61, 77, 0.9);
                    padding: 0.15rem 0.55rem;
                    border-radius: 12px;
                    box-shadow: 0 2px 6px rgba(0,0,0,0.15);
                    letter-spacing: 0.3px;
                    pointer-events: none;
                }

                /* ─ Compact Minimized Floating Pill ─ */
                .isaac-minimized-pill {
                    position: fixed;
                    bottom: 1.5rem;
                    right: 1.5rem;
                    z-index: 99999;
                    display: inline-flex;
                    align-items: center;
                    gap: 0.55rem;
                    background: linear-gradient(135deg, #233D4D 0%, #215E61 100%);
                    color: #fff;
                    padding: 0.45rem 0.75rem 0.45rem 0.55rem;
                    border-radius: 28px;
                    border: 1.5px solid rgba(255, 255, 255, 0.2);
                    cursor: pointer;
                    box-shadow: 0 8px 24px rgba(35, 61, 77, 0.35);
                    transition: transform 0.2s, box-shadow 0.2s;
                }
                .isaac-minimized-pill:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 12px 28px rgba(35, 61, 77, 0.45);
                }
                .minimized-pill-info {
                    display: flex;
                    flex-direction: column;
                }
                .minimized-pill-title {
                    font-size: 0.82rem;
                    font-weight: 700;
                    color: #fff;
                    line-height: 1.1;
                }
                .minimized-pill-status {
                    font-size: 0.64rem;
                    color: #80f7ff;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }
                .minimized-live-dot {
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    background: #00e5ff;
                    box-shadow: 0 0 6px #00e5ff;
                }
                .minimized-pill-actions {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    margin-left: 0.3rem;
                }
                .minimized-action-btn {
                    background: rgba(255, 255, 255, 0.15);
                    border: none;
                    color: #fff;
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 0.72rem;
                    cursor: pointer;
                    transition: background 0.15s;
                }
                .minimized-action-btn:hover {
                    background: rgba(255, 255, 255, 0.3);
                }

                /* ─ Resizable Chat Card ─ */
                .agent-chat-card {
                    position: fixed;
                    bottom: 1.5rem;
                    right: 1.5rem;
                    z-index: 99999;
                    background: #ffffff;
                    border-radius: 20px;
                    border: 1px solid rgba(33, 94, 97, 0.2);
                    display: flex;
                    flex-direction: column;
                    box-shadow: 0 16px 45px rgba(35, 61, 77, 0.32);
                    animation: popIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
                    min-width: 340px;
                    min-height: 460px;
                    max-width: 95vw;
                    max-height: 94vh;
                    overflow: hidden;
                }

                /* ─ Top-Left Corner Resize Grip ─ */
                .agent-resize-handle {
                    position: absolute;
                    top: 2px;
                    left: 2px;
                    width: 22px;
                    height: 22px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: rgba(255, 255, 255, 0.5);
                    font-size: 0.7rem;
                    cursor: nwse-resize;
                    z-index: 10;
                    transform: rotate(90deg);
                    transition: color 0.15s;
                }
                .agent-resize-handle:hover {
                    color: #00e5ff;
                }

                /* ─ Header ─ */
                .agent-header {
                    background: linear-gradient(135deg, #1b323f 0%, #215E61 100%);
                    color: #fff;
                    padding: 0.75rem 1rem 0.75rem 1.4rem;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    flex-shrink: 0;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                }
                .agent-header-left {
                    display: flex;
                    align-items: center;
                    gap: 0.65rem;
                }
                .agent-avatar-wrap {
                    position: relative;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .agent-online-dot {
                    position: absolute;
                    bottom: 0;
                    right: 0;
                    width: 9px;
                    height: 9px;
                    background: #10b981;
                    border: 2px solid #233D4D;
                    border-radius: 50%;
                }
                .agent-header-info {
                    display: flex;
                    flex-direction: column;
                }
                .agent-title {
                    font-size: 1.02rem;
                    font-weight: 800;
                    margin: 0;
                    color: #ffffff;
                    letter-spacing: 0.2px;
                }
                .agent-status-badge {
                    font-size: 0.65rem;
                    color: #80f7ff;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-weight: 500;
                }
                .agent-live-dot {
                    width: 6px;
                    height: 6px;
                    background: #00e5ff;
                    border-radius: 50%;
                    box-shadow: 0 0 5px #00e5ff;
                }
                .agent-header-actions {
                    display: flex;
                    align-items: center;
                    gap: 0.35rem;
                }
                .agent-btn-icon {
                    background: rgba(255, 255, 255, 0.12);
                    border: none;
                    color: #ffffff;
                    width: 28px;
                    height: 28px;
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 0.8rem;
                    cursor: pointer;
                    transition: all 0.15s;
                }
                .agent-btn-icon:hover {
                    background: rgba(255, 255, 255, 0.25);
                    transform: scale(1.05);
                }

                /* ─ Body ─ */
                .agent-body {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    background: #f8fbfb;
                    overflow: hidden;
                    min-height: 0;
                }
                .agent-intro-banner {
                    background: #eef7f8;
                    border-bottom: 1px solid #d4ebec;
                    padding: 0.45rem 0.85rem;
                    font-size: 0.72rem;
                    color: #215E61;
                    display: flex;
                    align-items: center;
                    flex-shrink: 0;
                }
                .agent-messages-list {
                    flex: 1;
                    overflow-y: auto;
                    padding: 0.9rem 0.85rem;
                    display: flex;
                    flex-direction: column;
                    gap: 0.85rem;
                    min-height: 0;
                }
                .agent-message-row {
                    display: flex;
                    align-items: flex-end;
                    gap: 0.45rem;
                }
                .msg-user {
                    justify-content: flex-end;
                }
                .msg-agent {
                    justify-content: flex-start;
                }
                .msg-avatar-icon {
                    width: 28px;
                    height: 28px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                    margin-bottom: 2px;
                }
                .agent-message-bubble {
                    max-width: 82%;
                    padding: 0.65rem 0.85rem;
                    border-radius: 14px;
                    font-size: 0.84rem;
                    line-height: 1.45;
                    position: relative;
                    word-wrap: break-word;
                }
                .msg-user .agent-message-bubble {
                    background: linear-gradient(135deg, #215E61 0%, #2d7d82 100%);
                    color: #fff;
                    border-bottom-right-radius: 3px;
                    box-shadow: 0 2px 8px rgba(33, 94, 97, 0.2);
                }
                .msg-agent .agent-message-bubble {
                    background: #ffffff;
                    color: #233D4D;
                    border: 1px solid #e2ecec;
                    border-bottom-left-radius: 3px;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
                }
                .msg-refusal {
                    background: #fff5f5 !important;
                    border: 1.5px solid #fed7d7 !important;
                    color: #9b2c2c !important;
                }
                .msg-timestamp {
                    display: block;
                    font-size: 0.65rem;
                    margin-top: 0.3rem;
                    text-align: right;
                    opacity: 0.65;
                }
                .msg-links-container {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0.35rem;
                    margin-top: 0.55rem;
                    padding-top: 0.45rem;
                    border-top: 1px solid #e2ecec;
                }
                .msg-link-pill {
                    background: #edf7f8;
                    color: #215E61;
                    border: 1px solid #cce8e9;
                    font-size: 0.72rem;
                    font-weight: 600;
                    border-radius: 14px;
                    padding: 0.2rem 0.55rem;
                    display: inline-flex;
                    align-items: center;
                    cursor: pointer;
                    transition: all 0.15s;
                }
                .msg-link-pill:hover {
                    background: #215E61;
                    color: #fff;
                }

                /* ─ Typing Indicator ─ */
                .msg-typing {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 0.65rem 0.9rem;
                }
                .typing-dot {
                    width: 7px;
                    height: 7px;
                    background: #215E61;
                    border-radius: 50%;
                    animation: typingBlink 1.4s infinite both;
                }
                .typing-dot:nth-child(2) { animation-delay: 0.2s; }
                .typing-dot:nth-child(3) { animation-delay: 0.4s; }

                /* ─ Stream Blinking Cursor ─ */
                @keyframes streamBlink {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0; }
                }
                .stream-cursor {
                    display: inline-block;
                    color: #215E61;
                    font-weight: 800;
                    animation: streamBlink 0.7s infinite ease-in-out;
                    margin-left: 2px;
                    line-height: 1;
                }

                /* ─ Quick Prompts ─ */
                .agent-prompts-bar {
                    background: #fff;
                    border-top: 1px solid #e5eded;
                    padding: 0.5rem 0.85rem;
                    display: flex;
                    flex-direction: column;
                    gap: 0.3rem;
                    flex-shrink: 0;
                }
                .prompts-label {
                    font-size: 0.68rem;
                    font-weight: 700;
                    color: #6b7280;
                    text-transform: uppercase;
                }
                .prompts-scroll-box {
                    display: flex;
                    gap: 0.45rem;
                    overflow-x: auto;
                    padding-bottom: 3px;
                    scrollbar-width: thin;
                }
                .prompts-scroll-box::-webkit-scrollbar {
                    height: 4px;
                }
                .prompts-scroll-box::-webkit-scrollbar-thumb {
                    background: #cce3e4;
                    border-radius: 4px;
                }
                .prompt-chip-btn {
                    white-space: nowrap;
                    background: #f3f8f8;
                    border: 1px solid #c9e2e4;
                    color: #215E61;
                    font-size: 0.74rem;
                    font-weight: 600;
                    padding: 0.28rem 0.75rem;
                    border-radius: 20px;
                    cursor: pointer;
                    transition: all 0.15s;
                    flex-shrink: 0;
                }
                .prompt-chip-btn:hover {
                    background: #215E61;
                    border-color: #215E61;
                    color: #fff;
                    transform: translateY(-1px);
                }

                /* ─ Footer Input ─ */
                .agent-footer {
                    background: #fff;
                    border-top: 1px solid #e0eeef;
                    padding: 0.65rem 0.85rem;
                    flex-shrink: 0;
                }
                .agent-input-wrap {
                    display: flex;
                    align-items: center;
                    gap: 0.4rem;
                    background: #f7fafb;
                    border: 1.5px solid #c7dfe1;
                    border-radius: 25px;
                    padding: 0.25rem 0.4rem 0.25rem 0.95rem;
                    transition: border-color 0.2s, box-shadow 0.2s;
                }
                .agent-input-wrap:focus-within {
                    border-color: #215E61;
                    box-shadow: 0 0 0 3px rgba(33, 94, 97, 0.15);
                    background: #fff;
                }
                .agent-text-input {
                    flex: 1;
                    border: none;
                    background: transparent;
                    font-size: 0.84rem;
                    color: #233D4D;
                    outline: none;
                    padding: 0.3rem 0;
                }
                .agent-text-input::placeholder {
                    color: #9ca3af;
                }
                .agent-send-btn {
                    width: 34px;
                    height: 34px;
                    background: #215E61;
                    color: #fff;
                    border: none;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 0.85rem;
                    cursor: pointer;
                    transition: background 0.15s, transform 0.1s;
                    flex-shrink: 0;
                }
                .agent-send-btn:hover:not(:disabled) {
                    background: #1a4a4d;
                    transform: scale(1.05);
                }
                .agent-send-btn:disabled {
                    background: #cbd5e1;
                    cursor: not-allowed;
                }

                /* ─ Keyframe Animations ─ */
                @keyframes glimHaloPulse {
                    0%, 100% { transform: scale(1); opacity: 0.5; }
                    50% { transform: scale(1.15); opacity: 0.85; }
                }
                @keyframes typingBlink {
                    0%, 80%, 100% { transform: scale(0.6); opacity: 0.3; }
                    40% { transform: scale(1); opacity: 1; }
                }
                @keyframes popIn {
                    from { transform: scale(0.94) translateY(12px); opacity: 0; }
                    to { transform: scale(1) translateY(0); opacity: 1; }
                }

                /* ─ Mobile Specific Responsive Drawer (Strict) ─ */
                @media (max-width: 640px) {
                    .isaac-launcher-container {
                        bottom: 1rem;
                        right: 1rem;
                    }
                    .agent-chat-card {
                        position: fixed !important;
                        top: 0 !important;
                        left: 0 !important;
                        right: 0 !important;
                        bottom: 0 !important;
                        width: 100vw !important;
                        height: 100dvh !important;
                        max-height: 100dvh !important;
                        border-radius: 0 !important;
                        border: none !important;
                        z-index: 100000 !important;
                    }
                    .agent-resize-handle {
                        display: none !important;
                    }
                    .agent-header {
                        padding: 0.75rem 0.85rem;
                    }
                    .agent-messages-list {
                        padding: 0.75rem 0.65rem;
                    }
                    .agent-message-bubble {
                        max-width: 90%;
                        font-size: 0.82rem;
                    }
                    .agent-footer {
                        padding: 0.5rem 0.65rem calc(0.5rem + env(safe-area-inset-bottom, 0px));
                    }
                }
            `}</style>
        </aside>
    );
}

// ─── Route Links Extractor ──────────────────────────────────────────────────
function extractPageLinks(text: string): { label: string; href: string }[] {
    const links: { label: string; href: string }[] = [];
    const routes = [
        { path: '/academic/priority', label: 'Priority Setting' },
        { path: '/academic/classes', label: 'Class Settings' },
        { path: '/academic/sections', label: 'Section Settings' },
        { path: '/academic/teachers', label: 'Teacher Assignments' },
        { path: '/attendance/students', label: 'Student Attendance' },
        { path: '/attendance/students/history', label: 'Attendance History' },
        { path: '/attendance/settings/students', label: 'Attendance Settings' },
        { path: '/examination/marks', label: 'Marks Entry' },
        { path: '/examination/approvals', label: 'Marks Approval' },
        { path: '/fees/collect', label: 'Fee Collection' },
        { path: '/fees/generate', label: 'Generate Fee Slips' },
        { path: '/fees/print', label: 'Print Fee Slips' },
        { path: '/students/admission', label: 'New Admission' },
        { path: '/students/details', label: 'Student Directory' },
        { path: '/reports/monthly', label: 'Collection Reports' },
        { path: '/settings/system', label: 'System Configuration' },
        { path: '/settings/roles', label: 'Roles & RBAC' }
    ];
    for (const r of routes) {
        if (text.includes(r.path) && !links.some(l => l.href === r.path)) {
            links.push({ label: `Go to ${r.label}`, href: r.path });
        }
    }
    return links.slice(0, 3);
}

// ─── Inline Formatting Parser (Handles `code` & **bold**) ───────────────────
function renderInlineSpans(text: string) {
    if (!text) return null;
    const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);

    return parts.map((part, idx) => {
        if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
            return (
                <code key={idx} className="px-1 py-0.5 rounded bg-light border text-danger small font-monospace">
                    {part.slice(1, -1)}
                </code>
            );
        }
        if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
            return <strong key={idx} className="fw-bold text-dark">{part.slice(2, -2)}</strong>;
        }
        return <span key={idx}>{part}</span>;
    });
}

// ─── Rich Formatting Helper with Bullet & Deep Stream Cursor Support ────────
function renderFormattedText(text: string, isStreaming?: boolean) {
    if (!text) {
        return isStreaming ? <span className="stream-cursor">▌</span> : null;
    }
    const lines = text.split('\n');

    return (
        <div className="formatted-chat-text">
            {lines.map((rawLine, i) => {
                const line = rawLine.trim();

                // Horizontal rule
                if (line === '---' || line === '***') {
                    return <hr key={i} className="my-2 border-secondary opacity-25" />;
                }

                // Header 3: ### Title
                if (line.startsWith('### ')) {
                    return (
                        <div key={i} className="fw-bold fs-6 mt-2 mb-1 text-teal">
                            {renderInlineSpans(line.replace(/^###\s*/, ''))}
                        </div>
                    );
                }

                // Header 2: ## Title
                if (line.startsWith('## ')) {
                    return (
                        <div key={i} className="fw-bold fs-6 mt-2 mb-1 text-teal">
                            {renderInlineSpans(line.replace(/^##\s*/, ''))}
                        </div>
                    );
                }

                // Bullet points: "* ", "- ", "• "
                const isBullet = line.startsWith('* ') || line.startsWith('- ') || line.startsWith('• ');
                // Numbered lists: "1. ", "2. ", etc.
                const numberMatch = line.match(/^(\d+)\.\s+/);

                let cleanLine = rawLine;
                let bulletIcon = null;

                if (isBullet) {
                    cleanLine = line.replace(/^[\*\-•]\s*/, '');
                    bulletIcon = <span className="me-1 text-teal fw-bold">•</span>;
                } else if (numberMatch) {
                    cleanLine = line.replace(/^\d+\.\s*/, '');
                    bulletIcon = <span className="me-1 fw-semibold text-secondary">{numberMatch[1]}.</span>;
                }

                return (
                    <div
                        key={i}
                        className={`${isBullet || numberMatch ? 'ps-3 mb-1' : rawLine.trim() === '' ? 'mb-2' : 'mb-1'} ${rawLine.trim() === '' ? 'empty-line' : ''}`}
                    >
                        {bulletIcon}
                        {renderInlineSpans(cleanLine)}
                        {isStreaming && i === lines.length - 1 && (
                            <span className="stream-cursor">▌</span>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// ─── Role Greetings ──────────────────────────────────────────────────────────
function getRoleGreeting(role: string, name: string): { text: string } {
    const cleanRole = role.toLowerCase();
    if (cleanRole.includes('admin') || cleanRole.includes('principal')) {
        return {
            text: `👋 Greetings **${name}**! I am **Isaac AI**, your School Administrator Assistant.\n\nYou have unrestricted administrative access across all modules (Academic, Fees, Attendance, Examination, Expenses, and Settings).\n\nAsk me how to configure workflows, set class priorities, verify notifications, or navigate any management screen.`
        };
    }
    if (cleanRole.includes('teacher') || cleanRole.includes('incharge')) {
        return {
            text: `👋 Hello **${name}**! I am **Isaac AI**, your Academic & Teaching Assistant.\n\nI can guide you on **daily student attendance**, **entering exam & class test marks**, or reviewing your assigned classes.\n\nHow can I help you today?`
        };
    }
    if (cleanRole.includes('accountant') || cleanRole.includes('cashier')) {
        return {
            text: `👋 Welcome **${name}**! I am **Isaac AI**, your Fee & Financial Support Assistant.\n\nI can assist you with **fee collection workflows**, **generating monthly slips**, **printing 3-copy vouchers**, or settling family advance balances.\n\nWhat would you like assistance with?`
        };
    }
    if (cleanRole.includes('student') || cleanRole.includes('parent') || cleanRole.includes('family')) {
        return {
            text: `👋 Hello **${name}**! Welcome to the **Student & Family Support Portal**. I am **Isaac AI**.\n\nI can guide you on how to check your **monthly fee slips**, **attendance record**, and **published examination result cards**.\n\nHow may I help you?`
        };
    }
    return {
        text: `👋 Hello **${name}**! I am **Isaac AI**, your School Support Assistant.\n\nI am configured with your active role (**${role}**). Ask me any question regarding your permitted pages, operational procedures, or system notifications.`
    };
}

// ─── Mock Role-Aware Agent Reasoning Engine (Phase 1 Fallback) ───────────────
function generateMockResponse(query: string, role: string, roleLevel: number, currentPath: string): ChatMessage {
    const qLower = query.toLowerCase();
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // 1. Security / RBAC Refusals
    const restrictedFinanceKeywords = ['salary', 'salaries', 'profit', 'expense totals', 'school revenue', 'delete employee', 'delete user', 'drop table', 'system password'];
    const isAskingRestrictedFinance = restrictedFinanceKeywords.some(k => qLower.includes(k));

    if (isAskingRestrictedFinance && roleLevel < 80) {
        return {
            id: 'agent-' + Date.now(),
            sender: 'agent',
            isRefusal: true,
            text: `⚠️ **Access Restricted (RBAC Protection)**\n\nYou do not have authorization to view school financial totals, employee payroll, or user credentials with your current role (**${role}**).\n\nThis security rule is strictly enforced by system policy. If you believe you require access to this information, please contact the **School Administrator**.`,
            timestamp
        };
    }

    // 2. What does this page do?
    if (qLower.includes('this page') || qLower.includes('what is the purpose') || qLower.includes('how do i use this')) {
        const pageInfo = PAGE_GUIDES[currentPath];
        if (pageInfo) {
            return {
                id: 'agent-' + Date.now(),
                sender: 'agent',
                text: `📖 **Guide for ${pageInfo.title}:**\n\n${pageInfo.summary}\n\n**Workflow Steps:**\n${pageInfo.guide}`,
                timestamp
            };
        }
        return {
            id: 'agent-' + Date.now(),
            sender: 'agent',
            text: `You are currently viewing **${currentPath}**.\n\nThis section is governed by your **${role}** access permissions. Use the navigation sidebar on the left to switch between modules.`,
            timestamp
        };
    }

    // 3. Priority Setting
    if (qLower.includes('priority') || qLower.includes('drag') || qLower.includes('class order')) {
        if (roleLevel < 80) {
            return {
                id: 'agent-' + Date.now(),
                sender: 'agent',
                isRefusal: true,
                text: `⚠️ **Access Restricted**\n\nThe **Priority Setting** editor is restricted to School Administrators and Principals. Teachers and support staff cannot alter academic class ordering.`,
                timestamp
            };
        }
        return {
            id: 'agent-' + Date.now(),
            sender: 'agent',
            text: `✨ **How Class & Section Priority Works:**\n\n1. Go to **Academic → Priority Setting** (\`/academic/priority\`).\n2. **Classes Order**: Drag any class card up or down (smallest classes like Reception/Nursery should be at the top).\n3. **Sections Order**: Click on any class to expand its section pills, then drag the pills to order them (e.g. A → B → C).\n4. **Duplicate Warnings**: If duplicate names exist (e.g., 'Class 1' and 'Class One'), a yellow **Possible Duplicate** badge appears.\n5. Click **Save Priority Order** to apply the priority across Fee Slips, Attendance, Examination, and Reports.`,
            pageLinks: [{ label: 'Open Priority Setting', href: '/academic/priority' }],
            timestamp
        };
    }

    // 4. Default Helpful Fallback
    return {
        id: 'agent-' + Date.now(),
        sender: 'agent',
        text: `I understand your question regarding **"${query}"**.\n\nAs your **Isaac AI** for **${role}**, I can guide you through system workflows, page navigation, attendance protocols, and examination procedures.\n\nFeel free to click any of the **Quick Suggestions** below or ask a specific workflow question!`,
        timestamp
    };
}
