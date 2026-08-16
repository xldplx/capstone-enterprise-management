/**
 * StoryDialog — estimate, assign, block or remove one story from a sprint.
 * Location: frontend/src/pages/dashboard/features/agile/StoryDialog.jsx
 *
 * Everything here is a delivery decision, so none of it is blocked by the
 * baseline lock. Nothing here edits the plan — dates, cost, hours and weight
 * stay on the Project Detail page where the lock applies.
 */
import { useState } from 'react';
import { X, Loader2, Ban } from 'lucide-react';
import { useTranslation } from '../../../../utils/i18n';
import { INPUT_CLASS, NULL_DISPLAY } from '../../../../utils/uiConstants';
import { POINT_SCALE, COLUMN_STYLES, BOARD_COLUMNS } from '../../../../utils/agileConstants';

export default function StoryDialog({ card, personnel, canEdit, onClose, onSave, onRemoveFromSprint }) {
    const { t } = useTranslation();

    const [form, setForm] = useState({
        story_points:   card.story_points ?? '',
        assignee_id:    card.assignee_id ?? '',
        board_status:   card.board_status,
        blocked_reason: card.blocked_reason ?? '',
    });
    const [error, setError]   = useState('');
    const [saving, setSaving] = useState(false);

    const update = (field, value) => setForm(current => ({ ...current, [field]: value }));

    const submit = async (event) => {
        event.preventDefault();
        setError('');

        if (form.board_status === 'blocked' && !form.blocked_reason.trim()) {
            setError(t('agile.errBlockedReason'));
            return;
        }

        setSaving(true);
        try {
            await onSave({
                story_points:   form.story_points === '' ? null : Number(form.story_points),
                assignee_id:    form.assignee_id  === '' ? null : Number(form.assignee_id),
                board_status:   form.board_status,
                blocked_reason: form.blocked_reason.trim() || null,
            });
        } catch (e) {
            setError(e.message || t('agile.errSaveFailed'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-6">
            <form
                onSubmit={submit}
                className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg p-8 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto"
            >
                <div className="flex items-start justify-between gap-4 mb-6">
                    <div className="min-w-0">
                        <p className="font-mono text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-md px-2 py-0.5 inline-block">
                            {card.wbs_code || NULL_DISPLAY}
                        </p>
                        <h3 className="text-base font-black text-slate-800 tracking-tight mt-2 break-words">{card.task_name}</h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">
                            {card.pct_complete}% {t('agile.complete')} · {card.planned_hours}h {t('agile.planned')}
                            {card.days_overdue > 0 && (
                                <span className="text-rose-600"> · {card.days_overdue} {t('agile.daysOverdue')}</span>
                            )}
                        </p>
                    </div>
                    <button
                        type="button" onClick={onClose}
                        className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors shrink-0"
                        aria-label={t('common.close')}
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {error && (
                    <div role="alert" className="p-4 rounded-2xl bg-rose-50/80 border border-rose-100 text-rose-600 text-xs font-bold mb-6">
                        {error}
                    </div>
                )}

                <div className="space-y-5">
                    <div className="space-y-2">
                        <label htmlFor="story-points" className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">
                            {t('agile.storyPoints')}
                        </label>
                        <select
                            id="story-points" value={form.story_points} disabled={!canEdit}
                            onChange={event => update('story_points', event.target.value)}
                            className={INPUT_CLASS}
                        >
                            <option value="">
                                {card.suggested_points
                                    ? `${t('agile.unestimated')} — ${t('agile.suggests')} ${card.suggested_points}`
                                    : t('agile.unestimated')}
                            </option>
                            {POINT_SCALE.map(points => (
                                <option key={points} value={points}>{points} {t('agile.points')}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="story-assignee" className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">
                            {t('agile.assignee')}
                        </label>
                        <select
                            id="story-assignee" value={form.assignee_id} disabled={!canEdit}
                            onChange={event => update('assignee_id', event.target.value)}
                            className={INPUT_CLASS}
                        >
                            <option value="">{t('agile.unassigned')}</option>
                            {personnel.map(person => (
                                <option key={person.id} value={person.id}>
                                    {person.full_name}{person.designation ? ` — ${person.designation}` : ''}
                                </option>
                            ))}
                        </select>
                        {personnel.length === 0 && (
                            <p className="text-[10px] font-medium text-slate-400 ml-1">{t('agile.noPersonnelHint')}</p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="story-status" className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">
                            {t('agile.boardColumn')}
                        </label>
                        <select
                            id="story-status" value={form.board_status} disabled={!canEdit}
                            onChange={event => update('board_status', event.target.value)}
                            className={INPUT_CLASS}
                        >
                            {BOARD_COLUMNS.map(column => (
                                <option key={column} value={column}>{t(COLUMN_STYLES[column].labelKey)}</option>
                            ))}
                        </select>
                    </div>

                    {form.board_status === 'blocked' && (
                        <div className="space-y-2 animate-in fade-in duration-200">
                            <label htmlFor="story-blocked" className="text-[10px] font-black text-rose-500 uppercase tracking-[0.2em] ml-1 flex items-center gap-1.5">
                                <Ban className="w-3 h-3" /> {t('agile.blockedReason')}
                            </label>
                            <textarea
                                id="story-blocked" rows={2} disabled={!canEdit}
                                value={form.blocked_reason}
                                onChange={event => update('blocked_reason', event.target.value)}
                                placeholder={t('agile.blockedReasonPlaceholder')}
                                className={`${INPUT_CLASS} resize-none`}
                            />
                        </div>
                    )}
                </div>

                {canEdit && (
                    <>
                        <div className="flex gap-3 mt-8">
                            <button
                                type="button" onClick={onClose}
                                className="flex-1 py-3 rounded-2xl border border-slate-200 text-xs font-black uppercase tracking-wider text-slate-500 hover:bg-slate-50 transition-colors"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                type="submit" disabled={saving}
                                className="flex-1 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                {saving ? t('common.saving') : t('common.save')}
                            </button>
                        </div>

                        <button
                            type="button" onClick={onRemoveFromSprint} disabled={saving}
                            className="w-full mt-3 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-wider text-slate-400 hover:text-rose-600 hover:bg-rose-50/50 transition-colors disabled:opacity-50"
                        >
                            {t('agile.returnToBacklog')}
                        </button>
                    </>
                )}
            </form>
        </div>
    );
}
