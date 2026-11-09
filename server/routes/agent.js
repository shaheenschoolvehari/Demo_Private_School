const router = require('express').Router();
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'shaheen_school_jwt_secret_key_2026_secure';
const AGENT_BACKEND_URL = process.env.AGENT_BACKEND_URL || 'http://127.0.0.1:8000';

// POST /agent/chat
router.post('/chat', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'Unauthorized: Missing Authorization header' });
        }

        const token = authHeader.replace('Bearer ', '').trim();
        try {
            jwt.verify(token, JWT_SECRET);
        } catch (jwtErr) {
            return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
        }

        const { message, history } = req.body;
        if (!message || typeof message !== 'string' || !message.trim()) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // Forward request to Python LangGraph Agent service
        try {
            const agentRes = await fetch(`${AGENT_BACKEND_URL}/api/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    message: message.trim(),
                    history: Array.isArray(history) ? history : []
                }),
                signal: AbortSignal.timeout(15000)
            });

            if (!agentRes.ok) {
                const errData = await agentRes.json().catch(() => ({}));
                return res.status(agentRes.status).json({
                    error: errData.detail || 'Agent service error',
                    status: agentRes.status
                });
            }

            const data = await agentRes.json();
            return res.json(data);

        } catch (fetchErr) {
            console.error('[AGENT PROXY ERROR] Cannot connect to Python agent backend:', fetchErr.message);
            return res.status(503).json({
                error: 'AI Agent service is currently unavailable or initializing. Please ensure Python FastAPI backend is running.',
                details: fetchErr.message
            });
        }

    } catch (err) {
        console.error('[AGENT ROUTE ERROR]:', err);
        return res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
});

// GET /agent/health
router.get('/health', async (req, res) => {
    try {
        const check = await fetch(`${AGENT_BACKEND_URL}/health`, { signal: AbortSignal.timeout(3000) });
        if (check.ok) {
            const data = await check.json();
            return res.json({ proxy: 'connected', agent: data });
        }
        return res.status(502).json({ proxy: 'online', agent: 'unhealthy' });
    } catch (e) {
        return res.status(503).json({ proxy: 'online', agent: 'offline', details: e.message });
    }
});

module.exports = router;

