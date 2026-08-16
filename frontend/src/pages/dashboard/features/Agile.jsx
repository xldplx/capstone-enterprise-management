/**
 * Agile — sprint board, burndown, velocity and product backlog.
 * Location: frontend/src/pages/dashboard/features/Agile.jsx
 *
 * Correction #3 implements Agile methodology over the existing schema rather
 * than beside it. No sprint, board column or story point is stored anywhere:
 * the backend derives them from tasks + daily_actuals + personnel, so this page
 * is a second view over the same rows CPM and EVM already read.
 *
 * Moving a card therefore writes progress, not board state:
 *   forward  — POST /daily-actuals, so the move lands in the ledger the
 *              burndown is drawn from (Project Manager, Site Engineer)
 *   backward — PUT /tasks/:id, behind a confirmation because it rewrites an
 *              EVM figure (Project Manager, Planner, Cost Engineer)
 *
 * Sprint length is a lens over the project window, not stored data, so it is
 * shown in the header rather than tucked into a settings menu — two users on
 * different cadences genuinely see different sprint boundaries.
 */
import { useState, useEffect, useCallback } from 'react';
import { KanbanSquare, Loader2, ChevronLeft, ChevronRight, Info, X } from 'lucide-react';
import { apiFetch, agileApi, tasksApi, dailyActualsApi } from '../../../utils/api';
import { useTranslation } from '../../../utils/i18n';
import { CARD_CLASS, INPUT_CLASS } from '../../../utils/uiConstants';
import { CADENCE_OPTIONS, COLUMN_TARGET_PCT, SPRINT_STATE_STYLES, formatShortDate } from '../../../utils/agileConstants';
import { load, save } from '../../../utils/localStore';
import EmptyState from '../../../components/EmptyState';
import ErrorState from '../../../components/ErrorState';
import SprintBoard from './agile/SprintBoard';
import BurndownChart from './agile/BurndownChart';
import SprintSummary from './agile/SprintSummary';
import ProductBacklog from './agile/ProductBacklog';

const CADENCE_KEY = 'epms.agile.cadence.v1';

// Routes that already accept a progress write, mirrored from server.js.
const CAN_REPORT_PROGRESS = ['Project Manager', 'Site Engineer'];
const CAN_CORRECT_PROGRESS = ['Project Manager', 'Planner', 'Cost Engineer'];

