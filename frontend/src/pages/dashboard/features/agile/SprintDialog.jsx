/**
 * SprintDialog — create or edit a sprint.
 * Location: frontend/src/pages/dashboard/features/agile/SprintDialog.jsx
 *
 * The sprint goal is the field that makes this a sprint rather than a date
 * range, so it gets equal billing with the dates.
 */
import { useState } from 'react';
import { X, Loader2, Target } from 'lucide-react';
import { useTranslation } from '../../../../utils/i18n';
import { INPUT_CLASS } from '../../../../utils/uiConstants';

export default function SprintDialog({ sprint, onClose, onSave }) {
    const { t } = useTranslation();
    const isEdit = Boolean(sprint?.id);

    const [form, setForm] = useState({
        name:       sprint?.name       || '',
        goal:       sprint?.goal       || '',
        start_date: sprint?.start_date || '',
        end_date:   sprint?.end_date   || '',
    });
    const [error, setError]     = useState('');
    const [saving, setSaving]   = useState(false);

    const update = (field, value) => setForm(current => ({ ...current, [field]: value }));

    const submit = async (event) => {
        event.preventDefault();
        setError('');

        if (!form.name.trim())                     { setError(t('agile.errNameRequired')); return; }
        if (!form.start_date || !form.end_date)    { setError(t('agile.errDatesRequired')); return; }
        if (form.end_date < form.start_date)       { setError(t('agile.errDatesOrder')); return; }

        setSaving(true);
        try {
            await onSave({ ...form, name: form.name.trim(), goal: form.goal.trim() });
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
                <div className="flex items-start justify-between gap-4 mb-8">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-600 border border-emerald-100 shadow-inner">
                            <Target className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">
                                {isEdit ? t('agile.editSprint') : t('agile.newSprint')}
                            </h3>
                            <p className="text-xs text-slate-400 font-medium mt-0.5">{t('agile.sprintDialogHint')}</p>
                        </div>
                    </div>
                    <button
                        type="button" onClick={onClose}
                        className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors"
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
                        <label htmlFor="sprint-name" className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">
                            {t('agile.sprintName')}
                        </label>
                        <input
                            id="sprint-name" type="text" autoFocus
                            value={form.name}
                            onChange={event => update('name', event.target.value)}
                            placeholder={t('agile.sprintNamePlaceholder')}
                            className={INPUT_CLASS}
                        />
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="sprint-goal" className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">
                            {t('agile.sprintGoal')}
                        </label>
                        <textarea
                            id="sprint-goal" rows={3}
                            value={form.goal}
                            onChange={event => update('goal', event.target.value)}
                            placeholder={t('agile.sprintGoalPlaceholder')}
                            className={`${INPUT_CLASS} resize-none`}
                        />
                        <p className="text-[10px] font-medium text-slate-400 ml-1 leading-relaxed">
                            {t('agile.sprintGoalHint')}
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label htmlFor="sprint-start" className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">
                                {t('agile.startDate')}
                            </label>
                            <input
                                id="sprint-start" type="date"
                                value={form.start_date}
                                onChange={event => update('start_date', event.target.value)}
                                className={INPUT_CLASS}
                            />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="sprint-end" className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">
                                {t('agile.endDate')}
                            </label>
                            <input
                                id="sprint-end" type="date"
                                value={form.end_date}
                                min={form.start_date || undefined}
                                onChange={event => update('end_date', event.target.value)}
                                className={INPUT_CLASS}
                            />
                        </div>
                    </div>
                </div>

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
            </form>
        </div>
    );
}
