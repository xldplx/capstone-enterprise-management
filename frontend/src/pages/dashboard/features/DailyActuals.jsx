import { useState, useEffect, useRef } from 'react';
import { ClipboardList, CheckCircle2, Camera, X, Loader2 } from 'lucide-react';
import { formatCurrency, formatDate } from '../../../utils/evmHelpers';
import { INPUT_CLASS, INLINE_INPUT_CLASS, CARD_CLASS } from '../../../utils/uiConstants';
import { apiFetch } from '../../../utils/api';
import { useTranslation } from '../../../utils/i18n';
import CurrencyInput from '../../../components/CurrencyInput';
import { parseGroupedWholeNumber } from '../../../utils/numberFormat';

export default function DailyActuals() {
    const { t } = useTranslation();
    const [selectedProjectId, setSelectedProjectId] = useState('');
    const [entryDate, setEntryDate]                 = useState('');
    const [actuals, setActuals]                     = useState({});
    const [submittedEntries, setSubmittedEntries]   = useState([]);
    const [isSubmitted, setIsSubmitted]             = useState(false);
    const [isUploading, setIsUploading]             = useState({});
    const [isLoadingProjects, setIsLoadingProjects] = useState(true);
    const [isSubmitting, setIsSubmitting]           = useState(false);
    const [submitError, setSubmitError]             = useState('');
    const [projects, setProjects]                   = useState([]);
    const [projectTasks, setProjectTasks]           = useState([]);
    const fileInputRefs = useRef({});

    const userRole  = localStorage.getItem('userRole');
    const canSubmit = ['Project Manager', 'Site Engineer'].includes(userRole);

    useEffect(() => {
        setIsLoadingProjects(true);
        apiFetch('/projects').then(r => setProjects(r.data || [])).catch(console.error).finally(() => setIsLoadingProjects(false));
    }, []);

    useEffect(() => {
        if (!selectedProjectId) { setProjectTasks([]); return; }
        apiFetch(`/projects/${selectedProjectId}/tasks`).then(r => setProjectTasks(r.data || [])).catch(console.error);
    }, [selectedProjectId]);

    const selectedProject = projects.find(p => p.id === parseInt(selectedProjectId));
    const isReady = selectedProjectId && entryDate;

    const updateActual = (taskId, field, value) => {
        if (field === 'photo') { setActuals(prev => ({ ...prev, [taskId]: { ...prev[taskId], [field]: value } })); return; }
        let v = field === 'actual_cost' ? parseGroupedWholeNumber(value) : parseFloat(value);
        if (isNaN(v) || v < 0) v = 0;
        if (field === 'pct_complete' && v > 100) v = 100;
        setActuals(prev => ({ ...prev, [taskId]: { ...prev[taskId], [field]: v } }));
    };

    const handleFileChange = async (taskId, file) => {
        if (!file) return;
        setIsUploading(prev => ({ ...prev, [taskId]: true }));
        const previewUrl = URL.createObjectURL(file);
        setTimeout(() => {
            updateActual(taskId, 'photo', { file, url: previewUrl });
            setIsUploading(prev => ({ ...prev, [taskId]: false }));
        }, 1000);
    };

    const hasAnyActuals = projectTasks.some(t =>
        actuals[t.id]?.actual_hours > 0 || actuals[t.id]?.actual_cost > 0 ||
        actuals[t.id]?.pct_complete > 0 || actuals[t.id]?.photo
    );

    const totalActualHours = projectTasks.reduce((s, t) => s + (parseFloat(actuals[t.id]?.actual_hours) || 0), 0);
    const totalActualCost  = projectTasks.reduce((s, t) => s + (parseFloat(actuals[t.id]?.actual_cost)  || 0), 0);

    const handleSubmit = async () => {
        if (!selectedProjectId || !entryDate) { setSubmitError(t('daily.selectProject') + ' and date.'); return; }
        setSubmitError('');

        const entries = projectTasks
            .filter(tk => actuals[tk.id]?.actual_hours > 0 || actuals[tk.id]?.actual_cost > 0 || actuals[tk.id]?.pct_complete > 0 || actuals[tk.id]?.photo)
            .map(tk => ({
                task_id:      tk.id,
                actual_hours: actuals[tk.id]?.actual_hours || 0,
                actual_cost:  actuals[tk.id]?.actual_cost  || 0,
                pct_complete: actuals[tk.id]?.pct_complete || 0,
                photo_url:    actuals[tk.id]?.photo?.url   || null,
            }));

        // Simpan info project SEBELUM state di-reset
        const submittedProjectName = selectedProject?.project_name || '';
        const submittedProjectCode = selectedProject?.project_code || '';
        const submittedDate        = entryDate;

        setIsSubmitting(true);
        try {
            await apiFetch(`/projects/${selectedProjectId}/daily-actuals`, {
                method: 'POST',
                body: JSON.stringify({ entry_date: submittedDate, entries }),
            });

            // Tambah ke session log dengan data yang sudah disimpan
            const newEntry = {
                id:           Date.now(),
                project_name: submittedProjectName,
                project_code: submittedProjectCode,
                date:         submittedDate,
                task_count:   entries.length,
            };
            setSubmittedEntries(prev => [newEntry, ...prev]);
            setIsSubmitted(true);

            // Reset form tapi JANGAN reset selectedProjectId agar log tetap terlihat
            setActuals({});
            setEntryDate('');
            setTimeout(() => setIsSubmitted(false), 3000);
        } catch (e) { setSubmitError(e.message || 'Failed to submit.');
        } finally { setIsSubmitting(false); }
    };

    if (isLoadingProjects) return (
        <div className="h-[60vh] flex flex-col items-center justify-center gap-4 text-slate-400">
            <Loader2 className="w-10 h-10 animate-spin text-emerald-500" />
            <p className="font-bold uppercase tracking-[0.2em] text-xs">{t('daily.loadingProjects')}</p>
        </div>
    );

    return (
        <div className="space-y-10 pb-12">
            {isSubmitted && (
                <div className="fixed top-6 right-6 z-50 bg-emerald-600 text-white px-6 py-4 rounded-[1.25rem] shadow-2xl shadow-emerald-200/50 flex items-center gap-3 text-sm font-bold animate-in slide-in-from-top-4 fade-in duration-300">
                    <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center"><CheckCircle2 className="w-4 h-4" /></div>
                    {t('daily.submitted')}
                </div>
            )}


            {/* CONTROLS */}
            <div className={`${CARD_CLASS} p-8`}>
                <div className="flex items-center gap-3 mb-8">
                    <div className="p-3 bg-slate-100 rounded-2xl text-slate-600 shadow-inner"><ClipboardList className="w-5 h-5" /></div>
                    <div>
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">{t('daily.entryConfig')}</h3>
                        <p className="text-xs text-slate-400 font-medium">{t('daily.selectProject')}</p>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">{t('common.project')}</label>
                        <select value={selectedProjectId} onChange={e => { setSelectedProjectId(e.target.value); setActuals({}); }} className={INPUT_CLASS}>
                            <option value="">{t('daily.selectProjectPlaceholder')}</option>
                            {projects.map(p => <option key={p.id} value={p.id}>{p.project_code} — {p.project_name}</option>)}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">{t('daily.reportingDate')}</label>
                        <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)}
                            max={new Date().toISOString().split('T')[0]} className={INPUT_CLASS} />
                    </div>
                </div>
            </div>

            {/* TASKS TABLE */}
            {isReady && (
                <div className={`${CARD_CLASS} animate-in fade-in slide-in-from-bottom-4 duration-500`}>
                    <div className="p-8 border-b border-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-slate-50/30">
                        <div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 px-2 py-0.5 bg-emerald-50 rounded-md border border-emerald-100">{t('daily.projectSession')}</span>
                            <h3 className="text-xl font-black text-slate-800 tracking-tight mt-1">{selectedProject?.project_name}</h3>
                            <p className="text-sm text-slate-400 font-bold mt-0.5 uppercase tracking-tighter">{formatDate(entryDate)} — {selectedProject?.project_code}</p>
                        </div>
                        {canSubmit && (
                            <div className="flex flex-col items-stretch gap-2 shrink-0">
                                <button onClick={handleSubmit} disabled={!hasAnyActuals || isSubmitting}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-4 rounded-[1.25rem] font-black text-sm shadow-xl shadow-emerald-200/50 transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed">
                                    {isSubmitting
                                        ? <><Loader2 className="w-5 h-5 animate-spin" /> {t('daily.submitting')}</>
                                        : <><CheckCircle2 className="w-5 h-5" /> {hasAnyActuals ? t('daily.submitRecords') : t('daily.enterDataFirst')}</>}
                                </button>
                                {submitError && <div id="daily-actual-error" role="alert" className="p-3 rounded-lg bg-red-50/80 border border-red-100 text-red-600 text-xs text-center font-bold uppercase">{submitError}</div>}
                            </div>
                        )}
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50/50 text-[10px] uppercase tracking-[0.2em] text-slate-400 font-black">
                                    <th className="px-8 py-5">{t('daily.taskDetails')}</th>
                                    <th className="px-6 py-5">{t('daily.budgetRef')}</th>
                                    <th className="px-6 py-5 text-emerald-600">{t('daily.actualHours')}</th>
                                    <th className="px-6 py-5 text-emerald-600">{t('daily.actualCost')} (IDR)</th>
                                    <th className="px-6 py-5 text-emerald-600">{t('daily.percentDone')}</th>
                                    <th className="px-8 py-5 text-emerald-600">{t('daily.evidence')}</th>
                                </tr>
                            </thead>
                            <tbody className="text-sm font-medium text-slate-600 divide-y divide-slate-50">
                                {projectTasks.map(task => (
                                    <tr key={task.id} className="hover:bg-emerald-50/30 transition-all duration-200">
                                        <td className="px-8 py-6">
                                            <p className="font-black text-slate-800 tracking-tight">{task.task_name}</p>
                                            <p className="font-mono text-[10px] text-slate-400 mt-1 uppercase tracking-widest">{task.wbs_code}</p>
                                        </td>
                                        <td className="px-6 py-6">
                                            <div className="space-y-1">
                                                <p className="text-xs font-bold text-slate-400 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-slate-200" />{formatCurrency(task.planned_cost)}</p>
                                                <p className="text-xs font-bold text-slate-400 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-slate-200" />{task.planned_hours} hrs</p>
                                            </div>
                                        </td>
                                        <td className="px-6 py-6 w-32">
                                            <input type="number" min="0" value={actuals[task.id]?.actual_hours || ''}
                                                onChange={e => updateActual(task.id, 'actual_hours', e.target.value)}
                                                placeholder="0" className={INLINE_INPUT_CLASS} />
                                        </td>
                                        <td className="px-6 py-6 w-48">
                                            <CurrencyInput value={actuals[task.id]?.actual_cost || ''}
                                                onChange={value => updateActual(task.id, 'actual_cost', value)}
                                                onRejectedInput={setSubmitError}
                                                placeholder="0" aria-label={`${task.task_name} actual cost in IDR`}
                                                aria-describedby={submitError ? 'daily-actual-error' : undefined}
                                                aria-invalid={Boolean(submitError)}
                                                className={INLINE_INPUT_CLASS} />
                                        </td>
                                        <td className="px-6 py-6 w-32">
                                            <div className="flex items-center gap-2">
                                                <input type="number" min="0" max="100" value={actuals[task.id]?.pct_complete || ''}
                                                    onChange={e => updateActual(task.id, 'pct_complete', e.target.value)}
                                                    placeholder="0" className={INLINE_INPUT_CLASS} />
                                                <span className="text-slate-400 text-[10px] font-black uppercase tracking-tighter shrink-0">%</span>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6 w-48">
                                            {actuals[task.id]?.photo ? (
                                                <div className="relative group/img w-16 h-12 rounded-xl overflow-hidden shadow-sm border border-slate-200">
                                                    <img src={actuals[task.id].photo.url} className="w-full h-full object-cover" alt="evidence" />
                                                    <button onClick={() => updateActual(task.id, 'photo', null)}
                                                        className="absolute inset-0 bg-red-600/80 text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity">
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <button onClick={() => fileInputRefs.current[task.id]?.click()} disabled={isUploading[task.id]}
                                                    className="w-12 h-12 rounded-xl border-2 border-dashed border-slate-200 text-slate-300 hover:border-emerald-500 hover:text-emerald-500 hover:bg-emerald-50 transition-all flex items-center justify-center disabled:opacity-50">
                                                    {isUploading[task.id] ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
                                                </button>
                                            )}
                                            <input type="file" accept="image/*" className="hidden"
                                                ref={el => fileInputRefs.current[task.id] = el}
                                                onChange={e => handleFileChange(task.id, e.target.files[0])} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="bg-slate-50/50 text-sm font-black text-slate-800 border-t border-slate-100">
                                    <td className="px-8 py-6" colSpan="2">{t('daily.aggregateTotals')}</td>
                                    <td className="px-6 py-6 text-emerald-700 font-black">{totalActualHours > 0 ? `${totalActualHours} hrs` : '—'}</td>
                                    <td className="px-6 py-6 text-emerald-700 font-black">{totalActualCost > 0 ? formatCurrency(totalActualCost) : '—'}</td>
                                    <td className="px-6 py-6" colSpan="2" />
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}

            {/* SESSION LOG */}
            <div className={`${CARD_CLASS} p-8`}>
                <div className="flex items-center gap-3 mb-8">
                    <div className="p-3 bg-slate-100 rounded-2xl text-slate-600 shadow-inner"><ClipboardList className="w-5 h-5" /></div>
                    <div>
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">{t('daily.sessionLog')}</h3>
                        <p className="text-xs text-slate-400 font-medium">{t('daily.recentSubmissions')}</p>
                    </div>
                </div>
                {submittedEntries.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {submittedEntries.map(entry => (
                            <div key={entry.id} className="flex items-center justify-between p-5 bg-slate-50/50 border border-slate-100 rounded-2xl hover:bg-white hover:shadow-sm transition-all duration-300">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm text-emerald-600">
                                        <ClipboardList className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-black text-slate-800">{entry.project_name}</p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="font-mono text-[10px] text-slate-400 uppercase tracking-widest">{entry.project_code}</span>
                                            <span className="w-1 h-1 rounded-full bg-slate-300" />
                                            <span className="text-[10px] font-bold text-slate-500">{entry.task_count} {t('daily.tasksRecorded')}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{formatDate(entry.date)}</p>
                                    <div className="flex items-center gap-1.5 justify-end mt-1 text-emerald-600">
                                        <CheckCircle2 className="w-3 h-3" />
                                        <span className="text-[10px] font-black uppercase tracking-tighter">{t('daily.synced')}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-slate-100 rounded-[2rem]">
                        <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 mb-3"><ClipboardList className="w-6 h-6" /></div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">{t('daily.noRecords')}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
