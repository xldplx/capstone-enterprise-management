/**
 * SprintSummary — sprint metric cards, capacity check and velocity history.
 * Location: frontend/src/pages/dashboard/features/agile/SprintSummary.jsx
 *
 * Capacity is real: active personnel on the project x working days x 8h, set
 * against the sprint's planned hours. Velocity credits each past sprint only
 * for work the ledger shows finished by that sprint's own end date.
 */
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { Target, Users, Gauge, Activity, AlertTriangle } from 'lucide-react';
import { useTranslation } from '../../../../utils/i18n';
import { CARD_CLASS } from '../../../../utils/uiConstants';
import { formatWholeNumber } from '../../../../utils/numberFormat';

// Matches the metric cards on Overview — same container, icon chip, label and
// value typography — so the Agile page reads as part of the same dashboard.
function MetricCard({ icon: Icon, label, value, unit, hint, tone = 'slate' }) {
    const tones = {
        slate:   { chip: 'bg-slate-50 text-slate-500 border-slate-200',      halo: 'bg-slate-50' },
        emerald: { chip: 'bg-emerald-50 text-emerald-650 border-emerald-100', halo: 'bg-emerald-50/50' },
        rose:    { chip: 'bg-rose-50 text-rose-600 border-rose-100',          halo: 'bg-rose-50/50' },
        blue:    { chip: 'bg-blue-50 text-blue-600 border-blue-100',          halo: 'bg-blue-50/50' },
    };
    const palette = tones[tone] || tones.slate;

    return (
        <div className={`${CARD_CLASS} p-6 bg-white border border-slate-200/60 rounded-3xl shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group`}>
            <div className={`absolute top-0 right-0 w-24 h-24 ${palette.halo} rounded-full translate-x-8 -translate-y-8 group-hover:scale-110 transition-transform duration-500 pointer-events-none`} />
            <div className={`p-3 rounded-xl border shadow-inner w-fit mb-4 relative z-10 ${palette.chip}`}>
                {Icon && <Icon className="w-5 h-5" />}
            </div>
            <h3 className="text-slate-400 text-[10px] font-bold uppercase tracking-wider relative z-10">{label}</h3>
            <p className="text-2xl font-extrabold text-slate-800 tracking-tight mt-1 relative z-10">
                {value}
                {unit && <span className="text-xs font-bold text-slate-400 ml-1.5">{unit}</span>}
            </p>
            {hint && (
                <div className="mt-4 pt-3 border-t border-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-tight relative z-10">
                    {hint}
                </div>
            )}
        </div>
    );
}

export default function SprintSummary({ metrics, capacity, velocity }) {
    const { t } = useTranslation();

    const velocityData = (velocity?.history || []).map(entry => ({
        name:      `S${entry.sprint_number}`,
        committed: entry.committed_points,
        completed: entry.completed_points,
    }));

    return (
        <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <MetricCard
                    icon={Target}
                    label={t('agile.committed')}
                    value={formatWholeNumber(metrics.committed_points)}
                    unit={t('agile.points')}
                    hint={`${metrics.task_count} ${t('agile.tasks')}`}
                />
                <MetricCard
                    icon={Activity}
                    label={t('agile.completed')}
                    value={formatWholeNumber(metrics.completed_points)}
                    unit={t('agile.points')}
                    tone="emerald"
                    hint={`${metrics.completion_pct}% ${t('agile.ofSprint')}`}
                />
                <MetricCard
                    icon={Gauge}
                    label={t('agile.remaining')}
                    value={formatWholeNumber(metrics.remaining_points)}
                    unit={t('agile.points')}
                    tone={metrics.remaining_points > 0 ? 'blue' : 'emerald'}
                    hint={metrics.unestimated_tasks > 0
                        ? `${metrics.unestimated_tasks} ${t('agile.unestimatedHint')}`
                        : t('agile.allEstimated')}
                />
                <MetricCard
                    icon={Users}
                    label={t('agile.capacity')}
                    value={capacity?.available_hours ? formatWholeNumber(capacity.available_hours) : '—'}
                    unit={capacity?.available_hours ? t('agile.hours') : ''}
                    tone={capacity?.over_committed ? 'rose' : 'slate'}
                    hint={capacity?.headcount
                        ? `${capacity.headcount} ${t('agile.peopleOver')} ${capacity.working_days} ${t('agile.workingDays')}`
                        : t('agile.noPersonnel')}
                />
            </div>

            {capacity?.over_committed && (
                <div className="flex items-start gap-3 p-5 rounded-2xl bg-rose-50/70 border border-rose-100 text-rose-700">
                    <AlertTriangle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-xs font-black uppercase tracking-wider">{t('agile.overCommitted')}</p>
                        <p className="text-xs font-medium mt-1 leading-relaxed">
                            {t('agile.overCommittedHint')
                                .replace('{committed}', formatWholeNumber(capacity.committed_hours))
                                .replace('{available}', formatWholeNumber(capacity.available_hours))}
                        </p>
                    </div>
                </div>
            )}

            {velocityData.length > 0 && (
                <div className={`${CARD_CLASS} p-8`}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-slate-100 rounded-2xl text-slate-600 shadow-inner">
                                <Activity className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">{t('agile.velocity')}</h3>
                                <p className="text-xs text-slate-400 font-medium">{t('agile.velocitySource')}</p>
                            </div>
                        </div>
                        <div className="px-4 py-2.5 rounded-2xl border border-slate-200 bg-slate-50 text-center">
                            <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">
                                {t('agile.averageVelocity')}
                            </p>
                            <p className="text-lg font-black text-slate-700 leading-none mt-1">
                                {velocity.average_points} <span className="text-[10px]">{t('agile.points')}</span>
                            </p>
                        </div>
                    </div>

                    <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={velocityData} margin={{ left: -18, right: 12, top: 6, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                <XAxis dataKey="name" tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                                <YAxis tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                                <Tooltip
                                    cursor={{ fill: '#f8fafc' }}
                                    contentStyle={{
                                        borderRadius: '1rem',
                                        border: '1px solid #e2e8f0',
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        boxShadow: '0 8px 24px rgba(0,0,0,0.06)',
                                    }}
                                />
                                <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }} />
                                <Bar dataKey="committed" name={t('agile.committed')} fill="#cbd5e1" radius={[6, 6, 0, 0]} />
                                <Bar dataKey="completed" name={t('agile.completed')} fill="#10b981" radius={[6, 6, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}
        </div>
    );
}
