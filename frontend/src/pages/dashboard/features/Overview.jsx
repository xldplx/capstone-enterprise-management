import React, { useState, useEffect, useMemo } from 'react';
import { Activity, TrendingUp, AlertTriangle, LineChart as ChartIcon, Target, Loader2, Layers, Briefcase, CheckCircle2, Sparkles } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell } from 'recharts';
import { computeEvm, computeAlerts, indexColor, formatCurrency } from '../../../utils/evmHelpers';
import { generateSCurveData } from '../../../utils/cpmHelpers';
import { STATUS_STYLES, CARD_CLASS } from '../../../utils/uiConstants';
import { apiFetch, aiApi } from '../../../utils/api';
import { useTranslation } from '../../../utils/i18n';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'];

function formatMarkdownText(text) {
    if (!text) return '';
    let html = text
        .replace(/\*\*\*(.*?)\*\*\*/g, '<strong>$1</strong>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code class="bg-emerald-950/60 border border-emerald-800 px-1 py-0.5 rounded text-[10px] font-mono text-emerald-300">$1</code>')
        .replace(/\n/g, '<br />');
    return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

const formatYAxis = (value) => {
    if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
    if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
    return `$${value}`;
};

const formatXAxis = (dateStr) => {
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
        return dateStr;
    }
};

function OverviewTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white/80 backdrop-blur-xl border border-white/40 rounded-2xl shadow-2xl p-4 text-[11px] min-w-52 ring-1 ring-slate-900/5">
            <p className="font-black text-slate-800 mb-3 flex items-center gap-2 border-b border-slate-100 pb-2">
                <Target className="w-3 h-3 text-emerald-500" />{formatXAxis(label)}
            </p>
            <div className="space-y-2.5">
                {payload.map(p => (
                    <div key={p.dataKey} className="flex justify-between items-center gap-4">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                            <span className="font-bold text-[10px] text-slate-500 uppercase tracking-widest">{p.name}</span>
                        </div>
                        <span className="text-slate-800 font-mono font-black">{formatCurrency(p.value)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function Overview({ onNavigate }) {
    const { t } = useTranslation();
    const [loading, setLoading]       = useState(true);
    const [projects, setProjects]     = useState([]);
    const [allTasks, setAllTasks]     = useState([]);
    const [thresholds, setThresholds] = useState({ cpi_amber: 1.00, cpi_red: 0.90, spi_amber: 1.00, spi_red: 0.90 });
    const [viewMode, setViewMode]     = useState('Daily');

    // AI Insights states
    const [aiProjectId, setAiProjectId] = useState('portfolio');
    const [aiInsights, setAiInsights]   = useState('');
    const [loadingAi, setLoadingAi]     = useState(false);

    useEffect(() => {
        setLoading(true);
        Promise.all([apiFetch('/alerts/raw'), apiFetch('/alerts/thresholds')])
            .then(([raw, thresh]) => {
                if (raw.success) { setProjects(raw.projects || []); setAllTasks(raw.tasks || []); }
                if (thresh.success && thresh.data) setThresholds(thresh.data);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    // Fetch AI insights whenever selected project target changes
    useEffect(() => {
        if (loading) return;
        setLoadingAi(true);
        aiApi.getInsights(aiProjectId)
            .then(res => {
                if (res.success) {
                    setAiInsights(res.data);
                }
            })
            .catch(err => {
                console.error(err);
                setAiInsights('Could not generate AI insights at this time.');
            })
            .finally(() => setLoadingAi(false));
    }, [aiProjectId, loading]);

    const projectMetrics = useMemo(() => projects.map(proj => {
        const tasks = allTasks.filter(t => t.project_id === proj.id);
        return { ...proj, ...computeEvm(tasks, proj.schedule_pct) };
    }), [projects, allTasks]);

    const { totalBAC, portfolioCPI, portfolioSPI } = useMemo(() => {
        const tEV = projectMetrics.reduce((s, p) => s + p.EV, 0);
        const tAC = projectMetrics.reduce((s, p) => s + p.AC, 0);
        const tPV = projectMetrics.reduce((s, p) => s + p.PV, 0);
        const tBAC = projectMetrics.reduce((s, p) => s + p.BAC, 0);
        return { totalBAC: tBAC, portfolioCPI: tAC > 0 ? tEV / tAC : null, portfolioSPI: tPV > 0 ? tEV / tPV : null };
    }, [projectMetrics]);

    const rawSCurveData = useMemo(() => {
        const dated = projects.filter(p => p.planned_start && p.planned_end);
        if (!dated.length || !allTasks.length) return [];
        const minDate = new Date(Math.min(...dated.map(p => new Date(p.planned_start).getTime())));
        const maxDate = new Date(Math.max(...dated.map(p => new Date(p.planned_end).getTime())));
        return generateSCurveData(allTasks, minDate.toISOString(), maxDate.toISOString());
    }, [projects, allTasks]);

    const sCurveData = useMemo(() => {
        if (!rawSCurveData.length) return [];
        if (viewMode === 'Daily') return rawSCurveData;
        const interval = viewMode === t('overview.weekly') || viewMode === 'Weekly' ? 7 : 30;
        const grouped = [];
        for (let i = 0; i < rawSCurveData.length; i += interval) {
            const chunk = rawSCurveData.slice(i, i + interval);
            grouped.push({ ...chunk[chunk.length - 1] });
        }
        return grouped;
    }, [rawSCurveData, viewMode, t]);

    const statusCounts = useMemo(() => {
        const counts = { active: 0, planning: 0, completed: 0, on_hold: 0 };
        projects.forEach(p => { if (counts[p.status] !== undefined) counts[p.status]++; });
        return counts;
    }, [projects]);

    const { alerts, criticalCount, warningCount } = useMemo(() => {
        const a = computeAlerts(projects, allTasks, thresholds);
        return { alerts: a, criticalCount: a.filter(x => x.severity === 'critical').length, warningCount: a.filter(x => x.severity === 'warning').length };
    }, [projects, allTasks, thresholds]);

    const cpiColor = indexColor(portfolioCPI);
    const spiColor = indexColor(portfolioSPI);

    const VIEW_MODES = [
        { key: 'Daily',   label: t('overview.daily') },
        { key: 'Weekly',  label: t('overview.weekly') },
        { key: 'Monthly', label: t('overview.monthly') },
    ];

    if (loading) return (
        <div className="h-[60vh] flex flex-col items-center justify-center gap-4 text-slate-400">
            <Loader2 className="w-10 h-10 animate-spin text-emerald-500" />
            <p className="font-bold uppercase tracking-[0.2em] text-xs">{t('overview.syncingData')}</p>
        </div>
    );

    return (
        <div className="space-y-8 pb-12">
            
            {/* 1. HIGH-IMPACT ACTIVE ALERTS BANNER (FIRST ON THE PAGE - Premium Light-Theme Fills) */}
            {alerts.length > 0 ? (
                <div className="bg-rose-50/80 backdrop-blur-md border border-rose-100 rounded-3xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm animate-in fade-in slide-in-from-top-4">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-rose-100 text-rose-600 rounded-2xl border border-rose-200/50 shrink-0">
                            <AlertTriangle className="w-6 h-6 animate-pulse" />
                        </div>
                        <div className="text-left">
                            <h4 className="text-xs font-black uppercase text-rose-800 tracking-wider">Active Portfolio Alerts</h4>
                            <p className="text-[11px] text-slate-500 font-bold mt-1 uppercase tracking-tight leading-relaxed">
                                {alerts.length} operational deviations detected: <span className="text-rose-650 font-extrabold">{criticalCount} critical thresholds breached</span> and {warningCount} warnings at risk.
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={() => onNavigate?.('Alerts')} 
                        className="text-[10px] font-black uppercase tracking-wider text-rose-700 hover:text-rose-800 bg-rose-100 hover:bg-rose-200/80 border border-rose-200/60 px-4 py-2 rounded-xl transition-all shadow-sm shrink-0"
                    >
                        Inspect Alerts
                    </button>
                </div>
            ) : (
                <div className="bg-emerald-50/80 backdrop-blur-md border border-emerald-100 rounded-3xl p-5 flex items-center gap-4 shadow-sm">
                    <div className="p-3 bg-emerald-100 text-emerald-600 rounded-2xl border border-emerald-200/40 shrink-0">
                        <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <div className="text-left">
                        <h4 className="text-xs font-black uppercase text-emerald-800 tracking-wider">All Systems Operational</h4>
                        <p className="text-[11px] text-slate-500 font-bold mt-1 uppercase tracking-tight leading-relaxed">
                            No critical alerts or threshold warnings are active across your project portfolio.
                        </p>
                    </div>
                </div>
            )}

            {/* AI PORTFOLIO INSIGHTS PANEL */}
            <div className="bg-gradient-to-r from-emerald-950 to-slate-900 border border-slate-800 rounded-3xl p-6 shadow-sm text-white relative overflow-hidden group">
                <div className="absolute right-[-2%] bottom-[-20%] w-60 h-60 bg-emerald-500/5 blur-[80px] rounded-full pointer-events-none" />
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4 mb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-2xl border border-emerald-500/30 shrink-0">
                            <Sparkles className="w-5 h-5 animate-pulse" />
                        </div>
                        <div className="text-left">
                            <h4 className="text-xs font-black uppercase text-emerald-400 tracking-wider">AI Insights</h4>
                            <p className="text-[10px] text-slate-350 font-bold uppercase tracking-tight mt-0.5">Real-time analytical insights & recommendations</p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-2 self-start md:self-auto">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Target Scope:</span>
                        <select 
                            value={aiProjectId} 
                            onChange={e => setAiProjectId(e.target.value)}
                            className="bg-slate-850/80 border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-200 outline-none cursor-pointer hover:border-emerald-500/50 transition-colors"
                        >
                            <option value="portfolio">Overall Portfolio</option>
                            {projects.map(p => (
                                <option key={p.id} value={p.id}>{p.project_name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="relative z-10 text-left min-h-[50px] flex items-center">
                    {loadingAi ? (
                        <div className="flex items-center gap-2.5 text-slate-400 text-xs font-bold uppercase tracking-wider py-2">
                            <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                            <span>Computing project data & generating summary...</span>
                        </div>
                    ) : (
                        <p className="text-slate-200 text-xs sm:text-sm font-medium leading-relaxed font-sans">
                            {formatMarkdownText(aiInsights)}
                        </p>
                    )}
                </div>
            </div>

            {/* 2. PREMIUM KPI CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                
                {/* Portfolio Budget */}
                <div className={`${CARD_CLASS} p-6 bg-white border border-slate-200/60 rounded-3xl shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group`}>
                    <div className="absolute top-0 right-0 w-24 h-24 bg-slate-50 rounded-full translate-x-8 -translate-y-8 group-hover:scale-110 transition-transform duration-500 pointer-events-none" />
                    <div className="p-3 bg-slate-50 text-slate-500 rounded-xl border border-slate-200 shadow-inner w-fit mb-4 relative z-10">
                        <Briefcase className="w-5 h-5" />
                    </div>
                    <h3 className="text-slate-400 text-[10px] font-bold uppercase tracking-wider relative z-10">{t('overview.portfolioBudget')}</h3>
                    <p className="text-2xl font-extrabold text-slate-800 tracking-tight mt-1 relative z-10">{formatCurrency(totalBAC)}</p>
                    <div className="mt-4 pt-3 border-t border-slate-50 flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-tight relative z-10">
                        <span>{t('overview.totalBac')}</span>
                        <span className="text-slate-500">100%</span>
                    </div>
                </div>

                {/* Total Projects */}
                <div className={`${CARD_CLASS} p-6 bg-white border border-slate-200/60 rounded-3xl shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group`}>
                    <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50/50 rounded-full translate-x-8 -translate-y-8 group-hover:scale-110 transition-transform duration-500 pointer-events-none" />
                    <div className="p-3 bg-emerald-50 text-emerald-650 rounded-xl border border-emerald-100 shadow-inner w-fit mb-4 relative z-10">
                        <Layers className="w-5 h-5" />
                    </div>
                    <h3 className="text-slate-400 text-[10px] font-bold uppercase tracking-wider relative z-10">{t('overview.totalProjects')}</h3>
                    <p className="text-2xl font-extrabold text-slate-800 tracking-tight mt-1 relative z-10">{projects.length}</p>
                    <div className="mt-4 pt-3 border-t border-slate-50 flex gap-2 relative z-10">
                        <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100/60">
                            {statusCounts.active} {t('status.active')}
                        </span>
                        <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100/60">
                            {statusCounts.planning} {t('status.planning')}
                        </span>
                    </div>
                </div>

                {/* Schedule Progress (SPI) */}
                <div className={`${CARD_CLASS} p-6 bg-white border border-slate-200/60 rounded-3xl shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group`}>
                    <div className="flex justify-between items-start mb-4 relative z-10">
                        <div className={`p-3 rounded-xl border shadow-inner ${
                            portfolioSPI >= 1 
                                ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                                : 'bg-red-50 text-red-600 border-red-100'
                        }`}>
                            <Activity className="w-5 h-5" />
                        </div>
                        <div className={`px-2.5 py-1 rounded-lg border font-black text-[9px] uppercase tracking-wider ${spiColor.bg} ${spiColor.border} ${spiColor.text}`}>
                            {spiColor.label}
                        </div>
                    </div>
                    <h3 className="text-slate-400 text-[10px] font-bold uppercase tracking-wider relative z-10">{t('overview.avgSchedule')}</h3>
                    <p className={`text-2xl font-extrabold tracking-tight mt-1 relative z-10 ${spiColor.text}`}>
                        {portfolioSPI !== null ? portfolioSPI.toFixed(2) : '--'}
                    </p>
                    <div className="mt-4 bg-slate-100 rounded-full h-1.5 overflow-hidden relative z-10">
                        <div className={`h-full rounded-full transition-all duration-1000 ${
                            portfolioSPI >= 1 ? 'bg-emerald-500' : 'bg-red-500'
                        }`} style={{ width: `${Math.min((portfolioSPI || 0) * 100, 100)}%` }} />
                    </div>
                </div>

                {/* Cost Performance (CPI) */}
                <div className={`${CARD_CLASS} p-6 bg-white border border-slate-200/60 rounded-3xl shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group`}>
                    <div className="flex justify-between items-start mb-4 relative z-10">
                        <div className={`p-3 rounded-xl border shadow-inner ${
                            portfolioCPI >= 1 
                                ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                                : 'bg-red-50 text-red-600 border-red-100'
                        }`}>
                            <TrendingUp className="w-5 h-5" />
                        </div>
                        <div className={`px-2.5 py-1 rounded-lg border font-black text-[9px] uppercase tracking-wider ${cpiColor.bg} ${cpiColor.border} ${cpiColor.text}`}>
                            {cpiColor.label}
                        </div>
                    </div>
                    <h3 className="text-slate-400 text-[10px] font-bold uppercase tracking-wider relative z-10">{t('overview.avgCost')}</h3>
                    <p className={`text-2xl font-extrabold tracking-tight mt-1 relative z-10 ${cpiColor.text}`}>
                        {portfolioCPI !== null ? portfolioCPI.toFixed(2) : '--'}
                    </p>
                    <div className="mt-4 bg-slate-100 rounded-full h-1.5 overflow-hidden relative z-10">
                        <div className={`h-full rounded-full transition-all duration-1000 ${
                            portfolioCPI >= 1 ? 'bg-emerald-500' : portfolioCPI >= 0.9 ? 'bg-amber-500' : 'bg-red-500'
                        }`} style={{ width: `${Math.min((portfolioCPI || 0) * 100, 100)}%` }} />
                    </div>
                </div>

            </div>

            {/* 3. S-CURVE PERFORMANCE CHART (WITH VIEW SELECTOR LOCALIZED IN HEADER) */}
            <div className="bg-white border border-slate-200/80 p-8 rounded-3xl shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                    <div className="flex items-center gap-3.5">
                        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100"><Activity className="w-5 h-5" /></div>
                        <div>
                            <h3 className="text-base font-bold text-slate-800 tracking-tight">{t('overview.cumulativeCurve')}</h3>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                                Cumulative Planned vs Earned Value Tracking
                            </p>
                        </div>
                    </div>
                    
                    {/* LOCALIZED DURATION SELECTOR */}
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/60 shadow-inner">
                            {VIEW_MODES.map(({ key, label }) => (
                                <button key={key} onClick={() => setViewMode(key)}
                                    className={`px-3.5 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all duration-200 ${
                                        viewMode === key 
                                            ? 'bg-white text-emerald-600 shadow-sm border border-slate-200/50' 
                                            : 'text-slate-400 hover:text-slate-700'
                                    }`}>
                                    {label}
                                </button>
                            ))}
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-3 bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200">
                            {[['bg-slate-300', 'PV'], ['bg-emerald-500', 'EV'], ['bg-amber-500', 'AC']].map(([color, key]) => (
                                <div key={key} className="flex items-center gap-1.5">
                                    <div className={`w-2 h-2 rounded-full ${color}`} />
                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{key}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={sCurveData} margin={{ left: -10, right: 10, top: 10, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorEV" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                            <XAxis dataKey="date" tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={formatXAxis} />
                            <YAxis tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={formatYAxis} />
                            <Tooltip content={<OverviewTooltip />} />
                            <Area type="monotone" dataKey="PV" name={t('overview.planned')} stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" fill="transparent" />
                            <Area type="monotone" dataKey="EV" name={t('overview.earned')} stroke="#10b981" strokeWidth={3} fill="url(#colorEV)" />
                            <Area type="monotone" dataKey="AC" name={t('overview.actual')} stroke="#f59e0b" strokeWidth={2} fill="transparent" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* 4. SPACE-EFFICIENT INTEGRATED PROJECTS LIST & STATUS BREAKDOWN */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 bg-white border border-slate-200/80 rounded-3xl shadow-sm overflow-hidden p-6 lg:p-8">
                
                {/* SCROLLABLE PROJECTS LIST (Left Side, 2 Cols) */}
                <div className="lg:col-span-2 flex flex-col min-w-0 pr-0 lg:pr-6 lg:border-r border-slate-100">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 shadow-sm text-slate-500"><Layers className="w-5 h-5" /></div>
                        <div className="text-left">
                            <h3 className="text-base font-bold text-slate-800 tracking-tight">Projects List</h3>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Live performance metrics log</p>
                        </div>
                    </div>
                    
                    {/* SCROLLABLE TABLE AREA */}
                    <div className="flex-1 overflow-y-auto max-h-[380px] pr-2 [scrollbar-width:thin] [scrollbar-color:#34d399_transparent] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-thumb]:rounded-full">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="text-[9px] uppercase tracking-widest text-slate-400 font-bold border-b border-slate-100 pb-3">
                                    <th className="pb-3 text-left">{t('overview.projectDetails')}</th>
                                    <th className="pb-3 text-left">Timeline</th>
                                    <th className="pb-3 text-left">{t('overview.performance')}</th>
                                    <th className="pb-3 text-left">Indices (SPI/CPI)</th>
                                    <th className="pb-3 text-right">{t('common.status')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {projectMetrics.map(p => {
                                    const spiC = indexColor(p.SPI);
                                    const cpiC = indexColor(p.CPI);
                                    return (
                                        <tr key={p.id} className="hover:bg-slate-50/50 transition-all duration-200 group">
                                            <td className="py-4 text-left pr-4">
                                                <button 
                                                    onClick={() => p.id != null && onNavigate?.('Projects', p.id)}
                                                    className="font-bold text-slate-800 tracking-tight hover:text-emerald-600 transition-colors text-left text-sm"
                                                >
                                                    {p.project_name}
                                                </button>
                                                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                                    <code className="text-[8px] text-slate-500 bg-slate-50 border border-slate-200/60 px-1.5 py-0.5 rounded uppercase tracking-wider font-mono leading-none">{p.project_code}</code>
                                                    <span className="text-[9px] text-slate-400 font-medium">
                                                        Budget: <span className="font-extrabold text-slate-600">{formatCurrency(p.total_budget || p.BAC)}</span>
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="py-4 text-left text-xs font-semibold text-slate-500 pr-4">
                                                <div className="whitespace-nowrap">
                                                    {p.planned_start ? new Date(p.planned_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                                                </div>
                                                <div className="text-[10px] text-slate-400 font-normal">
                                                    to {p.planned_end ? new Date(p.planned_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                                                </div>
                                            </td>
                                            <td className="py-4 text-left pr-4">
                                                <div className="w-32">
                                                    <div className="flex justify-between text-[8px] font-bold text-slate-400 uppercase mb-1">
                                                        <span>{t('overview.done')}</span>
                                                        <span className="text-slate-600 font-mono">{p.overallPct.toFixed(1)}%</span>
                                                    </div>
                                                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(p.overallPct, 100)}%` }} />
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-4 text-left">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded border leading-none ${spiC.bg} ${spiC.border} ${spiC.text}`} title="SPI">S: {p.SPI !== null ? p.SPI.toFixed(2) : '--'}</span>
                                                    <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded border leading-none ${cpiC.bg} ${cpiC.border} ${cpiC.text}`} title="CPI">C: {p.CPI !== null ? p.CPI.toFixed(2) : '--'}</span>
                                                </div>
                                            </td>
                                            <td className="py-4 text-right">
                                                <span className={`text-[8px] font-bold uppercase px-2.5 py-1 rounded-lg border ${STATUS_STYLES[p.status] || STATUS_STYLES.planning} tracking-widest inline-block`}>
                                                    {p.status}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* STATUS BREAKDOWN WIDGET (Right Side, 1 Col - scaled up) */}
                <div className="lg:col-span-1 flex flex-col justify-between pl-0 lg:pl-6">
                    <div>
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">{t('overview.statusBreakdown')}</h4>
                        <div className="h-[250px] w-full relative">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={[
                                        { name: t('status.active'), value: statusCounts.active },
                                        { name: t('status.planning'), value: statusCounts.planning },
                                        { name: t('status.completed'), value: statusCounts.completed },
                                        { name: t('status.onHold'), value: statusCounts.on_hold },
                                    ]} innerRadius={65} outerRadius={90} paddingAngle={8} dataKey="value">
                                        {COLORS.map((c, i) => <Cell key={i} fill={c} strokeWidth={0} />)}
                                    </Pie>
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <span className="text-3xl font-black text-slate-800 leading-none">{projects.length}</span>
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider mt-1">{t('common.total')}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="space-y-3 mt-6 pt-4 border-t border-slate-100">
                        {[
                            { color: '#10b981', count: statusCounts.active, label: t('status.active'), bg: 'bg-emerald-500' },
                            { color: '#3b82f6', count: statusCounts.planning, label: t('status.planning'), bg: 'bg-blue-500' },
                            { color: '#f59e0b', count: statusCounts.completed, label: t('status.completed'), bg: 'bg-amber-500' },
                            { color: '#ef4444', count: statusCounts.on_hold, label: t('status.onHold'), bg: 'bg-rose-500' },
                        ].map(({ color, count, label, bg }) => {
                            const pct = projects.length > 0 ? (count / projects.length) * 100 : 0;
                            return (
                                <div key={label} className="space-y-1">
                                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-tight">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                            <span className="text-slate-500">{label}</span>
                                        </div>
                                        <span className="text-slate-700 font-mono">{count} ({pct.toFixed(0)}%)</span>
                                    </div>
                                    <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full ${bg}`} style={{ width: `${pct}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

            </div>

        </div>
    );
}