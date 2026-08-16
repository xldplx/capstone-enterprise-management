/**
 * BurndownChart — remaining story points against the ideal line.
 * Location: frontend/src/pages/dashboard/features/agile/BurndownChart.jsx
 *
 * The actual series is real history, rebuilt server-side from the daily_actuals
 * ledger — not a line drawn between the sprint start and today. Days that have
 * not happened yet arrive as null so recharts leaves the line short rather than
 * flattening it along the axis, which would read as a stalled team.
 */
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { TrendingDown } from 'lucide-react';
import { useTranslation } from '../../../../utils/i18n';
import { CARD_CLASS } from '../../../../utils/uiConstants';
import { formatShortDate } from '../../../../utils/agileConstants';
import EmptyState from '../../../../components/EmptyState';

export default function BurndownChart({ burndown, sprintName }) {
    const { t } = useTranslation();
    const days = burndown?.days || [];

    const plotted = days.filter(point => point.remaining !== null);
    const latest  = plotted[plotted.length - 1];
    // Positive means ahead of plan: fewer points left than the ideal line wants.
    const variance = latest ? Number((latest.ideal - latest.remaining).toFixed(2)) : null;

    return (
        <div className={`${CARD_CLASS} p-8`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-slate-100 rounded-2xl text-slate-600 shadow-inner">
                        <TrendingDown className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">{t('agile.burndown')}</h3>
                        <p className="text-xs text-slate-400 font-medium">
                            {sprintName} — {t('agile.burndownSource')}
                        </p>
                    </div>
                </div>

                {variance !== null && (
                    <div className={`px-4 py-2.5 rounded-2xl border text-center ${
                        variance >= 0
                            ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                            : 'bg-rose-50 border-rose-100 text-rose-700'
                    }`}>
                        <p className="text-[9px] font-black uppercase tracking-[0.15em] opacity-70">
                            {variance >= 0 ? t('agile.aheadOfPlan') : t('agile.behindPlan')}
                        </p>
                        <p className="text-lg font-black leading-none mt-1">
                            {Math.abs(variance)} <span className="text-[10px]">{t('agile.points')}</span>
                        </p>
                    </div>
                )}
            </div>

            {burndown?.committed_points > 0 && days.length > 0 ? (
                <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={days} margin={{ left: -14, right: 12, top: 6, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                            <XAxis
                                dataKey="date"
                                tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }}
                                tickLine={false} axisLine={false}
                                tickFormatter={formatShortDate}
                            />
                            <YAxis
                                tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }}
                                tickLine={false} axisLine={false}
                                label={{ value: t('agile.points'), angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 9 }}
                            />
                            <Tooltip
                                labelFormatter={formatShortDate}
                                contentStyle={{
                                    borderRadius: '1rem',
                                    border: '1px solid #e2e8f0',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    boxShadow: '0 8px 24px rgba(0,0,0,0.06)',
                                }}
                            />
                            <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }} />
                            <Line
                                type="monotone" dataKey="ideal" name={t('agile.idealLine')}
                                stroke="#cbd5e1" strokeWidth={2} strokeDasharray="5 4" dot={false}
                            />
                            <Line
                                type="monotone" dataKey="remaining" name={t('agile.actualLine')}
                                stroke="#10b981" strokeWidth={2.5}
                                dot={{ r: 2.5, fill: '#10b981' }} activeDot={{ r: 4 }}
                                connectNulls={false}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            ) : (
                <EmptyState
                    icon={TrendingDown}
                    title={t('agile.noBurndown')}
                    hint={t('agile.noBurndownHint')}
                />
            )}
        </div>
    );
}
