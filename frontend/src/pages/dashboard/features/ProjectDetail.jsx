import { useState, useEffect, useMemo, useRef } from 'react';
import { ArrowLeft, Lock, Plus, ChevronRight, ChevronDown, ListTodo, X, Calendar, DollarSign, Clock, Loader2, GitBranch, Pencil, Trash2, AlertTriangle, Check, Download } from 'lucide-react';
import { formatCurrency, formatDate } from '../../../utils/evmHelpers';
import { STATUS_STYLES, INPUT_CLASS } from '../../../utils/uiConstants';
import { exportWorkbook, exportFilename } from '../../../utils/excelExport';
import { taskToRow } from '../../../utils/taskSchema';
import { apiFetch } from '../../../utils/api';
import { load, save } from '../../../utils/localStore';
import PlanningReadinessPanel from './PlanningReadinessPanel';

// Recursive WBS node component
function WbsNode({
    node, allNodes, expandedNodes, toggleExpand, selectedWbsId, setSelectedWbsId,
    overrides, canRename, editingId, setEditingId, onRename, onDelete, taskCounts,
}) {
    const children    = allNodes.filter(n => n.parent_id !== null && Number(n.parent_id) === Number(node.id));
    const hasChildren = children.length > 0;
    const isExpanded  = expandedNodes.has(node.id);
    const isSelected  = selectedWbsId !== null && Number(selectedWbsId) === Number(node.id);
    const indent      = (node.level - 1) * 16;
    const displayName = (overrides && overrides[node.id]) || node.name;
    const isEditing   = editingId === node.id;
    const [draft, setDraft] = useState(displayName);

    const commit = () => {
        const trimmed = draft.trim();
        // Reject empty submissions but allow reverting to original by clearing.
        if (trimmed === '' || trimmed === node.name) {
            onRename(node.id, '');
        } else {
            onRename(node.id, trimmed);
        }
        setEditingId(null);
    };

    return (
        <div>
            <div
                style={{ paddingLeft: `${indent + 8}px` }}
                className={`group w-full flex items-center gap-2 py-2 pr-2 rounded-lg text-sm transition-colors ${
                    isSelected ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'
                } ${isEditing ? '' : 'cursor-pointer'}`}
                onClick={() => { if (!isEditing) setSelectedWbsId(node.id); }}
                role={isEditing ? undefined : 'button'}
            >
                {hasChildren ? (
                    <span
                        role="button"
                        tabIndex={-1}
                        onClick={(e) => { e.stopPropagation(); toggleExpand(node.id); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); toggleExpand(node.id); } }}
                        aria-label={isExpanded ? 'Collapse' : 'Expand'}
                        className="w-3.5 h-3.5 shrink-0 text-slate-400 hover:text-emerald-600 transition-colors cursor-pointer"
                    >
                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </span>
                ) : (
                    <div className="w-3.5 h-3.5 shrink-0" />
                )}
                <span className="font-mono text-[10px] text-slate-400 shrink-0">{node.wbs_code}</span>

        {isEditing ? (
                    <div className="flex items-center gap-1 flex-1 min-w-0" onClick={e => e.stopPropagation()}>
                        <input
                            type="text"
                            autoFocus
                            value={draft}
                            onChange={e => setDraft(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') { e.preventDefault(); commit(); }
                                if (e.key === 'Escape') { e.preventDefault(); setEditingId(null); }
                            }}
                            className="flex-1 min-w-0 px-2 py-0.5 text-sm bg-white border border-emerald-300 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        />
                        <button
                            type="button"
                            onClick={commit}
                            aria-label="Save name"
                            className="p-1 rounded text-emerald-600 hover:bg-emerald-50 cursor-pointer"
                        >
                            <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            aria-label="Cancel edit"
                            className="p-1 rounded text-slate-400 hover:bg-slate-100 cursor-pointer"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                ) : (
                    <>
                        <span className="truncate text-left flex-1 min-w-0">{displayName}</span>
                        {taskCounts?.[node.id] > 0 && (
                            <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md shrink-0" title={`${taskCounts[node.id]} task(s)`}>
                                {taskCounts[node.id]}
                            </span>
                        )}
                        {canRename && (
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setDraft(displayName); setEditingId(node.id); }}
                                title="Rename"
                                aria-label="Rename node"
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 cursor-pointer"
                            >
                                <Pencil className="w-3 h-3" />
                            </button>
                        )}
                        {canRename && !hasChildren && (
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); onDelete(node.id); }}
                                title="Delete node"
                                aria-label="Delete node"
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                            >
                                <Trash2 className="w-3 h-3" />
                            </button>
                        )}
                    </>
                )}
            </div>
            {hasChildren && isExpanded && children.map(child => (
                <WbsNode
                    key={child.id}
                    node={child}
                    allNodes={allNodes}
                    expandedNodes={expandedNodes}
                    toggleExpand={toggleExpand}
                    selectedWbsId={selectedWbsId}
                    setSelectedWbsId={setSelectedWbsId}
                    overrides={overrides}
                    canRename={canRename}
                    editingId={editingId}
                    setEditingId={setEditingId}
                    onRename={onRename}
                    onDelete={onDelete}
                    taskCounts={taskCounts}
                />
            ))}
        </div>
    );
}

// Searchable WBS leaf-node picker for the task modal — filter by code or name,
// with each node's ancestor path shown for disambiguation on deep trees.
function WbsPicker({ leafNodes, allNodes, overrides, value, onChange }) {
    const [query, setQuery] = useState('');
    const [open, setOpen]   = useState(false);
    const wrapRef = useRef(null);

    const byId   = useMemo(() => Object.fromEntries(allNodes.map(n => [n.id, n])), [allNodes]);
    const nameOf = (n) => (overrides && overrides[n.id]) || n.name;
    const pathOf = (n) => {
        const parts = [];
        let cur = n, guard = 0;
        while (cur && guard++ < 32) {
            parts.unshift(cur.wbs_code);
            cur = cur.parent_id != null ? byId[cur.parent_id] : null;
        }
        return parts.join(' ▸ ');
    };

    const selected = value ? byId[parseInt(value)] : null;
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return leafNodes;
        return leafNodes.filter(n => `${n.wbs_code} ${nameOf(n)}`.toLowerCase().includes(q));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [leafNodes, query, overrides]);

    useEffect(() => {
        const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, []);

    return (
        <div className="relative" ref={wrapRef}>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                aria-label="Select WBS node"
                aria-haspopup="listbox"
                aria-expanded={open}
                className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-white/50 border border-slate-200 rounded-lg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all text-sm text-left"
            >
                <span className={selected ? 'text-slate-700 truncate' : 'text-slate-400'}>
                    {selected ? `${selected.wbs_code} — ${nameOf(selected)}` : 'Select a WBS node...'}
                </span>
                <ChevronDown className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl shadow-slate-200/50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                    <div className="p-2 border-b border-slate-100">
                        <input
                            autoFocus
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } }}
                            placeholder="Search code or name..."
                            aria-label="Search WBS nodes by code or name"
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-emerald-500"
                        />
                    </div>
                    <ul className="max-h-56 overflow-y-auto py-1">
                        {filtered.length > 0 ? filtered.map(n => (
                            <li key={n.id}>
                                <button
                                    type="button"
                                    onClick={() => { onChange(String(n.id)); setOpen(false); setQuery(''); }}
                                    className={`w-full text-left px-3 py-2 transition-colors hover:bg-slate-50 ${String(n.id) === String(value) ? 'bg-emerald-50' : ''}`}
                                >
                                    <div className="font-mono text-[10px] text-slate-400">{pathOf(n)}</div>
                                    <div className={`text-sm ${String(n.id) === String(value) ? 'text-emerald-700 font-semibold' : 'text-slate-700'}`}>{nameOf(n)}</div>
                                </button>
                            </li>
                        )) : (
                            <li className="px-3 py-4 text-sm text-slate-400 text-center">No matching WBS nodes.</li>
                        )}
                    </ul>
                </div>
            )}
        </div>
    );
}