export default function Agile() {
    const { t } = useTranslation();

    const [projects, setProjects]                   = useState([]);
    const [selectedProjectId, setSelectedProjectId] = useState('');
    const [isLoadingProjects, setIsLoadingProjects] = useState(true);

    const [cadence, setCadence] = useState(() => load(CADENCE_KEY, 14));
    const [overview, setOverview]         = useState(null);
    const [sprintNumber, setSprintNumber] = useState(null);
    const [detail, setDetail]             = useState(null);

    const [isLoadingOverview, setIsLoadingOverview] = useState(false);
    const [isLoadingDetail, setIsLoadingDetail]     = useState(false);
    const [loadError, setLoadError]                 = useState('');

    const [busyTaskId, setBusyTaskId] = useState(null);
    const [moveError, setMoveError]   = useState('');
    const [moveNotice, setMoveNotice] = useState('');
    const [pctPrompt, setPctPrompt]   = useState(null); // { card, value }

    const userRole   = localStorage.getItem('userRole');
    const canReport  = CAN_REPORT_PROGRESS.includes(userRole);
    const canCorrect = CAN_CORRECT_PROGRESS.includes(userRole);
    const canMove    = canReport || canCorrect;

    useEffect(() => {
        setIsLoadingProjects(true);
        apiFetch('/projects')
            .then(response => setProjects(response.data || []))
            .catch(error => setLoadError(error.message))
            .finally(() => setIsLoadingProjects(false));
    }, []);

    useEffect(() => { save(CADENCE_KEY, cadence); }, [cadence]);

    const fetchOverview = useCallback(async () => {
        if (!selectedProjectId) { setOverview(null); return; }
        setIsLoadingOverview(true);
        setLoadError('');
        try {
            const response = await agileApi.getOverview(selectedProjectId, cadence);
            setOverview(response.data);
            // Follow the project to whichever sprint is live unless the user has
            // already stepped to one that still exists at this cadence.
            setSprintNumber(current => {
                const stillValid = current != null && response.data.sprints.some(sprint => sprint.number === current);
                return stillValid ? current : response.data.active_sprint;
            });
        } catch (error) {
            setLoadError(error.message);
            setOverview(null);
        } finally {
            setIsLoadingOverview(false);
        }
    }, [selectedProjectId, cadence]);

    useEffect(() => { fetchOverview(); }, [fetchOverview]);

    const fetchDetail = useCallback(async () => {
        if (!selectedProjectId || sprintNumber == null) { setDetail(null); return; }
        setIsLoadingDetail(true);
        try {
            const response = await agileApi.getSprintDetail(selectedProjectId, sprintNumber, cadence);
            setDetail(response.data);
        } catch (error) {
            setLoadError(error.message);
            setDetail(null);
        } finally {
            setIsLoadingDetail(false);
        }
    }, [selectedProjectId, sprintNumber, cadence]);

    useEffect(() => { fetchDetail(); }, [fetchDetail]);

    // ── Card movement ─────────────────────────────────────────────────────────

    // 'at_risk' is derived from an overdue planned_end, so recording progress on
    // an overdue task leaves the card exactly where it was. Say so — a card that
    // does not move after a successful write otherwise reads as a failure.
    const willStayAtRisk = (card, targetPct) => card.column === 'at_risk' && targetPct < 100;

    const applyMove = async (card, targetPct) => {
        if (targetPct === card.pct_complete) {
            setMoveNotice(willStayAtRisk(card, targetPct) ? t('agile.stillAtRisk') : '');
            return;
        }
        const isForward = targetPct > card.pct_complete;

        if (!isForward && !canCorrect) {
            setMoveError(t('agile.cannotCorrect'));
            return;
        }
        if (!isForward && !window.confirm(
            t('agile.confirmBackward').replace('{from}', card.pct_complete).replace('{to}', targetPct)
        )) return;

        setBusyTaskId(card.id);
        setMoveError('');
        try {
            if (isForward && canReport) {
                // Progress belongs in the ledger, which is what the burndown reads.
                // Hours and cost stay zero: this records completion, not effort.
                await dailyActualsApi.submit(selectedProjectId, new Date().toISOString().split('T')[0], [{
                    task_id:      card.id,
                    actual_hours: 0,
                    actual_cost:  0,
                    pct_complete: targetPct,
                }]);
            } else {
                // Backward corrections, and forward moves by a role that cannot
                // file daily actuals, go straight at the task. A running sprint's
                // burndown reconciles its latest point against pct_complete, so
                // the chart still ends on the truth even with no ledger row.
                await tasksApi.update(card.id, { pct_complete: targetPct });
            }
            await Promise.all([fetchOverview(), fetchDetail()]);
            setMoveNotice(willStayAtRisk(card, targetPct) ? t('agile.stillAtRisk') : '');
        } catch (error) {
            setMoveError(error.message || t('agile.moveFailed'));
        } finally {
            setBusyTaskId(null);
        }
    };

    const handleMove = (card, targetColumn) => {
        setMoveError('');
        setMoveNotice('');
        if (targetColumn === card.column) return;

        const targetPct = COLUMN_TARGET_PCT[targetColumn];
        if (targetPct === undefined) {
            // 'in_progress' has no single correct percentage — ask instead of
            // inventing one, because this number lands in EVM.
            setPctPrompt({ card, value: card.pct_complete > 0 && card.pct_complete < 100 ? card.pct_complete : 50 });
            return;
        }
        applyMove(card, targetPct);
    };

    const submitPctPrompt = (event) => {
        event.preventDefault();
        const { card, value } = pctPrompt;
        const pct = Number(value);
        if (!Number.isFinite(pct) || pct < 1 || pct > 99) return;
        setPctPrompt(null);
        applyMove(card, pct);
    };

    // ── Render ────────────────────────────────────────────────────────────────

    if (isLoadingProjects) return (
        <div className="h-[60vh] flex flex-col items-center justify-center gap-4 text-slate-400">
            <Loader2 className="w-10 h-10 animate-spin text-emerald-500" />
            <p className="font-bold uppercase tracking-[0.2em] text-xs">{t('common.loading')}</p>
        </div>
    );

    const sprints       = overview?.sprints || [];
    const currentSprint = sprints.find(sprint => sprint.number === sprintNumber);
    const sprintIndex   = sprints.findIndex(sprint => sprint.number === sprintNumber);

    return (
        <div className="space-y-10 pb-12">
            {/* CONTROLS */}
            <div className={`${CARD_CLASS} p-8`}>
                <div className="flex items-center gap-3 mb-8">
                    <div className="p-3 bg-slate-100 rounded-2xl text-slate-600 shadow-inner"><KanbanSquare className="w-5 h-5" /></div>
                    <div>
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">{t('agile.sprintConfig')}</h3>
                        <p className="text-xs text-slate-400 font-medium">{t('agile.sprintConfigHint')}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">{t('common.project')}</label>
                        <select
                            value={selectedProjectId}
                            onChange={event => { setSelectedProjectId(event.target.value); setSprintNumber(null); setDetail(null); }}
                            className={INPUT_CLASS}
                        >
                            <option value="">{t('daily.selectProjectPlaceholder')}</option>
                            {projects.map(project => (
                                <option key={project.id} value={project.id}>{project.project_code} — {project.project_name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">{t('agile.sprintLength')}</label>
                        <select value={cadence} onChange={event => setCadence(Number(event.target.value))} className={INPUT_CLASS}>
                            {CADENCE_OPTIONS.map(option => (
                                <option key={option} value={option}>{option} {t('agile.days')}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* The derivation is a design decision, not a hidden one. */}
                <div className="flex items-start gap-3 mt-6 p-4 rounded-2xl bg-slate-50/70 border border-slate-100 text-slate-500">
                    <Info className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
                    <p className="text-[11px] font-medium leading-relaxed">{t('agile.derivedNotice')}</p>
                </div>
            </div>

            {!selectedProjectId && (
                <div className={`${CARD_CLASS} p-4`}>
                    <EmptyState icon={KanbanSquare} title={t('agile.selectProject')} hint={t('agile.selectProjectHint')} />
                </div>
            )}

            {loadError && selectedProjectId && (
                <div className={`${CARD_CLASS} p-4`}>
                    <ErrorState message={loadError} onRetry={fetchOverview} />
                </div>
            )}

            {selectedProjectId && !loadError && isLoadingOverview && (
                <div className="h-60 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                </div>
            )}

            {selectedProjectId && !loadError && !isLoadingOverview && sprints.length === 0 && (
                <div className={`${CARD_CLASS} p-4`}>
                    <EmptyState icon={KanbanSquare} title={t('agile.noSprints')} hint={t('agile.noSprintsHint')} />
                </div>
            )}

            {selectedProjectId && !loadError && sprints.length > 0 && currentSprint && (
                <>
                    {/* SPRINT NAVIGATOR */}
                    <div className={`${CARD_CLASS} p-6`}>
                        <div className="flex items-center justify-between gap-4">
                            <button
                                onClick={() => setSprintNumber(sprints[sprintIndex - 1].number)}
                                disabled={sprintIndex <= 0}
                                className="p-2.5 rounded-xl border border-slate-200 text-slate-500 hover:text-emerald-600 hover:border-emerald-200 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                aria-label={t('agile.previousSprint')}
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>

                            <div className="text-center min-w-0">
                                <div className="flex items-center justify-center gap-2 flex-wrap">
                                    <h3 className="text-lg font-black text-slate-800 tracking-tight">
                                        {t('agile.sprint')} {currentSprint.number}
                                    </h3>
                                    <span className={`px-2 py-0.5 rounded-md border text-[9px] font-black uppercase tracking-wider ${SPRINT_STATE_STYLES[currentSprint.state]}`}>
                                        {t(`agile.state.${currentSprint.state}`)}
                                    </span>
                                </div>
                                <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-tight">
                                    {formatShortDate(currentSprint.start_date)} → {formatShortDate(currentSprint.end_date)}
                                    <span className="mx-2 text-slate-300">·</span>
                                    {currentSprint.days} {t('agile.days')}
                                    <span className="mx-2 text-slate-300">·</span>
                                    {sprintIndex + 1} {t('common.of')} {sprints.length}
                                </p>
                            </div>

                            <button
                                onClick={() => setSprintNumber(sprints[sprintIndex + 1].number)}
                                disabled={sprintIndex >= sprints.length - 1}
                                className="p-2.5 rounded-xl border border-slate-200 text-slate-500 hover:text-emerald-600 hover:border-emerald-200 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                aria-label={t('agile.nextSprint')}
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {moveError && (
                        <div role="alert" className="p-4 rounded-2xl bg-rose-50/80 border border-rose-100 text-rose-600 text-xs font-bold">
                            {moveError}
                        </div>
                    )}

                    {moveNotice && !moveError && (
                        <div role="status" className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50/80 border border-amber-100 text-amber-700">
                            <Info className="w-4 h-4 shrink-0 mt-0.5" />
                            <p className="text-xs font-bold leading-relaxed">{moveNotice}</p>
                        </div>
                    )}

                    {isLoadingDetail && !detail ? (
                        <div className="h-60 flex items-center justify-center">
                            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                        </div>
                    ) : detail && (
                        <>
                            <SprintSummary
                                metrics={detail.metrics}
                                capacity={detail.capacity}
                                velocity={overview.velocity}
                            />

                            <div className={`${CARD_CLASS} p-8`}>
                                <div className="flex items-center gap-3 mb-8">
                                    <div className="p-3 bg-slate-100 rounded-2xl text-slate-600 shadow-inner"><KanbanSquare className="w-5 h-5" /></div>
                                    <div>
                                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">{t('agile.board')}</h3>
                                        <p className="text-xs text-slate-400 font-medium">
                                            {canMove ? t('agile.boardHint') : t('agile.boardReadOnly')}
                                        </p>
                                    </div>
                                </div>
                                <SprintBoard
                                    columns={detail.columns}
                                    canMove={canMove}
                                    busyTaskId={busyTaskId}
                                    onMove={handleMove}
                                />
                            </div>

                            <BurndownChart
                                burndown={detail.burndown}
                                sprintName={`${t('agile.sprint')} ${currentSprint.number}`}
                            />
                        </>
                    )}

                    <ProductBacklog backlog={overview.backlog || []} />
                </>
            )}

            {/* PERCENT PROMPT — 'in_progress' has no single correct value. */}
            {pctPrompt && (
                <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-6">
                    <form onSubmit={submitPctPrompt} className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm p-8 animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-start justify-between gap-4 mb-6">
                            <div>
                                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">{t('agile.setProgress')}</h3>
                                <p className="text-xs text-slate-400 font-medium mt-1">{pctPrompt.card.task_name}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setPctPrompt(null)}
                                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors"
                                aria-label={t('common.close')}
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">
                            {t('daily.percentDone')}
                        </label>
                        <input
                            type="number" min="1" max="99" autoFocus
                            value={pctPrompt.value}
                            onChange={event => setPctPrompt(prompt => ({ ...prompt, value: event.target.value }))}
                            className={`${INPUT_CLASS} mt-2`}
                        />
                        <p className="text-[10px] font-medium text-slate-400 mt-3 leading-relaxed">
                            {t('agile.setProgressHint')}
                        </p>

                        <div className="flex gap-3 mt-6">
                            <button
                                type="button"
                                onClick={() => setPctPrompt(null)}
                                className="flex-1 py-3 rounded-2xl border border-slate-200 text-xs font-black uppercase tracking-wider text-slate-500 hover:bg-slate-50 transition-colors"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                type="submit"
                                className="flex-1 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider transition-colors"
                            >
                                {t('common.save')}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
