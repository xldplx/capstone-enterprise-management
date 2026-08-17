/**
 * Agile — sprint board, planning, burndown, velocity and product backlog.
 * Location: frontend/src/pages/dashboard/features/Agile.jsx
 *
 * Correction #3 implements Agile over the existing plan rather than beside it.
 * WBS and sprints are orthogonal axes on the same task row: the WBS answers
 * "what" and a sprint answers "when we commit to it". Nothing here duplicates a
 * task, and nothing here edits the plan — dates, cost, hours and weight stay on
 * Project Detail, where the baseline lock applies.
 *
 * The full cycle lives on this page: plan a sprint from the WBS-grouped backlog,
 * work the board, watch it burn down, close it and roll unfinished stories
 * forward.
 */
import { useState, useEffect, useCallback } from 'react';
import {
    KanbanSquare, Loader2, Plus, Play, CheckCircle2, Pencil, Info, Target,
} from 'lucide-react';
import { apiFetch, agileApi, sprintsApi, projectsApi } from '../../../utils/api';
import { useTranslation } from '../../../utils/i18n';
import { CARD_CLASS, INPUT_CLASS } from '../../../utils/uiConstants';
import { SPRINT_STATE_STYLES, formatShortDate } from '../../../utils/agileConstants';
import EmptyState from '../../../components/EmptyState';
import ErrorState from '../../../components/ErrorState';
import SprintBoard from './agile/SprintBoard';
import SprintDialog from './agile/SprintDialog';
import StoryDialog from './agile/StoryDialog';
import BurndownChart from './agile/BurndownChart';
import SprintSummary from './agile/SprintSummary';
import ProductBacklog from './agile/ProductBacklog';
import TeamAgreements from './agile/TeamAgreements';

// Mirrors the route authorization in server.js.
const CAN_PLAN_SPRINTS = ['Project Manager', 'Planner'];
const CAN_MOVE_CARDS   = ['Project Manager', 'Planner', 'Cost Engineer', 'Site Engineer'];

