import { formatWholeNumber } from './numberFormat';

/**
 * Shared EVM helpers — bilingual labels tanpa import i18n
 * (membaca localStorage langsung agar tidak ada circular dependency)
 */

function _lang() {
    try { return localStorage.getItem('epms.language') || 'en'; } catch { return 'en'; }
}

// Supabase/PostgREST returns NUMERIC columns as strings. Coerce before any
// arithmetic — `s + "100" + "200"` concatenates instead of summing.
const num = (v) => parseFloat(v) || 0;

export function computeEvm(tasks, schedulePct) {
    const BAC = tasks.reduce((s, t) => s + num(t.planned_cost), 0);
    const EV  = tasks.reduce((s, t) => s + num(t.planned_cost) * (num(t.pct_complete) / 100), 0);
    const AC  = tasks.reduce((s, t) => s + num(t.actual_cost), 0);
    const PV  = BAC * num(schedulePct);
    const CPI = AC > 0 ? EV / AC : null;
    const SPI = PV > 0 ? EV / PV : null;
    const CV  = EV - AC;
    const SV  = EV - PV;
    const EAC  = CPI !== null && CPI > 0 ? BAC / CPI : null;
    const ETC  = EAC !== null ? EAC - AC : null;
    const VAC  = EAC !== null ? BAC - EAC : null;
    const TCPI = (BAC - AC) > 0 ? (BAC - EV) / (BAC - AC) : null;
    const overallPct = BAC > 0 ? (EV / BAC) * 100 : 0;
    const totalPlannedHours  = tasks.reduce((s, t) => s + num(t.planned_hours), 0);
    const totalActualHours   = tasks.reduce((s, t) => s + num(t.actual_hours), 0);
    const totalHoursVariance = tasks.reduce((s, t) =>
        num(t.actual_hours) > 0
            ? s + (Math.round(num(t.planned_hours) * (num(t.pct_complete) / 100)) - num(t.actual_hours))
            : s, 0);
    return { BAC, EV, AC, PV, CPI, SPI, CV, SV, EAC, ETC, VAC, TCPI, overallPct, totalPlannedHours, totalActualHours, totalHoursVariance };
}

export function indexColor(val) {
    const id = _lang() === 'id';
    if (val === null) return { bg: 'bg-slate-50',   text: 'text-slate-500',   border: 'border-slate-100',   label: '—' };
    if (val >= 1.0)  return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-100', label: id ? 'Sesuai Rencana' : 'On Track' };
    if (val >= 0.9)  return { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-100',   label: id ? 'Berisiko'       : 'At Risk'  };
    return                  { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-100',    label: id ? 'Kritis'         : 'Critical' };
}

export function varianceColor(val) {
    const id = _lang() === 'id';
    return val >= 0
        ? { text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-100', label: id ? 'Menguntungkan'       : 'Favorable'   }
        : { text: 'text-rose-700',     bg: 'bg-rose-50',     border: 'border-rose-100',     label: id ? 'Tidak Menguntungkan' : 'Unfavorable' };
}

export function formatCurrency(v) {
    return formatWholeNumber(v);
}

export function formatDate(d) {
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function _makeRec(type, extra) {
    const id = _lang() === 'id';
    const map = {
        'cpi_critical': {
            en: 'Actual costs are significantly exceeding earned value. Review cost control measures immediately.',
            id: 'Biaya aktual melebihi nilai yang diraih secara signifikan. Tinjau langkah pengendalian biaya segera.',
        },
        'cpi_warning': {
            en: 'Cost performance is below target. Monitor spending and review upcoming task budgets.',
            id: 'Kinerja biaya di bawah target. Pantau pengeluaran dan tinjau anggaran tugas mendatang.',
        },
        'spi_critical': {
            en: `Project is critically behind schedule.${extra ? ' High-impact delayed tasks: ' + extra + '.' : ''} Escalate to management.`,
            id: `Proyek sangat terlambat dari jadwal.${extra ? ' Tugas terdampak utama: ' + extra + '.' : ''} Eskalasi ke manajemen.`,
        },
        'spi_warning': {
            en: 'Schedule performance is below target. Review upcoming milestones and task dependencies.',
            id: 'Kinerja jadwal di bawah target. Tinjau tonggak mendatang dan ketergantungan tugas.',
        },
    };
    const entry = map[type];
    if (!entry) return '';
    return id ? entry.id : entry.en;
}

export function computeAlerts(projects, allTasks, thresholds) {
    const tv = {
        cpi_amber: thresholds.cpi_amber ?? 1.00,
        cpi_red:   thresholds.cpi_red   ?? 0.90,
        spi_amber: thresholds.spi_amber ?? 1.00,
        spi_red:   thresholds.spi_red   ?? 0.90,
    };

    const alerts = [];

    projects.forEach(project => {
        const tasks = allTasks.filter(task => task.project_id === project.id);
        const BAC = tasks.reduce((s, task) => s + num(task.planned_cost), 0);
        const EV  = tasks.reduce((s, task) => s + num(task.planned_cost) * (num(task.pct_complete) / 100), 0);
        const AC  = tasks.reduce((s, task) => s + num(task.actual_cost), 0);
        const PV  = BAC * num(project.schedule_pct);
        const CPI = AC > 0 ? EV / AC : null;
        const SPI = PV > 0 ? EV / PV : null;

        if (CPI !== null) {
            if (CPI < tv.cpi_red) {
                alerts.push({ id: `${project.id}-cpi-critical`, project, metric: 'CPI', value: CPI, threshold: tv.cpi_red, severity: 'critical', recommendation: _makeRec('cpi_critical') });
            } else if (CPI < tv.cpi_amber) {
                alerts.push({ id: `${project.id}-cpi-warning`, project, metric: 'CPI', value: CPI, threshold: tv.cpi_amber, severity: 'warning', recommendation: _makeRec('cpi_warning') });
            }
        }

        if (SPI !== null) {
            if (SPI < tv.spi_red) {
                const delayedTasks = tasks
                    .filter(task => num(task.pct_complete) < 100)
                    .sort((a, b) => (num(b.planned_cost) * (1 - num(b.pct_complete) / 100)) - (num(a.planned_cost) * (1 - num(a.pct_complete) / 100)))
                    .slice(0, 2);
                alerts.push({ id: `${project.id}-spi-critical`, project, metric: 'SPI', value: SPI, threshold: tv.spi_red, severity: 'critical', recommendation: _makeRec('spi_critical', delayedTasks.map(t => t.task_name).join(', ')), affectedTasks: delayedTasks });
            } else if (SPI < tv.spi_amber) {
                alerts.push({ id: `${project.id}-spi-warning`, project, metric: 'SPI', value: SPI, threshold: tv.spi_amber, severity: 'warning', recommendation: _makeRec('spi_warning') });
            }
        }
    });

    return alerts;
}
