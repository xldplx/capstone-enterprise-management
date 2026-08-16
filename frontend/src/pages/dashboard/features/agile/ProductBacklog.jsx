/**
 * ProductBacklog — unscheduled, unfinished work outside every sprint.
 * Location: frontend/src/pages/dashboard/features/agile/ProductBacklog.jsx
 *
 * There is no stored rank column and none is invented. The backend grooms the
 * list the way a PM would — overdue first, then least schedule float, then
 * heaviest — so the order is reproducible for every user.
 */
import { ListOrdered } from 'lucide-react';
import { useTranslation } from '../../../../utils/i18n';
import { CARD_CLASS, NULL_DISPLAY } from '../../../../utils/uiConstants';
import { formatShortDate } from '../../../../utils/agileConstants';
import EmptyState from '../../../../components/EmptyState';

export default function ProductBacklog({ backlog }) {
    const { t } = useTranslation();

    const totalPoints = backlog.reduce((sum, card) => sum + (card.story_points ?? 0), 0);

    return (
        <div className={CARD_CLASS}>
            <div className="p-8 border-b border-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/30">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-slate-100 rounded-2xl text-slate-600 shadow-inner">
                        <ListOrdered className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">{t('agile.backlog')}</h3>
                        <p className="text-xs text-slate-400 font-medium">{t('agile.backlogHint')}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <span className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-[10px] font-black uppercase tracking-wider text-slate-500">
                        {backlog.length} {t('agile.tasks')}
                    </span>
                    <span className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-[10px] font-black uppercase tracking-wider text-slate-500">
                        {totalPoints} {t('agile.points')}
                    </span>
                </div>
            </div>

            {backlog.length > 0 ? (
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50 text-[10px] uppercase tracking-[0.2em] text-slate-400 font-black">
                                <th className="px-8 py-5 w-12">#</th>
                                <th className="px-6 py-5">{t('agile.task')}</th>
                                <th className="px-6 py-5">{t('agile.points')}</th>
                                <th className="px-6 py-5">{t('agile.plannedWindow')}</th>
                                <th className="px-8 py-5">{t('agile.urgency')}</th>
                            </tr>
                        </thead>
                        <tbody className="text-sm font-medium text-slate-600 divide-y divide-slate-50">
                            {backlog.map((card, index) => (
                                <tr key={card.id} className="hover:bg-emerald-50/30 transition-all duration-200">
                                    <td className="px-8 py-5 text-[10px] font-black text-slate-300">{index + 1}</td>
                                    <td className="px-6 py-5">
                                        <p className="font-black text-slate-800 tracking-tight">{card.task_name}</p>
                                        <p className="font-mono text-[10px] text-slate-400 mt-1 uppercase tracking-widest">
                                            {card.wbs_code || NULL_DISPLAY}
                                        </p>
                                    </td>
                                    <td className="px-6 py-5">
                                        {card.story_points === null ? (
                                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-300">
                                                {t('agile.unestimated')}
                                            </span>
                                        ) : (
                                            <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-[11px] font-black text-slate-600">
                                                {card.story_points}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-5 text-xs font-bold text-slate-400">
                                        {card.planned_start || card.planned_end
                                            ? `${formatShortDate(card.planned_start) || NULL_DISPLAY} → ${formatShortDate(card.planned_end) || NULL_DISPLAY}`
                                            : t('agile.undated')}
                                    </td>
                                    <td className="px-8 py-5">
                                        {card.days_overdue > 0 ? (
                                            <span className="px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-100 text-[10px] font-black uppercase tracking-wider text-rose-700">
                                                {card.days_overdue} {t('agile.daysOverdue')}
                                            </span>
                                        ) : card.float !== null ? (
                                            <span className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                                                {card.float} {t('agile.daysFloat')}
                                            </span>
                                        ) : (
                                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-300">
                                                {t('agile.noDates')}
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
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
