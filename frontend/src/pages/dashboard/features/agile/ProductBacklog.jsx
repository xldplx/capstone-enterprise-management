/**
 * ProductBacklog — uncommitted stories, grouped by WBS node, with sprint planning.
 * Location: frontend/src/pages/dashboard/features/agile/ProductBacklog.jsx
 *
 * The WBS is already the scope decomposition, so it is the natural backlog
 * hierarchy: a WBS node is the epic, its tasks are the stories, and a sprint
 * cuts horizontally across several nodes. That is also how a construction
 * lookahead works — a fortnight pulls work from several work packages at once.
 *
 * Ordering inside a node is groomed server-side (overdue, then least float, then
 * largest), so every user sees the same list. There is no manual rank column and
 * none is faked.
 */
import { useState } from 'react';
import { ListOrdered, ChevronDown, ChevronRight, Plus, Loader2, AlertTriangle } from 'lucide-react';
import { useTranslation } from '../../../../utils/i18n';
import { CARD_CLASS, NULL_DISPLAY } from '../../../../utils/uiConstants';
import { formatShortDate } from '../../../../utils/agileConstants';
import EmptyState from '../../../../components/EmptyState';

export default function ProductBacklog({ backlog, targetSprint, canPlan, isCommitting, onCommit }) {
    const { t } = useTranslation();
    const [collapsed, setCollapsed] = useState({});
    const [selected, setSelected]   = useState(new Set());

    const toggleGroup = (key) =>
        setCollapsed(current => ({ ...current, [key]: !current[key] }));

    const toggleTask = (id) => setSelected(current => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    const toggleWholeGroup = (group) => setSelected(current => {
        const next = new Set(current);
        const ids  = group.tasks.map(task => task.id);
        const allIn = ids.every(id => next.has(id));
        ids.forEach(id => { if (allIn) next.delete(id); else next.add(id); });
        return next;
    });

    const totalTasks  = backlog.reduce((sum, group) => sum + group.task_count, 0);
    const totalPoints = backlog.reduce((sum, group) => sum + group.points, 0);

    const selectedPoints = backlog
        .flatMap(group => group.tasks)
        .filter(task => selected.has(task.id))
        .reduce((sum, task) => sum + (task.story_points ?? 0), 0);

    const commit = async () => {
        await onCommit([...selected]);
        setSelected(new Set());
    };

    // A closed sprint cannot take new scope; the backend refuses it too.
    const canCommitHere = canPlan && targetSprint && !['completed', 'cancelled'].includes(targetSprint.status);

    return (
        <div className={CARD_CLASS}>
            <div className="p-8 border-b border-slate-50 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-50/30">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-slate-100 rounded-2xl text-slate-600 shadow-inner">
                        <ListOrdered className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">{t('agile.backlog')}</h3>
                        <p className="text-xs text-slate-400 font-medium">{t('agile.backlogHint')}</p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <span className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-[10px] font-black uppercase tracking-wider text-slate-500">
                        {totalTasks} {t('agile.tasks')}
                    </span>
                    <span className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-[10px] font-black uppercase tracking-wider text-slate-500">
                        {totalPoints} {t('agile.points')}
                    </span>
                    {canCommitHere && selected.size > 0 && (
                        <button
                            onClick={commit}
                            disabled={isCommitting}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50"
                        >
                            {isCommitting
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <Plus className="w-3.5 h-3.5" />}
                            {t('agile.commitToSprint')
                                .replace('{count}', selected.size)
                                .replace('{points}', selectedPoints)
                                .replace('{sprint}', targetSprint.name)}
                        </button>
                    )}
                </div>
            </div>

            {canPlan && !canCommitHere && backlog.length > 0 && (
                <div className="px-8 py-3 bg-amber-50/60 border-b border-amber-100 text-[11px] font-bold text-amber-700">
                    {t('agile.selectOpenSprint')}
                </div>
            )}

            {backlog.length > 0 ? (
                <div className="divide-y divide-slate-50">
                    {backlog.map(group => {
                        const key      = group.wbs_id ?? 'unassigned';
                        const isOpen   = !collapsed[key];
                        const groupIds = group.tasks.map(task => task.id);
                        const allIn    = groupIds.every(id => selected.has(id));

                        return (
                            <div key={key}>
                                {/* WBS node = epic */}
                                <div className="flex items-center gap-3 px-8 py-4 bg-slate-50/40 hover:bg-slate-50/80 transition-colors">
                                    {canCommitHere && (
                                        <input
                                            type="checkbox"
                                            checked={allIn}
                                            onChange={() => toggleWholeGroup(group)}
                                            aria-label={`${t('agile.selectAllIn')} ${group.wbs_code || t('agile.unassignedWbs')}`}
                                            className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/20 shrink-0"
                                        />
                                    )}
                                    <button
                                        onClick={() => toggleGroup(key)}
                                        className="flex items-center gap-2 min-w-0 flex-1 text-left"
                                    >
                                        {isOpen
                                            ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                                            : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                                        <span className="font-mono text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-md px-2 py-0.5 shrink-0">
                                            {group.wbs_code || t('agile.unassignedWbs')}
                                        </span>
                                        <span className="text-xs font-black text-slate-700 truncate">{group.name || ''}</span>
                                    </button>
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider shrink-0">
                                        {group.task_count} {t('agile.tasks')} · {group.points} {t('agile.points')}
                                    </span>
                                </div>

                                {/* Tasks = stories */}
                                {isOpen && (
                                    <div className="divide-y divide-slate-50">
                                        {group.tasks.map(task => (
                                            <div key={task.id} className="flex items-center gap-3 px-8 py-4 pl-14 hover:bg-emerald-50/30 transition-colors">
                                                {canCommitHere && (
                                                    <input
                                                        type="checkbox"
                                                        checked={selected.has(task.id)}
                                                        onChange={() => toggleTask(task.id)}
                                                        aria-label={task.task_name}
                                                        className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/20 shrink-0"
                                                    />
                                                )}
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-bold text-slate-800 truncate">{task.task_name}</p>
                                                    <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                                                        {task.planned_start || task.planned_end
                                                            ? `${formatShortDate(task.planned_start) || NULL_DISPLAY} → ${formatShortDate(task.planned_end) || NULL_DISPLAY}`
                                                            : t('agile.undated')}
                                                    </p>
                                                </div>

                                                <div className="flex items-center gap-2 shrink-0">
                                                    {task.story_points === null ? (
                                                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-300">
                                                            {task.suggested_points
                                                                ? `~${task.suggested_points} ${t('agile.suggested')}`
                                                                : t('agile.unestimated')}
                                                        </span>
                                                    ) : (
                                                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-[11px] font-black text-slate-600">
                                                            {task.story_points}
                                                        </span>
                                                    )}
                                                    {task.days_overdue > 0 && (
                                                        <span className="px-2 py-1 rounded-lg bg-rose-50 border border-rose-100 text-[9px] font-black uppercase tracking-wider text-rose-700 flex items-center gap-1">
                                                            <AlertTriangle className="w-2.5 h-2.5" />
                                                            {task.days_overdue}{t('agile.daysOverdueShort')}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            ) : (
                <EmptyState
                    icon={ListOrdered}
                    title={t('agile.backlogEmpty')}
                    hint={t('agile.backlogEmptyHint')}
                />
            )}
        </div>
    );
}
