import { useState, useEffect } from 'react';
import { Bell, AlertTriangle, CheckCircle2, Settings, ChevronRight, Filter, ShieldAlert, ArrowRight, Search, TrendingDown, Clock, Sparkles, Loader2 } from 'lucide-react';
import { computeAlerts } from '../../../utils/evmHelpers';
import { INPUT_CLASS } from '../../../utils/uiConstants';
import { apiFetch, aiApi } from '../../../utils/api';
import { useTranslation } from '../../../utils/i18n';

function formatMarkdownText(text) {
    if (!text) return '';
    let html = text
        .replace(/\*\*\*(.*?)\*\*\*/g, '<strong>$1</strong>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code class="bg-slate-100 border border-slate-200 px-1 py-0.5 rounded text-[10px] font-mono text-emerald-700">$1</code>')
        .replace(/\n/g, '<br />');
    return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function Alerts({ onNavigate }) {
    const { t } = useTranslation();
    const [thresholds, setThresholds] = useState({ cpi_amber: '1.00', cpi_red: '0.90', spi_amber: '1.00', spi_red: '0.90' });
    const [thresholdToast, setThresholdToast] = useState(false);
    const [projects, setProjects] = useState([]);
    const [allTasks, setAllTasks] = useState([]);
    const [activeSeverityFilter, setActiveSeverityFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedAlerts, setExpandedAlerts] = useState({});
    const userRole = localStorage.getItem('userRole');

    // AI Risk Consultant States
    const [selectedAiProjId, setSelectedAiProjId] = useState('');
    const [aiRisks, setAiRisks]                   = useState('');
    const [loadingRisks, setLoadingRisks]         = useState(false);

    useEffect(() => {
        apiFetch('/alerts/raw').then(r => {
            if (r.success) { setProjects(r.projects || []); setAllTasks(r.tasks || []); }
        }).catch(console.error);
        apiFetch('/alerts/thresholds').then(r => {
            if (r.success && r.data) setThresholds({
                cpi_amber: String(r.data.cpi_amber), cpi_red: String(r.data.cpi_red),
                spi_amber: String(r.data.spi_amber), spi_red: String(r.data.spi_red),
            });
        }).catch(console.error);
    }, []);

    useEffect(() => {
        if (projects.length === 0) return;
        const targetId = selectedAiProjId || String(projects[0].id);
        if (!selectedAiProjId) {
            setSelectedAiProjId(targetId);
            return;
        }

        setLoadingRisks(true);
        aiApi.getRisks(targetId)
            .then(res => {
                if (res.success) setAiRisks(res.data);
            })
            .catch(err => {
                console.error(err);
                setAiRisks('Could not generate risk mitigation recommendations.');
            })
            .finally(() => setLoadingRisks(false));
    }, [selectedAiProjId, projects]);

    const tv = {
        cpi_amber: parseFloat(thresholds.cpi_amber) || 0,
        cpi_red:   parseFloat(thresholds.cpi_red)   || 0,
        spi_amber: parseFloat(thresholds.spi_amber) || 0,
        spi_red:   parseFloat(thresholds.spi_red)   || 0,
    };

    const alerts = computeAlerts(projects, allTasks, tv);
    const criticalCount = alerts.filter(a => a.severity === 'critical').length;
    const warningCount  = alerts.filter(a => a.severity === 'warning').length;
    const costAlertsCount = alerts.filter(a => a.metric === 'CPI').length;
    const scheduleAlertsCount = alerts.filter(a => a.metric === 'SPI').length;
    const thresholdWarning = tv.cpi_red >= tv.cpi_amber || tv.spi_red >= tv.spi_amber;

    const thresholdFields = [
        { key: 'cpi_amber', label: t('alerts.cpiAmber') },
        { key: 'cpi_red',   label: t('alerts.cpiRed') },
        { key: 'spi_amber', label: t('alerts.spiAmber') },
        { key: 'spi_red',   label: t('alerts.spiRed') },
    ];

    const handleThresholdBlur = async (e, key) => {
        const num     = parseFloat(e.target.value);
        const clamped = isNaN(num) ? 0 : Math.min(1.5, Math.max(0, num));
        const updated = { ...thresholds, [key]: clamped.toFixed(2) };
        setThresholds(updated);
        try {
            await apiFetch('/alerts/thresholds', {
                method: 'PUT',
                body: JSON.stringify({
                    cpi_amber: parseFloat(updated.cpi_amber), cpi_red: parseFloat(updated.cpi_red),
                    spi_amber: parseFloat(updated.spi_amber), spi_red: parseFloat(updated.spi_red),
                }),
            });
        } catch (e) { console.error(e); }
        setThresholdToast(true);
        setTimeout(() => setThresholdToast(false), 2000);
    };

    const handleSetPreset = async (key, val) => {
        const updated = { ...thresholds, [key]: val.toFixed(2) };
        setThresholds(updated);
        try {
            await apiFetch('/alerts/thresholds', {
                method: 'PUT',
                body: JSON.stringify({
                    cpi_amber: parseFloat(updated.cpi_amber), cpi_red: parseFloat(updated.cpi_red),
                    spi_amber: parseFloat(updated.spi_amber), spi_red: parseFloat(updated.spi_red),
                }),
            });
        } catch (e) { console.error(e); }
        setThresholdToast(true);
        setTimeout(() => setThresholdToast(false), 2000);
    };

    const handleSetAllPresets = async (cpiAmber, cpiRed, spiAmber, spiRed) => {
        const updated = {
            cpi_amber: cpiAmber.toFixed(2),
            cpi_red: cpiRed.toFixed(2),
            spi_amber: spiAmber.toFixed(2),
            spi_red: spiRed.toFixed(2)
        };
        setThresholds(updated);
        try {
            await apiFetch('/alerts/thresholds', {
                method: 'PUT',
                body: JSON.stringify({
                    cpi_amber: cpiAmber,
                    cpi_red: cpiRed,
                    spi_amber: spiAmber,
                    spi_red: spiRed
                }),
            });
        } catch (e) { console.error(e); }
        setThresholdToast(true);
        setTimeout(() => setThresholdToast(false), 2000);
    };

    const filteredAlerts = alerts.filter(a => {
        const matchesSearch = a.project.project_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                             a.project.project_code.toLowerCase().includes(searchQuery.toLowerCase());
        if (activeSeverityFilter === 'all') return matchesSearch;
        return a.severity === activeSeverityFilter && matchesSearch;
    });

    const toggleExpand = (id) => {
        setExpandedAlerts(prev => ({ ...prev, [id]: !prev[id] }));
    };

    return (
        <div className="space-y-6 pb-12 text-left">
            {thresholdToast && (
                <div className="fixed top-6 right-6 z-50 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-lg shadow-emerald-200 flex items-center gap-2 text-sm font-semibold animate-in slide-in-from-top-2 fade-in duration-200">
                    <CheckCircle2 className="w-4 h-4" /> Limits Updated
                </div>
            )}

            {/* TWO COLUMN PREMIUM WORKSPACE LAYOUT */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                
                {/* LEFT: ALERTS LOG CONSOLE IN ONE UNIFIED CARD */}
                <div className="lg:col-span-2 bg-white border border-slate-200/85 rounded-[2rem] shadow-sm overflow-hidden flex flex-col">
                    
                    {/* CARD HEADER: FILTERS & SEARCH */}
                    <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
                        <div className="flex flex-wrap items-center gap-2">
                            {[
                                { key: 'all',      label: 'All Alerts',  count: alerts.length,   activeCls: 'bg-slate-900 text-white border-slate-900 shadow-md' },
                                { key: 'critical', label: 'Critical',    count: criticalCount,  activeCls: 'bg-rose-600 text-white border-rose-600 shadow-lg shadow-rose-600/20' },
                                { key: 'warning',  label: 'Warning',     count: warningCount,   activeCls: 'bg-amber-500 text-white border-amber-500 shadow-lg shadow-amber-500/20' }
                            ].map(btn => {
                                const isActive = activeSeverityFilter === btn.key;
                                return (
                                    <button 
                                        key={btn.key} 
                                        onClick={() => setActiveSeverityFilter(btn.key)}
                                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 border ${
                                            isActive 
                                                ? btn.activeCls
                                                : 'bg-white border-slate-200 text-slate-550 hover:bg-slate-50 hover:text-slate-800'
                                        }`}
                                    >
                                        {btn.label}
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>{btn.count}</span>
                                    </button>
                                );
                            })}
                        </div>
                        
                        {/* SEARCH INPUT */}
                        <div className="relative min-w-[220px]">
                            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input 
                                type="text"
                                placeholder="Search by project name..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-550/5 transition-all text-slate-700 font-bold placeholder:text-slate-400 placeholder:font-bold"
                            />
                        </div>
                    </div>

                    {/* ALERTS BATCH LOG CONTAINER */}
                    <div className="p-6">
                        {filteredAlerts.length > 0 ? (
                            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 scroll-smooth">
                                {filteredAlerts.sort((a, b) => (b.severity === 'critical' ? 1 : 0) - (a.severity === 'critical' ? 1 : 0)).map(alert => {
                                    const isExpanded = !!expandedAlerts[alert.id];
                                    return (
                                        <div 
                                            key={alert.id}
                                            className={`group bg-white rounded-2xl border border-slate-200 border-l-4 p-5 transition-all hover:shadow-sm ${
                                                alert.severity === 'critical' ? 'border-l-rose-500' : 'border-l-amber-500'
                                            }`}
                                        >
                                            <div className="flex items-start gap-4">
                                                <div className={`p-2.5 rounded-xl shrink-0 border ${
                                                    alert.severity === 'critical' 
                                                        ? 'bg-rose-50 text-rose-600 border-rose-100/50' 
                                                        : 'bg-amber-50 text-amber-650 border-amber-100/50'
                                                }`}>
                                                    <AlertTriangle className="w-4.5 h-4.5" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-start justify-between gap-4">
                                                        <div>
                                                            <h4 className="font-extrabold text-slate-800 tracking-tight text-sm leading-snug">{alert.project.project_name}</h4>
                                                            <code className="text-[8px] text-slate-500 bg-slate-50 border border-slate-200/60 px-1.5 py-0.5 rounded mt-1 inline-block uppercase tracking-wider font-mono">{alert.project.project_code}</code>
                                                        </div>
                                                        <span className={`text-[8px] font-extrabold uppercase px-2 py-0.5 rounded border leading-none shrink-0 ${
                                                            alert.severity === 'critical' ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-amber-50 text-amber-650 border-amber-100'
                                                        }`}>
                                                            {alert.severity === 'critical' ? 'Critical' : 'Warning'}
                                                        </span>
                                                    </div>
                                                    
                                                    <p className="text-slate-600 text-xs mt-3 leading-relaxed font-semibold">{alert.recommendation}</p>

                                                    {/* METRICS ROW */}
                                                    <div className="flex flex-wrap items-center gap-4 mt-3.5 pt-3 border-t border-slate-100 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                                        <span><strong className="text-slate-650">{alert.metric}:</strong> {alert.value.toFixed(2)}</span>
                                                        <span>Limit: {alert.threshold.toFixed(2)}</span>
                                                        <span className={alert.severity === 'critical' ? 'text-rose-600 font-extrabold' : 'text-amber-655 font-extrabold'}>
                                                            Gap: {((alert.value - alert.threshold) * 100).toFixed(1)}%
                                                        </span>
                                                    </div>

                                                    {/* EXPANSION CONTROL */}
                                                    {alert.affectedTasks?.length > 0 && (
                                                        <div className="mt-3">
                                                            <button 
                                                                onClick={() => toggleExpand(alert.id)}
                                                                className="flex items-center gap-1 text-[8px] font-black uppercase tracking-wider text-emerald-600 hover:text-emerald-700 transition-colors"
                                                            >
                                                                {isExpanded ? 'Hide Tasks' : 'Show Tasks'}
                                                                <ChevronRight className={`w-3 h-3 transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`} />
                                                            </button>

                                                            {isExpanded && (
                                                                <div className="mt-2.5 p-3 bg-slate-50 border border-slate-150 rounded-xl space-y-3.5 animate-in fade-in slide-in-from-top-2 duration-300">
                                                                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-200/60 pb-1.5">Tasks with Issues</p>
                                                                    <div className="space-y-2.5">
                                                                        {alert.affectedTasks.map(task => (
                                                                            <div key={task.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-[11px]">
                                                                                <span className="font-bold text-slate-700">{task.task_name}</span>
                                                                                <div className="flex items-center gap-2.5 shrink-0">
                                                                                    <div className="w-20 bg-slate-200 h-1 rounded-full overflow-hidden">
                                                                                        <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${task.pct_complete}%` }} />
                                                                                    </div>
                                                                                    <span className="text-[9px] font-mono font-bold text-slate-500 w-8 text-right">{task.pct_complete.toFixed(0)}%</span>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                    
                                                    {/* ACTION ROUTING */}
                                                    {alert.project?.id != null && (
                                                        <div className="mt-3 flex justify-end">
                                                            <button 
                                                                onClick={() => onNavigate?.('Projects', alert.project.id)}
                                                                className="text-[9px] font-black uppercase tracking-wider text-slate-450 hover:text-slate-700 flex items-center gap-1 transition-colors border border-slate-200 px-2.5 py-1.5 rounded-lg hover:bg-slate-50"
                                                            >
                                                                Open Project <ArrowRight className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="py-16 flex flex-col items-center justify-center gap-3">
                                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                                <p className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">No active alerts found</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* RIGHT: CONTROL PANEL & STICKY CONFIGURATION (Span 1) */}
                <div className="space-y-6 lg:sticky lg:top-4">
                    
                    {/* SYSTEM HEALTH CARD */}
                    <div className="bg-slate-900 text-white rounded-3xl p-6 border border-slate-950 shadow-md relative overflow-hidden">
                        <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-25 pointer-events-none" />
                        <div className="flex items-center justify-between mb-5 relative z-10">
                            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">System Health</h4>
                            <ShieldAlert className={`w-5 h-5 shrink-0 ${alerts.length > 0 ? 'text-rose-500 animate-pulse' : 'text-emerald-500'}`} />
                        </div>
                        <div className="space-y-4 relative z-10">
                            <div className="flex items-end justify-between">
                                <span className="text-4xl font-black text-white leading-none">{alerts.length}</span>
                                <div className="text-right">
                                    <p className="text-[10px] font-bold text-rose-500 uppercase tracking-wider">{criticalCount} critical</p>
                                    <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">{warningCount} warning</p>
                                </div>
                            </div>
                            <p className="text-[10.5px] text-slate-400 font-bold uppercase tracking-wide leading-relaxed border-t border-slate-800 pt-3">
                                {alerts.length > 0 ? 'Some projects have issues.' : 'All projects are on track.'}
                            </p>

                            {/* ANALYTICAL BREAKDOWN INFO */}
                            <div className="border-t border-slate-800 pt-3.5 mt-2 space-y-2">
                                <div className="flex items-center justify-between text-[10px] font-extrabold uppercase text-slate-450">
                                    <div className="flex items-center gap-1.5">
                                        <TrendingDown className="w-3.5 h-3.5 text-rose-450" />
                                        <span>Cost Risks (CPI)</span>
                                    </div>
                                    <span className="text-white font-mono">{costAlertsCount}</span>
                                </div>
                                <div className="flex items-center justify-between text-[10px] font-extrabold uppercase text-slate-450">
                                    <div className="flex items-center gap-1.5">
                                        <Clock className="w-3.5 h-3.5 text-amber-450" />
                                        <span>Delay Risks (SPI)</span>
                                    </div>
                                    <span className="text-white font-mono">{scheduleAlertsCount}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* AI RISK RECOMMENDATIONS PANEL */}
                    <div className="bg-gradient-to-br from-slate-900 to-slate-950 text-white rounded-3xl p-6 border border-slate-800 shadow-md space-y-4">
                        <div className="flex items-center gap-2 pb-3 border-b border-white/10">
                            <Sparkles className="w-5 h-5 text-emerald-400 shrink-0 animate-pulse" />
                            <div className="text-left">
                                <h4 className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest leading-none">AI Risks</h4>
                                <span className="text-[8px] text-slate-400 uppercase tracking-wider font-extrabold block mt-1">Prescriptive Mitigation Audit</span>
                            </div>
                        </div>
                        
                        {projects.length > 0 && (
                            <div className="flex flex-col gap-1 text-left">
                                <label className="text-[8px] font-black uppercase text-slate-400 tracking-wider">Select Project</label>
                                <select 
                                    value={selectedAiProjId} 
                                    onChange={e => setSelectedAiProjId(e.target.value)}
                                    className="w-full bg-slate-850/80 border border-slate-700/80 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-200 outline-none cursor-pointer hover:border-emerald-500/50 transition-colors"
                                >
                                    {projects.map(p => (
                                        <option key={p.id} value={p.id}>{p.project_name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className="text-left text-xs leading-relaxed space-y-2 border-t border-white/5 pt-3">
                            {loadingRisks ? (
                                <div className="flex items-center gap-2 text-slate-400 font-bold uppercase tracking-wider text-[10px] py-4">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                                    <span>Analyzing risk variables...</span>
                                </div>
                            ) : (
                                <div className="prose prose-invert max-w-none text-slate-300 text-[11px] font-semibold leading-relaxed select-text space-y-2.5">
                                    {aiRisks.split('\n\n').map((chunk, idx) => {
                                        if (chunk.startsWith('###')) {
                                            return <h5 key={idx} className="font-extrabold text-emerald-400 mt-3 text-[12px] leading-tight">{chunk.replace('###', '').trim()}</h5>;
                                        }
                                        return <p key={idx}>{formatMarkdownText(chunk)}</p>;
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* CONFIG THRESHOLDS */}
                    {userRole === 'Project Manager' && (
                        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-6 space-y-5 text-left">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-slate-500 shadow-inner"><Settings className="w-5 h-5" /></div>
                                <div>
                                    <h3 className="font-bold text-slate-800 text-sm">Alert Limits</h3>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Settings</p>
                                </div>
                            </div>

                            {/* MASTER SET ALL PRESET LIMITS */}
                            <div className="border-t border-slate-100 pt-4">
                                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider ml-1">Preset All Limits</label>
                                <div className="flex gap-2 mt-2">
                                    {[
                                        { label: 'Strict',   vals: [1.05, 0.95, 1.05, 0.95], bg: 'hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200' },
                                        { label: 'Normal',   vals: [1.00, 0.90, 1.00, 0.90], bg: 'hover:bg-slate-100 hover:text-slate-800' },
                                        { label: 'Relaxed',  vals: [0.95, 0.85, 0.95, 0.85], bg: 'hover:bg-emerald-50 hover:text-emerald-650 hover:border-emerald-200' }
                                    ].map(allPreset => (
                                        <button
                                            key={allPreset.label}
                                            type="button"
                                            onClick={() => handleSetAllPresets(...allPreset.vals)}
                                            className={`flex-1 text-[10px] font-extrabold uppercase py-2 border border-slate-200 rounded-xl transition-all ${allPreset.bg}`}
                                        >
                                            {allPreset.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            
                            <div className="space-y-4 border-t border-slate-100 pt-4">
                                {thresholdFields.map(field => (
                                    <div key={field.key} className="space-y-1">
                                        <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider ml-1">{field.label}</label>
                                        <input type="number" step="0.01" min="0" max="1.5"
                                            value={thresholds[field.key]}
                                            onChange={e => setThresholds({ ...thresholds, [field.key]: e.target.value })}
                                            onBlur={e => handleThresholdBlur(e, field.key)}
                                            className={INPUT_CLASS} />
                                        
                                        {/* PRESET CHIPS */}
                                        <div className="flex flex-wrap gap-1 mt-1 pl-1">
                                            {(field.key.includes('amber') ? [0.95, 1.00, 1.05] : [0.80, 0.85, 0.90]).map(preset => (
                                                <button
                                                    key={preset}
                                                    type="button"
                                                    onClick={() => handleSetPreset(field.key, preset)}
                                                    className="text-[9px] font-bold text-slate-450 hover:text-emerald-600 bg-slate-50 hover:bg-emerald-50 px-2 py-0.5 rounded border border-slate-100 hover:border-emerald-100 transition-all leading-none"
                                                >
                                                    {preset.toFixed(2)}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            
                            {thresholdWarning && (
                                <div className="flex items-start gap-2 px-3.5 py-3 bg-amber-50 border border-amber-100 text-amber-700 rounded-2xl text-[10px] font-bold uppercase tracking-wide leading-relaxed">
                                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" /> 
                                    <span>Warning limit values look incorrect.</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}