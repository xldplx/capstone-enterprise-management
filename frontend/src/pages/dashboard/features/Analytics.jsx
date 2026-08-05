import React, { useState, useMemo, useRef, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, ComposedChart } from 'recharts';
import { calculateCPM, generateSCurveData } from '../../../utils/cpmHelpers';
import { computeEvm, indexColor } from '../../../utils/evmHelpers';
import { apiFetch } from '../../../utils/api';
import { useTranslation } from '../../../utils/i18n';
import { ZoomIn, ZoomOut, ChevronRight, Calendar, Target, Info, AlertCircle, CheckCircle2, Clock, Loader2, Search } from 'lucide-react';
import { formatWholeNumber } from '../../../utils/numberFormat';

const fmtIDR  = (v) => formatWholeNumber(v || 0);
const fmtHrs  = (v) => `${Math.round(v || 0)} hrs`;
const fmtPct  = (v) => `${(v || 0).toFixed(1)}%`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';

function CurveTooltip({ active, payload, label, mode }) {
    if (!active || !payload?.length) return null;
    const fmts = { cost: fmtIDR, hours: fmtHrs, pct: fmtPct };
    const f = fmts[mode] || ((v) => v);
    return (
        <div className="bg-white/95 backdrop-blur-sm border border-slate-200 rounded-2xl shadow-2xl p-4 text-xs min-w-52 ring-1 ring-slate-900/5">
            <p className="font-black text-slate-800 mb-3 flex items-center gap-2 border-b border-slate-100 pb-2">
                <Calendar className="w-3.5 h-3.5 text-emerald-500" />{label}
            </p>
            <div className="space-y-2.5">
                {payload.map(p => (
                    <div key={p.dataKey} className="flex justify-between items-center gap-4">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                            <span className="font-bold text-[10px] text-slate-500 uppercase tracking-widest">{p.dataKey}</span>
                        </div>
                        <span className="text-slate-800 font-mono font-black">{f(p.value)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function GanttChart({ tasks = [], cpmResults = [], t }) {
    const [zoom, setZoom] = useState(1.5);
    const [search, setSearch] = useState('');
    const [criticalOnly, setCriticalOnly] = useState(false);
    const [incompleteOnly, setIncompleteOnly] = useState(false);
    const [showArrows, setShowArrows] = useState(false);
    
    const containerRef = useRef(null);
    const today = new Date();

    if (!tasks || tasks.length === 0) return (
        <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-4 bg-white rounded-3xl border border-slate-200 shadow-sm">
            <AlertCircle className="w-12 h-12 opacity-20" />
            <p className="font-bold uppercase tracking-widest text-xs">{t('analytics.noSchedule')}</p>
        </div>
    );

    const allDates = tasks.flatMap(task => [new Date(task.planned_start), new Date(task.planned_end)]).filter(d => !isNaN(d.getTime()));
    if (allDates.length === 0) return (
        <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-4 bg-white rounded-3xl border border-slate-200 shadow-sm">
            <AlertCircle className="w-12 h-12 opacity-20" />
            <p className="font-bold uppercase tracking-widest text-xs">{t('analytics.invalidDates')}</p>
        </div>
    );

    const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));
    minDate.setDate(minDate.getDate() - 10);
    maxDate.setDate(maxDate.getDate() + 20);
    const totalMs  = maxDate - minDate;
    const baseWidth = 1200 * zoom;

    const getX = (dateStr) => { const d = new Date(dateStr); if (isNaN(d.getTime())) return 0; return ((d - minDate) / totalMs) * baseWidth; };
    const getWidth = (s, e) => { const start = new Date(s); const end = new Date(e); if (isNaN(start.getTime()) || isNaN(end.getTime())) return 8; return Math.max(((end - start) / totalMs) * baseWidth, 8); };
    const todayX = getX(today);

    const months = [];
    let cur = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    while (cur <= maxDate) {
        months.push({ label: cur.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }), x: getX(cur) });
        cur.setMonth(cur.getMonth() + 1);
    }

    const weeks = [];
    let weekCur = new Date(minDate);
    while (weekCur <= maxDate) {
        weeks.push({
            label: weekCur.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
            x: getX(weekCur)
        });
        weekCur.setDate(weekCur.getDate() + 7);
    }

    // Generate daily grid lines
    const days = [];
    let dayCur = new Date(minDate);
    while (dayCur <= maxDate) {
        days.push({ x: getX(dayCur) });
        dayCur.setDate(dayCur.getDate() + 1);
    }

    const cpmMap = Object.fromEntries(cpmResults.map(c => [c.id, c]));

    // Filter tasks dynamically
    const filteredTasks = useMemo(() => {
        return tasks.filter(task => {
            const matchesSearch = task.task_name.toLowerCase().includes(search.toLowerCase()) || 
                                  (task.wbs_code && task.wbs_code.toLowerCase().includes(search.toLowerCase()));
            const cpm = cpmMap[task.id];
            const matchesCritical = !criticalOnly || (cpm && cpm.isCritical);
            const matchesIncomplete = !incompleteOnly || (task.pct_complete < 100);
            return matchesSearch && matchesCritical && matchesIncomplete;
        });
    }, [tasks, search, criticalOnly, incompleteOnly, cpmMap]);

    return (
        <div className="flex flex-col h-full bg-white rounded-3xl overflow-hidden border border-slate-200/80 shadow-sm">
            {/* CONTROL PANEL HEADER - Styled like Alerts and Settings filter rows */}
            <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50 z-30">
                {/* Search & Filters */}
                <div className="flex flex-wrap items-center gap-2">
                    {/* Search bar matching Alerts search */}
                    <div className="relative min-w-[200px]">
                        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search tasks..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="pl-9 pr-4 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:border-emerald-500 transition-all text-slate-700 font-bold placeholder:text-slate-400 placeholder:font-bold"
                        />
                    </div>
                    {/* Premium Toggles matching Alerts button filters */}
                    <button
                        onClick={() => setCriticalOnly(!criticalOnly)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all border ${
                            criticalOnly
                                ? 'bg-rose-600 text-white border-rose-600 shadow-md shadow-rose-600/20'
                                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                        }`}
                    >
                        {t('evm.critical')}
                    </button>
                    <button
                        onClick={() => setIncompleteOnly(!incompleteOnly)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all border ${
                            incompleteOnly
                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/20'
                                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                        }`}
                    >
                        Active
                    </button>
                    <button
                        onClick={() => setShowArrows(!showArrows)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all border ${
                            showArrows
                                ? 'bg-slate-800 text-white border-slate-800 shadow-md'
                                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                        }`}
                    >
                        Links
                    </button>
                </div>

                {/* Right Side Zoom Controls */}
                <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-slate-200 shadow-sm w-fit">
                    <button onClick={() => setZoom(Math.max(1, zoom - 0.25))} className="p-2 hover:bg-slate-50 rounded-lg text-slate-500 transition-all active:scale-95">
                        <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[10px] font-black text-slate-600 px-3.5 min-w-[70px] text-center uppercase tracking-wider">Zoom {Math.round(zoom * 100)}%</span>
                    <button onClick={() => setZoom(Math.min(4, zoom + 0.25))} className="p-2 hover:bg-slate-50 rounded-lg text-slate-500 transition-all active:scale-95">
                        <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
            
            {/* GANTT SCROLLER SECTION */}
            <div className="relative flex-1 flex overflow-hidden h-[450px]">
                {/* WBS Sidebar List */}
                <div className="w-72 border-r border-slate-200 bg-white z-20 shadow-[10px_0_20px_-10px_rgba(0,0,0,0.05)] shrink-0 text-left flex flex-col">
                    <div className="h-10 border-b border-slate-200 bg-slate-50/50 flex items-center px-4 shrink-0">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.25em]">{t('analytics.workBreakdown')}</span>
                    </div>
                    <div className="overflow-y-auto flex-1 [scrollbar-width:none]">
                        {filteredTasks.length === 0 ? (
                            <div className="py-8 text-center text-slate-400 text-[10px] font-bold uppercase tracking-wider">No matching tasks</div>
                        ) : filteredTasks.map(task => (
                            <div key={task.id} className="h-11 border-b border-slate-50 flex flex-col justify-center px-4 group hover:bg-emerald-50/20 transition-all cursor-default shrink-0">
                                <p className="text-[11px] font-bold text-slate-700 truncate group-hover:text-emerald-700 transition-colors leading-tight">{task.task_name}</p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="text-[8px] font-mono font-bold text-slate-400 bg-slate-50 px-1.5 py-0.2 rounded border border-slate-100">{task.wbs_code}</span>
                                    <span className="text-[8px] font-semibold text-slate-400">{task.planned_duration}d</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Timeline Visual Grid */}
                <div className="flex-1 overflow-auto relative bg-slate-50 [scrollbar-width:thin]" ref={containerRef}>
                    <div style={{ width: `${baseWidth}px` }} className="relative min-h-full">
                        
                        {/* Daily grid lines */}
                        {days.map((d, i) => (
                            <div key={`day-${i}`} className="absolute top-0 bottom-0 border-l border-slate-200/10" style={{ left: `${d.x}px` }} />
                        ))}

                        {/* Weekly grid lines */}
                        {weeks.map((w, i) => (
                            <div key={`week-line-${i}`} className="absolute top-0 bottom-0 border-l border-slate-200/30" style={{ left: `${w.x}px` }} />
                        ))}
                        
                        {/* Month boundaries */}
                        {months.map((m, i) => (
                            <div key={i} className="absolute top-0 bottom-0 border-l border-slate-200/60" style={{ left: `${m.x}px` }} />
                        ))}

                        {/* DETAILED TIMELINE RULER BAR */}
                        <div className="absolute top-0 left-0 right-0 h-10 bg-slate-100/90 backdrop-blur-sm border-b border-slate-200 z-10 text-left">
                            {/* Month Headers */}
                            {months.map((m, i) => (
                                <div key={`month-lbl-${i}`} className="absolute top-1" style={{ left: `${m.x + 8}px` }}>
                                    <span className="text-[9px] font-black text-slate-700 uppercase tracking-wider">{m.label}</span>
                                </div>
                            ))}

                            {/* Weekly sub-headers (starts dates e.g. 05 Jul) */}
                            {weeks.map((w, i) => (
                                <div key={`week-lbl-${i}`} className="absolute top-5.5 flex flex-col items-center -translate-x-1/2" style={{ left: `${w.x}px` }}>
                                    <div className="w-[1px] h-1.5 bg-slate-300" />
                                    <span className="text-[8px] font-bold text-slate-400 font-mono mt-0.5">{w.label}</span>
                                </div>
                            ))}
                        </div>
                        
                        {/* Today's line */}
                        <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10 shadow-[0_0_12px_rgba(239,68,68,0.4)]" style={{ left: `${todayX}px` }}>
                            <div className="absolute top-10 -translate-x-1/2 px-2.5 py-1 bg-red-600 text-white text-[9px] font-bold rounded shadow tracking-tighter">Today</div>
                        </div>
                        
                        {/* Dependency arrows (only show when toggled) */}
                        {showArrows && (
                            <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-40">
                                {filteredTasks.map(task => (task.predecessors || []).map(predId => {
                                    const pred = filteredTasks.find(pt => pt.id === predId);
                                    if (!pred) return null;
                                    const x1 = getX(pred.planned_end), y1 = filteredTasks.indexOf(pred) * 44 + 22 + 40;
                                    const x2 = getX(task.planned_start), y2 = filteredTasks.indexOf(task) * 44 + 22 + 40;
                                    return <path key={`${predId}-${task.id}`} d={`M ${x1} ${y1} L ${x1+15} ${y1} L ${x1+15} ${y2} L ${x2} ${y2}`} fill="none" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="4 2" />;
                                }))}
                            </svg>
                        )}
                        
                        {/* Task bars */}
                        <div className="pt-10">
                            {filteredTasks.map((task) => {
                                const cpm  = cpmMap[task.id];
                                const x    = getX(task.planned_start);
                                const w    = getWidth(task.planned_start, task.planned_end);
                                const isCrit = cpm?.isCritical;
                                return (
                                    <div key={task.id} className="h-11 relative flex items-center group shrink-0">
                                        <div className={`h-6 rounded-lg relative transition-all duration-300 group-hover:scale-[1.02] shadow-sm overflow-hidden border ${isCrit ? 'bg-red-50 border-red-200 shadow-red-105' : 'bg-emerald-50 border-emerald-200 shadow-emerald-105'}`}
                                            style={{ left: `${x}px`, width: `${w}px` }}>
                                            <div className={`h-full opacity-100 transition-all duration-1000 ease-out ${isCrit ? 'bg-gradient-to-r from-red-500 to-rose-500' : 'bg-gradient-to-r from-emerald-500 to-teal-500'}`}
                                                style={{ width: `${task.pct_complete}%` }} />
                                            <div className="absolute inset-0 flex items-center justify-between px-2.5 pointer-events-none">
                                                <span className={`text-[9px] font-bold tracking-tighter ${task.pct_complete > 30 ? 'text-white' : 'text-slate-700'}`}>{task.pct_complete}%</span>
                                            </div>
                                        </div>
                                        {cpm?.float > 0 && (
                                            <div className="absolute h-1 bg-slate-200 rounded-full border border-slate-300/45"
                                                style={{ left: `${x + w}px`, width: `${(cpm.float / totalMs) * baseWidth}px`, top: '50%', transform: 'translateY(-50%)' }}>
                                                <div className="absolute -right-1 -top-1 w-3 h-3 rounded-full bg-white border border-slate-300" title={`Float: ${cpm.float} days`} />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function Analytics() {
    const { t } = useTranslation();
    const [activeTab, setActiveTab]         = useState('cost');
    const [projects, setProjects]           = useState([]);
    const [projectTasks, setProjectTasks]   = useState([]);
    const [loadingProjects, setLoadingProjects] = useState(true);
    const [loadingTasks, setLoadingTasks]       = useState(false);
    const [selectedProjectId, setSelectedProjectId] = useState(null);

    const TABS = [
        { key: 'cost',      label: t('analytics.costCurve') },
        { key: 'manpower',  label: t('analytics.manpowerCurve') },
        { key: 'progress',  label: t('analytics.progressCurve') },
        { key: 'gantt',     label: t('analytics.gantt') },
        { key: 'cpm',       label: t('analytics.cpm') },
    ];

    useEffect(() => {
        apiFetch('/projects').then(res => {
            const list = res.data || [];
            setProjects(list);
            if (list.length > 0) setSelectedProjectId(list[0].id);
        }).catch(console.error).finally(() => setLoadingProjects(false));
    }, []);

    useEffect(() => {
        if (!selectedProjectId) return;
        setLoadingTasks(true);
        apiFetch(`/projects/${selectedProjectId}/tasks`)
            .then(res => setProjectTasks(res.data || []))
            .catch(console.error).finally(() => setLoadingTasks(false));
    }, [selectedProjectId]);

    const project = useMemo(() => projects.find(p => p.id === selectedProjectId) || projects[0] || null, [selectedProjectId, projects]);

    const cpmResults = useMemo(() => { try { return calculateCPM(projectTasks); } catch { return []; } }, [projectTasks]);

    const costData = useMemo(() => {
        if (!project?.planned_start || !project?.planned_end) return [];
        return generateSCurveData(projectTasks, project.planned_start, project.planned_end);
    }, [projectTasks, project]);

    const manpowerData = useMemo(() => {
        if (!project?.planned_start || !project?.planned_end) return [];
        return generateSCurveData(projectTasks.map(task => ({ ...task, planned_cost: Number(task.planned_hours) || 0, actual_cost: Number(task.actual_hours) || 0 })), project.planned_start, project.planned_end);
    }, [projectTasks, project]);

    const progressData = useMemo(() => {
        if (!project?.planned_start || !project?.planned_end) return [];
        return generateSCurveData(projectTasks.map(task => ({ ...task, planned_cost: (Number(task.weight) || 0) * 100, actual_cost: (Number(task.pct_complete || 0) / 100) * ((Number(task.weight) || 0) * 100) })), project.planned_start, project.planned_end);
    }, [projectTasks, project]);

    const evmMetrics = useMemo(() => {
        if (!projectTasks.length || !project) return null;
        return computeEvm(projectTasks, project.schedule_pct);
    }, [projectTasks, project]);

    const perfIndex = evmMetrics?.CPI ?? null;
    const perfColor = perfIndex === null ? { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200', label: 'N/A' }
        : perfIndex >= 1   ? { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200', label: t('evm.onTrack') }
        : perfIndex >= 0.9 ? { bg: 'bg-amber-100',   text: 'text-amber-700',   border: 'border-amber-200',   label: t('evm.atRisk') }
        :                    { bg: 'bg-red-100',      text: 'text-red-700',     border: 'border-red-200',     label: t('evm.critical') };

    const curveConfig = {
        cost:     { data: costData,     mode: 'cost',  yLabel: t('analytics.currency'),    desc: t('analytics.costDesc') },
        manpower: { data: manpowerData, mode: 'hours', yLabel: t('analytics.laborHours'),  desc: t('analytics.manpowerDesc') },
        progress: { data: progressData, mode: 'pct',   yLabel: t('analytics.percentage'),  desc: t('analytics.progressDesc') },
    };
    const activeConfig = curveConfig[activeTab];
    const isCurveTab   = !!activeConfig;
    const criticalPath = cpmResults.filter(task => task.isCritical);

    if (loadingProjects) return (
        <div className="h-screen flex items-center justify-center gap-3 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin" /> {t('analytics.loadingProjects')}
        </div>
    );
    if (!project) return (
        <div className="h-screen flex items-center justify-center text-slate-500">
            <AlertCircle className="w-6 h-6 mr-2" /> {t('analytics.noData')}
        </div>
    );

    return (
        <div className="space-y-8 text-left pb-12 animate-in fade-in duration-300">

            {/* UNIFIED CONTROLS BAR CARD - Identical pattern to Report.jsx */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                    {/* Project & View Selector */}
                    <div className="flex flex-wrap items-center gap-6">
                        {/* Project selector */}
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1 mb-2">Select Active Project</span>
                            <select value={selectedProjectId || ''} onChange={e => setSelectedProjectId(Number(e.target.value))}
                                className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-sm font-semibold outline-none focus:border-emerald-500 cursor-pointer shadow-sm min-w-[240px]"
                            >
                                {projects.map(p => <option key={p.id} value={p.id}>{p.project_code} — {p.project_name}</option>)}
                            </select>
                        </div>
                        
                        {/* View Tabs Selector */}
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1 mb-2">Analytics Category</span>
                            <div className="flex gap-1.5 bg-slate-50 p-1.5 rounded-xl border border-slate-200/60 shadow-inner w-fit">
                                {TABS.map(tab => (
                                    <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                                        className={`px-5 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all duration-300 whitespace-nowrap ${
                                            activeTab === tab.key 
                                                ? 'bg-white text-emerald-700 shadow border border-emerald-100' 
                                                : 'text-slate-450 hover:text-slate-705'
                                        }`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {loadingTasks && (
                <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-wider pl-1">
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-500" /> {t('analytics.loadingTasks')}
                </div>
            )}

            {/* KPI CARDS STRIP */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { icon: <Target className="w-4 h-4" />, bg: 'bg-slate-50 border-slate-200 text-slate-500', label: 'CPI', value: perfIndex !== null ? perfIndex.toFixed(2) : '—', valCls: perfColor.text },
                    { icon: <CheckCircle2 className="w-4 h-4" />, bg: 'bg-emerald-50 border-emerald-100 text-emerald-600', label: 'SPI', value: evmMetrics?.SPI != null ? evmMetrics?.SPI?.toFixed(2) : '—', valCls: 'text-emerald-700' },
                    { icon: <AlertCircle className="w-4 h-4" />, bg: 'bg-rose-50 border-rose-100 text-rose-600', label: 'Planned Value', value: evmMetrics?.PV != null ? `IDR ${(evmMetrics?.PV / 1e6).toFixed(1)}M` : '—', valCls: 'text-rose-700' },
                    { icon: <Clock className="w-4 h-4" />, bg: 'bg-emerald-50 border-emerald-100 text-emerald-600', label: 'Earned Value', value: evmMetrics?.EV != null ? `IDR ${(evmMetrics?.EV / 1e6).toFixed(1)}M` : '—', valCls: 'text-emerald-700' }
                ].map((kpi, index) => (
                    <div key={index} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 text-left">
                        <div className={`p-2.5 rounded-xl border w-fit mb-3.5 ${kpi.bg}`}>{kpi.icon}</div>
                        <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-widest">{kpi.label}</h3>
                        <p className={`text-2xl font-black tracking-tight mt-1 ${kpi.valCls}`}>{kpi.value}</p>
                    </div>
                ))}
            </div>

            {/* MAIN CHART CONTAINER OR SCHEDULER VIEW */}
            <div className="animate-in fade-in duration-300">
                {isCurveTab && (
                    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
                        {/* Sidebar Status Info Card */}
                        <div className="xl:col-span-1 space-y-6 text-left">
                            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                                <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider mb-5 flex items-center gap-2">
                                    <Target className="w-4 h-4 text-emerald-500" /> {t('analytics.projectStatus')}
                                </h4>
                                <div className="space-y-6">
                                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">{t('analytics.perfIndex')}</p>
                                        <div className="flex items-center justify-between">
                                            <span className="text-2xl font-black text-slate-800">{perfIndex !== null ? perfIndex.toFixed(2) : '—'}</span>
                                            <span className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg border ${perfColor.bg} ${perfColor.text} ${perfColor.border}`}>{perfColor.label}</span>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">{t('analytics.projectTimeline')}</p>
                                        <div className="space-y-3">
                                            {[
                                                { icon: 'bg-emerald-50 text-emerald-600 border border-emerald-100', label: t('analytics.startDate'), value: fmtDate(project.planned_start) },
                                                { icon: 'bg-amber-50 text-amber-600 border border-amber-100',    label: t('analytics.targetFinish'), value: fmtDate(project.planned_end) },
                                            ].map(item => (
                                                <div key={item.label} className="flex items-center gap-3">
                                                    <div className={`w-8 h-8 rounded-lg ${item.icon} flex items-center justify-center`}><Calendar className="w-4 h-4" /></div>
                                                    <div>
                                                        <p className="text-[9px] font-bold text-slate-400 uppercase">{item.label}</p>
                                                        <p className="text-xs font-bold text-slate-700">{item.value}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-slate-800 p-6 rounded-3xl shadow-sm text-white relative overflow-hidden group">
                                <div className="relative z-10 text-left">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Info className="w-4 h-4 text-emerald-400" />
                                        <p className="text-[10px] font-black uppercase text-emerald-400 tracking-widest">{t('analytics.insightsTitle')}</p>
                                    </div>
                                    <p className="text-xs leading-relaxed text-slate-300 font-bold uppercase tracking-tight">{activeConfig.desc}</p>
                                </div>
                            </div>
                        </div>

                        {/* Chart Render Block */}
                        <div className="xl:col-span-3 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden flex flex-col justify-between">
                            <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-6 text-left">
                                <div>
                                    <h3 className="text-base font-bold text-slate-800 tracking-tight">{TABS.find(tab => tab.key === activeTab)?.label}</h3>
                                    <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-widest">{activeConfig.yLabel} {t('analytics.cumulativeTrend')}</p>
                                </div>
                                <div className="flex gap-4 bg-slate-50 px-4 py-2 rounded-xl border border-slate-200 shadow-inner">
                                    {[['bg-slate-300 border border-slate-400/40', 'PV'], ['bg-emerald-500 shadow-sm shadow-emerald-400/20', 'EV'], ['bg-amber-400 shadow-sm shadow-amber-400/20', 'AC']].map(([color, key]) => (
                                        <div key={key} className="flex items-center gap-2">
                                            <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
                                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{key}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="h-[460px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={activeConfig.data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorEV" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                                                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="6 6" stroke="#f1f5f9" vertical={false} />
                                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 800 }} tickLine={false} axisLine={false} minTickGap={40}
                                            tickFormatter={v => v ? new Date(v).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }) : ''} />
                                        <YAxis tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 800 }} tickLine={false} axisLine={false}
                                            tickFormatter={v => activeTab === 'cost' ? `${(v / 1e6).toFixed(0)}M` : v} />
                                        <Tooltip content={<CurveTooltip mode={activeConfig.mode} />} />
                                        <Area type="monotone" dataKey="EV" stroke="#10b981" strokeWidth={4} fillOpacity={1} fill="url(#colorEV)" />
                                        <Line type="monotone" dataKey="PV" stroke="#cbd5e1" strokeWidth={3} dot={false} strokeDasharray="8 6" />
                                        <Line type="monotone" dataKey="AC" stroke="#f59e0b" strokeWidth={3} dot={false} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                )}

                {/* GANTT TAB VIEW */}
                {activeTab === 'gantt' && (
                    <div className="h-[calc(100vh-320px)] min-h-[600px] animate-in fade-in duration-300">
                        <GanttChart tasks={projectTasks} cpmResults={cpmResults} t={t} />
                    </div>
                )}

                {/* CPM TAB VIEW */}
                {activeTab === 'cpm' && (
                    <div className="space-y-6 animate-in fade-in duration-500">
                        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm relative overflow-hidden text-left">
                            <div className="absolute top-0 left-0 w-1.5 h-full bg-rose-500" />
                            <div className="flex flex-col md:flex-row md:items-start gap-6 relative z-10 text-left">
                                <div className="p-3 bg-rose-50 rounded-xl border border-rose-100 shrink-0 text-rose-600"><AlertCircle className="w-5 h-5" /></div>
                                <div className="space-y-4">
                                    <div>
                                        <h3 className="text-base font-bold text-slate-800 tracking-tight">{t('analytics.criticalPath')}</h3>
                                        <p className="text-slate-550 text-xs mt-1 max-w-3xl leading-relaxed">{t('analytics.criticalDesc')}</p>
                                    </div>
                                    <div className="flex flex-wrap gap-3 text-left">
                                        {criticalPath.length === 0 ? (
                                            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">{t('analytics.noCritical')}</p>
                                        ) : criticalPath.map((task, i) => (
                                            <div key={task.id} className="flex items-center gap-2">
                                                <div className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-3 group hover:border-red-200 transition-colors cursor-default shadow-sm">
                                                    <span className="text-[10px] font-mono font-black text-rose-600 opacity-80">{task.wbs_code}</span>
                                                    <span className="text-xs font-bold text-slate-700 group-hover:text-rose-600 transition-colors">{task.task_name}</span>
                                                </div>
                                                {i < criticalPath.length - 1 && <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* CPM Matrix Grid Table Card */}
                        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-500px)] min-h-[500px]">
                            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/50 text-left">
                                <div>
                                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">{t('analytics.cpmMatrix')}</h3>
                                    <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-widest">{t('analytics.earlyLate')}</p>
                                </div>
                                <div className="flex items-center gap-6 text-[10px] font-bold uppercase tracking-tight text-slate-400">
                                    <div className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /><span>{t('analytics.autoPass')}</span></div>
                                    <div className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-emerald-500" /><span>{t('analytics.realtimeFloat')}</span></div>
                                </div>
                            </div>
                            <div className="overflow-auto flex-1 [scrollbar-width:thin]">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50/40 border-b border-slate-100 text-xs uppercase tracking-wider text-slate-500 font-black">
                                            <th className="px-6 py-4.5">{t('analytics.wbsNode')}</th>
                                            <th className="px-6 py-4.5">{t('analytics.timeDays')}</th>
                                            <th className="px-6 py-4.5 text-emerald-600">{t('analytics.perfectScenario')}</th>
                                            <th className="px-6 py-4.5 text-amber-600">{t('analytics.deadlineScenario')}</th>
                                            <th className="px-6 py-4.5">{t('analytics.wiggleRoom')}</th>
                                            <th className="px-6 py-4.5 text-right">{t('analytics.riskLevel')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-sm font-semibold text-slate-600 divide-y divide-slate-100">
                                        {cpmResults.length === 0 ? (
                                            <tr><td colSpan="6" className="px-6 py-16 text-center text-slate-400">{t('analytics.noCpmData')}</td></tr>
                                        ) : cpmResults.map(task => (
                                            <tr key={task.id} className={`hover:bg-slate-50/70 transition-colors ${task.isCritical ? 'bg-rose-50/10' : ''}`}>
                                                <td className="px-6 py-4.5 text-left">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-2.5 h-2.5 rounded-full shadow-sm shrink-0 ${task.isCritical ? 'bg-red-500 shadow-red-200' : 'bg-slate-300 shadow-slate-100'}`} />
                                                        <div>
                                                            <p className="font-extrabold text-slate-800 leading-tight">{task.task_name}</p>
                                                            <p className="text-[10px] font-mono font-bold text-slate-400 mt-1">{task.wbs_code}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4.5"><span className="text-xs font-bold text-slate-500 bg-white border border-slate-200 px-3 py-1 rounded-xl shadow-sm">{task.planned_duration}d</span></td>
                                                <td className="px-6 py-4.5"><div className="flex items-center gap-2 font-mono text-xs"><span className="text-emerald-700 font-extrabold">{task.es}</span><div className="w-4 h-[2px] bg-slate-200 shrink-0" /><span className="text-emerald-700 font-extrabold">{task.ef}</span></div></td>
                                                <td className="px-6 py-4.5"><div className="flex items-center gap-2 font-mono text-xs"><span className="text-amber-700 font-extrabold">{task.ls}</span><div className="w-4 h-[2px] bg-slate-200 shrink-0" /><span className="text-amber-700 font-extrabold">{task.lf}</span></div></td>
                                                <td className="px-6 py-4.5">
                                                    <div className="flex items-center gap-3">
                                                        <span className={`px-3 py-1 rounded-xl text-[10px] font-black tracking-wider shadow-sm border ${task.float === 0 ? 'bg-rose-50 text-rose-700 border-rose-100' : 'bg-white text-slate-600 border-slate-200'}`}>{task.float} DAYS</span>
                                                        {task.float > 0 && <div className="flex-1 max-w-[60px] h-1.5 bg-slate-100 rounded-full overflow-hidden shrink-0"><div className="h-full bg-slate-300" style={{ width: `${Math.min(task.float * 5, 100)}%` }} /></div>}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4.5 text-right">
                                                    {task.isCritical ? (
                                                        <span className="inline-flex items-center gap-1.5 text-[9px] font-black text-rose-700 uppercase tracking-wider bg-rose-50 px-2.5 py-1 rounded border border-rose-200 leading-none">
                                                            <AlertCircle className="w-3.5 h-3.5" /> {t('evm.critical')}
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1.5 text-[9px] font-black text-slate-500 uppercase tracking-wider bg-slate-50 px-2.5 py-1 rounded border border-slate-200 leading-none">
                                                            <CheckCircle2 className="w-3.5 h-3.5" /> {t('analytics.stable')}
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
