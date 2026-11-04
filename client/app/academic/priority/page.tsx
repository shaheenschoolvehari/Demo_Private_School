'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from '@/app/utils/notify';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://demo-private-school.onrender.com';

// ─── Types ───────────────────────────────────────────────────────────────────
type SectionItem = {
    section_id: number;
    section_name: string;
    class_id: number;
    section_order: number;
};

type ClassItem = {
    class_id: number;
    class_name: string;
    description: string;
    class_order: number;
    sections: SectionItem[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Normalize a class name to detect duplicates/aliases */
function normalizeClassName(name: string): string {
    const wordMap: Record<string, string> = {
        one: '1', two: '2', three: '3', four: '4', five: '5',
        six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
        first: '1', second: '2', third: '3', fourth: '4', fifth: '5',
        sixth: '6', seventh: '7', eighth: '8', ninth: '9', tenth: '10',
        'pre-nursery': 'prenursery', prenursery: 'prenursery',
        prep: 'prep', preparation: 'prep',
        reception: 'reception', kg: 'kg', kindergarten: 'kg',
    };
    let n = name.toLowerCase().trim();
    n = n.replace(/class\s*/g, '').trim();
    for (const [word, digit] of Object.entries(wordMap)) {
        n = n.replace(new RegExp(`\\b${word}\\b`, 'g'), digit);
    }
    return n.replace(/\s+/g, '');
}

/** Build alias groups: map normalizedKey → class_ids */
function buildAliasGroups(classes: ClassItem[]): Record<string, number[]> {
    const groups: Record<string, number[]> = {};
    for (const cls of classes) {
        const key = normalizeClassName(cls.class_name);
        if (!groups[key]) groups[key] = [];
        groups[key].push(cls.class_id);
    }
    return groups;
}

// ─── Drag state refs (avoid re-render during drag) ───────────────────────────
let dragClassIdx: number | null = null;
let dragSectionInfo: { classIdx: number; secIdx: number } | null = null;

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PrioritySettingPage() {
    const [classes, setClasses] = useState<ClassItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [expandedClasses, setExpandedClasses] = useState<Set<number>>(new Set());
    const [dragOverClassIdx, setDragOverClassIdx] = useState<number | null>(null);
    const [dragOverSecInfo, setDragOverSecInfo] = useState<{ classIdx: number; secIdx: number } | null>(null);
    const aliasGroups = buildAliasGroups(classes);
    const isDuplicate = (cls: ClassItem) => {
        const key = normalizeClassName(cls.class_name);
        return aliasGroups[key] && aliasGroups[key].length > 1;
    };

    // ─── Fetch ────────────────────────────────────────────────────────────────
    const fetchPriority = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API}/academic/priority`);
            if (!res.ok) throw new Error('Failed to load');
            const data: ClassItem[] = await res.json();
            setClasses(data);
            setDirty(false);
        } catch (err) {
            toast.error('Failed to load priority data');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchPriority(); }, [fetchPriority]);

    // ─── Save ─────────────────────────────────────────────────────────────────
    const handleSave = async () => {
        setSaving(true);
        const toastId = toast.loading('Saving priority...');
        try {
            const payload = classes.map((cls, ci) => ({
                class_id: cls.class_id,
                class_order: ci + 1,
                sections: cls.sections.map((sec, si) => ({
                    section_id: sec.section_id,
                    section_order: si + 1,
                })),
            }));
            const res = await fetch(`${API}/academic/priority`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ classes: payload }),
            });
            if (!res.ok) throw new Error('Save failed');
            toast.update(toastId, { render: 'Priority saved successfully!', type: 'success', isLoading: false, autoClose: 3000 });
            setDirty(false);
        } catch {
            toast.update(toastId, { render: 'Failed to save priority. Please try again.', type: 'error', isLoading: false, autoClose: 4000 });
        } finally {
            setSaving(false);
        }
    };

    // ─── Toggle Section Expand ────────────────────────────────────────────────
    const toggleExpand = (classId: number) => {
        setExpandedClasses(prev => {
            const next = new Set(prev);
            if (next.has(classId)) next.delete(classId); else next.add(classId);
            return next;
        });
    };

    const expandAll = () => setExpandedClasses(new Set(classes.map(c => c.class_id)));
    const collapseAll = () => setExpandedClasses(new Set());

    // ─── Class Drag & Drop ────────────────────────────────────────────────────
    const onClassDragStart = (e: React.DragEvent, idx: number) => {
        dragClassIdx = idx;
        dragSectionInfo = null;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('type', 'class');
    };
    const onClassDragOver = (e: React.DragEvent, idx: number) => {
        e.preventDefault();
        if (dragClassIdx === null || dragClassIdx === idx) return;
        setDragOverClassIdx(idx);
    };
    const onClassDrop = (e: React.DragEvent, targetIdx: number) => {
        e.preventDefault();
        if (dragClassIdx === null || dragClassIdx === targetIdx) {
            setDragOverClassIdx(null);
            return;
        }
        setClasses(prev => {
            const next = [...prev];
            const [moved] = next.splice(dragClassIdx!, 1);
            next.splice(targetIdx, 0, moved);
            return next;
        });
        setDirty(true);
        dragClassIdx = null;
        setDragOverClassIdx(null);
    };
    const onClassDragEnd = () => {
        dragClassIdx = null;
        setDragOverClassIdx(null);
    };

    // ─── Section Drag & Drop ──────────────────────────────────────────────────
    const onSectionDragStart = (e: React.DragEvent, classIdx: number, secIdx: number) => {
        dragSectionInfo = { classIdx, secIdx };
        dragClassIdx = null;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('type', 'section');
        e.stopPropagation();
    };
    const onSectionDragOver = (e: React.DragEvent, classIdx: number, secIdx: number) => {
        e.preventDefault();
        e.stopPropagation();
        if (!dragSectionInfo || dragSectionInfo.classIdx !== classIdx) return;
        setDragOverSecInfo({ classIdx, secIdx });
    };
    const onSectionDrop = (e: React.DragEvent, targetClassIdx: number, targetSecIdx: number) => {
        e.preventDefault();
        e.stopPropagation();
        if (!dragSectionInfo || dragSectionInfo.classIdx !== targetClassIdx) {
            dragSectionInfo = null;
            setDragOverSecInfo(null);
            return;
        }
        const { classIdx, secIdx: fromIdx } = dragSectionInfo;
        if (fromIdx === targetSecIdx) {
            dragSectionInfo = null;
            setDragOverSecInfo(null);
            return;
        }
        setClasses(prev => {
            const next = prev.map(c => ({ ...c, sections: [...c.sections] }));
            const secs = next[classIdx].sections;
            const [moved] = secs.splice(fromIdx, 1);
            secs.splice(targetSecIdx, 0, moved);
            return next;
        });
        setDirty(true);
        dragSectionInfo = null;
        setDragOverSecInfo(null);
    };
    const onSectionDragEnd = () => {
        dragSectionInfo = null;
        setDragOverSecInfo(null);
    };

    // ─── Render ───────────────────────────────────────────────────────────────
    return (
        <div className="priority-page">
            {/* ── Header ── */}
            <div className="priority-header">
                <div className="priority-header-left">
                    <div className="priority-title-row">
                        <div className="priority-icon-wrap">
                            <i className="bi bi-sort-numeric-down"></i>
                        </div>
                        <div>
                            <h1 className="priority-title">Priority Setting</h1>
                            <p className="priority-subtitle">Drag classes and sections to set their display order across the system</p>
                        </div>
                    </div>
                </div>
                <div className="priority-header-actions">
                    <button className="btn-outline-teal btn-sm-action" onClick={expandAll} title="Expand all sections">
                        <i className="bi bi-chevron-double-down"></i>
                        <span>Expand All</span>
                    </button>
                    <button className="btn-outline-teal btn-sm-action" onClick={collapseAll} title="Collapse all sections">
                        <i className="bi bi-chevron-double-up"></i>
                        <span>Collapse All</span>
                    </button>
                    <button className="btn-outline-teal btn-sm-action" onClick={fetchPriority} title="Reload" disabled={saving}>
                        <i className="bi bi-arrow-clockwise"></i>
                        <span>Reset</span>
                    </button>
                    <button
                        className={`btn-save-priority${dirty ? ' btn-save-ready' : ''}`}
                        onClick={handleSave}
                        disabled={saving || !dirty}
                        title={!dirty ? 'No changes to save' : 'Save priority order'}
                    >
                        {saving
                            ? <><span className="spinner-border spinner-border-sm me-1" role="status"></span>Saving…</>
                            : <><i className="bi bi-check2-circle me-1"></i>Save Order</>
                        }
                    </button>
                </div>
            </div>

            {/* ── Info Banner ── */}
            <div className="priority-info-banner">
                <i className="bi bi-info-circle-fill me-2"></i>
                <span>Drag <strong>class rows</strong> to reorder classes. Click a class to expand its sections, then drag <strong>section pills</strong> to reorder within that class. This order is used system-wide (fee slips, reports, attendance, etc.).</span>
            </div>

            {/* ── Content ── */}
            {loading ? (
                <div className="priority-loading">
                    <div className="spinner-border text-teal" role="status"></div>
                    <p>Loading priority data…</p>
                </div>
            ) : classes.length === 0 ? (
                <div className="priority-empty">
                    <i className="bi bi-layers text-muted" style={{ fontSize: '2.5rem' }}></i>
                    <p>No classes found. Add classes first from <a href="/academic/classes" className="link-teal">Class Setting</a>.</p>
                </div>
            ) : (
                <div className="priority-list">
                    {classes.map((cls, ci) => {
                        const isOpen = expandedClasses.has(cls.class_id);
                        const dup = isDuplicate(cls);
                        const isDragOver = dragOverClassIdx === ci;

                        return (
                            <div
                                key={cls.class_id}
                                className={`priority-class-card${isDragOver ? ' drag-over-class' : ''}`}
                                draggable
                                onDragStart={e => onClassDragStart(e, ci)}
                                onDragOver={e => onClassDragOver(e, ci)}
                                onDrop={e => onClassDrop(e, ci)}
                                onDragEnd={onClassDragEnd}
                            >
                                {/* Class Row */}
                                <div className="priority-class-row" onClick={() => toggleExpand(cls.class_id)}>
                                    <div className="priority-class-left">
                                        <span className="drag-handle" title="Drag to reorder" onClick={e => e.stopPropagation()}>
                                            <i className="bi bi-grip-vertical"></i>
                                        </span>
                                        <span className="priority-rank-badge">{ci + 1}</span>
                                        <div className="priority-class-info">
                                            <span className="priority-class-name">{cls.class_name}</span>
                                            {cls.description && (
                                                <span className="priority-class-desc">{cls.description}</span>
                                            )}
                                        </div>
                                        {dup && (
                                            <span className="alias-warning-badge" title="This class may be a duplicate/alias of another class. Review and merge if needed.">
                                                <i className="bi bi-exclamation-triangle-fill me-1"></i>Possible Duplicate
                                            </span>
                                        )}
                                    </div>
                                    <div className="priority-class-right">
                                        <span className="section-count-pill">
                                            <i className="bi bi-collection me-1"></i>
                                            {cls.sections.length} section{cls.sections.length !== 1 ? 's' : ''}
                                        </span>
                                        <span className={`expand-toggle${isOpen ? ' expanded' : ''}`}>
                                            <i className={`bi bi-chevron-${isOpen ? 'up' : 'down'}`}></i>
                                        </span>
                                    </div>
                                </div>

                                {/* Sections Area */}
                                {isOpen && (
                                    <div className="priority-sections-area">
                                        {cls.sections.length === 0 ? (
                                            <p className="no-sections-hint">
                                                <i className="bi bi-info-circle me-1"></i>
                                                No sections for this class. Add sections from <a href="/academic/sections" className="link-teal">Section Setting</a>.
                                            </p>
                                        ) : (
                                            <div className="sections-drag-container">
                                                <p className="sections-drag-hint">
                                                    <i className="bi bi-arrows-move me-1"></i>Drag sections to reorder within this class
                                                </p>
                                                <div className="sections-pills-row">
                                                    {cls.sections.map((sec, si) => {
                                                        const isSecOver = dragOverSecInfo?.classIdx === ci && dragOverSecInfo?.secIdx === si;
                                                        return (
                                                            <div
                                                                key={sec.section_id}
                                                                className={`section-pill${isSecOver ? ' drag-over-section' : ''}`}
                                                                draggable
                                                                onDragStart={e => onSectionDragStart(e, ci, si)}
                                                                onDragOver={e => onSectionDragOver(e, ci, si)}
                                                                onDrop={e => onSectionDrop(e, ci, si)}
                                                                onDragEnd={onSectionDragEnd}
                                                            >
                                                                <i className="bi bi-grip-vertical section-grip"></i>
                                                                <span className="section-order-num">{si + 1}</span>
                                                                <span className="section-name-text">{sec.section_name}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Dirty indicator ── */}
            {dirty && !loading && (
                <div className="priority-unsaved-banner">
                    <i className="bi bi-exclamation-circle-fill me-2"></i>
                    You have unsaved changes — click <strong>Save Order</strong> to apply.
                </div>
            )}

            {/* ── Styles ── */}
            <style>{`
                /* ─ Page Layout ─ */
                .priority-page {
                    padding: 1.25rem 1rem 3rem;
                    max-width: 900px;
                    margin: 0 auto;
                    font-family: inherit;
                }

                /* ─ Header ─ */
                .priority-header {
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    flex-wrap: wrap;
                    gap: 1rem;
                    margin-bottom: 1.1rem;
                }
                .priority-title-row {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                }
                .priority-icon-wrap {
                    width: 44px; height: 44px;
                    background: linear-gradient(135deg, #215E61 0%, #2d7d82 100%);
                    border-radius: 12px;
                    display: flex; align-items: center; justify-content: center;
                    color: #fff;
                    font-size: 1.3rem;
                    flex-shrink: 0;
                    box-shadow: 0 2px 8px rgba(33,94,97,0.25);
                }
                .priority-title {
                    font-size: 1.3rem;
                    font-weight: 700;
                    color: #215E61;
                    margin: 0;
                    line-height: 1.2;
                }
                .priority-subtitle {
                    font-size: 0.8rem;
                    color: #6c757d;
                    margin: 0.1rem 0 0;
                }
                .priority-header-actions {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    flex-wrap: wrap;
                }
                .btn-outline-teal {
                    display: inline-flex; align-items: center; gap: 0.3rem;
                    padding: 0.4rem 0.75rem;
                    border: 1.5px solid #215E61;
                    background: transparent;
                    color: #215E61;
                    border-radius: 8px;
                    font-size: 0.8rem;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.18s;
                    white-space: nowrap;
                }
                .btn-outline-teal:hover { background: #215E61; color: #fff; }
                .btn-outline-teal:disabled { opacity: 0.5; cursor: not-allowed; }
                .btn-sm-action { font-size: 0.78rem; }
                .btn-save-priority {
                    display: inline-flex; align-items: center;
                    padding: 0.45rem 1.1rem;
                    border: none;
                    background: #ccc;
                    color: #fff;
                    border-radius: 9px;
                    font-size: 0.85rem;
                    font-weight: 600;
                    cursor: not-allowed;
                    transition: all 0.2s;
                }
                .btn-save-priority.btn-save-ready {
                    background: linear-gradient(135deg, #215E61 0%, #2d7d82 100%);
                    cursor: pointer;
                    box-shadow: 0 2px 10px rgba(33,94,97,0.3);
                }
                .btn-save-priority.btn-save-ready:hover {
                    background: linear-gradient(135deg, #1a4a4d 0%, #215E61 100%);
                    box-shadow: 0 4px 14px rgba(33,94,97,0.4);
                }

                /* ─ Info Banner ─ */
                .priority-info-banner {
                    background: #eaf5f6;
                    border: 1px solid #b2dfe1;
                    border-radius: 10px;
                    padding: 0.65rem 1rem;
                    font-size: 0.82rem;
                    color: #215E61;
                    margin-bottom: 1.2rem;
                    display: flex;
                    align-items: flex-start;
                    gap: 0.3rem;
                    line-height: 1.5;
                }

                /* ─ Loading / Empty ─ */
                .priority-loading, .priority-empty {
                    display: flex; flex-direction: column; align-items: center;
                    justify-content: center; gap: 0.75rem;
                    padding: 3rem 1rem;
                    color: #6c757d;
                    font-size: 0.9rem;
                }
                .text-teal { color: #215E61 !important; }

                /* ─ Class List ─ */
                .priority-list {
                    display: flex;
                    flex-direction: column;
                    gap: 0.55rem;
                }

                /* ─ Class Card ─ */
                .priority-class-card {
                    background: #fff;
                    border: 1.5px solid #e0eeef;
                    border-radius: 12px;
                    overflow: hidden;
                    transition: box-shadow 0.18s, border-color 0.18s, transform 0.12s;
                    box-shadow: 0 1px 4px rgba(33,94,97,0.07);
                    cursor: grab;
                    user-select: none;
                }
                .priority-class-card:active { cursor: grabbing; }
                .priority-class-card:hover {
                    box-shadow: 0 4px 16px rgba(33,94,97,0.13);
                    border-color: #a8d5d8;
                }
                .priority-class-card.drag-over-class {
                    border-color: #FE7F2D !important;
                    box-shadow: 0 0 0 3px rgba(254,127,45,0.18);
                    transform: scale(1.012);
                }

                /* ─ Class Row ─ */
                .priority-class-row {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 0.75rem 1rem;
                    gap: 0.75rem;
                    cursor: pointer;
                    background: #fff;
                    transition: background 0.15s;
                }
                .priority-class-row:hover { background: #f7fcfc; }
                .priority-class-left {
                    display: flex;
                    align-items: center;
                    gap: 0.6rem;
                    flex: 1;
                    min-width: 0;
                }
                .priority-class-right {
                    display: flex;
                    align-items: center;
                    gap: 0.6rem;
                    flex-shrink: 0;
                }
                .drag-handle {
                    color: #adb5bd;
                    font-size: 1.1rem;
                    cursor: grab;
                    padding: 0.1rem 0.15rem;
                    border-radius: 4px;
                    transition: color 0.15s;
                    display: inline-flex;
                }
                .drag-handle:hover { color: #215E61; }
                .priority-rank-badge {
                    display: inline-flex; align-items: center; justify-content: center;
                    width: 26px; height: 26px;
                    background: linear-gradient(135deg, #215E61 0%, #2d7d82 100%);
                    color: #fff;
                    border-radius: 50%;
                    font-size: 0.72rem;
                    font-weight: 700;
                    flex-shrink: 0;
                }
                .priority-class-info {
                    display: flex;
                    flex-direction: column;
                    min-width: 0;
                }
                .priority-class-name {
                    font-size: 0.95rem;
                    font-weight: 600;
                    color: #233D4D;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .priority-class-desc {
                    font-size: 0.75rem;
                    color: #6c757d;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .alias-warning-badge {
                    display: inline-flex; align-items: center;
                    background: #fff3cd;
                    border: 1px solid #ffc107;
                    color: #856404;
                    border-radius: 20px;
                    font-size: 0.7rem;
                    font-weight: 600;
                    padding: 0.15rem 0.6rem;
                    white-space: nowrap;
                    cursor: help;
                    flex-shrink: 0;
                }
                .section-count-pill {
                    display: inline-flex; align-items: center;
                    background: #eaf5f6;
                    color: #215E61;
                    border-radius: 20px;
                    font-size: 0.72rem;
                    font-weight: 600;
                    padding: 0.2rem 0.6rem;
                    white-space: nowrap;
                }
                .expand-toggle {
                    color: #adb5bd;
                    font-size: 0.85rem;
                    transition: transform 0.2s, color 0.15s;
                    display: inline-flex;
                }
                .expand-toggle.expanded { color: #215E61; }

                /* ─ Sections Area ─ */
                .priority-sections-area {
                    border-top: 1px solid #e0eeef;
                    background: #f7fcfc;
                    padding: 0.75rem 1rem 0.85rem 1.1rem;
                }
                .no-sections-hint {
                    color: #6c757d;
                    font-size: 0.8rem;
                    margin: 0;
                }
                .sections-drag-container { }
                .sections-drag-hint {
                    font-size: 0.75rem;
                    color: #6c757d;
                    margin-bottom: 0.6rem;
                }
                .sections-pills-row {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0.5rem;
                }
                .section-pill {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.3rem;
                    background: #fff;
                    border: 1.5px solid #c4e0e2;
                    border-radius: 25px;
                    padding: 0.35rem 0.75rem 0.35rem 0.45rem;
                    font-size: 0.8rem;
                    color: #233D4D;
                    font-weight: 500;
                    cursor: grab;
                    user-select: none;
                    transition: all 0.15s;
                    box-shadow: 0 1px 3px rgba(33,94,97,0.07);
                }
                .section-pill:active { cursor: grabbing; }
                .section-pill:hover {
                    border-color: #215E61;
                    background: #eaf5f6;
                    box-shadow: 0 2px 8px rgba(33,94,97,0.13);
                }
                .section-pill.drag-over-section {
                    border-color: #FE7F2D !important;
                    background: #fff3eb !important;
                    box-shadow: 0 0 0 3px rgba(254,127,45,0.18);
                    transform: scale(1.07);
                }
                .section-grip {
                    color: #adb5bd;
                    font-size: 0.85rem;
                }
                .section-order-num {
                    display: inline-flex; align-items: center; justify-content: center;
                    width: 18px; height: 18px;
                    background: #215E61;
                    color: #fff;
                    border-radius: 50%;
                    font-size: 0.65rem;
                    font-weight: 700;
                    flex-shrink: 0;
                }
                .section-name-text {
                    font-size: 0.82rem;
                }

                /* ─ Unsaved Banner ─ */
                .priority-unsaved-banner {
                    position: fixed;
                    bottom: 1.2rem;
                    left: 50%;
                    transform: translateX(-50%);
                    background: #233D4D;
                    color: #fff;
                    padding: 0.65rem 1.4rem;
                    border-radius: 30px;
                    font-size: 0.82rem;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.25);
                    display: flex;
                    align-items: center;
                    white-space: nowrap;
                    z-index: 1050;
                    animation: slideUp 0.25s ease;
                }
                @keyframes slideUp {
                    from { opacity: 0; transform: translateX(-50%) translateY(12px); }
                    to { opacity: 1; transform: translateX(-50%) translateY(0); }
                }

                .link-teal { color: #215E61; font-weight: 600; }
                .link-teal:hover { color: #1a4a4d; }

                /* ─ Mobile ─ */
                @media (max-width: 600px) {
                    .priority-page { padding: 1rem 0.5rem 4rem; }
                    .priority-header { flex-direction: column; align-items: stretch; }
                    .priority-header-actions { justify-content: flex-end; }
                    .btn-sm-action span { display: none; }
                    .priority-title { font-size: 1.1rem; }
                    .priority-class-row { padding: 0.65rem 0.75rem; }
                    .priority-sections-area { padding: 0.6rem 0.75rem 0.75rem; }
                    .priority-unsaved-banner { bottom: 0.75rem; font-size: 0.75rem; padding: 0.55rem 1rem; }
                    .alias-warning-badge { display: none; } /* hide on mobile to save space; tooltip visible on tap */
                    .section-count-pill { display: none; }
                }
            `}</style>
        </div>
    );
}

