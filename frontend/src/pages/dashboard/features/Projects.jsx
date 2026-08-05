import { useState, useEffect, useMemo } from 'react';
import { Plus, FolderKanban, Calendar, DollarSign, ChevronRight, X, CheckCircle2, Loader2, Download, Search } from 'lucide-react';
import ProjectDetail from './ProjectDetail';
import { formatCurrency, formatDate, computeEvm, indexColor } from '../../../utils/evmHelpers';
import { STATUS_STYLES } from '../../../utils/uiConstants';
import { isValidProjectCode } from '../../../utils/validators';
import { exportWorkbook, exportFilename } from '../../../utils/excelExport';
import { recordAudit } from '../../../utils/auditLog';
import ErrorState from '../../../components/ErrorState';
import CurrencyInput from '../../../components/CurrencyInput';
import { apiFetch } from '../../../utils/api';
import { parseGroupedWholeNumber } from '../../../utils/numberFormat';

// Status-driven top accent so the portfolio scans by health at a glance.
const STATUS_ACCENT = {
    active:    'border-t-emerald-500',
    planning:  'border-t-blue-500',
    completed: 'border-t-slate-400',
    on_hold:   'border-t-amber-500',
};

export default function Projects({ initialProjectId = null, onConsumeInitial }) {
    const [projects, setProjects]     = useState([]);
    const [projectEvm, setProjectEvm] = useState({});
    const [loading, setLoading]       = useState(true);
    const [loadError, setLoadError]   = useState('');

    const [selectedProject, setSelectedProject] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        project_name: '',
        project_code: '',
        description: '',
        planned_start: '',
        planned_end: '',
        total_budget: '',
    });
    const [error, setError]             = useState('');
    const [successToast, setSuccessToast] = useState(false);
    const [exportToast, setExportToast]   = useState(false);

    // Portfolio controls
    const [statusFilter, setStatusFilter] = useState('All');
    const [search, setSearch]             = useState('');
    const [sortBy, setSortBy]             = useState('recent');

    const resetForm = () => setForm({
        project_name: '', project_code: '', description: '',
        planned_start: '', planned_end: '', total_budget: '',
    });

    const userRole = localStorage.getItem('userRole') || 'Guest';

    const fetchProjects = async () => {
        setLoading(true);
        setLoadError('');
        try {
            const res   = await apiFetch('/projects');
            const projs = res.data || [];
            setProjects(projs);

            // Compute EVM per project using real tasks
            const evmMap = {};
            await Promise.all(projs.map(async (p) => {
                try {
                    const taskRes = await apiFetch(`/projects/${p.id}/tasks`);
                    const tasks   = taskRes.data || [];
                    evmMap[p.id]  = computeEvm(tasks, p.schedule_pct);
                } catch { evmMap[p.id] = null; }
            }));
            setProjectEvm(evmMap);
        } catch (e) {
            setLoadError(e.message || 'Failed to load projects.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchProjects(); }, []);

    useEffect(() => {
        if (initialProjectId == null || projects.length === 0) return;
        const target = projects.find(p => Number(p.id) === Number(initialProjectId));
        if (target) {
            setSelectedProject(target);
            onConsumeInitial?.();
        }
    }, [initialProjectId, projects]);

    useEffect(() => {
        const handler = (e) => { if (e.key === 'Escape') setIsModalOpen(false); };
        if (isModalOpen) document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [isModalOpen]);

    const handleCreate = async (e) => {
        e.preventDefault();
        setError('');

        const trimmedName = form.project_name.trim();
        const trimmedCode = form.project_code.trim();

        if (!trimmedName) { setError('Project name is required.'); return; }
        if (!trimmedCode) { setError('Project code is required.'); return; }
        if (!isValidProjectCode(trimmedCode)) { setError('Project code must match PRJ-YYYY-NNN, e.g. PRJ-2026-004.'); return; }
        const totalBudget = parseGroupedWholeNumber(form.total_budget) ?? 0;
        if (Number.isNaN(totalBudget)) { setError('Total Budget must be a valid whole number.'); return; }
        if (form.planned_end && form.planned_start && new Date(form.planned_end) < new Date(form.planned_start)) {
            setError('End date must be on or after start date.');
            return;
        }

        setSaving(true);
        try {
            const res = await apiFetch('/projects', {
                method: 'POST',
                body: JSON.stringify({
                    ...form,
                    project_name: trimmedName,
                    project_code: trimmedCode,
                    total_budget: totalBudget,
                }),
            });
            if (!res.success) {
                setError(res.message || 'Failed to create project.');
                return;
            }
            recordAudit({ action: 'CREATE', resource_type: 'project', resource_id: trimmedCode, detail: `Created project "${trimmedName}"` });
            setIsModalOpen(false);
            resetForm();
            setSuccessToast(true);
            setTimeout(() => setSuccessToast(false), 3000);
            fetchProjects();
        } catch (e) {
            setError(e.message || 'Server error.');
        } finally {
            setSaving(false);
        }
    };

    const codeTrimmed = form.project_code.trim();
    const codeInvalid = codeTrimmed.length > 0 && !isValidProjectCode(codeTrimmed);

    const handleExport = () => {
        const rows = projects.map((p) => {
            const evm = projectEvm[p.id];
            return {
                'Code':         p.project_code,
                'Name':         p.project_name,
                'Status':       (p.status || 'planning').replace('_', ' '),
                'Start':        p.planned_start ? formatDate(p.planned_start) : '',
                'End':          p.planned_end ? formatDate(p.planned_end) : '',
                'Budget (IDR)': Number(p.total_budget) || 0,
                'CPI':          evm?.CPI != null ? Number(evm.CPI.toFixed(2)) : '',
                'SPI':          evm?.SPI != null ? Number(evm.SPI.toFixed(2)) : '',
                '% Complete':   evm?.overallPct != null ? Number(evm.overallPct.toFixed(1)) : '',
            };
        });
        exportWorkbook(exportFilename('Projects'), [{ name: 'Projects', rows }]);
        setExportToast(true);
        setTimeout(() => setExportToast(false), 2500);
    };

    const visibleProjects = useMemo(() => {
        const q = search.trim().toLowerCase();
        const list = projects.filter(p => {
            if (statusFilter !== 'All' && (p.status || 'planning') !== statusFilter) return false;
            if (q && !`${p.project_name} ${p.project_code}`.toLowerCase().includes(q)) return false;
            return true;
        });
        return [...list].sort((a, b) => {
            if (sortBy === 'name')   return (a.project_name || '').localeCompare(b.project_name || '');
            if (sortBy === 'code')   return (a.project_code || '').localeCompare(b.project_code || '');
            if (sortBy === 'budget') return (Number(b.total_budget) || 0) - (Number(a.total_budget) || 0);
            return 0; // 'recent'
        });
    }, [projects, statusFilter, search, sortBy]);

    // Compute Quick Portfolio KPI Stats
    const stats = useMemo(() => {
        const total = projects.length;
        const active = projects.filter(p => (p.status || 'planning') === 'active').length;
        const totalVal = projects.reduce((acc, curr) => acc + (Number(curr.total_budget) || 0), 0);
        let onTrack = 0;
        projects.forEach(p => {
            const evm = projectEvm[p.id];
            if (evm && evm.CPI >= 1.0) onTrack++;
        });
        return { total, active, totalVal, onTrack };
    }, [projects, projectEvm]);

    if (selectedProject) {
        return <ProjectDetail key={selectedProject.id} project={selectedProject} onBack={() => { setSelectedProject(null); fetchProjects(); }} />;
    }

    return (
        <div className="space-y-8 text-left pb-12 animate-in fade-in duration-300">

            {/* SUCCESS TOAST */}
            {successToast && (
                <div className="fixed top-6 right-6 z-50 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-lg shadow-emerald-200 flex items-center gap-2 text-sm font-semibold animate-in slide-in-from-top-2 fade-in duration-200">
                    <CheckCircle2 className="w-4 h-4" /> Project created successfully
                </div>
            )}

            {/* EXPORT TOAST */}
            {exportToast && (
                <div className="fixed top-6 right-6 z-50 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-lg shadow-emerald-200 flex items-center gap-2 text-sm font-semibold animate-in slide-in-from-top-2 fade-in duration-200">
                    <CheckCircle2 className="w-4 h-4" /> Projects exported to Excel
                </div>
            )}

            {/* STATS BAR CARD STRIP (KPI stats cards match Overview.jsx & Settings.jsx style) */}
            {!loading && !loadError && projects.length > 0 && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                        { label: 'Total Projects', value: stats.total, color: 'text-slate-800', desc: 'Registered in database' },
                        { label: 'Active Projects', value: stats.active, color: 'text-emerald-700', desc: 'Under site execution' },
                        { label: 'On-Track (CPI ≥ 1)', value: stats.onTrack, color: 'text-emerald-600', desc: 'CPI performing healthy' },
                        { label: 'Total Portfolio Budget (IDR)', value: formatCurrency(stats.totalVal), color: 'text-rose-700', desc: 'Cumulative project values' }
                    ].map((stat, idx) => (
                        <div key={idx} className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                            <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-widest">{stat.label}</h3>
                            <p className={`text-2xl font-black tracking-tight mt-1 ${stat.color}`}>{stat.value}</p>
                            <p className="text-[10px] text-slate-450 font-semibold mt-1.5 leading-tight">{stat.desc}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* FILTERS & SEARCH ROW IN UNIFIED CARD WITH ACTIONS - Matches Overview.jsx structure */}
            {!loading && !loadError && (
                <div className="bg-white border border-slate-200 rounded-3xl py-3 px-5 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-4">
                        {/* Status Filter tab toggle */}
                        <div className="flex gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200/60 shadow-inner w-fit overflow-x-auto no-scrollbar">
                            {['All', 'active', 'planning', 'completed', 'on_hold'].map(f => (
                                <button
                                    key={f}
                                    onClick={() => setStatusFilter(f)}
                                    className={`px-3.5 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all duration-300 whitespace-nowrap ${
                                        statusFilter === f
                                            ? 'bg-white text-emerald-700 shadow border border-emerald-100/60'
                                            : 'text-slate-450 hover:text-slate-700'
                                    }`}
                                >
                                    {f === 'All' ? 'All' : f.replace('_', ' ')}
                                </button>
                            ))}
                        </div>

                        {/* Sort Order Selector */}
                        <select
                            value={sortBy}
                            onChange={e => setSortBy(e.target.value)}
                            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-xs font-semibold outline-none focus:border-emerald-500 cursor-pointer shadow-sm min-w-[140px]"
                        >
                            <option value="recent">Most Recent</option>
                            <option value="name">Name (A–Z)</option>
                            <option value="code">Code (A–Z)</option>
                            <option value="budget">Budget (High–Low)</option>
                        </select>
                    </div>

                    {/* Search Input bar and Actions */}
                    <div className="flex flex-wrap items-center gap-3">
                        {/* Search Input */}
                        <div className="relative min-w-[200px]">
                            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search name or code..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-xl pl-8.5 pr-3 py-1.5 outline-none focus:border-emerald-500 transition-colors shadow-sm placeholder:text-slate-400 text-slate-700"
                            />
                        </div>

                        {/* Export Button inside card */}
                        <button
                            onClick={handleExport}
                            disabled={projects.length === 0}
                            className="text-[10px] font-bold uppercase tracking-wider px-3 py-2 rounded-xl transition-all flex items-center gap-1.5 border shadow bg-white border-slate-200 text-slate-500 hover:text-emerald-700 hover:border-emerald-250 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-40 disabled:pointer-events-none"
                        >
                            <Download className="w-3.5 h-3.5" /> Export
                        </button>

                        {/* Add Project Button inside card */}
                        {userRole === 'Project Manager' && (
                            <button
                                onClick={() => setIsModalOpen(true)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider shadow hover:shadow-lg transition-all transform hover:-translate-y-0.5 flex items-center gap-1.5 active:scale-95"
                            >
                                <Plus className="w-3.5 h-3.5" /> New Project
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* PROJECT CARDS GRID */}
            {loading ? (
                <div className="flex items-center justify-center h-48 gap-3 text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin text-emerald-500" /> Loading projects...
                </div>
            ) : loadError ? (
                <ErrorState message={loadError} onRetry={fetchProjects} />
            ) : projects.length === 0 ? (
                /* EMPTY STATE */
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-16">
                    <div className="flex flex-col items-center justify-center gap-2">
                        <FolderKanban className="w-12 h-12 text-slate-200" />
                        <p className="text-slate-400 font-bold uppercase tracking-wider text-xs">No projects found. Create your first project to get started.</p>
                    </div>
                </div>
            ) : visibleProjects.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {visibleProjects.map((project) => {
                        const evm = projectEvm[project.id];
                        const cpi = evm ? indexColor(evm.CPI) : null;
                        const spi = evm ? indexColor(evm.SPI) : null;

                        return (
                        <div
                            key={project.id}
                            onClick={() => setSelectedProject(project)}
                            className={`group bg-white p-6 rounded-3xl border border-slate-200 border-t-4 ${STATUS_ACCENT[project.status] || STATUS_ACCENT.planning} shadow-sm hover:shadow-xl hover:border-emerald-500/20 transition-all duration-300 hover:-translate-y-1 cursor-pointer flex flex-col justify-between`}
                        >
                            <div>
                                {/* Top Row: Icon + Status */}
                                <div className="flex justify-between items-start mb-4">
                                    <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                                        <FolderKanban className="w-6 h-6" />
                                    </div>
                                    <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-lg border ${STATUS_STYLES[project.status] || STATUS_STYLES.planning}`}>
                                        {(project.status || 'planning').replace('_', ' ')}
                                    </span>
                                </div>

                                {/* Project Info */}
                                <h3 className="text-base font-bold text-slate-800 mb-1 group-hover:text-emerald-700 transition-colors leading-tight">{project.project_name}</h3>
                                <p className="text-[9px] text-slate-400 font-mono font-bold mb-3 tracking-wider">{project.project_code}</p>
                                <p className="text-xs text-slate-500 mb-4 line-clamp-2 leading-relaxed font-semibold">{project.description || 'No description provided.'}</p>

                                {/* EVM Mini Metrics */}
                                {evm && (
                                    <div className="mb-4">
                                        <div className="flex items-center gap-2 mb-2.5">
                                            <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                                                <div className="h-1.5 rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.min(evm.overallPct, 100)}%` }} />
                                            </div>
                                            <span className="text-xs font-bold text-slate-500 shrink-0">{evm.overallPct.toFixed(1)}%</span>
                                        </div>
                                        <div className="flex gap-2">
                                            {cpi && <span className={`text-[9px] font-bold px-2 py-0.5 rounded-lg border uppercase tracking-wider ${cpi.bg} ${cpi.border} ${cpi.text}`}>CPI {evm.CPI?.toFixed(2) ?? '—'}</span>}
                                            {spi && <span className={`text-[9px] font-bold px-2 py-0.5 rounded-lg border uppercase tracking-wider ${spi.bg} ${spi.border} ${spi.text}`}>SPI {evm.SPI?.toFixed(2) ?? '—'}</span>}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div>
                                {/* Footer: date + budget & remaining breakdown */}
                                <div className="space-y-2 border-t border-slate-100 pt-3.5 text-xs text-slate-400">
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-1.5">
                                            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                            <span className="font-semibold text-slate-500">{project.planned_start ? formatDate(project.planned_start) : '—'}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <DollarSign className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                            <span className="font-bold text-slate-700">{formatCurrency(project.total_budget)}</span>
                                        </div>
                                    </div>

                                    {/* Auto-Reduced Budget Bar */}
                                    {project.allocated_budget !== undefined && (
                                        <div className="pt-1.5 border-t border-slate-100/60 flex items-center justify-between text-[11px]">
                                            <span className="font-semibold text-slate-400">Remaining Budget:</span>
                                            <span className={`font-mono font-bold px-2 py-0.5 rounded-lg border text-[10px] ${
                                                (project.remaining_budget ?? 0) < 0 
                                                    ? 'bg-rose-50 border-rose-200 text-rose-600' 
                                                    : 'bg-emerald-50 border-emerald-100 text-emerald-700'
                                            }`}>
                                                {formatCurrency(project.remaining_budget ?? (project.total_budget - project.allocated_budget))}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Hover Arrow */}
                                <div className="mt-3 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                    <div className="text-emerald-600 flex items-center gap-1 text-[11px] font-black uppercase tracking-wider">
                                        Open Project <ChevronRight className="w-3.5 h-3.5" />
                                    </div>
                                </div>
                            </div>

                        </div>
                        );
                    })}
                </div>
            ) : (
                /* NO MATCH FOR CURRENT FILTERS */
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-16">
                    <div className="flex flex-col items-center justify-center gap-3">
                        <Search className="w-12 h-12 text-slate-200" />
                        <p className="text-slate-400 font-bold uppercase tracking-wider text-xs">No projects match your filters.</p>
                        <button
                            onClick={() => { setStatusFilter('All'); setSearch(''); }}
                            className="text-xs font-bold text-emerald-600 hover:text-emerald-700 uppercase tracking-wider border-b border-emerald-600 border-dashed"
                        >
                            Clear filters
                        </button>
                    </div>
                </div>
            )}

            {/* CREATE PROJECT MODAL */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200" onClick={() => setIsModalOpen(false)}>
                    <div role="dialog" aria-label="Create new project" className="bg-white rounded-3xl p-8 w-full max-w-lg shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-250" onClick={(e) => e.stopPropagation()}>

                        {/* Modal Header */}
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-bold text-slate-800">Create New Project</h3>
                            <button onClick={() => setIsModalOpen(false)} aria-label="Close" className="text-slate-400 hover:text-slate-650 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Error */}
                        {error && (
                            <div id="project-form-error" role="alert" className="p-3 mb-4 rounded-xl bg-red-50 border border-red-150 text-red-655 text-xs text-center font-bold uppercase animate-pulse">
                                {error}
                            </div>
                        )}

                        {/* Form */}
                        <form onSubmit={handleCreate} className="space-y-4 text-left">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Project Name</label>
                                <input
                                    type="text"
                                    required
                                    value={form.project_name}
                                    onChange={(e) => setForm({ ...form, project_name: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/5 transition-all text-slate-700 text-sm font-semibold"
                                    placeholder="e.g. Industrial Complex Phase 2"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Project Code</label>
                                <input
                                    type="text"
                                    required
                                    value={form.project_code}
                                    onChange={(e) => setForm({ ...form, project_code: e.target.value })}
                                    className={`w-full px-4 py-2.5 bg-slate-50 border rounded-xl outline-none focus:ring-4 transition-all text-slate-700 text-sm font-semibold ${
                                        codeInvalid
                                            ? 'border-red-300 focus:border-red-500 focus:ring-red-500/5'
                                            : 'border-slate-200 focus:border-emerald-500 focus:ring-emerald-500/5'
                                    }`}
                                    placeholder="e.g. PRJ-2026-004"
                                    aria-invalid={codeInvalid}
                                />
                                <p className={`text-[10px] ml-1 font-bold ${codeInvalid ? 'text-red-500' : 'text-slate-400'}`}>
                                    Format: PRJ-YYYY-NNN (e.g. PRJ-2026-004)
                                </p>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Description</label>
                                <textarea
                                    value={form.description}
                                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                                    rows={3}
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/5 transition-all text-slate-700 text-sm font-semibold resize-none"
                                    placeholder="Brief project description..."
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Start Date</label>
                                    <input
                                        type="date"
                                        required
                                        value={form.planned_start}
                                        onChange={(e) => setForm({ ...form, planned_start: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/5 transition-all text-slate-700 text-sm font-semibold"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">End Date</label>
                                    <input
                                        type="date"
                                        required
                                        min={form.planned_start || undefined}
                                        value={form.planned_end}
                                        onChange={(e) => setForm({ ...form, planned_end: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/5 transition-all text-slate-700 text-sm font-semibold"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Total Budget (IDR)</label>
                                <CurrencyInput
                                    value={form.total_budget}
                                    onChange={(value) => setForm({ ...form, total_budget: value })}
                                    onRejectedInput={setError}
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/5 transition-all text-slate-700 text-sm font-semibold"
                                    placeholder="0"
                                    aria-describedby={error ? 'project-form-error' : undefined}
                                    aria-invalid={Boolean(error)}
                                />
                            </div>

                            {/* Buttons */}
                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => { setIsModalOpen(false); resetForm(); }}
                                    className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold uppercase text-xs tracking-widest hover:bg-slate-200 transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="flex-1 px-6 py-3 bg-emerald-600 text-white rounded-xl font-bold uppercase text-xs tracking-widest shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                                >
                                    {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : 'Create Project'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
