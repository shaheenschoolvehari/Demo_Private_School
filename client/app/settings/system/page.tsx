'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { showToast } from '@/utils/toastHelper';

type SystemSetting = {
    setting_key: string;
    setting_value: string;
    category: string;
    description: string;
    updated_at: string;
};

type DBStats = {
    db_type: string;
    status: string;
    db_name: string;
    size: string;
    connections: string;
    total_tables: number;
    healthy_tables: string;
};

type BackupFile = {
    name: string;
    size: string;
    created_at: string;
};

type ActiveSession = {
    session_id: number;
    user_id: number;
    username: string;
    full_name: string;
    role_name: string;
    ip_address: string;
    user_agent: string;
    remember_me: boolean;
    created_at: string;
    last_activity: string;
    expires_at: string;
};

export default function SystemConfigPage() {
    const [settings, setSettings] = useState<SystemSetting[]>([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<DBStats | null>(null);
    const [activeTab, setActiveTab] = useState('security');
    const [formData, setFormData] = useState<any>({});
    const [saving, setSaving] = useState(false);
    const { hasPermission } = useAuth();

    // Active Sessions State
    const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
    const [loadingSessions, setLoadingSessions] = useState(false);

    // Backup State
    const [backups, setBackups] = useState<BackupFile[]>([]);
    const [creatingBackup, setCreatingBackup] = useState(false);
    const [restoring, setRestoring] = useState(false);
    const [resetting, setResetting] = useState(false);

    // AI Agent & LLM Connectors State
    const [llmProvider, setLlmProvider] = useState('gemini');
    const [llmApiKey, setLlmApiKey] = useState('');
    const [showApiKey, setShowApiKey] = useState(false);
    const [llmModel, setLlmModel] = useState('gemini-2.0-flash');
    const [llmTemperature, setLlmTemperature] = useState('0.3');
    const [llmBaseUrl, setLlmBaseUrl] = useState('');
    const [llmEnabled, setLlmEnabled] = useState(true);
    const [hasApiKey, setHasApiKey] = useState(false);
    const [availableModels, setAvailableModels] = useState<Array<{ id: string; name: string; recommended?: boolean }>>([]);
    const [discoveringModels, setDiscoveringModels] = useState(false);
    const [savingLLM, setSavingLLM] = useState(false);
    const [testingAgent, setTestingAgent] = useState(false);
    const [testAgentQuery, setTestAgentQuery] = useState('How do I mark daily student attendance?');
    const [testAgentResponse, setTestAgentResponse] = useState<any>(null);

    useEffect(() => {
        fetchSettings();
        fetchStats();
        fetchBackups();
        fetchActiveSessions();
        fetchLLMConfig();
    }, []);

    const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://demo-private-school.onrender.com";

    const fetchActiveSessions = async () => {
        setLoadingSessions(true);
        try {
            const res = await fetch(`${API_URL}/auth/active-sessions`);
            if (res.ok) {
                const data = await res.json();
                setActiveSessions(data);
            }
        } catch (e) {
            console.error('Failed to fetch active sessions', e);
        } finally {
            setLoadingSessions(false);
        }
    };

    const fetchLLMConfig = async () => {
        try {
            const res = await fetch(`${API_URL}/system/llm/config`);
            if (res.ok) {
                const data = await res.json();
                setLlmProvider(data.llm_provider || 'gemini');
                setLlmModel(data.llm_model || 'gemini-2.0-flash');
                setLlmTemperature(data.llm_temperature || '0.3');
                setLlmBaseUrl(data.llm_base_url || '');
                setLlmEnabled(data.llm_is_enabled === 'true');
                setHasApiKey(!!data.has_api_key);
                if (data.llm_api_key_masked) {
                    setLlmApiKey(data.llm_api_key_masked);
                }
            }
        } catch (e) {
            console.error('Failed to load LLM config', e);
        }
    };

    const handleDiscoverModels = async (prov = llmProvider, key = llmApiKey, url = llmBaseUrl) => {
        if (!key && !hasApiKey && prov !== 'custom') {
            showToast.error('Please enter an API key first.');
            return;
        }
        setDiscoveringModels(true);
        try {
            const res = await fetch(`${API_URL}/system/llm/models`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider: prov,
                    apiKey: key,
                    customBaseUrl: url
                })
            });
            const data = await res.json();
            if (res.ok && data.models) {
                setAvailableModels(data.models);
                if (data.recommendedModel) {
                    setLlmModel(data.recommendedModel);
                }
                showToast.success(`🎉 Connected! Discovered ${data.models.length} live models for ${prov.toUpperCase()}. Recommended model selected.`);
            } else {
                showToast.error(data.error || 'Failed to fetch models from provider.');
            }
        } catch (e: any) {
            showToast.error('Connection failed: ' + e.message);
        } finally {
            setDiscoveringModels(false);
        }
    };

    const handleSaveLLMConfig = async () => {
        setSavingLLM(true);
        try {
            const res = await fetch(`${API_URL}/system/llm/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    llm_provider: llmProvider,
                    llm_api_key: llmApiKey,
                    llm_model: llmModel,
                    llm_temperature: llmTemperature,
                    llm_base_url: llmBaseUrl,
                    llm_is_enabled: llmEnabled
                })
            });
            const data = await res.json();
            if (res.ok) {
                showToast.success(data.message || 'AI Agent settings saved successfully!');
                fetchLLMConfig();
            } else {
                showToast.error(data.error || 'Failed to save configuration');
            }
        } catch (e: any) {
            showToast.error('Error saving LLM settings: ' + e.message);
        } finally {
            setSavingLLM(false);
        }
    };

    const handleTestAgentPrompt = async () => {
        if (!testAgentQuery.trim()) return;
        setTestingAgent(true);
        setTestAgentResponse(null);
        try {
            const session = sessionStorage.getItem('sms_user_session') || localStorage.getItem('sms_remember_session');
            const token = session ? JSON.parse(session).token : '';
            const res = await fetch(`${API_URL}/agent/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ message: testAgentQuery })
            });
            const data = await res.json();
            setTestAgentResponse(data);
            if (data.access_granted) {
                showToast.success('Test prompt completed successfully!');
            }
        } catch (e: any) {
            showToast.error('Test prompt failed: ' + e.message);
        } finally {
            setTestingAgent(false);
        }
    };

    const handleRevokeSession = async (sessionId: number) => {
        if (!confirm('Are you sure you want to terminate this user session?')) return;
        try {
            const res = await fetch(`${API_URL}/auth/revoke-session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: sessionId })
            });
            if (res.ok) {
                showToast.success('Session terminated successfully.');
                fetchActiveSessions();
            }
        } catch (e) {
            showToast.error('Failed to terminate session.');
        }
    };

    const handleRevokeAllSessions = async () => {
        if (!confirm('WARNING: This will log out all currently active users across all devices. Proceed?')) return;
        try {
            const res = await fetch(`${API_URL}/auth/revoke-all-sessions`, { method: 'POST' });
            if (res.ok) {
                showToast.success('All active sessions terminated.');
                fetchActiveSessions();
            }
        } catch (e) {
            showToast.error('Failed to revoke all sessions.');
        }
    };

    const fetchSettings = async () => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "https://demo-private-school.onrender.com"}/system`);
            const data = await res.json();
            setSettings(data);

            // Map to key-value for form
            const initialForm: any = {};
            data.forEach((s: SystemSetting) => {
                initialForm[s.setting_key] = s.setting_value;
            });
            setFormData(initialForm);
            setLoading(false);
        } catch (err) {
            console.error(err);
            setLoading(false);
        }
    };

    const fetchStats = async () => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "https://demo-private-school.onrender.com"}/system/db-stats`);
            if (res.ok) setStats(await res.json());
        } catch (err) { console.error(err); }
    };

    const fetchBackups = async () => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "https://demo-private-school.onrender.com"}/system/backups`);
            if (res.ok) {
                const data = await res.json();
                setBackups(data);
            }
        } catch (err) { console.error("Failed to fetch backups", err); }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "https://demo-private-school.onrender.com"}/system`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            if (res.ok) {
                showToast.success('System configuration updated successfully.');
                fetchSettings(); // refresh
            }
        } catch (err) {
            console.error(err);
            showToast.error('Failed to save settings.');
        } finally {
            setSaving(false);
        }
    };

    const handleChange = (key: string, value: string) => {
        setFormData({ ...formData, [key]: value });
    };

    // Check for missed auto backups or new backup notifications on load
    useEffect(() => {
        fetch(`${API_URL}/system/backup-notification`)
            .then(res => res.json())
            .then(data => {
                if (data && data.filename && !data.read) {
                    showToast.success(`🎉 Automatic Database Backup Completed!\nFile: ${data.filename}\nLocation: ${data.location || 'Server Backup Storage'}`);
                    fetch(`${API_URL}/system/backup-notification/read`, { method: 'POST' }).catch(() => { });
                }
            })
            .catch(() => { });
    }, [API_URL]);

    const handleCreateBackup = async () => {
        setCreatingBackup(true);
        try {
            const res = await fetch(`${API_URL}/system/backups/create`, { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                showToast.success(`🎉 ${data.message || 'Backup created successfully!'}\nFile: ${data.filename}`);
                fetchBackups();
            } else {
                showToast.error('Error: ' + data.error);
            }
        } catch (err) {
            showToast.error('Failed to create backup');
        } finally {
            setCreatingBackup(false);
        }
    };

    const handleDeleteBackup = async (filename: string) => {
        if (!confirm(`Are you sure you want to delete ${filename}?`)) return;
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "https://demo-private-school.onrender.com"}/system/backups/${filename}`, { method: 'DELETE' });
            if (res.ok) {
                showToast.success('Backup deleted successfully');
                fetchBackups();
            }
        } catch (err) { showToast.error('Failed to delete backup'); }
    };

    const handleDownloadBackup = (filename: string) => {
        window.location.href = `${process.env.NEXT_PUBLIC_API_URL || "https://demo-private-school.onrender.com"}/system/backups/download/${filename}`;
    };

    const handleRestoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;

        const file = e.target.files[0];
        if (!confirm(`WARNING: Restore will overwrite your current database with '${file.name}'. This cannot be undone. Are you sure?`)) {
            e.target.value = ''; // Reset input
            return;
        }

        setRestoring(true);
        const formData = new FormData();
        formData.append('backup_file', file);

        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "https://demo-private-school.onrender.com"}/system/backups/restore`, {
                method: 'POST',
                body: formData
            });
            const data = await res.json();

            if (res.ok) {
                showToast.success(data.message);
                window.location.reload();
            } else {
                showToast.error('Restore Failed: ' + data.error);
            }
        } catch (err) {
            console.error(err);
            showToast.error('Failed to connect to server for restore.');
        } finally {
            setRestoring(false);
            e.target.value = ''; // Reset input
        }
    };

    const handleResetDatabase = async () => {
        const input = prompt("DANGER: This will delete ALL student, fee, exam, attendance, and expense records in the database while preserving table structure and reseeding essential initial data!\nType 'DELETE' to confirm:");
        if (input !== 'DELETE') return;

        setResetting(true);
        try {
            const res = await fetch(`${API_URL}/system/reset-database`, { method: 'POST' });
            const data = await res.json();

            if (res.ok) {
                showToast.success(data.message || 'Database Factory Reset Successful!');
                setTimeout(() => {
                    window.location.href = '/login';
                }, 1500);
            } else {
                showToast.error('Error: ' + (data.error || 'Failed to reset database'));
            }
        } catch (err) {
            showToast.error('Network error during database reset.');
        } finally {
            setResetting(false);
        }
    };

    const renderSettingInput = (setting: SystemSetting) => {
        const key = setting.setting_key;
        const val = formData[key] || '';

        if (key === 'maintenance_mode' || key === 'auto_backup_enabled') {
            return (
                <select
                    className="form-select"
                    value={val}
                    onChange={e => handleChange(key, e.target.value)}
                >
                    <option value="false">Disabled</option>
                    <option value="true">Enabled</option>
                </select>
            );
        }

        if (key === 'backup_frequency') {
            return (
                <select
                    className="form-select"
                    value={val}
                    onChange={e => handleChange(key, e.target.value)}
                >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                </select>
            );
        }

        if (key === 'backup_time') {
            return (
                <input
                    type="time"
                    className="form-control"
                    value={val}
                    onChange={e => handleChange(key, e.target.value)}
                />
            );
        }

        if (key === 'backup_path') {
            return (
                <div className="input-group">
                    <span className="input-group-text bg-light text-muted"><i className="bi bi-folder2-open"></i></span>
                    <input
                        type="text"
                        className="form-control font-monospace"
                        placeholder="e.g. C:\Backups\SchoolSettings"
                        value={val}
                        onChange={e => handleChange(key, e.target.value)}
                    />
                </div>
            );
        }

        return (
            <input
                type="text"
                className="form-control"
                value={val}
                onChange={e => handleChange(key, e.target.value)}
            />
        );
    };

    if (loading) return <div className="p-5 text-center"><div className="spinner-border text-primary"></div></div>;

    // Filter settings by category
    const securitySettings = settings.filter(s => s.category === 'security');
    const dbSettings = settings.filter(s => s.category === 'system'); // maintenance_mode only
    const backupEnabled = formData['auto_backup_enabled'] === 'true';

    return (
        <div className="container-fluid animate__animated animate__fadeIn">
            <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
                <div>
                    <h2 className="h3 mb-0 text-primary-dark">System Configuration</h2>
                    <p className="text-muted">Manage security policies, sessions, and database maintenance.</p>
                </div>
                {/* Save Button for Global Config */}
                {hasPermission('settings', 'write') && (
                    <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                        {saving ? <div className="spinner-border spinner-border-sm me-2"></div> : <i className="bi bi-save me-2"></i>}
                        Save Configuration
                    </button>
                )}
            </div>

            <div className="card card-custom">
                <div className="card-header bg-white border-bottom-0 pb-0 overflow-auto">
                    <ul className="nav nav-tabs card-header-tabs flex-nowrap">
                        <li className="nav-item">
                            <button
                                className={`nav-link ${activeTab === 'security' ? 'active fw-bold text-primary-dark' : 'text-muted'}`}
                                onClick={() => setActiveTab('security')}
                            >
                                <i className="bi bi-shield-lock me-2"></i>Security & Sessions
                            </button>
                        </li>
                        <li className="nav-item">
                            <button
                                className={`nav-link ${activeTab === 'maintenance' ? 'active fw-bold text-primary-dark' : 'text-muted'}`}
                                onClick={() => setActiveTab('maintenance')}
                            >
                                <i className="bi bi-database-gear me-2"></i>Database & Maintenance
                            </button>
                        </li>
                        <li className="nav-item">
                            <button
                                className={`nav-link ${activeTab === 'ai_agent' ? 'active fw-bold text-primary-dark' : 'text-muted'}`}
                                onClick={() => setActiveTab('ai_agent')}
                            >
                                <i className="bi bi-robot me-2"></i>AI Support Agent (LLM)
                            </button>
                        </li>
                    </ul>
                </div>

                <div className="card-body p-4">

                    {/* Security Tab */}
                    {activeTab === 'security' && (
                        <div className="animate__animated animate__fadeIn">
                            <h5 className="mb-4 text-primary-teal"><i className="bi bi-shield-check me-2"></i>Login & Session Policies</h5>
                            <div className="row g-4 mb-5">
                                {securitySettings.map(setting => (
                                    <div key={setting.setting_key} className="col-12 col-md-6">
                                        <label className="form-label fw-semibold">
                                            {setting.setting_key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                                        </label>
                                        {renderSettingInput(setting)}
                                        <small className="text-muted d-block mt-1">{setting.description}</small>
                                    </div>
                                ))}
                            </div>

                            {/* Live Active Sessions Table */}
                            <div className="border-top pt-4">
                                <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                                    <div>
                                        <h5 className="mb-1 text-primary-dark">
                                            <i className="bi bi-people-fill me-2 text-primary-teal"></i>
                                            Active User Sessions ({activeSessions.length})
                                        </h5>
                                        <div className="text-muted small">Real-time active login sessions with IP, device info, and 24H persistence status</div>
                                    </div>
                                    <div className="d-flex gap-2">
                                        <button className="btn btn-outline-secondary btn-sm" onClick={fetchActiveSessions} disabled={loadingSessions}>
                                            <i className={`bi bi-arrow-clockwise me-1 ${loadingSessions ? 'spin' : ''}`}></i> Refresh
                                        </button>
                                        {activeSessions.length > 0 && hasPermission('settings', 'write') && (
                                            <button className="btn btn-outline-danger btn-sm" onClick={handleRevokeAllSessions}>
                                                <i className="bi bi-slash-circle me-1"></i> Revoke All Sessions
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="table-responsive rounded border">
                                    <table className="table table-hover table-striped mb-0 align-middle">
                                        <thead className="table-light">
                                            <tr>
                                                <th>User</th>
                                                <th>Role</th>
                                                <th>IP Address</th>
                                                <th>Device / Browser</th>
                                                <th>Session Type</th>
                                                <th>Logged In</th>
                                                <th>Expires</th>
                                                <th className="text-end">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {activeSessions.length > 0 ? (
                                                activeSessions.map(s => (
                                                    <tr key={s.session_id}>
                                                        <td>
                                                            <div className="fw-bold text-dark">{s.full_name || s.username}</div>
                                                            <div className="text-muted small">@{s.username}</div>
                                                        </td>
                                                        <td>
                                                            <span className="badge bg-info text-dark">{s.role_name || 'User'}</span>
                                                        </td>
                                                        <td className="font-monospace small">{s.ip_address}</td>
                                                        <td>
                                                            <div className="text-truncate small" style={{ maxWidth: '220px' }} title={s.user_agent}>
                                                                <i className="bi bi-display me-1 text-muted"></i>
                                                                {s.user_agent.includes('Mobile') ? 'Mobile Device' : 'Desktop Browser'}
                                                            </div>
                                                        </td>
                                                        <td>
                                                            {s.remember_me ? (
                                                                <span className="badge bg-success-subtle text-success border border-success-subtle">
                                                                    <i className="bi bi-clock-history me-1"></i> 24H Persistent
                                                                </span>
                                                            ) : (
                                                                <span className="badge bg-secondary-subtle text-secondary border border-secondary-subtle">
                                                                    Tab Session
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="small text-muted">{new Date(s.created_at).toLocaleString()}</td>
                                                        <td className="small text-muted">{new Date(s.expires_at).toLocaleString()}</td>
                                                        <td className="text-end">
                                                            {hasPermission('settings', 'write') && (
                                                                <button
                                                                    className="btn btn-outline-danger btn-sm px-2 py-1"
                                                                    onClick={() => handleRevokeSession(s.session_id)}
                                                                    title="Force Logout Session"
                                                                >
                                                                    <i className="bi bi-box-arrow-right me-1"></i> Terminate
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr>
                                                    <td colSpan={8} className="text-center py-4 text-muted">
                                                        {loadingSessions ? 'Loading active user sessions...' : 'No active sessions found.'}
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Maintenance Tab */}
                    {activeTab === 'maintenance' && (
                        <div className="animate__animated animate__fadeIn">
                            {/* Stats & Actions */}
                            <div className="row g-3 mb-5">
                                <div className="col-12 col-md-5">
                                    <div className="card bg-light border-0 shadow-sm h-100">
                                        <div className="card-body">
                                            <h6 className="card-subtitle mb-3 text-muted">
                                                <i className="bi bi-database-fill-check me-2 text-success"></i>
                                                Database Health & Diagnostic Status
                                            </h6>
                                            {stats ? (
                                                <>
                                                    <div className="d-flex justify-content-between mb-2">
                                                        <span>Engine Type</span>
                                                        <span className="fw-bold text-primary-dark">{stats.db_type || 'PostgreSQL'}</span>
                                                    </div>
                                                    <div className="d-flex justify-content-between mb-2">
                                                        <span>Database Name</span>
                                                        <span className="fw-bold">{stats.db_name}</span>
                                                    </div>
                                                    <div className="d-flex justify-content-between mb-2">
                                                        <span>Health Status</span>
                                                        <span className="badge bg-success text-white">
                                                            <i className="bi bi-check-circle-fill me-1"></i>
                                                            {stats.status || 'Connected & Healthy'}
                                                        </span>
                                                    </div>
                                                    <div className="d-flex justify-content-between mb-2">
                                                        <span>Total Tables</span>
                                                        <span className="fw-bold text-success">
                                                            {stats.total_tables ? `${stats.total_tables} Tables (${stats.healthy_tables})` : '41 Tables (41 / 41 Healthy)'}
                                                        </span>
                                                    </div>
                                                    <div className="d-flex justify-content-between mb-2">
                                                        <span>Database Size</span>
                                                        <span className="fw-bold">{stats.size}</span>
                                                    </div>
                                                    <div className="d-flex justify-content-between">
                                                        <span>Active Connections</span>
                                                        <span className="fw-bold">{stats.connections}</span>
                                                    </div>
                                                </>
                                            ) : <div className="text-center py-4"><span className="spinner-border spinner-border-sm"></span></div>}
                                        </div>
                                    </div>
                                </div>
                                <div className="col-12 col-md-7">
                                    <div className="card border-0 shadow-sm h-100">
                                        <div className="card-body d-flex flex-column justify-content-between">
                                            <div className="d-flex justify-content-between align-items-center mb-3">
                                                <div>
                                                    <h6 className="card-subtitle text-dark fw-bold mb-1">
                                                        <i className="bi bi-file-earmark-arrow-down-fill me-2 text-primary"></i>
                                                        Manual Backup (.sql)
                                                    </h6>
                                                    <small className="text-muted">Generates a complete PostgreSQL SQL database dump file.</small>
                                                </div>
                                                {hasPermission('settings', 'write') && (
                                                    <button
                                                        className="btn btn-sm btn-success px-3"
                                                        onClick={handleCreateBackup}
                                                        disabled={creatingBackup}
                                                    >
                                                        {creatingBackup ? <span className="spinner-border spinner-border-sm me-2"></span> : <i className="bi bi-plus-circle me-1"></i>}
                                                        Create Backup (.sql)
                                                    </button>
                                                )}
                                            </div>

                                            <div className="d-flex justify-content-between align-items-center mb-3 pt-3 border-top">
                                                <div>
                                                    <h6 className="card-subtitle text-dark fw-bold mb-1">
                                                        <i className="bi bi-upload me-2 text-warning"></i>
                                                        Restore Database (.sql)
                                                    </h6>
                                                    <small className="text-danger">Overwrites current database schema & records from selected .sql backup!</small>
                                                </div>
                                                {hasPermission('settings', 'write') && (
                                                    <label className={`btn btn-sm btn-outline-danger px-3 ${restoring ? 'disabled' : ''}`}>
                                                        {restoring ? <span className="spinner-border spinner-border-sm me-2"></span> : <i className="bi bi-upload me-1"></i>}
                                                        Upload & Restore
                                                        <input type="file" hidden accept=".sql" onChange={handleRestoreBackup} disabled={restoring} />
                                                    </label>
                                                )}
                                            </div>

                                            {/* DANGER ZONE */}
                                            <div className="d-flex justify-content-between align-items-center pt-3 border-top">
                                                <div>
                                                    <h6 className="card-subtitle text-danger fw-bold mb-1">
                                                        <i className="bi bi-exclamation-triangle-fill me-2"></i>
                                                        Factory Reset Database
                                                    </h6>
                                                    <small className="text-muted d-block">Truncates all user data rows while preserving schema & reseeding essential software defaults.</small>
                                                </div>
                                                {hasPermission('settings', 'delete') && (
                                                    <button
                                                        className={`btn btn-sm btn-danger px-3 ${resetting ? 'disabled' : ''}`}
                                                        onClick={handleResetDatabase}
                                                    >
                                                        {resetting ? <span className="spinner-border spinner-border-sm me-2"></span> : <i className="bi bi-arrow-counterclockwise me-1"></i>}
                                                        Reset Database
                                                    </button>
                                                )}
                                            </div>
                                            {/* END DANGER ZONE */}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Backups List */}
                            <h5 className="mb-3 text-primary-teal d-flex align-items-center justify-content-between">
                                <span><i className="bi bi-folder-symlink-fill me-2"></i>Available Database Backups (.sql)</span>
                                <span className="badge bg-secondary">{backups.length} Files</span>
                            </h5>
                            <div className="table-responsive mb-5 border rounded">
                                <table className="table table-hover mb-0 align-middle">
                                    <thead className="bg-light">
                                        <tr>
                                            <th>Filename</th>
                                            <th>File Size</th>
                                            <th style={{ width: '220px' }}>Created At</th>
                                            <th className="text-end" style={{ width: '180px' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {backups.length === 0 ? (
                                            <tr><td colSpan={4} className="text-center py-4 text-muted">No .sql backups found. Click &quot;Create Backup (.sql)&quot; above to generate one.</td></tr>
                                        ) : (
                                            backups.map(file => (
                                                <tr key={file.name}>
                                                    <td className="align-middle fw-semibold font-monospace">
                                                        <i className="bi bi-filetype-sql text-primary me-2 fs-5"></i>
                                                        {file.name}
                                                    </td>
                                                    <td className="align-middle">
                                                        <span className="badge bg-light text-dark border">{file.size}</span>
                                                    </td>
                                                    <td className="align-middle text-muted small">
                                                        {new Date(file.created_at).toLocaleString()}
                                                    </td>
                                                    <td className="text-end">
                                                        <div className="btn-group btn-group-sm">
                                                            <button
                                                                className="btn btn-outline-primary"
                                                                title="Download SQL File"
                                                                onClick={() => handleDownloadBackup(file.name)}
                                                            >
                                                                <i className="bi bi-download me-1"></i> Download
                                                            </button>
                                                            {hasPermission('settings', 'delete') && (
                                                                <button
                                                                    className="btn btn-outline-danger"
                                                                    title="Delete"
                                                                    onClick={() => handleDeleteBackup(file.name)}
                                                                >
                                                                    <i className="bi bi-trash"></i>
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* AUTO BACKUP CONFIGURATION (2 TIMES PER DAY) */}
                            <h5 className="mb-3 text-primary-teal">
                                <i className="bi bi-clock-history me-2"></i>2-Times Daily Auto Backup System
                            </h5>
                            <div className="card border-0 shadow-sm mb-4" style={{ borderLeft: '4px solid #215E61', borderRadius: 12 }}>
                                <div className="card-body p-4">
                                    <div className="row g-4">

                                        {/* Enable / Disable */}
                                        <div className="col-12 col-md-6">
                                            <label className="form-label fw-semibold">
                                                <i className="bi bi-toggle-on me-2 text-success"></i>Auto Backup Status
                                            </label>
                                            <select
                                                className="form-select"
                                                value={formData['auto_backup_enabled'] || 'false'}
                                                onChange={e => handleChange('auto_backup_enabled', e.target.value)}
                                            >
                                                <option value="false">Disabled</option>
                                                <option value="true">Enabled (2 Times Daily Automatic)</option>
                                            </select>
                                            <small className="text-muted">Automatically triggers full SQL database backup twice per day.</small>
                                        </div>

                                        {/* Storage Location Path */}
                                        <div className="col-12 col-md-6">
                                            <label className="form-label fw-semibold">
                                                <i className="bi bi-folder2-open me-2 text-primary"></i>Backup Destination Storage Path
                                            </label>
                                            <div className="input-group">
                                                <span className="input-group-text bg-light">
                                                    <i className="bi bi-hdd-network"></i>
                                                </span>
                                                <input
                                                    type="text"
                                                    className="form-control font-monospace"
                                                    placeholder="e.g. D:\Falcon School System\Backups"
                                                    value={formData['backup_path'] || ''}
                                                    disabled={!backupEnabled}
                                                    onChange={e => handleChange('backup_path', e.target.value)}
                                                />
                                            </div>
                                            <small className="text-muted">Target directory path where automatic .sql database backups will be saved.</small>
                                        </div>

                                        {/* Time 1 Picker */}
                                        <div className="col-12 col-md-6">
                                            <label className="form-label fw-semibold">
                                                <i className="bi bi-brightness-high me-2 text-warning"></i>Shift 1 Daily Backup Time (Morning) <span className="text-danger">*</span>
                                            </label>
                                            <input
                                                type="time"
                                                className="form-control"
                                                value={formData['backup_time_1'] || formData['backup_time'] || '08:00'}
                                                disabled={!backupEnabled}
                                                onChange={e => {
                                                    handleChange('backup_time_1', e.target.value);
                                                    handleChange('backup_time', e.target.value);
                                                }}
                                            />
                                            <small className="text-muted">First scheduled daily database backup time (24h format).</small>
                                        </div>

                                        {/* Time 2 Picker */}
                                        <div className="col-12 col-md-6">
                                            <label className="form-label fw-semibold">
                                                <i className="bi bi-moon-stars me-2 text-info"></i>Shift 2 Daily Backup Time (Evening) <span className="text-danger">*</span>
                                            </label>
                                            <input
                                                type="time"
                                                className="form-control"
                                                value={formData['backup_time_2'] || '20:00'}
                                                disabled={!backupEnabled}
                                                onChange={e => handleChange('backup_time_2', e.target.value)}
                                            />
                                            <small className="text-muted">Second scheduled daily database backup time (24h format).</small>
                                        </div>

                                    </div>

                                    {backupEnabled ? (
                                        <div className="alert alert-success d-flex align-items-center gap-2 mt-4 mb-0" role="alert">
                                            <i className="bi bi-check-circle-fill fs-5"></i>
                                            <div>
                                                <strong>2-Times Daily Auto Backup Active</strong> &mdash; Full database backups will be generated twice every day at{' '}
                                                <strong>{formData['backup_time_1'] || '08:00'}</strong> and <strong>{formData['backup_time_2'] || '20:00'}</strong> and saved automatically to target location.
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="alert alert-warning d-flex align-items-center gap-2 mt-4 mb-0" role="alert">
                                            <i className="bi bi-exclamation-triangle-fill fs-5"></i>
                                            <div>Auto Backup is currently <strong>Disabled</strong>. Select &quot;Enabled&quot; above and click <strong>Save Configuration</strong> to start automated daily backups.</div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                    {/* AI Support Agent & LLM Connectors Tab */}
                    {activeTab === 'ai_agent' && (
                        <div className="animate__animated animate__fadeIn">
                            {/* Header Section */}
                            <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4 p-3 bg-light rounded-3 border">
                                <div>
                                    <h5 className="mb-1 text-primary-teal d-flex align-items-center gap-2">
                                        <i className="bi bi-robot fs-4"></i>
                                        <span>AI Support Agent &amp; LLM Multi-Provider Connectors</span>
                                    </h5>
                                    <p className="text-muted small mb-0">
                                        Configure API keys and connect flagship models from Google Gemini, OpenAI, Claude, Grok, OpenRouter, or Kimi.
                                    </p>
                                </div>
                                <div className="d-flex align-items-center gap-2">
                                    <span className={`badge px-3 py-2 ${llmEnabled ? 'bg-success' : 'bg-secondary'}`}>
                                        <i className={`bi ${llmEnabled ? 'bi-check-circle-fill' : 'bi-pause-circle-fill'} me-1`}></i>
                                        {llmEnabled ? 'Agent Active' : 'Agent Paused'}
                                    </span>
                                    <div className="form-check form-switch ms-2">
                                        <input
                                            className="form-check-input"
                                            type="checkbox"
                                            role="switch"
                                            id="llmEnableSwitch"
                                            checked={llmEnabled}
                                            onChange={e => setLlmEnabled(e.target.checked)}
                                        />
                                        <label className="form-check-label small fw-semibold" htmlFor="llmEnableSwitch">
                                            Enable AI
                                        </label>
                                    </div>
                                </div>
                            </div>

                            {/* Provider Selection Grid */}
                            <div className="mb-4">
                                <label className="form-label fw-bold text-dark d-flex align-items-center gap-2 mb-2">
                                    <i className="bi bi-grid-fill text-primary"></i>
                                    <span>Select LLM Provider Company:</span>
                                </label>
                                <div className="row g-3">
                                    {[
                                        { id: 'gemini', name: 'Google Gemini', badge: 'Recommended', icon: 'bi-google', desc: 'Fast, highly accurate, free tier' },
                                        { id: 'openai', name: 'OpenAI', badge: 'Industry Standard', icon: 'bi-robot', desc: 'GPT-4o, GPT-4o-mini' },
                                        { id: 'claude', name: 'Anthropic Claude', badge: 'High Reasoning', icon: 'bi-chat-heart', desc: 'Claude 3.5 Sonnet, Haiku' },
                                        { id: 'openrouter', name: 'OpenRouter', badge: '200+ Models', icon: 'bi-cpu', desc: 'DeepSeek, Llama 3.3, Mistral' },
                                        { id: 'grok', name: 'xAI Grok', badge: 'xAI', icon: 'bi-lightning-charge', desc: 'Grok-2, Grok-2-mini' },
                                        { id: 'kimi', name: 'Kimi (Moonshot)', badge: 'Long Context', icon: 'bi-moon-stars', desc: 'Moonshot-v1-32k/128k' },
                                        { id: 'groq', name: 'Groq', badge: 'Ultra-Fast', icon: 'bi-speedometer2', desc: 'Llama 3.3 70B (Sub-second)' },
                                        { id: 'custom', name: 'Custom / Ollama', badge: 'Self-Hosted', icon: 'bi-hdd-network', desc: 'Local endpoint or private proxy' }
                                    ].map(p => {
                                        const isSelected = llmProvider === p.id;
                                        return (
                                            <div key={p.id} className="col-12 col-sm-6 col-md-3">
                                                <div
                                                    className={`card h-100 p-3 border-2 cursor-pointer transition-all ${
                                                        isSelected ? 'border-primary bg-primary bg-opacity-10 shadow-sm' : 'border-light-subtle hover-shadow'
                                                    }`}
                                                    onClick={() => {
                                                        setLlmProvider(p.id);
                                                        setAvailableModels([]);
                                                    }}
                                                    style={{ cursor: 'pointer' }}
                                                >
                                                    <div className="d-flex justify-content-between align-items-start mb-2">
                                                        <i className={`bi ${p.icon} fs-3 ${isSelected ? 'text-primary' : 'text-muted'}`}></i>
                                                        <span className={`badge ${isSelected ? 'bg-primary' : 'bg-light text-dark border'}`} style={{ fontSize: '10px' }}>
                                                            {p.badge}
                                                        </span>
                                                    </div>
                                                    <div className="fw-bold mb-1" style={{ color: isSelected ? 'var(--bs-primary)' : 'inherit' }}>
                                                        {p.name}
                                                    </div>
                                                    <small className="text-muted" style={{ fontSize: '11px' }}>{p.desc}</small>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Credentials & Dynamic Model Discovery Form */}
                            <div className="card border p-4 mb-4 bg-white rounded-3 shadow-sm">
                                <div className="row g-4">
                                    {/* API Key Field */}
                                    <div className="col-12 col-md-7">
                                        <div className="d-flex justify-content-between align-items-center mb-1">
                                            <label className="form-label fw-bold mb-0">
                                                <i className="bi bi-key-fill text-warning me-1"></i>
                                                {llmProvider.toUpperCase()} API Key <span className="text-danger">*</span>
                                            </label>
                                            <small>
                                                <a
                                                    href={
                                                        llmProvider === 'gemini' ? 'https://aistudio.google.com/app/apikey' :
                                                        llmProvider === 'openai' ? 'https://platform.openai.com/api-keys' :
                                                        llmProvider === 'claude' ? 'https://console.anthropic.com/settings/keys' :
                                                        llmProvider === 'openrouter' ? 'https://openrouter.ai/keys' :
                                                        llmProvider === 'grok' ? 'https://console.x.ai/' :
                                                        llmProvider === 'kimi' ? 'https://platform.moonshot.cn/console/api-keys' :
                                                        llmProvider === 'groq' ? 'https://console.groq.com/keys' : '#'
                                                    }
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-decoration-none"
                                                >
                                                    Get API Key <i className="bi bi-box-arrow-up-right ms-1"></i>
                                                </a>
                                            </small>
                                        </div>
                                        <div className="input-group">
                                            <input
                                                type={showApiKey ? 'text' : 'password'}
                                                className="form-control"
                                                placeholder={
                                                    llmProvider === 'gemini' ? 'AIzaSy...' :
                                                    llmProvider === 'openai' ? 'sk-proj-...' :
                                                    llmProvider === 'claude' ? 'sk-ant-...' :
                                                    llmProvider === 'openrouter' ? 'sk-or-v1-...' :
                                                    'Paste your API key here'
                                                }
                                                value={llmApiKey}
                                                onChange={e => setLlmApiKey(e.target.value)}
                                            />
                                            <button
                                                type="button"
                                                className="btn btn-outline-secondary"
                                                onClick={() => setShowApiKey(!showApiKey)}
                                                title={showApiKey ? 'Hide' : 'Show'}
                                            >
                                                <i className={`bi ${showApiKey ? 'bi-eye-slash' : 'bi-eye'}`}></i>
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-teal text-white fw-semibold"
                                                onClick={() => handleDiscoverModels()}
                                                disabled={discoveringModels}
                                            >
                                                {discoveringModels ? (
                                                    <>
                                                        <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                                                        Connecting...
                                                    </>
                                                ) : (
                                                    <>
                                                        <i className="bi bi-magic me-1"></i>
                                                        Discover Models
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                        <small className="text-muted d-block mt-1">
                                            Click <strong>&quot;Discover Models&quot;</strong> to test your key live and auto-select the best flagship model.
                                        </small>
                                    </div>

                                    {/* Model Selection Field */}
                                    <div className="col-12 col-md-5">
                                        <label className="form-label fw-bold mb-1">
                                            <i className="bi bi-cpu-fill text-info me-1"></i>
                                            Select Model (Auto-Discovered) <span className="text-danger">*</span>
                                        </label>
                                        {availableModels.length > 0 ? (
                                            <select
                                                className="form-select border-primary"
                                                value={llmModel}
                                                onChange={e => setLlmModel(e.target.value)}
                                            >
                                                {availableModels.map(m => (
                                                    <option key={m.id} value={m.id}>
                                                        {m.recommended ? '⭐ ' : ''}{m.name || m.id} {m.recommended ? '(Recommended)' : ''}
                                                    </option>
                                                ))}
                                            </select>
                                        ) : (
                                            <input
                                                type="text"
                                                className="form-control"
                                                placeholder="e.g. gemini-2.0-flash, gpt-4o-mini"
                                                value={llmModel}
                                                onChange={e => setLlmModel(e.target.value)}
                                            />
                                        )}
                                        <small className="text-muted d-block mt-1">
                                            {availableModels.length > 0 ? `Showing ${availableModels.length} models from live API.` : 'You can enter model identifier or click Discover Models.'}
                                        </small>
                                    </div>

                                    {/* Optional Custom Base URL (for Custom, OpenRouter or local proxies) */}
                                    {(llmProvider === 'custom' || llmProvider === 'openrouter') && (
                                        <div className="col-12 col-md-8">
                                            <label className="form-label fw-semibold">
                                                <i className="bi bi-link-45deg me-1"></i>Custom API Base URL
                                            </label>
                                            <input
                                                type="text"
                                                className="form-control"
                                                placeholder={llmProvider === 'openrouter' ? 'https://openrouter.ai/api/v1' : 'http://localhost:11434/v1'}
                                                value={llmBaseUrl}
                                                onChange={e => setLlmBaseUrl(e.target.value)}
                                            />
                                        </div>
                                    )}

                                    {/* Temperature Slider */}
                                    <div className="col-12 col-md-4">
                                        <label className="form-label fw-semibold d-flex justify-content-between">
                                            <span>Temperature (Creativity vs Determinism)</span>
                                            <span className="badge bg-secondary">{llmTemperature}</span>
                                        </label>
                                        <input
                                            type="range"
                                            className="form-range"
                                            min="0.0"
                                            max="1.0"
                                            step="0.05"
                                            value={llmTemperature}
                                            onChange={e => setLlmTemperature(e.target.value)}
                                        />
                                        <small className="text-muted">Recommended: 0.2 - 0.4 for strict factual school assistance.</small>
                                    </div>
                                </div>

                                {/* Save Button */}
                                <div className="d-flex justify-content-end mt-4 pt-3 border-top">
                                    <button
                                        type="button"
                                        className="btn btn-primary px-4 py-2 fw-semibold"
                                        onClick={handleSaveLLMConfig}
                                        disabled={savingLLM}
                                    >
                                        {savingLLM ? (
                                            <>
                                                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                                Saving Configuration...
                                            </>
                                        ) : (
                                            <>
                                                <i className="bi bi-check2-circle me-2"></i>
                                                Save AI Configuration
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* Live Sandbox Test Panel */}
                            <div className="card border p-4 bg-light rounded-3">
                                <h6 className="fw-bold mb-2 d-flex align-items-center gap-2">
                                    <i className="bi bi-terminal-fill text-success"></i>
                                    <span>Interactive LLM Sandbox (Test Live Agent Before Deployment)</span>
                                </h6>
                                <p className="small text-muted mb-3">
                                    Ask a test question to verify that the API key, model connection, and role-scoped RBAC guardrails are working properly.
                                </p>
                                <div className="input-group mb-3">
                                    <input
                                        type="text"
                                        className="form-control"
                                        placeholder="Ask a test query (e.g. How do I mark student attendance?)"
                                        value={testAgentQuery}
                                        onChange={e => setTestAgentQuery(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') handleTestAgentPrompt(); }}
                                    />
                                    <button
                                        type="button"
                                        className="btn btn-dark"
                                        onClick={handleTestAgentPrompt}
                                        disabled={testingAgent}
                                    >
                                        {testingAgent ? (
                                            <>
                                                <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                                                Generating...
                                            </>
                                        ) : (
                                            <>
                                                <i className="bi bi-send-fill me-1"></i>
                                                Test Prompt
                                            </>
                                        )}
                                    </button>
                                </div>

                                {testAgentResponse && (
                                    <div className="p-3 bg-white rounded border mt-2">
                                        <div className="d-flex justify-content-between align-items-center mb-2 pb-2 border-bottom">
                                            <span className="badge bg-success">
                                                <i className="bi bi-shield-check me-1"></i>
                                                {testAgentResponse.access_granted ? 'Access Granted' : 'Access Restricted'}
                                            </span>
                                            {testAgentResponse.llm_used && (
                                                <span className="badge bg-info text-dark">
                                                    <i className="bi bi-cpu me-1"></i>
                                                    Model: {testAgentResponse.llm_used}
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-secondary small" style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
                                            {testAgentResponse.response}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
