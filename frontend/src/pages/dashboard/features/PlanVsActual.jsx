import { useState, useMemo, useEffect } from 'react';
import { BarChart3, Download, CheckCircle2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { computeEvm, computeAlerts, indexColor, varianceColor, formatCurrency } from '../../../utils/evmHelpers';
import { INPUT_CLASS } from '../../../utils/uiConstants';
import { apiFetch } from '../../../utils/api';
import { useTranslation } from '../../../utils/i18n';

export default function PlanVsActual() {
    const { t } = useTranslation();
    const [selectedProjectId, setSelectedProjectId] = useState('');
    const [exportFeedback, setExportFeedback]       = useState(false);
    const [projects, setProjects] = useState([]);
    const [tasks, setTasks]       = useState([]);

    useEffect(() => { apiFetch('/projects').then(r => setProjects(r.data || [])).catch(console.error); }, []);
    useEffect(() => {
        if (!selectedProjectId) { setTasks([]); return; }
        apiFetch(`/projects/${selectedProjectId}/tasks`).then(r => setTasks(r.data || [])).catch(console.error);
    }, [selectedProjectId]);

    const selectedProject = projects.find(p => p.id === parseInt(selectedProjectId));

    const { evm, kpiCards, refValues, forecastValues } = useMemo(() => {
        const e = computeEvm(tasks, selectedProject?.schedule_pct || 0);
        const { BAC, EV, AC, PV, CPI, SPI, CV, SV, EAC, ETC, VAC, TCPI } = e;
        const cpiC = indexColor(CPI), spiC = indexColor(SPI);
        const cvC = varianceColor(CV), svC = varianceColor(SV);
        const tcpiC = indexColor(TCPI);
        const vacC = VAC !== null ? varianceColor(VAC) : null;
        return {
            evm: e,
            kpiCards: [
                { label: 'CPI', subtitle: CV >= 0 ? t('pva.underBudget') : t('pva.overBudget'), value: CPI !== null ? CPI.toFixed(2) : '—', color: cpiC },
                { label: 'SPI', subtitle: SV >= 0 ? t('pva.aheadSchedule') : t('pva.behindSchedule'), value: SPI !== null ? SPI.toFixed(2) : '—', color: spiC },
                { label: 'CV', subtitle: CV >= 0 ? t('pva.underBudget') : t('pva.overBudget'), value: formatCurrency(CV), color: cvC },
                { label: 'SV', subtitle: SV >= 0 ? t('pva.aheadSchedule') : t('pva.behindSchedule'), value: formatCurrency(SV), color: svC },
            ],
            refValues: [
                { label: 'PV', value: formatCurrency(PV) },
                { label: 'EV', value: formatCurrency(EV) },
                { label: 'AC', value: formatCurrency(AC) },
                { label: 'BAC', value: formatCurrency(BAC) },
            ],
            forecastValues: [
                { label: 'EAC', value: EAC !== null ? formatCurrency(EAC) : '—', textClass: 'text-slate-800' },
                { label: 'ETC', value: ETC !== null ? formatCurrency(ETC) : '—', textClass: 'text-slate-800' },
                { label: 'VAC', value: VAC !== null ? formatCurrency(VAC) : '—', textClass: vacC ? vacC.text : 'text-slate-800' },
                { label: 'TCPI', value: TCPI !== null ? TCPI.toFixed(2) : '—', textClass: tcpiC.text },
            ],
        };
    }, [tasks, selectedProject?.schedule_pct, t]);

    const { BAC, EV, AC, PV, CPI, SPI, CV, SV, EAC, ETC, VAC, TCPI, overallPct, totalHoursVariance: totalHV } = evm;

    const numericIDR = (v) => Number(v) || 0;

    const handleExport = () => {
        if (!selectedProject) return;
        const wb = XLSX.utils.book_new();
        const kpiData = [
            { Metric: 'CPI', Value: CPI !== null ? CPI.toFixed(2) : 'N/A', Status: indexColor(CPI).label },
            { Metric: 'SPI', Value: SPI !== null ? SPI.toFixed(2) : 'N/A', Status: indexColor(SPI).label },
            { Metric: 'CV (IDR)',  Value: numericIDR(CV),  Status: varianceColor(CV).label },
            { Metric: 'SV (IDR)',  Value: numericIDR(SV),  Status: varianceColor(SV).label },
            { Metric: 'BAC (IDR)', Value: numericIDR(BAC), Status: '' },
            { Metric: 'EV (IDR)',  Value: numericIDR(EV),  Status: '' },
            { Metric: 'AC (IDR)',  Value: numericIDR(AC),  Status: '' },
            { Metric: 'PV (IDR)',  Value: numericIDR(PV),  Status: '' },
            { Metric: 'EAC (IDR)', Value: EAC !== null ? numericIDR(Math.round(EAC)) : 'N/A', Status: '' },
            { Metric: 'ETC (IDR)', Value: ETC !== null ? numericIDR(Math.round(ETC)) : 'N/A', Status: '' },
            { Metric: 'VAC (IDR)', Value: VAC !== null ? numericIDR(Math.round(VAC)) : 'N/A', Status: VAC !== null ? varianceColor(VAC).label : '' },
            { Metric: 'TCPI', Value: TCPI !== null ? TCPI.toFixed(2) : 'N/A', Status: TCPI !== null ? indexColor(TCPI).label : '' },
        ];
        const ws1 = XLSX.utils.json_to_sheet(kpiData);
        ws1['!cols'] = [{ wch: 38 }, { wch: 28 }, { wch: 14 }];
        XLSX.utils.book_append_sheet(wb, ws1, 'KPI Summary');
        const taskRows = tasks.map(t => {
            const taskEV = parseFloat(t.planned_cost) * (parseFloat(t.pct_complete) / 100);
            const earnedHrs = Math.round((parseFloat(t.planned_hours) || 0) * (parseFloat(t.pct_complete) / 100));
            return {
                'Task Name': t.task_name, 'WBS': t.wbs_code,
                'Planned Cost (IDR)': numericIDR(t.planned_cost), 'Actual Cost (IDR)': numericIDR(t.actual_cost),
                'Cost Variance (IDR)': numericIDR(taskEV - parseFloat(t.actual_cost)),
                'Planned Hours': t.planned_hours, 'Actual Hours': t.actual_hours,
                'Hours Variance': parseFloat(t.actual_hours) > 0 ? earnedHrs - parseFloat(t.actual_hours) : 0,
                '% Complete': `${t.pct_complete}%`,
            };
        });
        const ws2 = XLSX.utils.json_to_sheet(taskRows);
        XLSX.utils.book_append_sheet(wb, ws2, 'Task Details');
        const projectAlerts = computeAlerts([selectedProject], tasks, { cpi_amber: 1.00, cpi_red: 0.90, spi_amber: 1.00, spi_red: 0.90 });
        const alertRows = projectAlerts.length > 0
            ? projectAlerts.map(a => ({ Metric: a.metric, Value: a.value.toFixed(2), Threshold: a.threshold.toFixed(2), Severity: a.severity === 'critical' ? 'CRITICAL' : 'WARNING', Recommendation: a.recommendation }))
            : [{ Metric: '-', Value: '-', Threshold: '-', Severity: 'No Alerts', Recommendation: 'All metrics are within configured thresholds.' }];
        const ws3 = XLSX.utils.json_to_sheet(alertRows);
        XLSX.utils.book_append_sheet(wb, ws3, 'Alerts');
        XLSX.writeFile(wb, `EVM_Report_${selectedProject.project_code}_${new Date().toISOString().slice(0, 10)}.xlsx`);
        setExportFeedback(true);
        setTimeout(() => setExportFeedback(false), 2500);
    };

    return (
        <div className="space-y-8">
            {/* ACTIONS */}
            {selectedProject && (
                <div className="flex justify-end mb-6">
                    <button onClick={handleExport}
                        className="text-sm font-semibold px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 border shadow-sm text-emerald-600 bg-emerald-50 border-emerald-100 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 hover:shadow-lg hover:shadow-emerald-200 hover:-translate-y-0.5">
                        <Download className="w-4 h-4" /> {t('pva.exportExcel')}
                    </button>
                </div>
            )}

            {exportFeedback && (
                <div className="fixed top-6 right-6 z-50 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-lg shadow-emerald-200 flex items-center gap-2 text-sm font-semibold animate-in slide-in-from-top-2 fade-in duration-200">
                    <CheckCircle2 className="w-4 h-4" /> {t('pva.exportedSuccess')}
                </div>
            )}

            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-5">{t('pva.selectProject')}</h3>
                <div className="max-w-md space-y-1">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">{t('common.project')}</label>
                    <select value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)} className={INPUT_CLASS}>
                        <option value="">{t('pva.selectPlaceholder')}</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.project_code} — {p.project_name}</option>)}
                    </select>
                </div>
            </div>

            {!selectedProject && (
                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-16 text-center">
                    <p className="text-slate-400 text-sm">{t('pva.emptyState')}</p>
                </div>
            )}

            {selectedProject && (
                <>
                    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-bold text-slate-700">{t('pva.physicalProgress')}</h3>
                            <span className="text-2xl font-bold text-emerald-600">{overallPct.toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                            <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(overallPct, 100)}%` }} />
                        </div>
                        <div className="flex justify-between text-[10px] font-black uppercase text-slate-400 tracking-wider mt-2.5">
                            <span>EV: {formatCurrency(EV)}</span>
                            <span>BAC: {formatCurrency(BAC)}</span>
                        </div>
                    </div>

                    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            {kpiCards.map(card => (
                                <div key={card.label} className={`rounded-2xl border p-5 ${card.color.bg} ${card.color.border}`}>
                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">{card.label}</p>
                                    <p className={`text-2xl font-bold ${card.color.text} mt-1 whitespace-nowrap`}>{card.value}</p>
                                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">{card.subtitle}</p>
                                    <span className={`mt-3 inline-block text-[10px] font-bold uppercase px-2.5 py-1 rounded-lg border ${card.color.bg} ${card.color.border} ${card.color.text}`}>{card.color.label}</span>
                                </div>
                            ))}
                        </div>
                        <div className="border-t border-slate-100 pt-5">
                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">{t('pva.refForecast')}</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
                                {[...refValues, ...forecastValues].map(item => (
                                    <div key={item.label} className="min-w-0">
                                        <p className="text-[10px] text-slate-400 font-semibold truncate">{item.label}</p>
                                        <p className={`font-bold text-sm mt-0.5 ${item.textClass || 'text-slate-800'}`}>{item.value}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                        <div className="p-6 border-b border-slate-50 flex items-center gap-3">
                            <div className="p-2.5 bg-slate-50 rounded-xl text-slate-500"><BarChart3 className="w-5 h-5" /></div>
                            <div>
                                <h3 className="font-bold text-slate-700">{t('pva.taskComparison')}</h3>
                                <p className="text-xs text-slate-400 mt-0.5">{selectedProject.project_name}</p>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50/80 text-xs uppercase tracking-wider text-slate-500 font-bold">
                                        <th className="px-4 py-4">{t('common.name')}</th>
                                        <th className="px-4 py-4">WBS</th>
                                        <th className="px-4 py-4">{t('pva.plannedCost')}</th>
                                        <th className="px-4 py-4">{t('pva.actualCost')}</th>
                                        <th className="px-4 py-4">{t('pva.costVariance')}</th>
                                        <th className="px-4 py-4">{t('pva.plannedHrs')}</th>
                                        <th className="px-4 py-4">{t('pva.actualHrs')}</th>
                                        <th className="px-4 py-4">{t('pva.hrsVariance')}</th>
                                        <th className="px-4 py-4">{t('pva.complete')}</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm font-medium text-slate-600 divide-y divide-slate-50">
                                    {tasks.map(task => {
                                        const taskEV = parseFloat(task.planned_cost) * (parseFloat(task.pct_complete) / 100);
                                        const taskCV = taskEV - parseFloat(task.actual_cost);
                                        const taskCVColor = varianceColor(taskCV);
                                        const earnedHours = Math.round(parseFloat(task.planned_hours) * (parseFloat(task.pct_complete) / 100));
                                        const taskHV = parseFloat(task.actual_hours) > 0 ? earnedHours - parseFloat(task.actual_hours) : null;
                                        const taskHVColor = taskHV !== null ? varianceColor(taskHV) : null;
                                        const rowBg = taskCV < 0 ? 'bg-red-50/60' : parseFloat(task.pct_complete) === 100 ? 'bg-emerald-50/50' : parseFloat(task.pct_complete) === 0 ? 'bg-slate-50/60' : '';
                                        return (
                                            <tr key={task.id} className={`${rowBg} transition-colors`}>
                                                <td className="px-6 py-4.5 font-extrabold text-slate-800">{task.task_name}</td>
                                                <td className="px-6 py-4.5 font-mono text-xs text-slate-400">{task.wbs_code}</td>
                                                <td className="px-6 py-4.5 text-slate-500">{formatCurrency(task.planned_cost)}</td>
                                                <td className="px-6 py-4.5 text-slate-500">{formatCurrency(task.actual_cost)}</td>
                                                <td className={`px-6 py-4.5 font-bold whitespace-nowrap ${taskCVColor.text}`}>{formatCurrency(taskCV)}</td>
                                                <td className="px-6 py-4.5 text-slate-500">{task.planned_hours}</td>
                                                <td className="px-6 py-4.5 text-slate-500">{task.actual_hours}</td>
                                                <td className={`px-6 py-4.5 font-bold ${taskHVColor ? taskHVColor.text : 'text-slate-400'}`}>
                                                    {taskHV !== null ? (taskHV >= 0 ? `+${taskHV}` : taskHV) : '—'}
                                                </td>
                                                <td className="px-6 py-4.5 text-right">
                                                    <div className="flex items-center gap-2 justify-end">
                                                        <div className="w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                                            <div className="h-full bg-emerald-500" style={{ width: `${task.pct_complete}%` }} />
                                                        </div>
                                                        <span className="text-xs font-bold text-slate-500 shrink-0">{task.pct_complete}%</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-slate-50/50 text-sm font-bold text-slate-700 border-t border-slate-100">
                                        <td className="px-4 py-3.5" colSpan="2">{t('common.total')}</td>
                                        <td className="px-4 py-3.5">{formatCurrency(BAC)}</td>
                                        <td className="px-4 py-3.5">{formatCurrency(AC)}</td>
                                        <td className={`px-4 py-3.5 font-bold whitespace-nowrap ${varianceColor(CV).text}`}>{formatCurrency(CV)}</td>
                                        <td className="px-4 py-3.5">{tasks.reduce((s, t) => s + parseFloat(t.planned_hours || 0), 0)}</td>
                                        <td className="px-4 py-3.5">{tasks.reduce((s, t) => s + parseFloat(t.actual_hours || 0), 0)}</td>
                                        <td className={`px-4 py-3.5 font-bold ${varianceColor(totalHV).text}`}>{totalHV >= 0 ? `+${totalHV}` : totalHV}</td>
                                        <td className="px-4 py-3.5" />
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
