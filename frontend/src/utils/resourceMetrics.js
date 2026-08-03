const number = value => Number(value) || 0;

export function equipmentVarianceView(items, limit = 10) {
    return items.map(item => {
        const planned = Math.min(100, Math.max(0, number(item.planned_utilization)));
        const actual = Math.min(100, Math.max(0, number(item.actual_utilization)));
        const variance = actual - planned;
        const shortfall = planned - actual;
        const state = shortfall <= 0 ? 'on_target' : shortfall < 10 ? 'small_shortfall' : 'material_shortfall';
        return {
            ...item,
            name: item.equipment_name || item.name || 'Unnamed equipment',
            planned,
            actual,
            variance,
            state,
            varianceLabel: variance >= 0 ? `${variance.toFixed(1)}% above plan` : `${Math.abs(variance).toFixed(1)}% shortfall`,
        };
    }).sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance)).slice(0, limit);
}

export function budgetCategoryView(items, limit = 10) {
    return items.map(item => {
        const planned = number(item.planned_amount ?? item.planned);
        const actual = number(item.actual_amount ?? item.actual);
        const variance = planned - actual;
        const usage = planned > 0 ? actual / planned : actual > 0 ? Number.POSITIVE_INFINITY : 0;
        const state = variance < 0 ? 'overrun' : usage >= 0.9 ? 'near_limit' : 'favorable';
        return { ...item, planned, actual, variance, state };
    }).sort((a, b) => {
        if (a.state === 'overrun' && b.state !== 'overrun') return -1;
        if (b.state === 'overrun' && a.state !== 'overrun') return 1;
        return Math.abs(b.variance) - Math.abs(a.variance);
    }).slice(0, limit);
}