export default function ProjectDetail({ project, onBack }) {
    const [tasks, setTasks]       = useState([]);
    const [wbsNodes, setWbsNodes] = useState([]);
    const [loadingTasks, setLoadingTasks] = useState(true);

    const [selectedWbsId, setSelectedWbsId] = useState(null);
    const [expandedNodes, setExpandedNodes]  = useState(new Set());

    // Task modal (add + edit share the same modal)
    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
    const [editingTaskId, setEditingTaskId]     = useState(null);
    const [taskForm, setTaskForm] = useState({
        task_name: '', wbs_id: '', planned_start: '', planned_end: '',
        planned_cost: '', planned_hours: '', weight: '', predecessors: [],
    });
    const [taskError, setTaskError]   = useState('');
    const [savingTask, setSavingTask] = useState(false);

    // Delete task confirm
    const [deletingTaskId, setDeletingTaskId] = useState(null);
    const [deletingTask, setDeletingTask]     = useState(false);
    const [deleteError, setDeleteError]       = useState('');

    // Add WBS Node modal
    const [isWbsModalOpen, setIsWbsModalOpen] = useState(false);
    const [wbsForm, setWbsForm] = useState({ wbs_code: '', name: '', parent_id: '', level: '1' });
    const [wbsError, setWbsError] = useState('');
    const [savingWbs, setSavingWbs] = useState(false);

    // Baseline. ProjectDetail remounts per project (keyed in Projects.jsx), so
    // project-scoped state is seeded once from localStorage via lazy initializers
    // instead of re-synced through prop-watching effects.
    const baselineCacheKey = `epms.baseline.v1.${project.id}`;
    const [isLocked, setIsLocked]             = useState(false);
    const [isLockModalOpen, setIsLockModalOpen] = useState(false);
    const [baselineName, setBaselineName]      = useState('Baseline Rev.0');
    const [baseline, setBaseline]              = useState(() => {
        const cached = load(baselineCacheKey, null);
        return cached && cached.name ? { name: cached.name, lockedAt: new Date(cached.lockedAt) } : null;
    });
    const [lockingBaseline, setLockingBaseline] = useState(false);
    const [lockError, setLockError]             = useState('');
    const [lockReadiness, setLockReadiness]     = useState(null);
    const [isReadinessOpen, setIsReadinessOpen] = useState(false);
    const [highlightedTaskIds, setHighlightedTaskIds] = useState([]);
    const readinessTriggerRef = useRef(null);

    // WBS name overrides — local-only edits until backend PUT route exists.
    const wbsOverrideKey = `epms.wbs_name_overrides.v1.${project.id}`;
    const [wbsOverrides, setWbsOverrides] = useState(() => load(wbsOverrideKey, {}));
    const [editingWbsId, setEditingWbsId] = useState(null);
    const [deletingWbsId, setDeletingWbsId]   = useState(null);
    const [deletingWbs, setDeletingWbs]       = useState(false);
    const [deleteWbsError, setDeleteWbsError] = useState('');

    const userRole = localStorage.getItem('userRole');
    const canEdit  = userRole === 'Project Manager' || userRole === 'Planner';

    const fetchData = async () => {
        setLoadingTasks(true);
        try {
            const [taskRes, wbsRes, baselineRes] = await Promise.all([
                apiFetch(`/projects/${project.id}/tasks`),
                apiFetch(`/projects/${project.id}/wbs`),
                apiFetch(`/projects/${project.id}/tasks/baseline`).catch(() => ({ success: false })),
            ]);
            const fetchedTasks = taskRes.data || [];
            setTasks(fetchedTasks);
            setWbsNodes(wbsRes.data || []);
            setIsLocked(fetchedTasks.some(t => t.is_baseline_locked));
            // Prefer baseline metadata from the DB (name / who / when); fall back to local cache.
            if (baselineRes?.success && baselineRes.data) {
                const b = baselineRes.data;
                setBaseline({
                    name:     b.baseline_name || 'Baseline Rev.0',
                    lockedAt: b.locked_at ? new Date(b.locked_at) : null,
                    lockedBy: b.locked_by || null,
                });
            }
            const roots = (wbsRes.data || []).filter(n => n.parent_id === null);
            setExpandedNodes(new Set(roots.map(n => n.id)));
        } catch (e) { console.error(e); }
        finally { setLoadingTasks(false); }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch only when the project changes
    useEffect(() => { fetchData(); }, [project.id]);

    const renameWbsNode = async (id, newName) => {
        const trimmed = (newName || '').trim();
        const original = wbsNodes.find(n => n.id === id)?.name;
        const clearOverride = () => setWbsOverrides(prev => {
            if (!(id in prev)) return prev;
            const next = { ...prev }; delete next[id]; save(wbsOverrideKey, next); return next;
        });
        // Empty or unchanged → no API call; just drop any stale local override.
        if (!trimmed || trimmed === original) { clearOverride(); return; }
        // Optimistic update, then persist to the DB. Revert via refetch on failure.
        setWbsNodes(prev => prev.map(n => (n.id === id ? { ...n, name: trimmed } : n)));
        clearOverride();
        try {
            const res = await apiFetch(`/projects/${project.id}/wbs/${id}`, {
                method: 'PUT', body: JSON.stringify({ name: trimmed }),
            });
            if (!res.success) throw new Error(res.message || 'Failed to rename WBS node.');
        } catch (e) {
            console.error(e);
            fetchData(); // revert to server truth on failure
        }
    };

    const requestDeleteWbs = (id) => { setDeleteWbsError(''); setDeletingWbsId(id); };

    const handleDeleteWbs = async () => {
        if (deletingWbsId == null) return;
        setDeleteWbsError('');
        setDeletingWbs(true);
        try {
            const res = await apiFetch(`/projects/${project.id}/wbs/${deletingWbsId}`, { method: 'DELETE' });
            if (!res.success) { setDeleteWbsError(res.message || 'Failed to delete WBS node.'); return; }
            if (selectedWbsId === deletingWbsId) setSelectedWbsId(null);
            setDeletingWbsId(null);
            fetchData();
        } catch (e) {
            setDeleteWbsError(e.message || 'Server error.');
        } finally {
            setDeletingWbs(false);
        }
    };

    // Close modals on Escape
    useEffect(() => {
        const handler = (e) => {
            if (e.key === 'Escape') {
                setIsTaskModalOpen(false);
                setEditingTaskId(null);
                setIsLockModalOpen(false);
                setIsWbsModalOpen(false);
                setDeletingTaskId(null);
                setDeletingWbsId(null);
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, []);

    const resetTaskForm = () => setTaskForm({
        task_name: '', wbs_id: '', planned_start: '', planned_end: '',
        planned_cost: '', planned_hours: '', weight: '', predecessors: [],
    });

    const togglePredecessor = (id) => setTaskForm(f => ({
        ...f,
        predecessors: f.predecessors.includes(id)
            ? f.predecessors.filter(p => p !== id)
            : [...f.predecessors, id],
    }));

    const closeTaskModal = () => {
        setIsTaskModalOpen(false);
        setEditingTaskId(null);
        setTaskError('');
        resetTaskForm();
    };

    const openAddTaskModal = () => {
        setEditingTaskId(null);
        setTaskError('');
        // Pre-select the WBS node the user already highlighted in the tree (leaf only).
        const preset = selectedWbsId && leafNodes.some(n => n.id === selectedWbsId) ? String(selectedWbsId) : '';
        setTaskForm({
            task_name: '', wbs_id: preset, planned_start: '', planned_end: '',
            planned_cost: '', planned_hours: '', weight: '', predecessors: [],
        });
        setIsTaskModalOpen(true);
    };

    const openEditTaskModal = (task) => {
        setEditingTaskId(task.id);
        setTaskError('');
        setTaskForm({
            task_name:     task.task_name || '',
            wbs_id:        String(task.wbs_id || ''),
            planned_start: (task.planned_start || '').slice(0, 10),
            planned_end:   (task.planned_end || '').slice(0, 10),
            planned_cost:  task.planned_cost  != null ? String(task.planned_cost)  : '',
            planned_hours: task.planned_hours != null ? String(task.planned_hours) : '',
            weight:        task.weight        != null ? String(task.weight)        : '',
            predecessors:  Array.isArray(task.predecessors) ? task.predecessors : [],
        });
        setIsTaskModalOpen(true);
    };

    const toggleExpand = (id) => {
        setExpandedNodes(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };
    const expandAll   = () => setExpandedNodes(new Set(wbsNodes.map(n => n.id)));
    const collapseAll = () => setExpandedNodes(new Set());
    const leafNodes = wbsNodes.filter(n => !wbsNodes.some(m => m.parent_id !== null && String(m.parent_id) === String(n.id)));
    const rootNodes = wbsNodes.filter(n => n.parent_id === null || n.parent_id === undefined || String(n.parent_id) === 'null' || String(n.parent_id) === '');

    // Predecessor candidates = every other task in the project (exclude self when editing).
    const otherTasks = tasks.filter(t => t.id !== editingTaskId);
    // Auto-computed task duration shown read-only in the modal (same formula sent to the API).
    const taskDurationDays = (taskForm.planned_start && taskForm.planned_end
        && new Date(taskForm.planned_end) >= new Date(taskForm.planned_start))
        ? Math.round((new Date(taskForm.planned_end) - new Date(taskForm.planned_start)) / (1000 * 60 * 60 * 24))
        : null;

    const selectedNode  = wbsNodes.find(n => String(n.id) === String(selectedWbsId));
    
    // Filter tasks based on WBS code hierarchy (matching exact or sub-nodes)
    const filteredTasks = useMemo(() => {
        if (!selectedNode) return tasks;
        const codePrefix = selectedNode.wbs_code;
        return tasks.filter(t => t.wbs_code && (t.wbs_code === codePrefix || t.wbs_code.startsWith(codePrefix + '.')));
    }, [tasks, selectedNode]);

    // Task count per WBS node (includes descendants) matching WBS codes
    const taskCounts = useMemo(() => {
        const map = {};
        for (const n of wbsNodes) {
            const codePrefix = n.wbs_code;
            map[n.id] = tasks.filter(t => t.wbs_code && (t.wbs_code === codePrefix || t.wbs_code.startsWith(codePrefix + '.'))).length;
        }
        return map;
    }, [wbsNodes, tasks]);
    const anyExpandable = wbsNodes.some(n => wbsNodes.some(m => m.parent_id !== null && String(m.parent_id) === String(n.id)));

    const totalCost   = filteredTasks.reduce((s, t) => s + parseFloat(t.planned_cost   || 0), 0);
    const totalHours  = filteredTasks.reduce((s, t) => s + parseFloat(t.planned_hours  || 0), 0);
    const totalWeight = filteredTasks.reduce((s, t) => s + parseFloat(t.weight         || 0), 0);

    const durationDays = project.planned_start && project.planned_end
        ? Math.round((new Date(project.planned_end) - new Date(project.planned_start)) / (1000 * 60 * 60 * 24))
        : 0;

    // ── Add WBS Node ──────────────────────────────────────────────────────────
    const handleAddWbs = async (e) => {
        e.preventDefault();
        setWbsError('');
        if (!wbsForm.wbs_code.trim()) { setWbsError('WBS Code is required.'); return; }
        if (!wbsForm.name.trim())     { setWbsError('Node name is required.'); return; }

        // Check duplicate wbs_code within project
        if (wbsNodes.some(n => n.wbs_code === wbsForm.wbs_code.trim())) {
            setWbsError('WBS Code already exists in this project.'); return;
        }

        setSavingWbs(true);
        try {
            const parentId = wbsForm.parent_id ? parseInt(wbsForm.parent_id) : null;
            const level    = parentId
                ? (wbsNodes.find(n => n.id === parentId)?.level || 1) + 1
                : 1;

            const res = await apiFetch(`/projects/${project.id}/wbs`, {
                method: 'POST',
                body: JSON.stringify({
                    wbs_code:  wbsForm.wbs_code.trim(),
                    name:      wbsForm.name.trim(),
                    parent_id: parentId,
                    level,
                }),
            });
            if (!res.success) { setWbsError(res.message || 'Failed to add WBS node.'); return; }
            setIsWbsModalOpen(false);
            setWbsForm({ wbs_code: '', name: '', parent_id: '', level: '1' });
            fetchData();
        } catch (e) {
            setWbsError(e.message || 'Server error.');
        } finally {
            setSavingWbs(false);
        }
    };

    // ── Add / Edit Task ───────────────────────────────────────────────────────
    const handleSubmitTask = async (e) => {
        e.preventDefault();
        setTaskError('');
        if (!taskForm.wbs_id) { setTaskError('Please select a WBS node.'); return; }
        if (new Date(taskForm.planned_end) < new Date(taskForm.planned_start)) {
            setTaskError('End date must be on or after start date.'); return;
        }
        if (parseFloat(taskForm.planned_cost) <= 0 || isNaN(parseFloat(taskForm.planned_cost))) {
            setTaskError('Planned cost must be greater than zero.'); return;
        }
        if (parseFloat(taskForm.planned_hours) <= 0 || isNaN(parseFloat(taskForm.planned_hours))) {
            setTaskError('Planned hours must be greater than zero.'); return;
        }
        const w = parseFloat(taskForm.weight);
        if (isNaN(w) || w <= 0 || w > 1) {
            setTaskError('Weight must be between 0.01 and 1.00.'); return;
        }
        const currentTotal = tasks.reduce((s, t) => {
            if (editingTaskId && t.id === editingTaskId) return s;
            return s + parseFloat(t.weight || 0);
        }, 0);
        if (currentTotal + w > 1.001) {
            setTaskError(`Total weight would exceed 100%. Remaining: ${((1 - currentTotal) * 100).toFixed(1)}%`); return;
        }

        setSavingTask(true);
        try {
            const wbsNode  = wbsNodes.find(n => n.id === parseInt(taskForm.wbs_id));
            const duration = Math.round((new Date(taskForm.planned_end) - new Date(taskForm.planned_start)) / (1000 * 60 * 60 * 24));
            const body = JSON.stringify({
                wbs_id:           parseInt(taskForm.wbs_id),
                wbs_code:         wbsNode?.wbs_code || '',
                task_name:        taskForm.task_name,
                planned_start:    taskForm.planned_start,
                planned_end:      taskForm.planned_end,
                planned_duration: duration,
                planned_cost:     parseFloat(taskForm.planned_cost)  || 0,
                planned_hours:    parseFloat(taskForm.planned_hours) || 0,
                weight:           parseFloat(taskForm.weight)        || 0,
                predecessors:     taskForm.predecessors || [],
            });
            const res = editingTaskId
                ? await apiFetch(`/tasks/${editingTaskId}`,             { method: 'PUT',  body })
                : await apiFetch(`/projects/${project.id}/tasks`,        { method: 'POST', body });
            if (!res.success) {
                setTaskError(res.message || (editingTaskId ? 'Failed to update task.' : 'Failed to add task.'));
                return;
            }
            closeTaskModal();
            fetchData();
        } catch (e) {
            setTaskError(e.message || 'Server error.');
        } finally {
            setSavingTask(false);
        }
    };

    // ── Delete Task ───────────────────────────────────────────────────────────
    const handleDeleteTask = async () => {
        if (!deletingTaskId) return;
        setDeleteError('');
        setDeletingTask(true);
        try {
            const res = await apiFetch(`/tasks/${deletingTaskId}`, { method: 'DELETE' });
            if (!res.success) { setDeleteError(res.message || 'Failed to delete task.'); return; }
            setDeletingTaskId(null);
            fetchData();
        } catch (e) {
            setDeleteError(e.message || 'Server error.');
        } finally {
            setDeletingTask(false);
        }
    };

    const deletingTaskName = tasks.find(t => t.id === deletingTaskId)?.task_name;
    const deletingWbsNode  = wbsNodes.find(n => n.id === deletingWbsId);

    // ── Lock Baseline ─────────────────────────────────────────────────────────
    const handleLockBaseline = async () => {
        setLockError('');
        setLockingBaseline(true);
        try {
            const name = baselineName.trim() || 'Baseline Rev.0';
            const res  = await apiFetch(`/projects/${project.id}/tasks/baseline`, {
                method: 'POST',
                body: JSON.stringify({ baseline_name: name }),
            });
            if (!res.success) { setLockError(res.message || 'Failed to lock baseline.'); return; }
            const lockedAt = new Date();
            setBaseline({ name, lockedAt, lockedBy: localStorage.getItem('userName') || null });
            save(baselineCacheKey, { name, lockedAt: lockedAt.toISOString() });
            setIsLocked(true);
            setIsLockModalOpen(false);
            setIsReadinessOpen(false);
            setHighlightedTaskIds([]);
            fetchData();
        } catch (e) {
            setLockError(e.message || 'Server error.');
        } finally {
            setLockingBaseline(false);
        }
    };

    const currentStatus = isLocked ? 'active' : (project.status || 'planning');

    const openReadinessWorkspace = () => {
        setLockError('');
        setIsReadinessOpen(true);
    };

    const closeReadinessWorkspace = () => {
        setIsReadinessOpen(false);
        setHighlightedTaskIds([]);
        requestAnimationFrame(() => readinessTriggerRef.current?.focus());
    };

    const requestBaselineLock = readiness => {
        if (readiness.summary.blockers > 0 || userRole !== 'Project Manager') return;
        setLockReadiness(readiness);
        setLockError('');
        setIsLockModalOpen(true);
    };

    const openTaskFromFinding = taskId => {
        const task = tasks.find(candidate => String(candidate.id) === String(taskId));
        if (!task) return;
        setSelectedWbsId(null);
        openEditTaskModal(task);
    };

    // Tasks sheet uses the shared schema so it round-trips back through Excel Import.
    const handleExport = () => {
        const taskRows = tasks.map(taskToRow);
        const wbsRows  = wbsNodes.map(n => ({
            'WBS Code': n.wbs_code,
            'Name':     wbsOverrides[n.id] || n.name,
            'Level':    n.level,
            'Parent':   wbsNodes.find(p => p.id === n.parent_id)?.wbs_code || '',
        }));
        exportWorkbook(exportFilename('Tasks', project.project_code), [
            { name: 'Tasks', rows: taskRows },
            { name: 'WBS',   rows: wbsRows },
        ]);
    };

    return (
        <div className="space-y-6">
            <div className="sr-only" aria-live="polite">
                {lockingBaseline ? 'Baseline lock is being submitted.' : isLocked ? 'Baseline locked successfully.' : lockError}
            </div>

            {/* HEADER */}
            <div className="flex flex-col gap-5">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                        <button onClick={onBack} aria-label="Go back to projects"
                            className="mt-1 p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer">
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div>
                            <div className="flex items-center gap-3 flex-wrap">
                                <h2 className="text-3xl font-bold text-slate-800 tracking-tight">{project.project_name}</h2>
                                <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-lg border ${STATUS_STYLES[currentStatus] || STATUS_STYLES.planning}`}>
                                    {currentStatus.replace('_', ' ')}
                                </span>
                            </div>
                            <p className="text-slate-400 font-mono text-xs mt-1">{project.project_code}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                        <button
                            onClick={handleExport}
                            disabled={tasks.length === 0 && wbsNodes.length === 0}
                            className="text-sm font-semibold px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 border shadow-sm text-emerald-600 bg-emerald-50 border-emerald-100 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 hover:shadow-lg hover:shadow-emerald-200 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                        >
                            <Download className="w-4 h-4" /> Export
                        </button>
                        {canEdit && (
                            isLocked ? (
                                <div className="flex items-center gap-2 px-5 py-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl font-semibold text-sm">
                                    <Lock className="w-4 h-4" /> Baseline Locked
                                </div>
                            ) : (
                                <button
                                    ref={readinessTriggerRef}
                                    onClick={openReadinessWorkspace}
                                    aria-expanded={isReadinessOpen}
                                    aria-controls="baseline-readiness-workspace"
                                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition duration-150 border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 cursor-pointer"
                                >
                                    <Lock className="w-4 h-4" />
                                    {userRole === 'Project Manager' ? 'Check & Lock Baseline' : 'Check plan'}
                                </button>
                            )
                        )}
                    </div>
                </div>

                {/* KPI STATS BAR STRIP */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 ml-14">
                    {[
                        { label: 'Planned Start', value: project.planned_start ? formatDate(project.planned_start) : '—', color: 'text-slate-800', icon: <Calendar className="w-4 h-4 text-emerald-600" />, bg: 'bg-emerald-50 border-emerald-100/50' },
                        { label: 'Target Finish', value: project.planned_end ? formatDate(project.planned_end) : '—', color: 'text-slate-800', icon: <Calendar className="w-4 h-4 text-amber-650" />, bg: 'bg-amber-50 border-amber-100/50' },
                        { label: 'Project Duration', value: `${durationDays} Days`, color: 'text-emerald-700', icon: <Clock className="w-4 h-4 text-emerald-600" />, bg: 'bg-emerald-50 border-emerald-100/50' },
                        { label: 'Total Budget (BAC)', value: formatCurrency(project.total_budget), color: 'text-rose-705', icon: <DollarSign className="w-4 h-4 text-rose-600" />, bg: 'bg-rose-50 border-rose-100/50' }
                    ].map((stat, idx) => (
                        <div key={idx} className="bg-white p-4.5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-300 flex items-center gap-3.5">
                            <div className={`p-2.5 rounded-xl border shrink-0 ${stat.bg}`}>{stat.icon}</div>
                            <div className="text-left">
                                <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-widest">{stat.label}</h3>
                                <p className={`text-sm font-black tracking-tight mt-0.5 ${stat.color}`}>{stat.value}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {isLocked && baseline && (
                    <div className="ml-14 flex items-center gap-3 px-4 py-3 bg-emerald-50/70 border border-emerald-200 rounded-2xl w-fit">
                        <div className="p-2 bg-emerald-100 rounded-xl text-emerald-700"><Lock className="w-4 h-4" /></div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700/80">Active Baseline</span>
                            <span className="text-sm font-bold text-emerald-800">{baseline.name}</span>
                            <span className="text-[11px] text-emerald-700/80">
                                {tasks.length} tasks
                                {baseline.lockedBy ? ` · by ${baseline.lockedBy}` : ''}
                                {baseline.lockedAt ? ` · locked ${baseline.lockedAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {isReadinessOpen && !isLocked && (
                <div id="baseline-readiness-workspace">
                    <PlanningReadinessPanel
                        projectId={project.id}
                        tasks={tasks}
                        canLock={userRole === 'Project Manager'}
                        onClose={closeReadinessWorkspace}
                        onOpenTask={openTaskFromFinding}
                        onRequestLock={requestBaselineLock}
                        onHighlightTasks={setHighlightedTaskIds}
                    />
                </div>
            )}

            {/* MAIN CONTENT: WBS Tree + Tasks Table */}
            <div className="flex gap-6 items-start">

                {/* LEFT: WBS Tree */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 w-72 shrink-0">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">WBS</h3>
                        <div className="flex items-center gap-1">
                            {anyExpandable && (
                                <>
                                    <button onClick={expandAll} title="Expand all"
                                        className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors">
                                        <ChevronDown className="w-4 h-4" />
                                    </button>
                                    <button onClick={collapseAll} title="Collapse all"
                                        className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors">
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </>
                            )}
                            {canEdit && !isLocked && (
                                <button
                                    onClick={() => setIsWbsModalOpen(true)}
                                    title="Add WBS Node"
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                                >
                                    <Plus className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </div>

                    {loadingTasks ? (
                        <div className="flex items-center justify-center h-16 gap-2 text-slate-300">
                            <Loader2 className="w-4 h-4 animate-spin" />
                        </div>
                    ) : (
                        <div className="space-y-0.5">
                            <button
                                onClick={() => setSelectedWbsId(null)}
                                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${selectedWbsId === null ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500 hover:bg-slate-50'}`}
                            >
                                All Tasks
                            </button>
                            {rootNodes.map(node => (
                                <WbsNode
                                    key={node.id}
                                    node={node}
                                    allNodes={wbsNodes}
                                    expandedNodes={expandedNodes}
                                    toggleExpand={toggleExpand}
                                    selectedWbsId={selectedWbsId}
                                    setSelectedWbsId={setSelectedWbsId}
                                    overrides={wbsOverrides}
                                    canRename={canEdit && !isLocked}
                                    editingId={editingWbsId}
                                    setEditingId={setEditingWbsId}
                                    onRename={renameWbsNode}
                                    onDelete={requestDeleteWbs}
                                    taskCounts={taskCounts}
                                />
                            ))}
                            {rootNodes.length === 0 && (
                                <div className="text-center py-6">
                                    <GitBranch className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                                    <p className="text-xs text-slate-400">No WBS nodes yet.</p>
                                    {canEdit && !isLocked && (
                                        <button
                                            onClick={() => setIsWbsModalOpen(true)}
                                            className="mt-2 text-xs text-emerald-600 font-semibold hover:underline"
                                        >
                                            + Add first node
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* RIGHT: Tasks Table */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex-1 min-w-0">
                    <div className="p-6 border-b border-slate-100 flex items-center justify-between gap-4 bg-slate-50/20">
                        <div>
                            <h3 className="font-bold text-slate-700">Tasks</h3>
                            {selectedNode ? (
                                <p className="text-xs text-slate-400 mt-0.5 font-semibold">
                                    Showing: <span className="font-mono text-emerald-600 font-bold">{selectedNode.wbs_code}</span> — {wbsOverrides[selectedNode.id] || selectedNode.name}
                                </p>
                            ) : (
                                <p className="text-xs text-slate-400 mt-0.5 font-semibold">All tasks in this project</p>
                            )}
                        </div>
                        {canEdit && !isLocked && (
                            <button
                                onClick={openAddTaskModal}
                                disabled={wbsNodes.length === 0}
                                title={wbsNodes.length === 0 ? 'Add a WBS node first' : 'Add task'}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-wider shadow hover:shadow-lg transition-all flex items-center gap-1.5 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none cursor-pointer"
                            >
                                <Plus className="w-3.5 h-3.5" /> Add Task
                            </button>
                        )}
                        {isLocked && (
                            <span className="flex items-center gap-1.5 text-xs text-slate-400 font-semibold">
                                <Lock className="w-3.5 h-3.5" /> Baseline Locked — Read-Only
                            </span>
                        )}
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50/80 text-xs uppercase tracking-wider text-slate-500 font-bold">
                                    <th className="px-4 py-4">Task Name</th>
                                    <th className="px-4 py-4">WBS</th>
                                    <th className="px-4 py-4">Start</th>
                                    <th className="px-4 py-4">End</th>
                                    <th className="px-4 py-4">Days</th>
                                    <th className="px-4 py-4">Planned Cost</th>
                                    <th className="px-4 py-4">Hours</th>
                                    <th className="px-4 py-4">Weight</th>
                                    <th className="px-4 py-4 text-right">{canEdit ? 'Actions' : ''}</th>
                                </tr>
                            </thead>
                            <tbody className="text-sm font-medium text-slate-600 divide-y divide-slate-50">
                                {loadingTasks ? (
                                    <tr><td colSpan="9" className="px-6 py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-slate-300 mx-auto" /></td></tr>
                                ) : filteredTasks.length > 0 ? (
                                    filteredTasks.map(task => (
                                        <tr key={task.id} className={`transition-colors ${highlightedTaskIds.some(id => String(id) === String(task.id)) ? 'bg-amber-50/80' : 'hover:bg-slate-50/50'}`}>
                                            <td className="px-4 py-3.5 font-semibold text-slate-700">
                                                <span className="inline-flex items-center gap-1.5">
                                                    {isLocked && <Lock className="w-3 h-3 text-slate-400 shrink-0" aria-label="Locked under baseline" />}
                                                    {task.task_name}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3.5 font-mono text-xs text-slate-400">{task.wbs_code}</td>
                                            <td className="px-4 py-3.5 text-slate-500">{task.planned_start ? formatDate(task.planned_start) : '—'}</td>
                                            <td className="px-4 py-3.5 text-slate-500">{task.planned_end   ? formatDate(task.planned_end)   : '—'}</td>
                                            <td className="px-4 py-3.5 text-slate-500">{task.planned_duration || '—'}</td>
                                            <td className="px-4 py-3.5 text-slate-700">{formatCurrency(task.planned_cost)}</td>
                                            <td className="px-4 py-3.5 text-slate-500">{task.planned_hours}</td>
                                            <td className="px-4 py-3.5">
                                                <span className="bg-indigo-50 text-indigo-600 border border-indigo-100 text-xs font-bold px-2 py-0.5 rounded-lg">
                                                    {(parseFloat(task.weight || 0) * 100).toFixed(0)}%
                                                </span>
                                            </td>
                                            <td className="px-4 py-3.5 text-right">
                                                {canEdit && (
                                                    <div className="flex items-center justify-end gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => openEditTaskModal(task)}
                                                            disabled={isLocked}
                                                            title={isLocked ? 'Locked under baseline' : 'Edit task'}
                                                            aria-label="Edit task"
                                                            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-slate-400 disabled:hover:bg-transparent"
                                                        >
                                                            <Pencil className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => { setDeleteError(''); setDeletingTaskId(task.id); }}
                                                            disabled={isLocked}
                                                            title={isLocked ? 'Locked under baseline' : 'Delete task'}
                                                            aria-label="Delete task"
                                                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-slate-400 disabled:hover:bg-transparent"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="9" className="px-6 py-12 text-center text-slate-400">
                                            <div className="flex flex-col items-center justify-center gap-2">
                                                <ListTodo className="w-10 h-10 text-slate-200" />
                                                <p>No tasks under this WBS node.</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                            {filteredTasks.length > 0 && (
                                <tfoot>
                                    <tr className="bg-slate-50/50 text-sm font-bold text-slate-700 border-t border-slate-100">
                                        <td className="px-4 py-3.5" colSpan="5">Total</td>
                                        <td className="px-4 py-3.5">{formatCurrency(totalCost)}</td>
                                        <td className="px-4 py-3.5">{totalHours} hrs</td>
                                        <td className={`px-4 py-3.5 ${totalWeight > 1.001 ? 'text-red-600 font-bold' : ''}`}>{(totalWeight * 100).toFixed(1)}%</td>
                                        <td className="px-4 py-3.5"></td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>
            </div>

            {/* ── ADD WBS NODE MODAL ─────────────────────────────────────────── */}
            {isWbsModalOpen && (
                <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setIsWbsModalOpen(false)}>
                    <div role="dialog" aria-label="Add WBS node" className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl border border-slate-100 animate-in fade-in duration-200" onClick={e => e.stopPropagation()}>

                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-emerald-50 rounded-xl text-emerald-600">
                                    <GitBranch className="w-5 h-5" />
                                </div>
                                <h3 className="text-xl font-bold text-slate-800">Add WBS Node</h3>
                            </div>
                            <button onClick={() => setIsWbsModalOpen(false)} aria-label="Close" className="text-slate-400 hover:text-slate-600 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {wbsError && (
                            <div className="p-3 mb-4 rounded-lg bg-red-50/80 border border-red-100 text-red-600 text-xs text-center font-bold uppercase">
                                {wbsError}
                            </div>
                        )}

                        <form onSubmit={handleAddWbs} className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">WBS Code <span className="text-red-500">*</span></label>
                                <input
                                    type="text" required value={wbsForm.wbs_code}
                                    onChange={e => setWbsForm({ ...wbsForm, wbs_code: e.target.value })}
                                    placeholder="e.g. 1.1 or 1.1.2"
                                    className="w-full px-4 py-3 bg-white/50 border border-slate-200 rounded-lg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all text-slate-700 text-sm"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">Node Name <span className="text-red-500">*</span></label>
                                <input
                                    type="text" required value={wbsForm.name}
                                    onChange={e => setWbsForm({ ...wbsForm, name: e.target.value })}
                                    placeholder="e.g. Foundation Works"
                                    className="w-full px-4 py-3 bg-white/50 border border-slate-200 rounded-lg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all text-slate-700 text-sm"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">Parent Node <span className="text-slate-300">(optional)</span></label>
                                <select
                                    value={wbsForm.parent_id}
                                    onChange={e => setWbsForm({ ...wbsForm, parent_id: e.target.value })}
                                    className="w-full px-4 py-3 bg-white/50 border border-slate-200 rounded-lg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all text-slate-700 text-sm"
                                >
                                    <option value="">— Root level node —</option>
                                    {wbsNodes.map(n => (
                                        <option key={n.id} value={n.id}>{n.wbs_code} — {wbsOverrides[n.id] || n.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button type="button" onClick={() => setIsWbsModalOpen(false)}
                                    className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-semibold hover:bg-slate-200 transition-all">
                                    Cancel
                                </button>
                                <button type="submit" disabled={savingWbs}
                                    className="flex-1 px-6 py-3 bg-emerald-600 text-white rounded-xl font-semibold shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 disabled:opacity-60">
                                    {savingWbs ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : 'Add Node'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── ADD / EDIT TASK MODAL ──────────────────────────────────────── */}
            {isTaskModalOpen && (
                <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50" onClick={closeTaskModal}>
                    <div role="dialog" aria-label={editingTaskId ? 'Edit task' : 'Add new task'} className="bg-white rounded-3xl p-8 w-full max-w-lg shadow-2xl border border-slate-100 animate-in fade-in duration-200" onClick={e => e.stopPropagation()}>

                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-bold text-slate-800">{editingTaskId ? 'Edit Task' : 'Add New Task'}</h3>
                            <button onClick={closeTaskModal} aria-label="Close" className="text-slate-400 hover:text-slate-600 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {taskError && (
                            <div className="p-3 mb-4 rounded-lg bg-red-50/80 border border-red-100 text-red-600 text-xs text-center font-bold uppercase">
                                {taskError}
                            </div>
                        )}

                        <form onSubmit={handleSubmitTask} className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">Task Name</label>
                                <input type="text" required value={taskForm.task_name}
                                    onChange={e => setTaskForm({ ...taskForm, task_name: e.target.value })}
                                    className="w-full px-4 py-3 bg-white/50 border border-slate-200 rounded-lg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all text-slate-700 text-sm"
                                    placeholder="e.g. Bored Pile 600mm Dia."
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">WBS Node</label>
                                {leafNodes.length === 0 ? (
                                    <div className="px-4 py-3 bg-amber-50/60 border border-amber-100 rounded-lg text-sm text-amber-700 flex items-center justify-between gap-3">
                                        <span>No WBS nodes yet — add one first.</span>
                                        <button
                                            type="button"
                                            onClick={() => { closeTaskModal(); setIsWbsModalOpen(true); }}
                                            className="shrink-0 text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-white border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors"
                                        >
                                            Add WBS Node
                                        </button>
                                    </div>
                                ) : (
                                    <WbsPicker
                                        leafNodes={leafNodes}
                                        allNodes={wbsNodes}
                                        overrides={wbsOverrides}
                                        value={taskForm.wbs_id}
                                        onChange={(v) => setTaskForm({ ...taskForm, wbs_id: v })}
                                    />
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">Start Date</label>
                                    <input type="date" required value={taskForm.planned_start}
                                        min={project.planned_start || undefined}
                                        max={project.planned_end || undefined}
                                        onChange={e => setTaskForm({ ...taskForm, planned_start: e.target.value })}
                                        className="w-full px-4 py-3 bg-white/50 border border-slate-200 rounded-lg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all text-slate-700 text-sm"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">End Date</label>
                                    <input type="date" required value={taskForm.planned_end}
                                        min={taskForm.planned_start || project.planned_start || undefined}
                                        max={project.planned_end || undefined}
                                        onChange={e => setTaskForm({ ...taskForm, planned_end: e.target.value })}
                                        className="w-full px-4 py-3 bg-white/50 border border-slate-200 rounded-lg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all text-slate-700 text-sm"
                                    />
                                </div>
                            </div>

                            {(taskForm.planned_start && taskForm.planned_end) && (
                                <div className="flex items-center gap-2 text-xs text-slate-500 ml-1">
                                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                                    Duration:
                                    <span className="font-bold text-slate-700">
                                        {taskDurationDays != null ? `${taskDurationDays} day${taskDurationDays === 1 ? '' : 's'}` : '—'}
                                    </span>
                                    <span className="text-slate-300">(auto)</span>
                                </div>
                            )}

                            <div className="grid grid-cols-3 gap-3">
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">Cost (IDR)</label>
                                    <input type="number" value={taskForm.planned_cost}
                                        onChange={e => setTaskForm({ ...taskForm, planned_cost: e.target.value })}
                                        className="w-full px-4 py-3 bg-white/50 border border-slate-200 rounded-lg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all text-slate-700 text-sm"
                                        placeholder="0"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">Hours</label>
                                    <input type="number" value={taskForm.planned_hours}
                                        onChange={e => setTaskForm({ ...taskForm, planned_hours: e.target.value })}
                                        className="w-full px-4 py-3 bg-white/50 border border-slate-200 rounded-lg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all text-slate-700 text-sm"
                                        placeholder="0"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">Weight</label>
                                    <input type="number" step="0.01" min="0" max="1" value={taskForm.weight}
                                        onChange={e => setTaskForm({ ...taskForm, weight: e.target.value })}
                                        className="w-full px-4 py-3 bg-white/50 border border-slate-200 rounded-lg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all text-slate-700 text-sm"
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>

                            {otherTasks.length > 0 && (
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">
                                        Predecessors <span className="text-slate-300">(optional)</span>
                                    </label>
                                    <div className="max-h-32 overflow-y-auto border border-slate-200 rounded-lg p-2 bg-white/50 space-y-0.5">
                                        {otherTasks.map(t => (
                                            <label key={t.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-50 cursor-pointer text-sm">
                                                <input
                                                    type="checkbox"
                                                    checked={taskForm.predecessors.includes(t.id)}
                                                    onChange={() => togglePredecessor(t.id)}
                                                    className="accent-emerald-600"
                                                />
                                                <span className="font-mono text-[10px] text-slate-400 shrink-0">{t.wbs_code}</span>
                                                <span className="truncate text-slate-700">{t.task_name}</span>
                                            </label>
                                        ))}
                                    </div>
                                    {taskForm.predecessors.length > 0 && (
                                        <p className="text-[11px] text-slate-400 ml-1">{taskForm.predecessors.length} selected — drives CPM in Analytics</p>
                                    )}
                                </div>
                            )}

                            <div className="flex gap-3 pt-4">
                                <button type="button" onClick={closeTaskModal}
                                    className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-semibold hover:bg-slate-200 transition-all">
                                    Cancel
                                </button>
                                <button type="submit" disabled={savingTask || !taskForm.wbs_id}
                                    className="flex-1 px-6 py-3 bg-emerald-600 text-white rounded-xl font-semibold shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
                                    {savingTask
                                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                                        : (editingTaskId ? 'Save Changes' : 'Add Task')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── DELETE TASK CONFIRM MODAL ──────────────────────────────────── */}
            {deletingTaskId !== null && (
                <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => !deletingTask && setDeletingTaskId(null)}>
                    <div role="dialog" aria-label="Delete task" className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl border border-slate-100 animate-in fade-in duration-200" onClick={e => e.stopPropagation()}>

                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2.5 bg-red-50 rounded-xl text-red-600"><AlertTriangle className="w-5 h-5" /></div>
                            <h3 className="text-xl font-bold text-slate-800">Delete Task</h3>
                        </div>

                        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                            Permanently remove <strong className="text-slate-700">{deletingTaskName || 'this task'}</strong>?
                            This cannot be undone.
                        </p>

                        {deleteError && (
                            <div className="p-3 mb-4 rounded-lg bg-red-50/80 border border-red-100 text-red-600 text-xs text-center font-bold uppercase">
                                {deleteError}
                            </div>
                        )}

                        <div className="flex gap-3">
                            <button onClick={() => setDeletingTaskId(null)} disabled={deletingTask}
                                className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-semibold hover:bg-slate-200 transition-all disabled:opacity-60">
                                Cancel
                            </button>
                            <button onClick={handleDeleteTask} disabled={deletingTask}
                                className="flex-1 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold shadow-lg shadow-red-100 transition-all flex items-center justify-center gap-2 disabled:opacity-60">
                                {deletingTask
                                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Deleting...</>
                                    : <><Trash2 className="w-4 h-4" /> Delete</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── DELETE WBS NODE CONFIRM MODAL ──────────────────────────────── */}
            {deletingWbsId !== null && (
                <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => !deletingWbs && setDeletingWbsId(null)}>
                    <div role="dialog" aria-label="Delete WBS node" className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl border border-slate-100 animate-in fade-in duration-200" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2.5 bg-red-50 rounded-xl text-red-600"><AlertTriangle className="w-5 h-5" /></div>
                            <h3 className="text-xl font-bold text-slate-800">Delete WBS Node</h3>
                        </div>
                        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                            Permanently remove{' '}
                            <strong className="text-slate-700">
                                {deletingWbsNode ? `${deletingWbsNode.wbs_code} — ${wbsOverrides[deletingWbsNode.id] || deletingWbsNode.name}` : 'this node'}
                            </strong>?
                            {taskCounts[deletingWbsId] > 0 && (
                                <span className="block mt-2 text-amber-600 font-semibold">This node has {taskCounts[deletingWbsId]} task(s). Reassign or delete them first.</span>
                            )}
                        </p>
                        {deleteWbsError && (
                            <div className="p-3 mb-4 rounded-lg bg-red-50/80 border border-red-100 text-red-600 text-xs text-center font-bold uppercase">
                                {deleteWbsError}
                            </div>
                        )}
                        <div className="flex gap-3">
                            <button onClick={() => setDeletingWbsId(null)} disabled={deletingWbs}
                                className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-semibold hover:bg-slate-200 transition-all disabled:opacity-60">
                                Cancel
                            </button>
                            <button onClick={handleDeleteWbs} disabled={deletingWbs}
                                className="flex-1 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold shadow-lg shadow-red-100 transition-all flex items-center justify-center gap-2 disabled:opacity-60">
                                {deletingWbs ? <><Loader2 className="w-4 h-4 animate-spin" /> Deleting...</> : <><Trash2 className="w-4 h-4" /> Delete</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── LOCK BASELINE MODAL ────────────────────────────────────────── */}
            {isLockModalOpen && (
                <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setIsLockModalOpen(false)}>
                    <div role="dialog" aria-label="Lock baseline" className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl border border-slate-100 animate-in fade-in duration-200" onClick={e => e.stopPropagation()}>

                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2.5 bg-amber-50 rounded-xl text-amber-600"><Lock className="w-5 h-5" /></div>
                            <h3 className="text-xl font-bold text-slate-800">Lock Baseline</h3>
                        </div>

                        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                            This freezes all <strong>{tasks.length} tasks</strong> and their planned values as the reference baseline.
                            Tasks cannot be edited after locking.
                        </p>

                        {lockReadiness?.summary.warnings > 0 && (
                            <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                                <p className="font-semibold">Locking with {lockReadiness.summary.warnings} planning warning{lockReadiness.summary.warnings === 1 ? '' : 's'}.</p>
                                <p className="mt-1 text-xs text-amber-700">Warnings remain in the readiness report and will be recorded in the baseline audit.</p>
                            </div>
                        )}

                        {lockError && (
                            <div className="p-3 mb-4 rounded-lg bg-red-50/80 border border-red-100 text-red-600 text-xs text-center font-bold uppercase">
                                {lockError}
                            </div>
                        )}

                        <div className="mb-6 p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Will be saved as</p>
                            <p className="text-base font-bold text-slate-800 mt-0.5">{baselineName.trim() || 'Baseline Rev.0'}</p>
                            <details className="mt-3 group">
                                <summary className="text-xs font-semibold text-slate-500 hover:text-emerald-600 cursor-pointer select-none list-none flex items-center gap-1">
                                    <ChevronRight className="w-3 h-3 transition-transform group-open:rotate-90" />
                                    Customize name
                                </summary>
                                <input
                                    type="text"
                                    value={baselineName}
                                    onChange={e => setBaselineName(e.target.value)}
                                    placeholder="Baseline Rev.0"
                                    className={`${INPUT_CLASS} mt-2`}
                                />
                            </details>
                        </div>

                        <div className="flex gap-3">
                            <button onClick={() => setIsLockModalOpen(false)}
                                className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-semibold hover:bg-slate-200 transition-all">
                                Cancel
                            </button>
                            <button onClick={handleLockBaseline} disabled={lockingBaseline}
                                className="flex-1 px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-semibold shadow-lg shadow-amber-100 transition-all flex items-center justify-center gap-2 disabled:opacity-60">
                                {lockingBaseline ? <><Loader2 className="w-4 h-4 animate-spin" /> Locking...</> : <><Lock className="w-4 h-4" /> Confirm Lock</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
