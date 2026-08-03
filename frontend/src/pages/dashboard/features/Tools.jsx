import { useState, useEffect, useMemo } from 'react';
import {
    Plus, Hammer, Search, X, Loader2, CheckCircle2, Wrench,
    AlertTriangle, Package, RotateCcw, Pencil, Trash2, Download
} from 'lucide-react';
import { apiFetch } from '../../../utils/api';
import { useTranslation } from '../../../utils/i18n';
import { exportWorkbook, exportFilename } from '../../../utils/excelExport';
import RowActionsMenu from '../../../components/RowActionsMenu';

const todayISO = () => new Date().toISOString().slice(0, 10);
const fmtDate  = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const CONDITION_BADGE = {
    good:         'bg-emerald-50 text-emerald-700 border-emerald-100',
    fair:         'bg-amber-50 text-amber-700 border-amber-100',
    needs_repair: 'bg-red-50 text-red-700 border-red-100',
};

const STATUS_FILTERS = ['All', 'Available', 'Checked Out', 'Needs Repair'];

export default function Tools() {
    const { t } = useTranslation();

    const [tools, setTools]               = useState([]);
    const [loading, setLoading]           = useState(true);
    const [search, setSearch]             = useState('');
    const [statusFilter, setStatusFilter] = useState('All');

    // Add / Edit modal
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingTool, setEditingTool]       = useState(null);
    const [addForm, setAddForm]               = useState({ name: '', category: '', condition: 'good' });
    const [addError, setAddError]             = useState('');
    const [savingAdd, setSavingAdd]           = useState(false);

    // Checkout modal
    const [checkoutTarget, setCheckoutTarget] = useState(null);
    const [checkoutForm, setCheckoutForm]     = useState({ assigned_to: '', checkout_date: todayISO() });
    const [checkoutError, setCheckoutError]   = useState('');
    const [savingCheckout, setSavingCheckout] = useState(false);

    // Delete confirm
    const [deletingId, setDeletingId]     = useState(null);
    const [deletingTool, setDeletingTool] = useState(false);
    const [deleteError, setDeleteError]   = useState('');

    const [toast, setToast] = useState({ msg: '', type: 'success' });

    const userRole  = localStorage.getItem('userRole');
    const canEdit   = ['Project Manager', 'Planner', 'Site Engineer'].includes(userRole);
    const canDelete = userRole === 'Project Manager';

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast({ msg: '', type: 'success' }), 3000);
    };

    // ── Fetch ─────────────────────────────────────────────────────────────────
    const fetchTools = async () => {
        setLoading(true);
        try {
            const res = await apiFetch('/tools');
            setTools(res.data || []);
        } catch (e) { showToast(e.message || 'Failed to load tools.', 'error'); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchTools(); }, []);

    useEffect(() => {
        const handler = (e) => {
            if (e.key !== 'Escape') return;
            setIsAddModalOpen(false); setCheckoutTarget(null); setDeletingId(null);
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, []);

    // ── KPI ───────────────────────────────────────────────────────────────────
    const counts = useMemo(() => ({
        total:       tools.length,
        available:   tools.filter(t => t.status === 'Available').length,
        checkedOut:  tools.filter(t => t.status === 'Checked Out').length,
        needsRepair: tools.filter(t => t.status === 'Needs Repair').length,
    }), [tools]);

    const STATUS_LABELS = {
        'All':          t('common.all'),
        'Available':    t('tools.available'),
        'Checked Out':  t('tools.checkedOut'),
        'Needs Repair': t('tools.needsRepair'),
    };

    // ── Filter ────────────────────────────────────────────────────────────────
    const filtered = useMemo(() => tools.filter(tool => {
        if (statusFilter !== 'All' && tool.status !== statusFilter) return false;
        if (search && !tool.name.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    }), [tools, search, statusFilter]);

    // ── Add / Edit ────────────────────────────────────────────────────────────
    const openAddModal = () => {
        setEditingTool(null); setAddForm({ name: '', category: '', condition: 'good' });
        setAddError(''); setIsAddModalOpen(true);
    };

    const openEditModal = (tool) => {
        setEditingTool(tool);
        setAddForm({ name: tool.name, category: tool.category || '', condition: tool.condition || 'good' });
        setAddError(''); setIsAddModalOpen(true);
    };

    const handleSubmitTool = async (e) => {
        e.preventDefault(); setAddError('');
        if (!addForm.name.trim()) { setAddError(t('common.name') + ' ' + t('common.required') + '.'); return; }
        setSavingAdd(true);
        try {
            if (editingTool) {
                await apiFetch(`/tools/${editingTool.id}`, {
                    method: 'PUT',
                    body: JSON.stringify({ name: addForm.name.trim(), category: addForm.category.trim() || null, condition: addForm.condition }),
                });
                showToast(`"${addForm.name}" ${t('tools.updatedSuccess')}`);
            } else {
                await apiFetch('/tools', {
                    method: 'POST',
                    body: JSON.stringify({ name: addForm.name.trim(), category: addForm.category.trim() || null, condition: addForm.condition }),
                });
                showToast(`"${addForm.name}" ${t('tools.addedSuccess')}`);
            }
            setIsAddModalOpen(false);
            fetchTools();
        } catch (err) { setAddError(err.message || 'Failed.'); }
        finally { setSavingAdd(false); }
    };

    // ── Checkout ──────────────────────────────────────────────────────────────
    const openCheckoutModal = (tool) => {
        setCheckoutTarget(tool);
        setCheckoutForm({ assigned_to: '', checkout_date: todayISO() });
        setCheckoutError('');
    };

    const handleCheckout = async (e) => {
        e.preventDefault(); setCheckoutError('');
        if (!checkoutForm.assigned_to.trim()) { setCheckoutError(t('tools.assignedToLabel') + ' ' + t('common.required') + '.'); return; }
        setSavingCheckout(true);
        try {
            await apiFetch(`/tools/${checkoutTarget.id}/checkout`, {
                method: 'PATCH',
                body: JSON.stringify({ assigned_to: checkoutForm.assigned_to.trim(), checkout_date: checkoutForm.checkout_date }),
            });
            showToast(`"${checkoutTarget.name}" ${t('tools.checkedOutTo')} ${checkoutForm.assigned_to}.`);
            setCheckoutTarget(null);
            fetchTools();
        } catch (err) { setCheckoutError(err.message || 'Failed.'); }
        finally { setSavingCheckout(false); }
    };

    // ── Return ────────────────────────────────────────────────────────────────
    const handleReturn = async (tool) => {
        try {
            await apiFetch(`/tools/${tool.id}/return`, {
                method: 'PATCH',
                body: JSON.stringify({ return_date: todayISO() }),
            });
            showToast(`"${tool.name}" ${t('tools.returned')}`);
            fetchTools();
        } catch (err) { showToast(err.message || 'Failed.', 'error'); }
    };

    // ── Delete ────────────────────────────────────────────────────────────────
    const handleDelete = async () => {
        if (!deletingId) return;
        setDeleteError(''); setDeletingTool(true);
        try {
            await apiFetch(`/tools/${deletingId}`, { method: 'DELETE' });
            showToast(t('tools.deletedSuccess'));
            setDeletingId(null);
            fetchTools();
        } catch (err) { setDeleteError(err.message || 'Failed.'); }
        finally { setDeletingTool(false); }
    };

    // ── Export ────────────────────────────────────────────────────────────────
    const handleExport = () => {
        const rows = tools.map(tl => ({
            Name:            tl.name,
            Category:        tl.category,
            Condition:       tl.condition,
            Status:          tl.status,
            'Assigned To':   tl.assigned_to,
            'Checkout Date': tl.checkout_date,
        }));
        exportWorkbook(exportFilename('Tools'), [{ name: 'Tools', rows }]);
    };

    const conditionLabel = (c) => c === 'good' ? t('tools.conditionGood') : c === 'fair' ? t('tools.conditionFair') : t('tools.conditionRepair');
    const inputCls = "w-full px-4 py-3 bg-white/50 border border-slate-200 rounded-lg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all text-slate-700 text-sm";

    return (
        <div className="space-y-8">

            {/* TOAST */}
            {toast.msg && (
                <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm font-semibold animate-in slide-in-from-top-2 fade-in duration-200 ${
                    toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white shadow-emerald-200'}`}>
                    {toast.type === 'error' ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                    {toast.msg}
                </div>
            )}

            {/* KPI */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { icon: <Package className="w-5 h-5" />,       bg: 'bg-slate-100',  cls: 'text-slate-500',   label: t('common.total'),         value: counts.total,       valCls: 'text-slate-800' },
                    { icon: <CheckCircle2 className="w-5 h-5" />,  bg: 'bg-emerald-50', cls: 'text-emerald-600', label: t('tools.available'),      value: counts.available,   valCls: 'text-emerald-600' },
                    { icon: <Wrench className="w-5 h-5" />,        bg: 'bg-blue-50',    cls: 'text-blue-600',    label: t('tools.checkedOut'),     value: counts.checkedOut,  valCls: 'text-blue-600' },
                    { icon: <AlertTriangle className="w-5 h-5" />, bg: 'bg-red-50',     cls: 'text-red-600',     label: t('tools.needsRepair'),    value: counts.needsRepair, valCls: 'text-red-600' },
                ].map((kpi, i) => (
                    <div key={i} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                        <div className={`p-3 ${kpi.bg} rounded-xl ${kpi.cls} w-fit mb-4`}>{kpi.icon}</div>
                        <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-widest">{kpi.label}</h3>
                        <p className={`text-2xl font-black tracking-tight mt-1 ${kpi.valCls}`}>{kpi.value}</p>
                    </div>
                ))}
            </div>

            {/* FILTERS */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4" aria-label="Tools table controls">
                <div className="flex items-center gap-2 overflow-x-auto p-1">
                    {STATUS_FILTERS.map(f => (
                        <button key={f} onClick={() => setStatusFilter(f)}
                            className={`px-5 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${
                                statusFilter === f ? 'bg-white text-emerald-700 shadow-md border border-emerald-100' : 'text-slate-400 hover:text-slate-700'}`}>
                            {STATUS_LABELS[f]}
                        </button>
                    ))}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs font-semibold text-slate-400">{filtered.length} results</span>
                    <div className="relative flex-1 min-w-56">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input type="search" aria-label="Search tools" placeholder={t('tools.searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)}
                            className="w-full text-sm bg-white border border-slate-200 rounded-xl pl-9 pr-9 py-2.5 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-colors" />
                        {search && <button aria-label="Clear tool search" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>}
                    </div>
                    <button onClick={handleExport} disabled={tools.length === 0}
                        className="bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 disabled:opacity-50">
                        <Download className="w-4 h-4" /> {t('common.export')}
                    </button>
                    {canEdit && <button onClick={openAddModal} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm transition-colors flex items-center gap-2"><Plus className="w-4 h-4" /> {t('tools.addTool')}</button>}
                </div>
            </div>

            {/* TABLE */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4 text-slate-400">
                        <Loader2 className="w-10 h-10 animate-spin text-emerald-500" />
                        <p className="text-xs font-bold uppercase tracking-widest">{t('common.loading')}</p>
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <caption className="sr-only">Tools inventory, assignments, condition, and available actions</caption>
                                <thead>
                                    <tr className="bg-slate-50/80 text-xs uppercase tracking-wider text-slate-500 font-bold">
                                        <th scope="col" className="px-6 py-4">{t('common.name')}</th>
                                        <th scope="col" className="px-6 py-4">{t('tools.category')}</th>
                                        <th scope="col" className="px-6 py-4">{t('tools.condition')}</th>
                                        <th scope="col" className="px-6 py-4">{t('tools.assignedTo')}</th>
                                        <th scope="col" className="px-6 py-4">{t('tools.checkoutDate')}</th>
                                        <th scope="col" className="px-6 py-4">{t('tools.return')}</th>
                                        <th scope="col" className="px-6 py-4 text-right">{t('common.actions')}</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm font-medium text-slate-600 divide-y divide-slate-50">
                                    {filtered.length > 0 ? filtered.map(tool => {
                                        const isCheckedOut  = tool.status === 'Checked Out';
                                        const isNeedsRepair = tool.status === 'Needs Repair';
                                        return (
                                            <tr key={tool.id} className="hover:bg-slate-50/50 transition-colors group">
                                                <td className="px-6 py-4 font-semibold text-slate-700">{tool.name}</td>
                                                <td className="px-6 py-4 text-slate-500">{tool.category || '—'}</td>
                                                <td className="px-6 py-4">
                                                    <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-lg border ${CONDITION_BADGE[tool.condition] || CONDITION_BADGE.good}`}>
                                                        {conditionLabel(tool.condition)}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-slate-600">{tool.assigned_to || '—'}</td>
                                                <td className="px-6 py-4 text-slate-400 text-xs">{fmtDate(tool.checkout_date)}</td>
                                                <td className="px-6 py-4 text-slate-400 text-xs">{fmtDate(tool.return_date)}</td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center justify-end gap-2 min-w-max">
                                                        {canEdit && !isNeedsRepair && (
                                                            isCheckedOut ? (
                                                                <button onClick={() => handleReturn(tool)}
                                                                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-colors">
                                                                    <RotateCcw className="w-3.5 h-3.5" /> Return tool
                                                                </button>
                                                            ) : (
                                                                <button onClick={() => openCheckoutModal(tool)}
                                                                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-colors">
                                                                    <Wrench className="w-3.5 h-3.5" /> Check out
                                                                </button>
                                                            )
                                                        )}
                                                        {isNeedsRepair && (
                                                            <span className="text-[10px] font-bold uppercase px-3 py-2 rounded-lg bg-slate-50 text-slate-500 border border-slate-200">
                                                                {t('tools.inRepair')}
                                                            </span>
                                                        )}
                                                        <RowActionsMenu label={`More actions for ${tool.name}`} actions={[
                                                            ...(canEdit ? [{ label: t('common.edit'), icon: Pencil, onSelect: () => openEditModal(tool) }] : []),
                                                            ...(canDelete ? [{ label: t('common.delete'), icon: Trash2, destructive: true, onSelect: () => { setDeleteError(''); setDeletingId(tool.id); } }] : []),
                                                        ]} />
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    }) : (
                                        <tr>
                                            <td colSpan="7" className="px-6 py-16 text-center text-slate-400">
                                                <div className="flex flex-col items-center gap-3">
                                                    <Hammer className="w-12 h-12 text-slate-200" />
                                                    <p>{t('tools.noMatch')}</p>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="bg-slate-50 p-4 flex justify-between items-center border-t border-slate-100">
                            <span className="text-xs text-slate-400">{t('common.showing')} {filtered.length} {t('common.of')} {tools.length}</span>
                            <span className="text-xs text-slate-400">{counts.available} {t('tools.available')} · {counts.checkedOut} {t('tools.checkedOut')} · {counts.needsRepair} {t('tools.needsRepair')}</span>
                        </div>
                    </>
                )}
            </div>

            {/* ADD / EDIT MODAL */}
            {isAddModalOpen && (
                <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setIsAddModalOpen(false)}>
                    <div role="dialog" className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className={`p-2.5 rounded-xl ${editingTool ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                    {editingTool ? <Pencil className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                                </div>
                                <h3 className="text-xl font-bold text-slate-800">{editingTool ? t('tools.editTool') : t('tools.addTool')}</h3>
                            </div>
                            <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                        </div>
                        {addError && (
                            <div className="p-3 mb-4 rounded-xl bg-red-50 border border-red-100 text-red-600 text-xs font-bold flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 shrink-0" /> {addError}
                            </div>
                        )}
                        <form onSubmit={handleSubmitTool} className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">{t('common.name')} <span className="text-red-500">*</span></label>
                                <input type="text" required value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })}
                                    placeholder="e.g. Total Station Leica TS06" className={inputCls} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">{t('tools.category')}</label>
                                    <input type="text" value={addForm.category} onChange={e => setAddForm({ ...addForm, category: e.target.value })}
                                        placeholder="e.g. Survey" className={inputCls} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">{t('tools.condition')}</label>
                                    <select value={addForm.condition} onChange={e => setAddForm({ ...addForm, condition: e.target.value })} className={inputCls}>
                                        <option value="good">{t('tools.conditionGood')}</option>
                                        <option value="fair">{t('tools.conditionFair')}</option>
                                        <option value="needs_repair">{t('tools.conditionRepair')}</option>
                                    </select>
                                </div>
                            </div>
                            <div className="flex gap-3 pt-4">
                                <button type="button" onClick={() => setIsAddModalOpen(false)} className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-semibold hover:bg-slate-200 transition-all">{t('common.cancel')}</button>
                                <button type="submit" disabled={savingAdd} className="flex-1 px-6 py-3 bg-emerald-600 text-white rounded-xl font-semibold shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 disabled:opacity-60">
                                    {savingAdd ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('common.saving')}</> : (editingTool ? t('projects.saveChanges') : t('tools.addTool'))}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* CHECKOUT MODAL */}
            {checkoutTarget && (
                <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setCheckoutTarget(null)}>
                    <div role="dialog" className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-xl font-bold text-slate-800">{t('tools.confirmCheckout')}</h3>
                            <button onClick={() => setCheckoutTarget(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                        </div>
                        <p className="text-sm text-slate-500 mb-6 font-mono">{checkoutTarget.name}</p>
                        {checkoutError && (
                            <div className="p-3 mb-4 rounded-xl bg-red-50 border border-red-100 text-red-600 text-xs font-bold flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 shrink-0" /> {checkoutError}
                            </div>
                        )}
                        <form onSubmit={handleCheckout} className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">{t('tools.assignedToLabel')} <span className="text-red-500">*</span></label>
                                <input type="text" required value={checkoutForm.assigned_to} onChange={e => setCheckoutForm({ ...checkoutForm, assigned_to: e.target.value })}
                                    placeholder="e.g. Budi Santoso" className={inputCls} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">{t('tools.checkoutDate')} <span className="text-red-500">*</span></label>
                                <input type="date" required max={todayISO()} value={checkoutForm.checkout_date} onChange={e => setCheckoutForm({ ...checkoutForm, checkout_date: e.target.value })}
                                    className={inputCls} />
                            </div>
                            <div className="flex gap-3 pt-4">
                                <button type="button" onClick={() => setCheckoutTarget(null)} className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-semibold hover:bg-slate-200 transition-all">{t('common.cancel')}</button>
                                <button type="submit" disabled={savingCheckout} className="flex-1 px-6 py-3 bg-emerald-600 text-white rounded-xl font-semibold shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 disabled:opacity-60">
                                    {savingCheckout ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('tools.checkingOut')}</> : t('tools.confirmCheckout')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* DELETE CONFIRM */}
            {deletingId && (
                <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => !deletingTool && setDeletingId(null)}>
                    <div role="dialog" className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2.5 bg-red-50 rounded-xl text-red-600"><Trash2 className="w-5 h-5" /></div>
                            <h3 className="text-xl font-bold text-slate-800">{t('tools.deleteTool')}</h3>
                        </div>
                        <p className="text-sm text-slate-500 mb-6">{t('settings.users.deleteCannotUndo')}</p>
                        {deleteError && (
                            <div className="p-3 mb-4 rounded-xl bg-red-50 border border-red-100 text-red-600 text-xs font-bold flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 shrink-0" /> {deleteError}
                            </div>
                        )}
                        <div className="flex gap-3">
                            <button onClick={() => setDeletingId(null)} disabled={deletingTool} className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-semibold hover:bg-slate-200 transition-all disabled:opacity-60">{t('common.cancel')}</button>
                            <button onClick={handleDelete} disabled={deletingTool} className="flex-1 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold shadow-lg shadow-red-100 transition-all flex items-center justify-center gap-2 disabled:opacity-60">
                                {deletingTool ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('common.deleting')}</> : <><Trash2 className="w-4 h-4" /> {t('common.delete')}</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
