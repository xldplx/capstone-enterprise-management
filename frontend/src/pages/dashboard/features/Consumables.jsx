import { useState, useEffect, useMemo } from 'react';
import { Package, Plus, Search, X, Loader2, CheckCircle2, AlertTriangle, Droplet, Activity, Layers, History, ChevronDown, ChevronRight, Trash2, Download, Pencil } from 'lucide-react';
import { apiFetch } from '../../../utils/api';
import { exportWorkbook, exportFilename } from '../../../utils/excelExport';
import { useTranslation } from '../../../utils/i18n';
import RowActionsMenu from '../../../components/RowActionsMenu';
import { formatProjectStatus, sortProjectsForSelection } from '../../../utils/projectPresentation';

const CATEGORIES = ['Fuel', 'Lubricant', 'Welding', 'Cleaning', 'Other'];
const UNITS      = ['L', 'kg', 'pcs'];
const todayISO   = () => new Date().toISOString().slice(0, 10);
const fmtDate    = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function Consumables() {
    const { t } = useTranslation();

    const [items, setItems]                         = useState([]);
    const [logs, setLogs]                           = useState([]);
    const [loadingItems, setLoadingItems]           = useState(true);
    const [loadingLogs, setLoadingLogs]             = useState(false);
    const [logsError, setLogsError]                 = useState('');
    const [projects, setProjects]                   = useState([]);
    const [isLoadingProjects, setIsLoadingProjects] = useState(true);
    const [selectedProjectId, setSelectedProjectId] = useState('');

    const [search, setSearch]             = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [historyOpen, setHistoryOpen]   = useState(true);

    // Add modal
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingItem, setEditingItem]         = useState(null);
    const [addForm, setAddForm]               = useState({ name: '', category: 'Fuel', unit: 'L', current_stock: '', reorder_threshold: '' });
    const [addError, setAddError]             = useState('');
    const [saving, setSaving]                 = useState(false);

    // Log modal
    const [logTargetId, setLogTargetId]   = useState(null);
    const [logForm, setLogForm]           = useState({ qty: '', date: todayISO(), project_id: '', note: '' });
    const [logError, setLogError]         = useState('');
    const [savingLog, setSavingLog]       = useState(false);

    // Delete confirm
    const [deletingId, setDeletingId]     = useState(null);
    const [deletingItem, setDeletingItem] = useState(false);

    const [toast, setToast] = useState('');

    const userRole  = localStorage.getItem('userRole');
    const canAdd    = ['Project Manager', 'Planner'].includes(userRole);
    const canLogUse = ['Project Manager', 'Planner', 'Site Engineer'].includes(userRole);
    const canDelete = userRole === 'Project Manager';

    const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

    // ── Fetch items ──────────────────────────────────────────────────────────
    const fetchItems = async () => {
        setLoadingItems(true);
        try {
            const res = await apiFetch('/consumables');
            setItems(res.data || []);
        } catch (e) { showToast(e.message); }
        finally { setLoadingItems(false); }
    };

    // ── Fetch logs (project-scoped) ──────────────────────────────────────────
    const fetchLogs = async (projectId) => {
        if (!projectId) { setLogs([]); return; }
        setLoadingLogs(true);
        setLogsError('');
        try {
            const res = await apiFetch(`/consumable-logs?project_id=${projectId}`);
            setLogs(res.data || []);
        } catch (e) { setLogsError(e.message || 'Failed to load usage logs.'); }
        finally { setLoadingLogs(false); }
    };

    // ── Fetch projects ───────────────────────────────────────────────────────
    useEffect(() => {
        setIsLoadingProjects(true);
        apiFetch('/projects').then(r => {
            const list = sortProjectsForSelection(r.data || []);
            setProjects(list);
            if (list.length > 0) {
                const firstId = String(list[0].id);
                setSelectedProjectId(firstId);
                fetchLogs(firstId);
            }
        }).catch(console.error).finally(() => setIsLoadingProjects(false));
        fetchItems();
    }, []);

    useEffect(() => {
        const handler = (e) => {
            if (e.key !== 'Escape') return;
            setIsAddModalOpen(false); setLogTargetId(null); setDeletingId(null);
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, []);

    const handleProjectChange = (e) => {
        setSelectedProjectId(e.target.value);
        fetchLogs(e.target.value);
    };

    // ── Excel export ───────────────────────────────────────────────────────────
    const handleExport = () => {
        const itemRows = items.map(it => ({
            Name:                it.name,
            Category:            it.category,
            Unit:                it.unit,
            'Current Stock':     it.current_stock,
            'Reorder Threshold': it.reorder_threshold,
            'Last Used':         it.last_used_at,
        }));
        const logRows = logs.map(l => ({
            Date:       l.date,
            Consumable: l.consumables?.name || `Item #${l.item_id}`,
            Quantity:   l.qty,
            Unit:       l.consumables?.unit || '',
            Note:       l.note,
        }));
        exportWorkbook(exportFilename('Consumables'), [
            { name: 'Consumables', rows: itemRows },
            { name: 'Usage Logs', rows: logRows },
        ]);
    };

    // ── KPI ──────────────────────────────────────────────────────────────────
    const today = todayISO();
    const counts = useMemo(() => ({
        total:    items.length,
        lowStock: items.filter(i => parseFloat(i.current_stock) < parseFloat(i.reorder_threshold)).length,
        todayConsumptions: logs.filter(l => l.date === today).length,
        categories: new Set(items.map(i => i.category).filter(Boolean)).size,
    }), [items, logs, today]);

    // ── Filter ───────────────────────────────────────────────────────────────
    const STATUS_FILTERS = ['All', 'Low Stock', 'Healthy'];
    const STATUS_LABELS  = { 'All': t('common.all'), 'Low Stock': t('consumables.lowStock'), 'Healthy': t('consumables.healthy') };

    const filtered = useMemo(() => items.filter(i => {
        const isLow = parseFloat(i.current_stock) < parseFloat(i.reorder_threshold);
        if (statusFilter === 'Low Stock' && !isLow)  return false;
        if (statusFilter === 'Healthy'   &&  isLow)  return false;
        if (search && !i.name.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    }), [items, search, statusFilter]);

    const itemById = useMemo(() => Object.fromEntries(items.map(i => [i.id, i])), [items]);
    const selectedProject = projects.find(p => String(p.id) === selectedProjectId);
    const sortedProjects = useMemo(() => sortProjectsForSelection(projects), [projects]);

    const openAddModal = () => {
        setEditingItem(null);
        setAddForm({ name: '', category: 'Fuel', unit: 'L', current_stock: '', reorder_threshold: '' });
        setAddError('');
        setIsAddModalOpen(true);
    };

    const openEditModal = item => {
        setEditingItem(item);
        setAddForm({
            name: item.name || '',
            category: item.category || 'Other',
            unit: item.unit || 'pcs',
            current_stock: String(item.current_stock ?? ''),
            reorder_threshold: String(item.reorder_threshold ?? ''),
        });
        setAddError('');
        setIsAddModalOpen(true);
    };

    // ── Add Consumable ────────────────────────────────────────────────────────
    const handleAddItem = async (e) => {
        e.preventDefault(); setAddError('');
        if (!addForm.name.trim()) { setAddError(t('common.name') + ' ' + t('common.required') + '.'); return; }
        const stock     = parseFloat(addForm.current_stock);
        const threshold = parseFloat(addForm.reorder_threshold);
        if (isNaN(stock) || stock < 0)         { setAddError(t('consumables.startingStock') + ' must be ≥ 0.'); return; }
        if (isNaN(threshold) || threshold < 0) { setAddError(t('consumables.reorderThreshold') + ' must be ≥ 0.'); return; }

        setSaving(true);
        try {
            await apiFetch(editingItem ? `/consumables/${editingItem.id}` : '/consumables', {
                method: editingItem ? 'PUT' : 'POST',
                body: JSON.stringify({
                    name:              addForm.name.trim(),
                    category:          addForm.category,
                    unit:              addForm.unit,
                    current_stock:     stock,
                    reorder_threshold: threshold,
                }),
            });
            setIsAddModalOpen(false);
            setEditingItem(null);
            setAddForm({ name: '', category: 'Fuel', unit: 'L', current_stock: '', reorder_threshold: '' });
            showToast(`"${addForm.name.trim()}" ${editingItem ? 'updated' : 'added'} successfully.`);
            fetchItems();
        } catch (err) { setAddError(err.message || 'Failed.'); }
        finally { setSaving(false); }
    };

    // ── Log Consumption ───────────────────────────────────────────────────────
    const openLogModal = (itemId) => {
        setLogForm({ qty: '', date: todayISO(), project_id: selectedProjectId, note: '' });
        setLogError(''); setLogTargetId(itemId);
    };

    const handleLogConsumption = async (e) => {
        e.preventDefault(); setLogError('');
        const target = itemById[logTargetId];
        if (!target) { setLogError('Item not found.'); return; }
        const qty = parseFloat(logForm.qty);
        if (isNaN(qty) || qty <= 0)                { setLogError(t('consumables.quantity') + ' must be > 0.'); return; }
        if (qty > parseFloat(target.current_stock)) { setLogError(`Only ${target.current_stock} ${target.unit} in stock.`); return; }
        if (!logForm.date)                          { setLogError(t('common.date') + ' ' + t('common.required') + '.'); return; }
        if (logForm.date > todayISO())              { setLogError(t('common.date') + ' cannot be in the future.'); return; }
        if (!logForm.project_id)                    { setLogError(t('common.project') + ' ' + t('common.required') + '.'); return; }

        setSavingLog(true);
        try {
            await apiFetch('/consumable-logs', {
                method: 'POST',
                body: JSON.stringify({
                    item_id:    logTargetId,
                    project_id: parseInt(logForm.project_id),
                    qty,
                    date:       logForm.date,
                    note:       logForm.note.trim() || null,
                }),
            });
            setLogTargetId(null);
            showToast(`${t('consumables.logged')} ${qty} ${target.unit} ${t('consumables.of')} ${target.name}`);
            fetchItems();
            fetchLogs(selectedProjectId);
        } catch (err) { setLogError(err.message || 'Failed.'); }
        finally { setSavingLog(false); }
    };

    // ── Delete ────────────────────────────────────────────────────────────────
    const handleDelete = async () => {
        if (!deletingId) return;
        setDeletingItem(true);
        try {
            await apiFetch(`/consumables/${deletingId}`, { method: 'DELETE' });
            showToast('Consumable deleted.');
            setDeletingId(null);
            fetchItems();
        } catch (err) { showToast(err.message || 'Failed.'); }
        finally { setDeletingItem(false); }
    };

    const logTarget = itemById[logTargetId];
    const inputCls  = "w-full px-4 py-3 bg-white/50 border border-slate-200 rounded-lg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all text-slate-700 text-sm";

    return (
        <div className="space-y-8">
            {/* TOAST */}
            {toast && (
                <div className="fixed top-6 right-6 z-50 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-lg shadow-emerald-200 flex items-center gap-2 text-sm font-semibold animate-in slide-in-from-top-2 fade-in duration-200">
                    <CheckCircle2 className="w-4 h-4" /> {toast}
                </div>
            )}

            {/* KPI */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { icon: <Package className="w-5 h-5" />, bg: 'bg-slate-100', cls: 'text-slate-500', label: t('consumables.totalItems'), value: counts.total, valCls: 'text-slate-800' },
                    { icon: <AlertTriangle className="w-5 h-5" />, bg: 'bg-red-50', cls: 'text-red-600', label: t('consumables.lowStock'), value: counts.lowStock, valCls: 'text-red-600' },
                    { icon: <Droplet className="w-5 h-5" />, bg: 'bg-blue-50', cls: 'text-blue-600', label: t('consumables.todayConsumptions'), value: counts.todayConsumptions, valCls: 'text-blue-600' },
                    { icon: <Layers className="w-5 h-5" />, bg: 'bg-emerald-50', cls: 'text-emerald-600', label: t('consumables.categories'), value: counts.categories, valCls: 'text-emerald-600' },
                ].map((k, i) => (
                    <div key={i} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                        <div className={`p-3 ${k.bg} rounded-xl ${k.cls} w-fit mb-4`}>{k.icon}</div>
                        <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-widest">{k.label}</h3>
                        <p className={`text-2xl font-black tracking-tight mt-1 ${k.valCls}`}>{k.value}</p>
                    </div>
                ))}
            </div>

            {/* FILTERS */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4 flex flex-wrap items-center gap-3" aria-label="Consumables table controls">
                <div className="flex items-center gap-2 overflow-x-auto p-1">
                    {STATUS_FILTERS.map(f => (
                        <button key={f} onClick={() => setStatusFilter(f)}
                            className={`px-5 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${statusFilter === f ? 'bg-white text-emerald-700 shadow-md border border-emerald-100' : 'text-slate-400 hover:text-slate-700'}`}>
                            {STATUS_LABELS[f]}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2 min-w-60 flex-1">
                    <Activity className="w-4 h-4 text-slate-400 shrink-0" />
                    <select aria-label={t('consumables.projectScope')} value={selectedProjectId} onChange={handleProjectChange}
                        disabled={isLoadingProjects || projects.length === 0}
                        className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-slate-700 text-sm font-semibold disabled:opacity-60">
                        {isLoadingProjects ? <option>{t('common.loading')}</option> : projects.length === 0 ? <option>No projects</option>
                            : sortedProjects.map(p => <option key={p.id} value={p.id}>{p.project_code} — {p.project_name} ({formatProjectStatus(p.status)})</option>)}
                    </select>
                </div>
                <span className="text-xs font-semibold text-slate-400 whitespace-nowrap">{filtered.length} results</span>
                <div className="flex flex-wrap items-center gap-3 ml-auto">
                    <div className="relative min-w-56 flex-1">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input type="text" placeholder={t('consumables.searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)}
                            className="text-sm bg-white border border-slate-200 rounded-xl pl-9 pr-9 py-2 outline-none focus:border-emerald-500 transition-colors min-w-[240px] shadow-sm" />
                        {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>}
                    </div>
                    <button onClick={handleExport} disabled={items.length === 0}
                        className="text-sm font-semibold px-4 py-2 rounded-xl transition-all flex items-center gap-2 border shadow-sm text-emerald-600 bg-emerald-50 border-emerald-100 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 hover:shadow-lg hover:shadow-emerald-200 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-40 disabled:pointer-events-none">
                        <Download className="w-4 h-4" /> Export
                    </button>
                    {canAdd && <button onClick={openAddModal} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm transition-colors flex items-center gap-2"><Plus className="w-4 h-4" /> {t('consumables.addItem')}</button>}
                </div>
            </div>

            {/* TABLE */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                {loadingItems ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4 text-slate-400">
                        <Loader2 className="w-10 h-10 animate-spin text-emerald-500" />
                        <p className="text-xs font-bold uppercase tracking-widest">{t('common.loading')}</p>
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <caption className="sr-only">Consumables stock levels, reorder points, and available actions</caption>
                                <thead>
                                    <tr className="bg-slate-50/80 text-xs uppercase tracking-wider text-slate-500 font-bold">
                                        <th scope="col" className="px-6 py-4">{t('common.name')}</th>
                                        <th scope="col" className="px-6 py-4">{t('consumables.category')}</th>
                                        <th scope="col" className="px-6 py-4">{t('consumables.stockTable')}</th>
                                        <th scope="col" className="px-6 py-4">{t('consumables.reorderAt')}</th>
                                        <th scope="col" className="px-6 py-4">{t('consumables.lastUsed')}</th>
                                        <th scope="col" className="px-6 py-4 text-right">{t('common.actions')}</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm font-medium text-slate-600 divide-y divide-slate-50">
                                    {filtered.length > 0 ? filtered.map(item => {
                                        const isLow = parseFloat(item.current_stock) < parseFloat(item.reorder_threshold);
                                        return (
                                            <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                                                <td className="px-6 py-4 font-semibold text-slate-700">{item.name}</td>
                                                <td className="px-6 py-4 text-slate-500">{item.category || '—'}</td>
                                                <td className="px-6 py-4">
                                                    <span className="inline-flex items-center gap-2">
                                                        <span className={`font-mono font-bold ${isLow ? 'text-red-600' : 'text-slate-700'}`}>{item.current_stock} {item.unit}</span>
                                                        {isLow && <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-md bg-red-50 text-red-700 border border-red-100">{t('consumables.low')}</span>}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-slate-500 font-mono text-xs">{item.reorder_threshold} {item.unit}</td>
                                                <td className="px-6 py-4 text-slate-400 text-xs">{fmtDate(item.last_used_at)}</td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center justify-end gap-2 min-w-max">
                                                        {canLogUse && (
                                                            <button onClick={() => openLogModal(item.id)}
                                                                disabled={parseFloat(item.current_stock) <= 0}
                                                                title={parseFloat(item.current_stock) <= 0 ? t('consumables.outOfStock') : t('consumables.logConsumption')}
                                                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                                                                <Activity className="w-3.5 h-3.5" /> Record usage
                                                            </button>
                                                        )}
                                                        <RowActionsMenu label={`More actions for ${item.name}`} actions={[
                                                            ...(canAdd ? [{ label: t('common.edit'), icon: Pencil, onSelect: () => openEditModal(item) }] : []),
                                                            ...(canDelete ? [{ label: t('common.delete'), icon: Trash2, destructive: true, onSelect: () => setDeletingId(item.id) }] : []),
                                                        ]} />
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    }) : (
                                        <tr>
                                            <td colSpan="6" className="px-6 py-16 text-center text-slate-400">
                                                <div className="flex flex-col items-center gap-3">
                                                    <Package className="w-12 h-12 text-slate-200" />
                                                    <p>{t('common.noData')}</p>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="bg-slate-50 p-4 flex justify-between items-center border-t border-slate-100">
                            <span className="text-xs text-slate-400">{t('common.showing')} {filtered.length} {t('common.of')} {items.length}</span>
                        </div>
                    </>
                )}
            </div>

            {/* RECENT CONSUMPTION */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                <button onClick={() => setHistoryOpen(o => !o)} className="w-full px-6 py-4 flex items-center justify-between gap-4 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-100 rounded-xl text-slate-500"><History className="w-4 h-4" /></div>
                        <div className="text-left">
                            <h3 className="font-bold text-slate-700">{t('consumables.recentConsumption')}</h3>
                            <p className="text-xs text-slate-400">{selectedProject ? `${selectedProject.project_code} — ${selectedProject.project_name}` : t('consumables.selectProject')}</p>
                        </div>
                    </div>
                    {historyOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                </button>
                {historyOpen && (
                    <div className="border-t border-slate-100">
                        {loadingLogs ? (
                            <div className="flex items-center justify-center py-8 gap-2 text-slate-400">
                                <Loader2 className="w-5 h-5 animate-spin" />
                            </div>
                        ) : logsError ? (
                            <div className="p-12 flex flex-col items-center justify-center gap-2 text-slate-400">
                                <AlertTriangle className="w-10 h-10 text-red-300" />
                                <p className="text-sm">{logsError}</p>
                                <button onClick={() => fetchLogs(selectedProjectId)} className="text-xs font-bold text-emerald-600 hover:text-emerald-700">{t('common.retry')}</button>
                            </div>
                        ) : logs.length > 0 ? (
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50/60 text-xs uppercase tracking-wider text-slate-500 font-bold">
                                        <th className="px-6 py-3">{t('common.date')}</th>
                                        <th className="px-6 py-3">{t('common.name')}</th>
                                        <th className="px-6 py-3">{t('consumables.quantity')}</th>
                                        <th className="px-6 py-3">{t('consumables.note')}</th>
                                        <th className="px-6 py-3">By</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm font-medium text-slate-600 divide-y divide-slate-50">
                                    {logs.map(log => (
                                        <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-6 py-3 text-slate-500 text-xs">{fmtDate(log.date)}</td>
                                            <td className="px-6 py-3 font-semibold text-slate-700">
                                                {log.consumables?.name || `Item #${log.item_id}`}
                                            </td>
                                            <td className="px-6 py-3 font-mono text-slate-700">
                                                {log.qty} {log.consumables?.unit || ''}
                                            </td>
                                            <td className="px-6 py-3 text-slate-400 text-xs">{log.note || '—'}</td>
                                            <td className="px-6 py-3 text-slate-400 text-xs">{log.submitted_by || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div className="p-12 flex flex-col items-center justify-center gap-2 text-slate-400">
                                <History className="w-10 h-10 text-slate-200" />
                                <p className="text-sm">{t('consumables.noEvents')}</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ADD MODAL */}
            {isAddModalOpen && (
                <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setIsAddModalOpen(false)}>
                    <div role="dialog" className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl border border-slate-100 animate-in fade-in duration-200" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-bold text-slate-800">{editingItem ? `Edit ${editingItem.name}` : t('consumables.addItem')}</h3>
                            <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors"><X className="w-5 h-5" /></button>
                        </div>
                        {addError && <div className="p-3 mb-4 rounded-lg bg-red-50/80 border border-red-100 text-red-600 text-xs font-bold uppercase">{addError}</div>}
                        <form onSubmit={handleAddItem} className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">{t('common.name')} <span className="text-red-500">*</span></label>
                                <input type="text" required value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })} placeholder="e.g. Diesel Fuel" className={inputCls} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">{t('consumables.category')}</label>
                                    <select value={addForm.category} onChange={e => setAddForm({ ...addForm, category: e.target.value })} className={inputCls}>
                                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">{t('consumables.unit')}</label>
                                    <select value={addForm.unit} onChange={e => setAddForm({ ...addForm, unit: e.target.value })} className={inputCls}>
                                        {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">{t('consumables.startingStock')} <span className="text-red-500">*</span></label>
                                    <input type="number" required min="0" step="any" value={addForm.current_stock} onChange={e => setAddForm({ ...addForm, current_stock: e.target.value })} placeholder="0" className={inputCls} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">{t('consumables.reorderThreshold')} <span className="text-red-500">*</span></label>
                                    <input type="number" required min="0" step="any" value={addForm.reorder_threshold} onChange={e => setAddForm({ ...addForm, reorder_threshold: e.target.value })} placeholder="0" className={inputCls} />
                                </div>
                            </div>
                            <div className="flex gap-3 pt-4">
                                <button type="button" onClick={() => setIsAddModalOpen(false)} className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-semibold hover:bg-slate-200 transition-all">{t('common.cancel')}</button>
                                <button type="submit" disabled={saving} className="flex-1 px-6 py-3 bg-emerald-600 text-white rounded-xl font-semibold shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 disabled:opacity-60">
                                    {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('common.saving')}</> : editingItem ? t('projects.saveChanges') : t('consumables.addItem')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* LOG MODAL */}
            {logTargetId !== null && (
                <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setLogTargetId(null)}>
                    <div role="dialog" className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl border border-slate-100 animate-in fade-in duration-200" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-xl font-bold text-slate-800">{t('consumables.logConsumption')}</h3>
                            <button onClick={() => setLogTargetId(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                        </div>
                        <p className="text-sm text-slate-500 mb-6 font-mono">{logTarget?.name} · {logTarget?.current_stock} {logTarget?.unit} in stock</p>
                        {logError && <div className="p-3 mb-4 rounded-lg bg-red-50/80 border border-red-100 text-red-600 text-xs font-bold uppercase">{logError}</div>}
                        <form onSubmit={handleLogConsumption} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">{t('consumables.quantity')} <span className="text-red-500">*</span></label>
                                    <input type="number" required min="0.01" step="any" value={logForm.qty} onChange={e => setLogForm({ ...logForm, qty: e.target.value })} placeholder="0" className={inputCls} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">{t('common.date')} <span className="text-red-500">*</span></label>
                                    <input type="date" required max={todayISO()} value={logForm.date} onChange={e => setLogForm({ ...logForm, date: e.target.value })} className={inputCls} />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">{t('common.project')} <span className="text-red-500">*</span></label>
                                <select required value={logForm.project_id} onChange={e => setLogForm({ ...logForm, project_id: e.target.value })} className={inputCls}>
                                    <option value="">{t('consumables.selectProject')}</option>
                                    {sortedProjects.map(p => <option key={p.id} value={p.id}>{p.project_code} — {p.project_name} ({formatProjectStatus(p.status)})</option>)}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">{t('consumables.note')} <span className="text-slate-300">(optional)</span></label>
                                <input type="text" value={logForm.note} onChange={e => setLogForm({ ...logForm, note: e.target.value })} placeholder="e.g. Excavator EX-02 refuel" className={inputCls} />
                            </div>
                            <div className="flex gap-3 pt-4">
                                <button type="button" onClick={() => setLogTargetId(null)} className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-semibold hover:bg-slate-200 transition-all">{t('common.cancel')}</button>
                                <button type="submit" disabled={savingLog} className="flex-1 px-6 py-3 bg-emerald-600 text-white rounded-xl font-semibold shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 disabled:opacity-60">
                                    {savingLog ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('common.saving')}</> : t('consumables.logConsumption')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* DELETE CONFIRM */}
            {deletingId && (
                <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => !deletingItem && setDeletingId(null)}>
                    <div role="dialog" className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl border border-slate-100 animate-in fade-in duration-200" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2.5 bg-red-50 rounded-xl text-red-600"><Trash2 className="w-5 h-5" /></div>
                            <h3 className="text-xl font-bold text-slate-800">{t('common.delete')}</h3>
                        </div>
                        <p className="text-sm text-slate-500 mb-6">{t('settings.users.deleteCannotUndo')}</p>
                        <div className="flex gap-3">
                            <button onClick={() => setDeletingId(null)} disabled={deletingItem} className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-semibold hover:bg-slate-200 transition-all disabled:opacity-60">{t('common.cancel')}</button>
                            <button onClick={handleDelete} disabled={deletingItem} className="flex-1 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold shadow-lg shadow-red-100 transition-all flex items-center justify-center gap-2 disabled:opacity-60">
                                {deletingItem ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('common.deleting')}</> : <><Trash2 className="w-4 h-4" /> {t('common.delete')}</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
