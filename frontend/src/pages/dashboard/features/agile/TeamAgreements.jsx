/**
 * TeamAgreements — the Product Goal and the Definition of Done.
 * Location: frontend/src/pages/dashboard/features/agile/TeamAgreements.jsx
 *
 * These are two of the three artifact commitments in the 2020 Scrum Guide: the
 * Product Goal belongs to the Product Backlog, and the Definition of Done to the
 * Increment. (The third, the Sprint Goal, lives on each sprint.)
 *
 * Both are stored on the project rather than the sprint, because they hold
 * across sprints by definition — a Definition of Done that changed every
 * fortnight would not be a definition of anything. They are also not planning
 * fields, so they stay editable after the baseline is locked.
 */
import { useState } from 'react';
import { Target, CheckSquare, Pencil, Loader2, X } from 'lucide-react';
import { useTranslation } from '../../../../utils/i18n';
import { CARD_CLASS, INPUT_CLASS } from '../../../../utils/uiConstants';
import { toChecklist } from '../../../../utils/agileConstants';

export default function TeamAgreements({ project, canEdit, onSave }) {
    const { t } = useTranslation();

    const [isEditing, setIsEditing] = useState(false);
    const [form, setForm] = useState({
        product_goal:       project?.product_goal       || '',
        definition_of_done: project?.definition_of_done || '',
    });
    const [error, setError]   = useState('');
    const [saving, setSaving] = useState(false);

    const checklist = toChecklist(project?.definition_of_done);

    const startEditing = () => {
        setForm({
            product_goal:       project?.product_goal       || '',
            definition_of_done: project?.definition_of_done || '',
        });
        setError('');
        setIsEditing(true);
    };

    const submit = async (event) => {
        event.preventDefault();
        setError('');
        setSaving(true);
        try {
            await onSave({
                product_goal:       form.product_goal.trim()       || null,
                definition_of_done: form.definition_of_done.trim() || null,
            });
            setIsEditing(false);
        } catch (e) {
            setError(e.message || t('agile.errSaveFailed'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className={`${CARD_CLASS} p-8`}>
            <div className="flex items-start justify-between gap-4 mb-8">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-slate-100 rounded-2xl text-slate-600 shadow-inner">
                        <CheckSquare className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">{t('agile.teamAgreements')}</h3>
                        <p className="text-xs text-slate-400 font-medium">{t('agile.teamAgreementsHint')}</p>
                    </div>
                </div>

                {canEdit && !isEditing && (
                    <button
                        onClick={startEditing}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500 hover:bg-slate-50 transition-colors shrink-0"
                    >
                        <Pencil className="w-3.5 h-3.5" /> {t('common.edit')}
                    </button>
                )}
            </div>

            {error && (
                <div role="alert" className="p-4 rounded-2xl bg-rose-50/80 border border-rose-100 text-rose-600 text-xs font-bold mb-6">
                    {error}
                </div>
            )}

            {isEditing ? (
                <form onSubmit={submit} className="space-y-6">
                    <div className="space-y-2">
                        <label htmlFor="product-goal" className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">
                            {t('agile.productGoal')}
                        </label>
                        <textarea
                            id="product-goal" rows={2} autoFocus
                            value={form.product_goal}
                            onChange={event => setForm(current => ({ ...current, product_goal: event.target.value }))}
                            placeholder={t('agile.productGoalPlaceholder')}
                            className={`${INPUT_CLASS} resize-none`}
                        />
                        <p className="text-[10px] font-medium text-slate-400 ml-1 leading-relaxed">{t('agile.productGoalHint')}</p>
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="definition-of-done" className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">
                            {t('agile.definitionOfDone')}
                        </label>
                        <textarea
                            id="definition-of-done" rows={5}
                            value={form.definition_of_done}
                            onChange={event => setForm(current => ({ ...current, definition_of_done: event.target.value }))}
                            placeholder={t('agile.dodPlaceholder')}
                            className={`${INPUT_CLASS} resize-none font-mono text-xs`}
                        />
                        <p className="text-[10px] font-medium text-slate-400 ml-1 leading-relaxed">{t('agile.dodHint')}</p>
                    </div>

                    <div className="flex gap-3">
                        <button
                            type="button" onClick={() => setIsEditing(false)}
                            className="flex-1 py-3 rounded-2xl border border-slate-200 text-xs font-black uppercase tracking-wider text-slate-500 hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
                        >
                            <X className="w-3.5 h-3.5" /> {t('common.cancel')}
                        </button>
                        <button
                            type="submit" disabled={saving}
                            className="flex-1 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            {saving ? t('common.saving') : t('common.save')}
                        </button>
                    </div>
                </form>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Product Goal — the Product Backlog's commitment */}
                    <div className="p-6 rounded-2xl bg-slate-50/60 border border-slate-100">
                        <div className="flex items-center gap-2 text-slate-400 mb-3">
                            <Target className="w-4 h-4" />
                            <span className="text-[9px] font-black uppercase tracking-[0.15em]">{t('agile.productGoal')}</span>
                        </div>
                        {project?.product_goal ? (
                            <p className="text-sm font-bold text-slate-700 leading-relaxed">{project.product_goal}</p>
                        ) : (
                            <p className="text-xs font-bold text-slate-300 uppercase tracking-wider">{t('agile.noProductGoal')}</p>
                        )}
                    </div>

                    {/* Definition of Done — the Increment's commitment */}
                    <div className="p-6 rounded-2xl bg-slate-50/60 border border-slate-100">
                        <div className="flex items-center gap-2 text-slate-400 mb-3">
                            <CheckSquare className="w-4 h-4" />
                            <span className="text-[9px] font-black uppercase tracking-[0.15em]">{t('agile.definitionOfDone')}</span>
                        </div>
                        {checklist.length > 0 ? (
                            <ul className="space-y-2">
                                {checklist.map((item, index) => (
                                    <li key={index} className="flex items-start gap-2 text-xs font-bold text-slate-600 leading-relaxed">
                                        <CheckSquare className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-xs font-bold text-slate-300 uppercase tracking-wider">{t('agile.noDod')}</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
