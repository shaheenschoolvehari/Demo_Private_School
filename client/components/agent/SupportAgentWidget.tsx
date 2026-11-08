'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth, AuthUser } from '@/contexts/AuthContext';
import { usePathname, useRouter } from 'next/navigation';

// ─── Types ───────────────────────────────────────────────────────────────────
interface ChatMessage {
    id: string;
    sender: 'user' | 'agent' | 'system';
    text: string;
    timestamp: string;
    isRefusal?: boolean;
    pageLinks?: { label: string; href: string }[];
    roleTag?: string;
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

// ─── Component ───────────────────────────────────────────────────────────────
export default function SupportAgentWidget({ user: propUser }: { user?: AuthUser | null }) {
    const { user: authUser, isLoggedIn } = useAuth();
    const user = propUser || authUser;
    const pathname = usePathname();
    const router = useRouter();

    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [hasUnread, setHasUnread] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const userRole = (user?.role_name || 'Staff').trim();
    const roleLevel = user?.role_level || 50;

    // ─── Initial Welcome Message ───────────────────────────────────────────────
    useEffect(() => {
        if (!user || messages.length > 0) return;

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
    }, [user, userRole, messages.length]);

    // ─── Scroll to bottom ──────────────────────────────────────────────────────
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        if (isOpen && !isMinimized) {
            scrollToBottom();
            setHasUnread(false);
        }
    }, [isOpen, isMinimized, messages]);

    // Focus input when opened
    useEffect(() => {
        if (isOpen && !isMinimized) {
            setTimeout(() => inputRef.current?.focus(), 200);
        }
    }, [isOpen, isMinimized]);

    // ─── Context-Aware Prompt Suggestions ──────────────────────────────────────
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

        // 2. Role-specific common questions
        if (roleLevel >= 90) {
            // Admin
            basePrompts.push(
                { label: '📊 System overview', query: 'What modules and management features can I access as Administrator?' },
                { label: '⚡ How to set class priority?', query: 'How does the Priority Setting page work for classes and sections?' },
                { label: '📢 Notification rules', query: 'Which notifications do I receive and how do approval alerts work?' }
            );
        } else if (roleLevel >= 65) {
            // Coordinator / Head Teacher
            basePrompts.push(
                { label: '📝 How to review attendance?', query: 'How do I view student attendance history for my coordinated classes?' },
                { label: '🎯 Exam approval workflow', query: 'How do exam sheet submissions and publishing approvals work?' }
            );
        } else if (roleLevel === 50) {
            // Teacher
            basePrompts.push(
                { label: '📅 How to mark attendance?', query: 'How do I mark daily student attendance for my assigned class?' },
                { label: '📝 How to enter exam marks?', query: 'How do I enter and save term marks or class test marks?' },
                { label: '🔒 What can I access?', query: 'Which pages and features can I access with my Teacher role?' }
            );
        } else if (roleLevel === 30) {
            // Accountant
            basePrompts.push(
                { label: '💵 How to collect fees?', query: 'How do I collect student tuition fees and print receipts?' },
                { label: '📄 How to print fee vouchers?', query: 'How do I print 3-copy fee slips for students?' },
                { label: '📑 Advance balance settlement', query: 'How does family advance balance settlement work in fee collection?' }
            );
        } else if (roleLevel === 10) {
            // Student / Parent
            basePrompts.push(
                { label: '💳 View fee slips', query: 'How can I view my fee voucher and payment status?' },
                { label: '📜 Result card access', query: 'When and how will my term exam result card be visible?' }
            );
        }

        // Add a security test prompt to demonstrate refusal handling
        if (roleLevel < 90) {
            basePrompts.push({
                label: '🛡️ Test access check',
                query: 'Can you show me the school monthly financial expense totals and all staff salaries?'
            });
        }

        return basePrompts.slice(0, 4);
    }, [pathname, roleLevel]);

    // ─── Handle Sending Message ────────────────────────────────────────────────
    const handleSend = async (queryText?: string) => {
        const textToSend = (queryText || input).trim();
        if (!textToSend || isTyping) return;

        const userMsg: ChatMessage = {
            id: 'u-' + Date.now(),
            sender: 'user',
            text: textToSend,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsTyping(true);

        // Simulate typing latency and fetch mock response
        setTimeout(() => {
            const agentReply = generateMockResponse(textToSend, userRole, roleLevel, pathname);
            setMessages(prev => [...prev, agentReply]);
            setIsTyping(false);
            if (!isOpen) setHasUnread(true);
        }, 650);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const clearChat = () => {
        if (!confirm('Clear chat history?')) return;
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

    // If not logged in, do not render agent widget
    if (!isLoggedIn || !user) return null;

    return (
        <aside aria-label="School AI Support Assistant" className="support-agent-wrapper">
            {/* ── Floating Launcher Button ── */}
            {!isOpen && (
                <button
                    type="button"
                    className="agent-launcher-btn shadow-lg"
                    onClick={() => { setIsOpen(true); setIsMinimized(false); setHasUnread(false); }}
                    title="Open AI School Support Assistant"
                    aria-label="Open AI School Support Assistant"
                >
                    <div className="agent-launcher-inner">
                        <i className="bi bi-stars launcher-sparkle"></i>
                        <i className="bi bi-chat-dots-fill launcher-chat-icon"></i>
                        <span className="agent-launcher-text">AI Support</span>
                    </div>
                    {hasUnread && <span className="agent-unread-dot" />}
                </button>
            )}

            {/* ── Chat Container ── */}
            {isOpen && (
                <div className={`agent-chat-card shadow-2xl ${isMinimized ? 'minimized' : ''}`}>
                    {/* Header */}
                    <div className="agent-header">
                        <div className="agent-header-left">
                            <div className="agent-avatar">
                                <i className="bi bi-robot"></i>
                                <span className="agent-online-dot"></span>
                            </div>
                            <div className="agent-header-info">
                                <div className="agent-title-row">
                                    <h2 className="agent-title">School Support AI</h2>
                                    <span className="agent-badge-role" title={`Logged in role: ${userRole} (Level ${roleLevel})`}>
                                        {userRole}
                                    </span>
                                </div>
                                <span className="agent-subtitle">Role-Aware Assistant • Online</span>
                            </div>
                        </div>

                        <div className="agent-header-actions">
                            <button
                                type="button"
                                className="agent-btn-icon"
                                onClick={() => setIsMinimized(prev => !prev)}
                                title={isMinimized ? 'Expand' : 'Minimize'}
                            >
                                <i className={`bi bi-${isMinimized ? 'arrows-angle-expand' : 'dash-lg'}`}></i>
                            </button>
                            <button
                                type="button"
                                className="agent-btn-icon"
                                onClick={clearChat}
                                title="Clear Conversation"
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

                    {/* Body (Collapses when minimized) */}
                    {!isMinimized && (
                        <>
                            {/* Message Stream */}
                            <div className="agent-body">
                                <div className="agent-intro-banner">
                                    <i className="bi bi-shield-lock-fill me-1 text-teal"></i>
                                    <span>
                                        Responses are strictly personalized to your permissions as <strong>{userRole}</strong>.
                                    </span>
                                </div>

                                <div className="agent-messages-list">
                                    {messages.map(msg => (
                                        <div
                                            key={msg.id}
                                            className={`agent-message-row ${msg.sender === 'user' ? 'msg-user' : 'msg-agent'}`}
                                        >
                                            {msg.sender === 'agent' && (
                                                <div className="msg-avatar-icon">
                                                    <i className="bi bi-robot"></i>
                                                </div>
                                            )}
                                            <div className={`agent-message-bubble ${msg.isRefusal ? 'msg-refusal' : ''}`}>
                                                <div className="msg-text-content">{renderFormattedText(msg.text)}</div>

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

                                    {isTyping && (
                                        <div className="agent-message-row msg-agent">
                                            <div className="msg-avatar-icon">
                                                <i className="bi bi-robot"></i>
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

                                {/* Suggested Prompts */}
                                {quickPrompts.length > 0 && (
                                    <div className="agent-prompts-bar">
                                        <span className="prompts-label">Quick Suggestions:</span>
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

                            {/* Input Form */}
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
                                        title="Send question"
                                    >
                                        <i className="bi bi-send-fill"></i>
                                    </button>
                                </div>
                                <div className="agent-footer-note">
                                    Role-Aware Support Engine • LangChain &amp; LangGraph
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ── Embedded Scoped CSS ── */}
            <style>{`
                /* ─ Launcher Button ─ */
                .support-agent-wrapper {
                    position: fixed;
                    bottom: 1.5rem;
                    right: 1.5rem;
                    z-index: 99999;
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                }
                .agent-launcher-btn {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    background: linear-gradient(135deg, #215E61 0%, #233D4D 100%);
                    color: #fff;
                    border: 2px solid rgba(255, 255, 255, 0.25);
                    border-radius: 50px;
                    padding: 0.65rem 1.15rem;
                    cursor: pointer;
                    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
                    position: relative;
                }
                .agent-launcher-btn:hover {
                    transform: translateY(-2px) scale(1.03);
                    box-shadow: 0 10px 25px rgba(33, 94, 97, 0.45);
                    border-color: #FE7F2D;
                }
                .agent-launcher-inner {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }
                .launcher-sparkle {
                    color: #FE7F2D;
                    font-size: 1.1rem;
                    animation: pulseSparkle 2s infinite;
                }
                .launcher-chat-icon {
                    font-size: 1.1rem;
                }
                .agent-launcher-text {
                    font-weight: 700;
                    font-size: 0.88rem;
                    letter-spacing: 0.2px;
                }
                .agent-unread-dot {
                    position: absolute;
                    top: 2px;
                    right: 2px;
                    width: 12px;
                    height: 12px;
                    background: #FE7F2D;
                    border: 2px solid #fff;
                    border-radius: 50%;
                }

                /* ─ Chat Card (Desktop) ─ */
                .agent-chat-card {
                    width: 390px;
                    height: 590px;
                    background: #ffffff;
                    border-radius: 18px;
                    border: 1px solid rgba(33, 94, 97, 0.15);
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    box-shadow: 0 12px 40px rgba(35, 61, 77, 0.28);
                    animation: popIn 0.22s cubic-bezier(0.16, 1, 0.3, 1);
                }
                .agent-chat-card.minimized {
                    height: auto !important;
                    box-shadow: 0 6px 20px rgba(35, 61, 77, 0.2);
                }

                /* ─ Header ─ */
                .agent-header {
                    background: linear-gradient(135deg, #233D4D 0%, #215E61 100%);
                    color: #fff;
                    padding: 0.85rem 1rem;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    flex-shrink: 0;
                }
                .agent-header-left {
                    display: flex;
                    align-items: center;
                    gap: 0.65rem;
                }
                .agent-avatar {
                    width: 38px;
                    height: 38px;
                    background: rgba(255, 255, 255, 0.15);
                    border: 1.5px solid rgba(254, 127, 45, 0.6);
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1.25rem;
                    color: #fff;
                    position: relative;
                }
                .agent-online-dot {
                    position: absolute;
                    bottom: -2px;
                    right: -2px;
                    width: 9px;
                    height: 9px;
                    background: #10b981;
                    border: 1.5px solid #233D4D;
                    border-radius: 50%;
                }
                .agent-header-info {
                    display: flex;
                    flex-direction: column;
                }
                .agent-title-row {
                    display: flex;
                    align-items: center;
                    gap: 0.45rem;
                }
                .agent-title {
                    font-size: 0.95rem;
                    font-weight: 700;
                    margin: 0;
                    color: #fff;
                    line-height: 1.2;
                }
                .agent-badge-role {
                    background: rgba(254, 127, 45, 0.22);
                    border: 1px solid #FE7F2D;
                    color: #fff;
                    font-size: 0.65rem;
                    font-weight: 700;
                    padding: 0.1rem 0.45rem;
                    border-radius: 10px;
                    text-transform: uppercase;
                    letter-spacing: 0.3px;
                }
                .agent-subtitle {
                    font-size: 0.72rem;
                    color: rgba(255, 255, 255, 0.75);
                }
                .agent-header-actions {
                    display: flex;
                    align-items: center;
                    gap: 0.25rem;
                }
                .agent-btn-icon {
                    background: transparent;
                    border: none;
                    color: rgba(255, 255, 255, 0.8);
                    width: 28px;
                    height: 28px;
                    border-radius: 6px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    font-size: 0.88rem;
                    transition: background 0.15s, color 0.15s;
                }
                .agent-btn-icon:hover {
                    background: rgba(255, 255, 255, 0.18);
                    color: #fff;
                }

                /* ─ Body ─ */
                .agent-body {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    background: #f8fafb;
                }
                .agent-intro-banner {
                    background: #eaf5f6;
                    border-bottom: 1px solid #c7e5e7;
                    padding: 0.45rem 0.85rem;
                    font-size: 0.72rem;
                    color: #215E61;
                    display: flex;
                    align-items: center;
                }
                .agent-messages-list {
                    flex: 1;
                    overflow-y: auto;
                    padding: 0.9rem 0.85rem;
                    display: flex;
                    flex-direction: column;
                    gap: 0.75rem;
                }

                /* ─ Message Bubbles ─ */
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
                    background: #215E61;
                    color: #fff;
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 0.85rem;
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
                    opacity: 0.65;
                    text-align: right;
                }
                .msg-links-container {
                    margin-top: 0.5rem;
                    display: flex;
                    flex-direction: column;
                    gap: 0.3rem;
                }
                .msg-link-pill {
                    background: #eaf5f6;
                    border: 1px solid #215E61;
                    color: #215E61;
                    padding: 0.25rem 0.6rem;
                    border-radius: 6px;
                    font-size: 0.74rem;
                    font-weight: 600;
                    text-align: left;
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
                    gap: 0.4rem;
                    overflow-x: auto;
                    padding-bottom: 2px;
                    scrollbar-width: none;
                }
                .prompts-scroll-box::-webkit-scrollbar { display: none; }
                .prompt-chip-btn {
                    white-space: nowrap;
                    background: #f3f8f8;
                    border: 1px solid #c9e2e4;
                    color: #215E61;
                    font-size: 0.74rem;
                    font-weight: 500;
                    padding: 0.25rem 0.65rem;
                    border-radius: 20px;
                    cursor: pointer;
                    transition: all 0.15s;
                    flex-shrink: 0;
                }
                .prompt-chip-btn:hover {
                    background: #215E61;
                    border-color: #215E61;
                    color: #fff;
                }

                /* ─ Footer Input ─ */
                .agent-footer {
                    background: #fff;
                    border-top: 1px solid #e0eeef;
                    padding: 0.65rem 0.85rem 0.5rem;
                    flex-shrink: 0;
                }
                .agent-input-wrap {
                    display: flex;
                    align-items: center;
                    gap: 0.4rem;
                    background: #f7fafb;
                    border: 1.5px solid #c7dfe1;
                    border-radius: 25px;
                    padding: 0.2rem 0.35rem 0.2rem 0.85rem;
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
                    width: 32px;
                    height: 32px;
                    background: #215E61;
                    color: #fff;
                    border: none;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 0.82rem;
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
                .agent-footer-note {
                    text-align: center;
                    font-size: 0.63rem;
                    color: #94a3b8;
                    margin-top: 0.35rem;
                }

                /* ─ Animations ─ */
                @keyframes pulseSparkle {
                    0%, 100% { transform: scale(1) rotate(0deg); opacity: 0.9; }
                    50% { transform: scale(1.18) rotate(15deg); opacity: 1; }
                }
                @keyframes typingBlink {
                    0%, 80%, 100% { transform: scale(0.6); opacity: 0.3; }
                    40% { transform: scale(1); opacity: 1; }
                }
                @keyframes popIn {
                    from { transform: scale(0.92) translateY(16px); opacity: 0; }
                    to { transform: scale(1) translateY(0); opacity: 1; }
                }

                /* ─ Mobile Specific Responsive Drawer (Strict) ─ */
                @media (max-width: 640px) {
                    .support-agent-wrapper {
                        bottom: 1rem;
                        right: 1rem;
                    }
                    .agent-launcher-btn {
                        padding: 0.65rem 0.9rem;
                    }
                    .agent-chat-card {
                        position: fixed;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        width: 100vw !important;
                        height: 100dvh !important;
                        max-height: 100dvh !important;
                        border-radius: 0;
                        border: none;
                        z-index: 100000;
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

// ─── Formatting Helper ───────────────────────────────────────────────────────
function renderFormattedText(text: string) {
    // Basic formatting: bold **text**, bullet points, emojis
    const lines = text.split('\n');
    return (
        <div>
            {lines.map((line, i) => {
                const isBullet = line.trim().startsWith('- ') || line.trim().startsWith('• ');
                const cleanLine = isBullet ? line.trim().substring(2) : line;

                // Simple parser for **bold**
                const parts = cleanLine.split(/(\*\*.*?\*\*)/g);

                return (
                    <div key={i} className={isBullet ? 'ps-3 mb-1' : 'mb-1'}>
                        {isBullet && <span className="me-1 text-teal">•</span>}
                        {parts.map((p, pIdx) => {
                            if (p.startsWith('**') && p.endsWith('**')) {
                                return <strong key={pIdx}>{p.slice(2, -2)}</strong>;
                            }
                            return <span key={pIdx}>{p}</span>;
                        })}
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
            text: `👋 Greetings **${name}**! I am your **Administrator AI Support Assistant**.\n\nYou have unrestricted administrative access across all modules (Academic, Fees, Attendance, Examination, Expenses, and Settings).\n\nAsk me how to configure workflows, set class priorities, verify notifications, or navigate any management screen.`
        };
    }
    if (cleanRole.includes('teacher') || cleanRole.includes('incharge')) {
        return {
            text: `👋 Hello **${name}**! I am your **Academic & Teaching Assistant**.\n\nI can guide you on **daily student attendance**, **entering exam & class test marks**, or reviewing your assigned classes.\n\nHow can I help you today?`
        };
    }
    if (cleanRole.includes('accountant') || cleanRole.includes('cashier')) {
        return {
            text: `👋 Welcome **${name}**! I am your **Fee & Financial Support Assistant**.\n\nI can assist you with **fee collection workflows**, **generating monthly slips**, **printing 3-copy vouchers**, or settling family advance balances.\n\nWhat would you like assistance with?`
        };
    }
    if (cleanRole.includes('student') || cleanRole.includes('parent') || cleanRole.includes('family')) {
        return {
            text: `👋 Hello **${name}**! Welcome to the **Student & Family Support Portal**.\n\nI can guide you on how to check your **monthly fee slips**, **attendance record**, and **published examination result cards**.\n\nHow may I help you?`
        };
    }
    return {
        text: `👋 Hello **${name}**! I am your **School Support AI Assistant**.\n\nI am configured with your active role (**${role}**). Ask me any question regarding your permitted pages, operational procedures, or system notifications.`
    };
}

// ─── Mock Role-Aware Agent Reasoning Engine (Phase 1 Step 1) ─────────────────
function generateMockResponse(query: string, role: string, roleLevel: number, currentPath: string): ChatMessage {
    const qLower = query.toLowerCase();
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // ── 1. SECURITY / RBAC BYPASS REFUSAL TESTS ──
    const restrictedFinanceKeywords = ['salary', 'salaries', 'profit', 'expense totals', 'school revenue', 'delete employee', 'delete user', 'drop table', 'system password'];
    const isAskingRestrictedFinance = restrictedFinanceKeywords.some(k => qLower.includes(k));

    if (isAskingRestrictedFinance && roleLevel < 90) {
        return {
            id: 'agent-' + Date.now(),
            sender: 'agent',
            isRefusal: true,
            text: `⚠️ **Access Restricted (RBAC Protection)**\n\nYou do not have authorization to view school financial totals, employee payroll, or user credentials with your current role (**${role}**).\n\nThis security rule is strictly enforced by system policy. If you believe you require access to this information, please contact the **School Administrator**.`,
            timestamp
        };
    }

    // ── 2. WHAT DOES THIS PAGE DO? ──
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

    // ── 3. PRIORITY SETTING ──
    if (qLower.includes('priority') || qLower.includes('drag') || qLower.includes('class order')) {
        if (roleLevel < 90) {
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
            text: `✨ **How Class & Section Priority Works:**\n\n1. Go to **Academic → Priority Setting**.\n2. **Classes Order**: Drag any class card up or down (smallest classes like Reception/Nursery should be at the top).\n3. **Sections Order**: Click on any class to expand its section pills, then drag the pills to order them (e.g. A → B → C).\n4. **Duplicate Warnings**: If duplicate names exist (e.g., 'Class 1' and 'Class One'), a yellow **Possible Duplicate** badge appears.\n5. Click **Save Order** to apply the priority across Fee Slips, Attendance, Examination, and Reports.`,
            pageLinks: [{ label: 'Open Priority Setting', href: '/academic/priority' }],
            timestamp
        };
    }

    // ── 4. HOW TO MARK ATTENDANCE ──
    if (qLower.includes('attendance') && (qLower.includes('mark') || qLower.includes('how do i') || qLower.includes('daily'))) {
        return {
            id: 'agent-' + Date.now(),
            sender: 'agent',
            text: `📋 **Daily Student Attendance Procedure:**\n\n1. Open **Attendance → Student Attendance**.\n2. Select your assigned **Class** and **Section** from the dropdowns.\n3. The system defaults all students to **Present**.\n4. Click **A** for Absent, **L** for Late, or **LV** for Approved Leave.\n5. Holidays and locked days cannot be altered unless you possess administrative override permissions.\n6. Click **Save Attendance** to record entries. Automated SMS/push notifications are sent to parents according to school notification policy.`,
            pageLinks: [{ label: 'Go to Student Attendance', href: '/attendance/students' }],
            timestamp
        };
    }

    // ── 5. HOW TO ENTER EXAM MARKS ──
    if (qLower.includes('exam') || qLower.includes('marks') || qLower.includes('test marking')) {
        return {
            id: 'agent-' + Date.now(),
            sender: 'agent',
            text: `✍️ **Examination Marks Workflow:**\n\n- **Term Exams**: Go to **Examination → Marks Entry**, pick the active Term, Class, Section, and Subject. Enter scored marks out of total.\n- **Class Tests**: Go to **Examination → Test Marking** for weekly assessments.\n- **Approvals**: Once marks are submitted by the teacher, they must be approved in **Marks Approval & Publishing** before result cards become accessible on the portal.`,
            pageLinks: [
                { label: 'Marks Entry', href: '/examination/marks' },
                { label: 'Test Marking', href: '/examination/test-marking' }
            ],
            timestamp
        };
    }

    // ── 6. FEE COLLECTION & PRINTING ──
    if (qLower.includes('fee') || qLower.includes('collect') || qLower.includes('voucher') || qLower.includes('slip')) {
        if (roleLevel === 50) {
            return {
                id: 'agent-' + Date.now(),
                sender: 'agent',
                isRefusal: true,
                text: `⚠️ **Notice for Teachers:**\n\nFee collection, slip generation, and financial ledgers are restricted to the **Accounts Department**. Teachers can only view assigned academic classes and student attendance.`,
                timestamp
            };
        }
        return {
            id: 'agent-' + Date.now(),
            sender: 'agent',
            text: `💵 **Fee Collection & Voucher Guide:**\n\n1. **Collect Fees**: Navigate to **Fee Management → Collect Fees**. Enter Student Roll No or Family ID.\n2. **Advance Balances**: If the family has an advance credit balance, you can check **Apply Advance** to automatically reduce the payable amount.\n3. **Print Slips**: In **Fee Management → Print Slips**, select the billing month to print standardized 3-copy bank vouchers (Bank, School, and Student copies).`,
            pageLinks: [
                { label: 'Collect Fees Screen', href: '/fees/collect' },
                { label: 'Print Fee Slips', href: '/fees/print' }
            ],
            timestamp
        };
    }

    // ── 7. PERMITTED PAGES & ROLES ──
    if (qLower.includes('what can i access') || qLower.includes('my role') || qLower.includes('permissions') || qLower.includes('which pages')) {
        return {
            id: 'agent-' + Date.now(),
            sender: 'agent',
            text: `🔐 **Your Role Profile:**\n\n- **Role Name**: ${role}\n- **Role Level**: ${roleLevel} / 100\n\n**Allowed Capabilities:**\n${getRoleCapabilitiesList(roleLevel)}`,
            timestamp
        };
    }

    // ── 8. NOTIFICATIONS ──
    if (qLower.includes('notification') || qLower.includes('alert') || qLower.includes('message')) {
        return {
            id: 'agent-' + Date.now(),
            sender: 'agent',
            text: `🔔 **Notification System Rules for ${role}:**\n\n${getNotificationExplanation(roleLevel)}`,
            timestamp
        };
    }

    // ── 9. DEFAULT HELPFUL FALLBACK ──
    return {
        id: 'agent-' + Date.now(),
        sender: 'agent',
        text: `I understand your question regarding **"${query}"**.\n\nAs your **${role} Support Assistant**, I can guide you through system workflows, page navigation, attendance protocols, and examination procedures.\n\nFeel free to click any of the **Quick Suggestions** below or ask a specific workflow question!`,
        timestamp
    };
}

function getRoleCapabilitiesList(roleLevel: number): string {
    if (roleLevel >= 90) {
        return `• Full School Settings & System Backups\n• User Account Management & Role Permission Editing\n• Class & Section Priority Setting\n• Full Fee Management & Audit Reports\n• Exam Publishing Approvals & Attendance Policies`;
    }
    if (roleLevel >= 65) {
        return `• Coordinated Class Student Attendance\n• Term Exam Review & Department Oversight\n• Academic Promotion Assistance`;
    }
    if (roleLevel === 50) {
        return `• Daily Student Attendance for assigned classes\n• Marks Entry for assigned subjects\n• Class Test Marking\n• Class Incharge Marks Sheet & Result Card viewing`;
    }
    if (roleLevel === 30) {
        return `• Monthly Fee Slip Generation\n• Fee Collection & Receipt Printing\n• Family Ledger & Advance Balance Management\n• Daily & Monthly Financial Collection Reports\n• School Operational Expense Entry`;
    }
    if (roleLevel === 10) {
        return `• Personal Fee Slip & Payment Status\n• Personal Attendance History\n• Published Term Result Cards`;
    }
    return `• Standard Support Staff Functions\n• Basic Attendance Check-in`;
}

function getNotificationExplanation(roleLevel: number): string {
    if (roleLevel >= 90) {
        return `As Administrator, you receive all operational notices including **Exam Marksheet Submissions awaiting approval**, **Expense approvals**, **Staff daily attendance anomalies**, and **Fee generation summaries**.`;
    }
    if (roleLevel === 50) {
        return `As Teacher, you receive **Direct Staff Announcements**, **Class Teacher Assignment updates**, and alerts when your submitted exam marks are approved or published.`;
    }
    if (roleLevel === 30) {
        return `As Accountant, you receive **Fee Slip Generation confirmations**, **Family Advance Balance adjustment notifications**, and **Expense status updates**.`;
    }
    if (roleLevel === 10) {
        return `As Student/Parent, you strictly receive notices addressed to your family or student ID, such as **Fee Due Reminders**, **Daily Attendance SMS/alerts**, and **Published Term Result Card announcements**.`;
    }
    return `You receive direct notices addressed to your account or general staff announcements.`;
}
