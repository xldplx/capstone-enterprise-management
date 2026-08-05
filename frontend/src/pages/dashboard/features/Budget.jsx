import { useState, useEffect, useMemo } from 'react';
import {
    Plus, Wallet, X, Loader2, CheckCircle2,
    Activity as ActivityIcon, Pencil, Trash2, AlertTriangle, RefreshCw, Link2, Download
} from 'lucide-react';
import { BarChart, Bar, CartesianGrid, Cell, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCurrency } from '../../../utils/evmHelpers';
import { INPUT_CLASS } from '../../../utils/uiConstants';
import { apiFetch } from '../../../utils/api';
import { exportWorkbook, exportFilename } from '../../../utils/excelExport';
import { useTranslation } from '../../../utils/i18n';
import CurrencyInput from '../../../components/CurrencyInput';
import { formatCompactWholeNumber, parseGroupedWholeNumber } from '../../../utils/numberFormat';
import { budgetCategoryView } from '../../../utils/resourceMetrics';

const VALID_TYPES = ['CAPEX', 'OPEX'];
const EMPTY_FORM  = { category: '', type: 'CAPEX', planned: '', actual: '', wbs_id: '' };

export default function Budget() {
    const { t } = useTranslation();

    const [projects, setProjects]                   = useState([]);
    const [isLoadingProjects, setIsLoadingProjects] = useState(true);
    const [selectedProjectId, setSelectedProjectId] = useState('');
    const [categories, setCategories]               = useState([]);
    const [loadingCats, setLoadingCats]             = useState(false);
    const [wbsNodes, setWbsNodes]                   = useState([]);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRow, setEditingRow]   = useState(null);
    const [form, setForm]               = useState(EMPTY_FORM);
    const [saving, setSaving]           = useState(false);
    const [formError, setFormError]     = useState('');

    const [deletingId, setDeletingId]   = useState(null);
    const [deletingRow, setDeletingRow] = useState(false);
    const [deleteError, setDeleteError] = useState('');

    const [syncingId, setSyncingId]     = useState(null); // per-row sync
    const [syncingAll, setSyncingAll]   = useState(false);

    const [toast, setToast] = useState({ msg: '', type: 'success' });

    const userRole = localStorage.getItem('userRole');
    const canEdit  = ['Project Manager', 'Cost Engineer'].includes(userRole);

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast({ msg: '', type: 'success' }), 3000);
    };

    // ── Fetch projects ────────────────────────────────────────────────────────
    useEffect(() => {
        setIsLoadingProjects(true);
        apiFetch('/projects')
            .then(r => {
                const list = r.data || [];
                setProjects(list);
                if (list.length > 0) setSelectedProjectId(String(list[0].id));
            })
            .catch(console.error)
            .finally(() => setIsLoadingProjects(false));
    }, []);

    // ── Fetch budget + WBS when project changes ───────────────────────────────
    const fetchCategories = async (pid) => {
        if (!pid) { setCategories([]); return; }
        setLoadingCats(true);
        try {
            const [budgetRes, wbsRes] = await Promise.all([
                apiFetch(`/budget?project_id=${pid}`),
                apiFetch(`/projects/${pid}/wbs`),
            ]);
            setCategories(budgetRes.data || []);
            setWbsNodes(wbsRes.data || []);
        } catch (e) { showToast(e.message || 'Failed to load.', 'error'); }
        finally { setLoadingCats(false); }
    };

    useEffect(() => { fetchCategories(selectedProjectId); }, [selectedProjectId]);

    useEffect(() => {
        const handler = (e) => { if (e.key !== 'Escape') return; setIsModalOpen(false); setDeletingId(null); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, []);

    const selectedProject = projects.find(p => String(p.id) === selectedProjectId);

    // ── Aggregates ────────────────────────────────────────────────────────────
    const { totalPlanned, totalActual, totalVariance, usagePct } = useMemo(() => {
        const tp = categories.reduce((s, c) => s + (Number(c.planned) || 0), 0);
        const ta = categories.reduce((s, c) => s + (Number(c.actual)  || 0), 0);
        return { totalPlanned: tp, totalActual: ta, totalVariance: tp - ta, usagePct: tp > 0 ? (ta / tp) * 100 : 0 };
    }, [categories]);

    const capexRows = categories.filter(c => c.type === 'CAPEX');
    const opexRows  = categories.filter(c => c.type === 'OPEX');
    const wbsLinkedRows = categories.filter(c => c.wbs_id && c.wbs);
    const projectBudget = Number(selectedProject?.total_budget) || 0;
    const allocationBalance = projectBudget - totalPlanned;
    const allocationPct = projectBudget > 0 ? (totalPlanned / projectBudget) * 100 : totalPlanned > 0 ? 100 : 0;
    const chartRows = useMemo(() => budgetCategoryView(categories), [categories]);
    const projectedPlanned = parseGroupedWholeNumber(form.planned) || 0;
    const projectedAllocation = totalPlanned - (editingRow ? Number(editingRow.planned) || 0 : 0) + projectedPlanned;
    const projectedOverage = Math.max(0, projectedAllocation - projectBudget);

    // ── Modals ────────────────────────────────────────────────────────────────
    const openAddModal = () => {
        setEditingRow(null); setForm(EMPTY_FORM); setFormError(''); setIsModalOpen(true);
    };

    const openEditModal = (row) => {
        setEditingRow(row);
        setForm({ category: row.category, type: row.type, planned: String(row.planned), actual: String(row.actual || 0), wbs_id: row.wbs_id ? String(row.wbs_id) : '' });
        setFormError(''); setIsModalOpen(true);
    };

    // ── Submit ────────────────────────────────────────────────────────────────
    const handleSubmit = async (e) => {
        e.preventDefault(); setFormError('');
        if (!form.category.trim()) { setFormError(t('budget.categoryName') + ' ' + t('common.required') + '.'); return; }
        const plannedNum = parseGroupedWholeNumber(form.planned);
        if (plannedNum === null || Number.isNaN(plannedNum)) { setFormError(t('budget.planned') + ' must be a valid whole number.'); return; }
        const actualNum = parseGroupedWholeNumber(form.actual) ?? 0;
        if (Number.isNaN(actualNum)) { setFormError(t('budget.actual') + ' must be a valid whole number.'); return; }

        setSaving(true);
        try {
            const payload = { category: form.category.trim(), type: form.type, planned: plannedNum, actual: actualNum, wbs_id: form.wbs_id || null };
            if (editingRow) {
                await apiFetch(`/budget/${editingRow.id}`, { method: 'PUT', body: JSON.stringify(payload) });
                showToast(`"${form.category}" ${t('budget.updatedSuccess')}`);
            } else {
                await apiFetch('/budget', { method: 'POST', body: JSON.stringify({ ...payload, project_id: selectedProjectId }) });
                showToast(`"${form.category}" ${t('budget.addedSuccess')}`);
            }
            setIsModalOpen(false);
            fetchCategories(selectedProjectId);
        } catch (err) { setFormError(err.message || 'An error occurred.'); }
        finally { setSaving(false); }
    };

    // ── Delete ────────────────────────────────────────────────────────────────
    const handleDelete = async () => {
        if (!deletingId) return; setDeleteError(''); setDeletingRow(true);
        try {
            await apiFetch(`/budget/${deletingId}`, { method: 'DELETE' });
            showToast(t('budget.deletedSuccess'));
            setDeletingId(null); fetchCategories(selectedProjectId);
        } catch (err) { setDeleteError(err.message || 'Failed.'); }
        finally { setDeletingRow(false); }
    };

    // ── Sync single row ───────────────────────────────────────────────────────
    const handleSyncOne = async (rowId) => {
        setSyncingId(rowId);
        try {
            const res = await apiFetch(`/budget/${rowId}/sync`, { method: 'PATCH' });
            showToast(`${t('budget.syncedActual')} ${formatCurrency(res.synced_actual)}`);
            fetchCategories(selectedProjectId);
        } catch (err) { showToast(err.message || 'Sync failed.', 'error'); }
        finally { setSyncingId(null); }
    };

    // ── Sync all WBS-linked rows ──────────────────────────────────────────────
    const handleSyncAll = async () => {
        if (wbsLinkedRows.length === 0) return;
        setSyncingAll(true);
        try {
            await Promise.all(wbsLinkedRows.map(row =>
                apiFetch(`/budget/${row.id}/sync`, { method: 'PATCH' })
            ));
            showToast(`${wbsLinkedRows.length} ${t('budget.syncedCount')}`);
            await fetchCategories(selectedProjectId);
        } catch (err) { showToast(err.message || 'Sync failed.', 'error'); }
        finally { setSyncingAll(false); }
    };

    // ── Export ────────────────────────────────────────────────────────────────
    const handleExport = () => {
        const rows = categories.map((c) => ({
            'Category':      c.category,
            'Type':          c.type,
            'WBS':           c.wbs?.wbs_code || '',
            'Planned (IDR)': Number(c.planned) || 0,
            'Actual (IDR)':  Number(c.actual) || 0,
            'Variance':      (Number(c.planned) || 0) - (Number(c.actual) || 0),
        }));
        exportWorkbook(exportFilename('Budget', selectedProject?.project_code), [{ name: 'Budget', rows }]);
    };

    // ── Render row ────────────────────────────────────────────────────────────
    const renderRow = (row) => {
        const variance = (Number(row.planned) || 0) - (Number(row.actual) || 0);
        const pct      = (Number(row.planned) || 0) > 0 ? (Number(row.actual) / Number(row.planned)) * 100 : 0;
        const overrun  = (Number(row.actual) || 0) > (Number(row.planned) || 0) && (Number(row.actual) || 0) > 0;
        const varianceClass = overrun ? 'text-rose-600' : pct >= 90 ? 'text-amber-600' : 'text-emerald-600';
        const isSyncing = syncingId === row.id;
        return (
            <tr key={row.id} className={`transition-colors group ${overrun ? 'bg-red-50/40 hover:bg-red-50/60' : 'hover:bg-slate-50/50'}`}>
                <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-700">{row.category}</span>
                        {row.wbs && (
                            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100 flex items-center gap-1">
                                <Link2 className="w-2.5 h-2.5" /> {row.wbs.wbs_code}
                            </span>
                        )}
                        {!row.wbs && <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-50 text-slate-500 border border-slate-200">Manual actual</span>}
                    </div>
                </td>
                <td className="px-6 py-4 text-slate-600 font-mono text-sm">{formatCurrency(row.planned)}</td>
                <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                        <span className="text-slate-600 font-mono text-sm">{formatCurrency(row.actual || 0)}</span>
                        {canEdit && row.wbs && (
                            <button onClick={() => handleSyncOne(row.id)} disabled={isSyncing}
                                title="Sync from tasks"
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-40">
                                {isSyncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                            </button>
                        )}
                    </div>
                </td>
                <td className={`px-6 py-4 font-mono text-sm font-bold ${varianceClass}`}>
                    {variance >= 0 ? '+' : '−'}{formatCurrency(Math.abs(variance))}
                </td>
                <td className="px-6 py-4 text-slate-500 font-semibold text-sm">{pct.toFixed(1)}%</td>
                <td className="px-6 py-4 w-36">
                    <div className="space-y-1">
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-700 ${overrun ? 'bg-red-500' : pct >= 90 ? 'bg-amber-500' : pct > 0 ? 'bg-emerald-500' : 'bg-slate-200'}`}
                                style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                    </div>
                </td>
                {canEdit && (
                    <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => openEditModal(row)} title={t('common.edit')}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors">
                                <Pencil className="w-4 h-4" />
                            </button>
                            <button onClick={() => { setDeleteError(''); setDeletingId(row.id); }} title={t('common.delete')}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </td>
                )}
            </tr>
        );
    };

    if (isLoadingProjects) return (
        <div className="h-[60vh] flex flex-col items-center justify-center gap-4 text-slate-400">
            <Loader2 className="w-10 h-10 animate-spin text-emerald-500" />
            <p className="font-bold uppercase tracking-[0.2em] text-xs">{t('common.loading')}</p>
        </div>
    );

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

            {/* ACTIONS */}
            <div className="flex justify-end gap-3 mb-6">
                <button
                    onClick={handleExport}
                    disabled={categories.length === 0}
                    className="text-sm font-semibold px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 border shadow-sm text-emerald-600 bg-emerald-50 border-emerald-100 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 hover:shadow-lg hover:shadow-emerald-200 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-40 disabled:pointer-events-none"
                >
                    <Download className="w-4 h-4" /> {t('common.export')}
                </button>
                {canEdit && selectedProjectId && wbsLinkedRows.length > 0 && (
                    <button onClick={handleSyncAll} disabled={syncingAll}
                        title="Update actual costs for every WBS-linked budget category"
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-all disabled:opacity-60">
                        {syncingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        Sync WBS actuals
                    </button>
                )}
                {canEdit && selectedProjectId && (
                    <button onClick={openAddModal}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl font-semibold shadow-lg shadow-emerald-200 transition-all transform hover:-translate-y-0.5 flex items-center gap-2">
                        <Plus className="w-5 h-5" /> {t('budget.addCategory')}
                    </button>
                )}
            </div>

            {/* PROJECT SELECTOR */}
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">{t('common.project')}</label>
                <select value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)} className={`${INPUT_CLASS} mt-1`}>
                    {projects.length === 0 && <option value="">No projects available</option>}
                    {projects.map(p => <option key={p.id} value={p.id}>{p.project_code} — {p.project_name}</option>)}
                </select>
                {selectedProject && (
                    <p className="text-xs text-slate-400 mt-2 font-mono">{t('budget.totalBudget')} (IDR): {formatCurrency(selectedProject.total_budget || 0)}</p>
                )}
            </div>

            {selectedProjectId && (
                <>
                    {/* Allocation meter */}
                    <section className={`bg-white p-6 rounded-3xl border shadow-sm ${allocationBalance < 0 ? 'border-rose-200' : 'border-slate-100'}`} aria-labelledby="allocation-heading">
                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                            <div>
                                <h3 id="allocation-heading" className="font-bold text-slate-800">Project budget allocation (IDR)</h3>
                                <p className="text-xs text-slate-500 mt-1">Project Total Budget is the reference; category plans are allocations.</p>
                            </div>
                            <span className={`text-xs font-black rounded-xl border px-3 py-2 ${allocationBalance < 0 ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-emerald-50 border-emerald-100 text-emerald-700'}`}>
                                {allocationBalance < 0 ? `Overallocated by ${formatCurrency(Math.abs(allocationBalance))}` : `${formatCurrency(allocationBalance)} remaining`}
                            </span>
                        </div>
                        <div className="mt-5 h-3 bg-slate-100 rounded-full overflow-hidden" aria-label={`${allocationPct.toFixed(1)} percent allocated`}>
                            <div className={`h-full rounded-full ${allocationBalance < 0 ? 'bg-rose-500' : allocationPct >= 90 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(allocationPct, 100)}%` }} />
                        </div>
                        <dl className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-4">
                            {[
                                ['Project Total', projectBudget, 'text-slate-800'],
                                ['Allocated', totalPlanned, allocationBalance < 0 ? 'text-rose-700' : 'text-slate-800'],
                                ['Actual Spend', totalActual, 'text-blue-700'],
                                [allocationBalance < 0 ? 'Overallocated' : 'Remaining', Math.abs(allocationBalance), allocationBalance < 0 ? 'text-rose-700' : 'text-emerald-700'],
                            ].map(([label, value, color]) => <div key={label}><dt className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</dt><dd className={`mt-1 text-lg font-black font-mono ${color}`}>{formatCurrency(value)}</dd></div>)}
                        </dl>
                    </section>

                    {/* Plan vs Actual Variance */}
                    <section className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm" aria-labelledby="budget-chart-heading">
                        <div className="mb-6">
                            <h3 id="budget-chart-heading" className="text-lg font-bold text-slate-800 flex items-center gap-2"><ActivityIcon className="w-5 h-5" /> Category Plan vs Actual</h3>
                            <p className="text-xs text-slate-500 mt-1">Overruns first, then the ten largest planned-minus-actual variances. Values are IDR.</p>
                        </div>
                        {chartRows.length ? (
                            <>
                                <div style={{ height: Math.max(300, chartRows.length * 58) }} role="img" aria-label="Budget category planned versus actual chart">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={chartRows} layout="vertical" margin={{ top: 8, right: 54, left: 16, bottom: 8 }} barGap={3}>
                                            <CartesianGrid stroke="#f1f5f9" horizontal={false} />
                                            <XAxis type="number" tickFormatter={formatCompactWholeNumber} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                            <YAxis type="category" dataKey="category" width={130} tick={{ fontSize: 10, fontWeight: 700, fill: '#475569' }} axisLine={false} tickLine={false} />
                                            <Tooltip formatter={(value, name) => [formatCurrency(value), `${name} (IDR)`]} />
                                            <Legend />
                                            <Bar dataKey="planned" name="Planned" fill="#64748b" radius={[0, 6, 6, 0]} />
                                            <Bar dataKey="actual" name="Actual" radius={[0, 6, 6, 0]}>
                                                {chartRows.map(row => <Cell key={row.id || row.category} fill={row.state === 'overrun' ? '#f43f5e' : row.state === 'near_limit' ? '#f59e0b' : '#10b981'} />)}
                                                <LabelList dataKey="actual" position="right" formatter={formatCompactWholeNumber} className="fill-slate-500 text-[9px]" />
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                                <ul className="mt-5 grid sm:grid-cols-2 gap-2" aria-label="Written budget variances">
                                    {chartRows.map(row => <li key={row.id || row.category} className="flex items-center justify-between gap-3 bg-slate-50 rounded-xl px-3 py-2 text-xs"><span className="font-semibold text-slate-700 truncate">{row.category}</span><span className={`font-bold whitespace-nowrap ${row.state === 'overrun' ? 'text-rose-700' : row.state === 'near_limit' ? 'text-amber-700' : 'text-emerald-700'}`}>{row.variance >= 0 ? '+' : '−'}{formatCurrency(Math.abs(row.variance))} {row.state === 'overrun' ? 'overrun' : row.state === 'near_limit' ? 'near limit' : 'remaining'}</span></li>)}
                                </ul>
                            </>
                        ) : <p className="py-16 text-center text-sm text-slate-400">Add a budget category to see plan versus actual.</p>}
                    </section>

                    {/* SYNC INFO */}
                    <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 border border-blue-100 rounded-2xl text-sm text-blue-700">
                        <RefreshCw className="w-4 h-4 shrink-0" />
                        <span>{t('budget.syncInfo')}</span>
                    </div>

                    {/* CATEGORIES TABLE */}
                    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                        <div className="p-6 border-b border-slate-50">
                            <h3 className="font-bold text-slate-700">{t('budget.categories')}</h3>
                            <p className="text-xs text-slate-400 mt-0.5">{t('budget.groupedBy')}</p>
                        </div>

                        {loadingCats ? (
                            <div className="flex items-center justify-center py-16 gap-3 text-slate-400">
                                <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
                                <span className="text-xs font-bold uppercase tracking-widest">{t('common.loading')}</span>
                            </div>
                        ) : categories.length === 0 ? (
                            <div className="px-6 py-16 text-center text-slate-400">
                                <div className="flex flex-col items-center justify-center gap-3">
                                    <Wallet className="w-12 h-12 text-slate-200" />
                                    <p className="text-sm">{t('budget.noCategories')}</p>
                                    {canEdit && (
                                        <button onClick={openAddModal} className="text-xs font-bold text-emerald-600 hover:text-emerald-700 uppercase tracking-wider">
                                            {t('budget.addFirst')}
                                        </button>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50/80 text-xs uppercase tracking-wider text-slate-500 font-bold">
                                            <th className="px-6 py-4">{t('common.name')}</th>
                                            <th className="px-6 py-4">{t('budget.planned')} (IDR)</th>
                                            <th className="px-6 py-4">{t('budget.actual')} (IDR)</th>
                                            <th className="px-6 py-4">{t('budget.variance')} (IDR)</th>
                                            <th className="px-6 py-4">{t('budget.percentUsed')}</th>
                                            <th className="px-6 py-4">{t('budget.progress')}</th>
                                            {canEdit && <th className="px-6 py-4 text-right">{t('common.actions')}</th>}
                                        </tr>
                                    </thead>
                                    <tbody className="text-sm font-medium text-slate-600 divide-y divide-slate-50">
                                        {capexRows.length > 0 && (
                                            <>
                                                <tr><td colSpan={canEdit ? 7 : 6} className="px-6 py-2 bg-slate-50/60 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700">{t('budget.capex')}</td></tr>
                                                {capexRows.map(renderRow)}
                                            </>
                                        )}
                                        {opexRows.length > 0 && (
                                            <>
                                                <tr><td colSpan={canEdit ? 7 : 6} className="px-6 py-2 bg-slate-50/60 text-[10px] font-black uppercase tracking-[0.2em] text-blue-700">{t('budget.opex')}</td></tr>
                                                {opexRows.map(renderRow)}
                                            </>
                                        )}
                                    </tbody>
                                    <tfoot>
                                        <tr className="bg-slate-50/80 text-sm font-bold text-slate-700 border-t-2 border-slate-200">
                                            <td className="px-6 py-4">{t('common.total')}</td>
                                            <td className="px-6 py-4 font-mono">{formatCurrency(totalPlanned)}</td>
                                            <td className="px-6 py-4 font-mono">{formatCurrency(totalActual)}</td>
                                            <td className={`px-6 py-4 font-mono ${totalVariance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                {totalVariance >= 0 ? '+' : '−'}{formatCurrency(Math.abs(totalVariance))}
                                            </td>
                                            <td className="px-6 py-4">{usagePct.toFixed(1)}%</td>
                                            <td className="px-6 py-4" />
                                            {canEdit && <td className="px-6 py-4" />}
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* ADD/EDIT MODAL */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setIsModalOpen(false)}>
                    <div role="dialog" className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className={`p-2.5 rounded-xl ${editingRow ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                    {editingRow ? <Pencil className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                                </div>
                                <h3 className="text-xl font-bold text-slate-800">{editingRow ? t('budget.editCategory') : t('budget.addCategory')}</h3>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                        </div>

                        {formError && (
                            <div id="budget-form-error" role="alert" className="p-3 mb-5 rounded-xl bg-red-50 border border-red-100 text-red-600 text-xs font-bold flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 shrink-0" /> {formError}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">{t('budget.categoryName')} <span className="text-red-500">*</span></label>
                                <input type="text" required value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                                    placeholder="e.g. Site Preparation"
                                    className="w-full px-4 py-3 bg-white/50 border border-slate-200 rounded-lg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all text-slate-700 text-sm" />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">{t('budget.type')} <span className="text-red-500">*</span></label>
                                    <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
                                        className="w-full px-4 py-3 bg-white/50 border border-slate-200 rounded-lg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all text-slate-700 text-sm">
                                        {VALID_TYPES.map(tp => <option key={tp} value={tp}>{tp}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">{t('budget.planned')} (IDR) <span className="text-red-500">*</span></label>
                                    <CurrencyInput required value={form.planned} onChange={value => setForm({ ...form, planned: value })}
                                        onRejectedInput={setFormError}
                                        placeholder="0"
                                        aria-describedby={formError ? 'budget-form-error' : undefined}
                                        aria-invalid={Boolean(formError)}
                                        className="w-full px-4 py-3 bg-white/50 border border-slate-200 rounded-lg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all text-slate-700 text-sm" />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                {/* Manual actual input */}
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">{t('budget.actual')} (IDR) · {form.wbs_id ? 'Synced' : 'Manual'}</label>
                                    <CurrencyInput value={form.actual} onChange={value => setForm({ ...form, actual: value })}
                                        disabled={Boolean(form.wbs_id)}
                                        onRejectedInput={setFormError}
                                        placeholder="0"
                                        aria-describedby={formError ? 'budget-form-error' : undefined}
                                        className="w-full px-4 py-3 bg-white/50 border border-slate-200 rounded-lg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all text-slate-700 text-sm disabled:bg-slate-100 disabled:text-slate-400" />
                                </div>
                                {/* WBS Link */}
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1 flex items-center gap-1">
                                        <Link2 className="w-3 h-3" /> {t('budget.wbsLink')} <span className="text-slate-300">(optional)</span>
                                    </label>
                                    <select value={form.wbs_id} onChange={e => setForm({ ...form, wbs_id: e.target.value })}
                                        className="w-full px-4 py-3 bg-white/50 border border-slate-200 rounded-lg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all text-slate-700 text-sm">
                                        <option value="">{t('budget.noWbsLink')}</option>
                                        {wbsNodes.map(n => <option key={n.id} value={n.id}>{n.wbs_code} — {n.name}</option>)}
                                    </select>
                                </div>
                            </div>

                            {form.wbs_id && (
                                <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700 flex items-start gap-2">
                                    <RefreshCw className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                    {t('budget.syncWbsInfo')}
                                </div>
                            )}

                            {/* Live Auto-Reduced Remaining Budget Preview */}
                            <div className={`p-3.5 rounded-xl border text-xs space-y-1 ${
                                projectedOverage > 0 
                                    ? 'bg-rose-50 border-rose-200 text-rose-800' 
                                    : 'bg-emerald-50 border-emerald-100 text-emerald-800'
                            }`}>
                                <div className="flex justify-between items-center font-bold">
                                    <span>Total Project Budget:</span>
                                    <span className="font-mono">{formatCurrency(projectBudget)}</span>
                                </div>
                                <div className="flex justify-between items-center font-medium opacity-80">
                                    <span>Remaining Available Budget:</span>
                                    <span className="font-mono">{formatCurrency(allocationBalance)}</span>
                                </div>
                                <div className="flex justify-between items-center font-black pt-1 border-t border-black/5">
                                    <span>Budget Remaining After Entry:</span>
                                    <span className="font-mono">
                                        {formatCurrency(projectBudget - projectedAllocation)}
                                    </span>
                                </div>
                            </div>

                            {projectedOverage > 0 && (
                                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2" role="status">
                                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                    Saving is allowed, but this allocation will exceed Project Total Budget by {formatCurrency(projectedOverage)}.
                                </div>
                            )}


                            <div className="flex gap-3 pt-4">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-semibold hover:bg-slate-200 transition-all">{t('common.cancel')}</button>
                                <button type="submit" disabled={saving} className="flex-1 px-6 py-3 bg-emerald-600 text-white rounded-xl font-semibold shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 disabled:opacity-60">
                                    {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('common.saving')}</> : (editingRow ? t('projects.saveChanges') : t('budget.addCategory'))}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* DELETE CONFIRM */}
            {deletingId && (
                <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => !deletingRow && setDeletingId(null)}>
                    <div role="dialog" className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2.5 bg-red-50 rounded-xl text-red-600"><Trash2 className="w-5 h-5" /></div>
                            <h3 className="text-xl font-bold text-slate-800">{t('budget.deleteCategory')}</h3>
                        </div>
                        <p className="text-sm text-slate-500 mb-6">{t('settings.users.deleteCannotUndo')}</p>
                        {deleteError && <div className="p-3 mb-4 rounded-xl bg-red-50 border border-red-100 text-red-600 text-xs font-bold flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" /> {deleteError}</div>}
                        <div className="flex gap-3">
                            <button onClick={() => setDeletingId(null)} disabled={deletingRow} className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-semibold hover:bg-slate-200 transition-all disabled:opacity-60">{t('common.cancel')}</button>
                            <button onClick={handleDelete} disabled={deletingRow} className="flex-1 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold shadow-lg shadow-red-100 transition-all flex items-center justify-center gap-2 disabled:opacity-60">
                                {deletingRow ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('common.deleting')}</> : <><Trash2 className="w-4 h-4" /> {t('common.delete')}</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