export default function Agile() {
    const { t } = useTranslation();

    const [projects, setProjects]                   = useState([]);
    const [selectedProjectId, setSelectedProjectId] = useState('');
    const [isLoadingProjects, setIsLoadingProjects] = useState(true);

    const [overview, setOverview]   = useState(null);
    const [sprintId, setSprintId]   = useState(null);
    const [detail, setDetail]       = useState(null);

    const [isLoadingOverview, setIsLoadingOverview] = useState(false);
    const [isLoadingDetail, setIsLoadingDetail]     = useState(false);
    const [loadError, setLoadError]                 = useState('');
    const [actionError, setActionError]             = useState('');

    const [busyTaskId, setBusyTaskId]       = useState(null);
    const [isCommitting, setIsCommitting]   = useState(false);
    const [sprintDialog, setSprintDialog]   = useState(null); // null | {} | sprint
    const [storyDialog, setStoryDialog]     = useState(null);

    const userRole = localStorage.getItem('userRole');
    const canPlan  = CAN_PLAN_SPRINTS.includes(userRole);
    const canMove  = CAN_MOVE_CARDS.includes(userRole);

    useEffect(() => {
        setIsLoadingProjects(true);
        apiFetch('/projects')
            .then(response => setProjects(response.data || []))
            .catch(error => setLoadError(error.message))
            .finally(() => setIsLoadingProjects(false));
    }, []);

    const fetchOverview = useCallback(async () => {
        if (!selectedProjectId) { setOverview(null); return; }
        setIsLoadingOverview(true);
        setLoadError('');
        try {
            const response = await agileApi.getOverview(selectedProjectId);
            setOverview(response.data);
            // Follow the project to its live sprint unless the user has already
            // stepped to one that still exists.
            setSprintId(current => {
                const stillValid = current != null && response.data.sprints.some(sprint => sprint.id === current);
                return stillValid ? current : response.data.active_sprint;
            });
        } catch (error) {
            setLoadError(error.message);
            setOverview(null);
        } finally {
            setIsLoadingOverview(false);
        }
    }, [selectedProjectId]);

    useEffect(() => { fetchOverview(); }, [fetchOverview]);

    const fetchDetail = useCallback(async () => {
        if (!selectedProjectId || sprintId == null) { setDetail(null); return; }
        setIsLoadingDetail(true);
        try {
            const response = await agileApi.getSprintDetail(selectedProjectId, sprintId);
            setDetail(response.data);
        } catch (error) {
            setLoadError(error.message);
            setDetail(null);
        } finally {
            setIsLoadingDetail(false);
        }
    }, [selectedProjectId, sprintId]);

    useEffect(() => { fetchDetail(); }, [fetchDetail]);

    const refresh = () => Promise.all([fetchOverview(), fetchDetail()]);

    // ── Actions ───────────────────────────────────────────────────────────────

    const runAction = async (work, { taskId = null } = {}) => {
        setActionError('');
        if (taskId) setBusyTaskId(taskId);
        try {
            await work();
            await refresh();
        } catch (error) {
            setActionError(error.message || t('agile.errActionFailed'));
            throw error;
        } finally {
            if (taskId) setBusyTaskId(null);
        }
    };

    const moveCard = (card, boardStatus) => {
        // Blocked needs a reason, so route that through the dialog instead of
        // firing a request the API would correctly refuse.
        if (boardStatus === 'blocked' && !card.blocked_reason) {
            setStoryDialog({ ...card, board_status: 'blocked' });
            return;
        }
        runAction(() => agileApi.updateAgile(card.id, { board_status: boardStatus }), { taskId: card.id })
            .catch(() => {});
    };

    const saveSprint = async (payload) => {
        if (sprintDialog?.id) {
            await runAction(() => sprintsApi.update(sprintDialog.id, payload));
        } else {
            const created = await sprintsApi.create(selectedProjectId, payload);
            setSprintId(created.data.id);
            await refresh();
        }
        setSprintDialog(null);
    };

    const saveStory = async (payload) => {
        await runAction(() => agileApi.updateAgile(storyDialog.id, payload), { taskId: storyDialog.id });
        setStoryDialog(null);
    };

    const removeFromSprint = async () => {
        await runAction(() => agileApi.updateAgile(storyDialog.id, { sprint_id: null }), { taskId: storyDialog.id });
        setStoryDialog(null);
    };

    // Product Goal and Definition of Done live on the project, so this reuses the
    // existing project endpoint rather than adding an agile-specific one.
    const saveAgreements = async (payload) => {
        await runAction(() => projectsApi.update(selectedProjectId, payload));
    };

    const commitToSprint = async (taskIds) => {
        setIsCommitting(true);
        try {
            await runAction(() => agileApi.commitToSprint(selectedProjectId, sprintId, taskIds));
        } catch { /* surfaced via actionError */ }
        finally { setIsCommitting(false); }
    };

    const completeSprint = () => {
        if (!window.confirm(t('agile.confirmComplete'))) return;
        runAction(() => sprintsApi.complete(sprintId)).catch(() => {});
    };

    // ── Render ────────────────────────────────────────────────────────────────

    if (isLoadingProjects) return (
        <div className="h-[60vh] flex flex-col items-center justify-center gap-4 text-slate-400">
            <Loader2 className="w-10 h-10 animate-spin text-emerald-500" />
            <p className="font-bold uppercase tracking-[0.2em] text-xs">{t('common.loading')}</p>
        </div>
    );

    const sprints       = overview?.sprints || [];
    const currentSprint = sprints.find(sprint => sprint.id === sprintId) || null;

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
                        <label htmlFor="agile-project" className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">
                            {t('common.project')}
                        </label>
                        <select
                            id="agile-project" value={selectedProjectId}
                            onChange={event => { setSelectedProjectId(event.target.value); setSprintId(null); setDetail(null); }}
                            className={INPUT_CLASS}
                        >
                            <option value="">{t('daily.selectProjectPlaceholder')}</option>
                            {projects.map(project => (
                                <option key={project.id} value={project.id}>{project.project_code} — {project.project_name}</option>
                            ))}
                        </select>
                    </div>

                    {sprints.length > 0 && (
                        <div className="space-y-2">
                            <label htmlFor="agile-sprint" className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">
                                {t('agile.sprint')}
                            </label>
                            <select
                                id="agile-sprint" value={sprintId ?? ''}
                                onChange={event => setSprintId(Number(event.target.value))}
                                className={INPUT_CLASS}
                            >
                                {sprints.map(sprint => (
                                    <option key={sprint.id} value={sprint.id}>
                                        {sprint.name} — {formatShortDate(sprint.start_date)} → {formatShortDate(sprint.end_date)}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                <div className="flex items-start gap-3 mt-6 p-4 rounded-2xl bg-slate-50/70 border border-slate-100 text-slate-500">
                    <Info className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
                    <p className="text-[11px] font-medium leading-relaxed">{t('agile.modelNotice')}</p>
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

            {selectedProjectId && !loadError && isLoadingOverview && !overview && (
                <div className="h-60 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                </div>
            )}

            {actionError && (
                <div role="alert" className="p-4 rounded-2xl bg-rose-50/80 border border-rose-100 text-rose-600 text-xs font-bold">
                    {actionError}
                </div>
            )}

            {selectedProjectId && !loadError && overview && (
                <>
                    {/* SPRINT HEADER */}
                    <div className={`${CARD_CLASS} p-6`}>
                        {currentSprint ? (
                            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h3 className="text-lg font-black text-slate-800 tracking-tight">{currentSprint.name}</h3>
                                        <span className={`px-2 py-0.5 rounded-md border text-[9px] font-black uppercase tracking-wider ${SPRINT_STATE_STYLES[currentSprint.status]}`}>
                                            {t(`agile.state.${currentSprint.status}`)}
                                        </span>
                                    </div>
                                    {currentSprint.goal ? (
                                        <p className="flex items-start gap-1.5 text-xs font-bold text-emerald-700 mt-2">
                                            <Target className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                            {currentSprint.goal}
                                        </p>
                                    ) : (
                                        <p className="text-xs font-bold text-slate-300 mt-2 uppercase tracking-wider">{t('agile.noGoal')}</p>
                                    )}
                                    <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-wider">
                                        {formatShortDate(currentSprint.start_date)} → {formatShortDate(currentSprint.end_date)}
                                    </p>
                                </div>

                                {canPlan && (
                                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                                        <button
                                            onClick={() => setSprintDialog(currentSprint)}
                                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500 hover:bg-slate-50 transition-colors"
                                        >
                                            <Pencil className="w-3.5 h-3.5" /> {t('common.edit')}
                                        </button>
                                        {currentSprint.status === 'planning' && (
                                            <button
                                                onClick={() => runAction(() => sprintsApi.start(currentSprint.id)).catch(() => {})}
                                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-wider transition-all active:scale-95"
                                            >
                                                <Play className="w-3.5 h-3.5" /> {t('agile.startSprint')}
                                            </button>
                                        )}
                                        {currentSprint.status === 'active' && (
                                            <button
                                                onClick={completeSprint}
                                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider transition-all active:scale-95"
                                            >
                                                <CheckCircle2 className="w-3.5 h-3.5" /> {t('agile.completeSprint')}
                                            </button>
                                        )}
                                        <button
                                            onClick={() => setSprintDialog({})}
                                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-emerald-200 text-[10px] font-black uppercase tracking-wider text-emerald-700 hover:bg-emerald-50 transition-colors"
                                        >
                                            <Plus className="w-3.5 h-3.5" /> {t('agile.newSprint')}
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <EmptyState
                                icon={Target}
                                title={t('agile.noSprints')}
                                hint={canPlan ? t('agile.noSprintsHint') : t('agile.noSprintsReadOnly')}
                                action={canPlan ? (
                                    <button
                                        onClick={() => setSprintDialog({})}
                                        className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-wider transition-all active:scale-95"
                                    >
                                        <Plus className="w-3.5 h-3.5" /> {t('agile.newSprint')}
                                    </button>
                                ) : null}
                            />
                        )}
                    </div>

                    {currentSprint && (isLoadingDetail && !detail ? (
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
                                    onMove={moveCard}
                                    onOpen={setStoryDialog}
                                />
                            </div>

                            <BurndownChart burndown={detail.burndown} sprintName={currentSprint.name} />
                        </>
                    ))}

                    <TeamAgreements
                        project={overview.project}
                        canEdit={canPlan}
                        onSave={saveAgreements}
                    />

                    <ProductBacklog
                        backlog={overview.backlog || []}
                        targetSprint={currentSprint}
                        canPlan={canPlan}
                        isCommitting={isCommitting}
                        onCommit={commitToSprint}
                    />
                </>
            )}

            {sprintDialog && (
                <SprintDialog
                    sprint={sprintDialog.id ? sprintDialog : null}
                    onClose={() => setSprintDialog(null)}
                    onSave={saveSprint}
                />
            )}

            {storyDialog && (
                <StoryDialog
                    card={storyDialog}
                    personnel={overview?.personnel || []}
                    project={overview?.project}
                    canEdit={canMove}
                    onClose={() => setStoryDialog(null)}
                    onSave={saveStory}
                    onRemoveFromSprint={removeFromSprint}
                />
            )}
        </div>
    );
}
