const WHOLE_NUMBER_PATTERN = /^[\d,\s]*$/;

export function parseGroupedWholeNumber(value) {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const text = String(value);
    if (!WHOLE_NUMBER_PATTERN.test(text)) return Number.NaN;
    const digits = text.replace(/[,\s]/g, '');
    if (!digits || !/^\d+$/.test(digits)) return Number.NaN;
    const parsed = Number(digits);
    return Number.isSafeInteger(parsed) ? parsed : Number.NaN;
}

export function formatWholeNumber(value) {
    if (value === null || value === undefined || value === '') return '';
    const numeric = typeof value === 'number' ? value : parseGroupedWholeNumber(value);
    if (!Number.isFinite(numeric)) return '';
    return Math.max(0, Math.trunc(numeric)).toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    });
}

export function formatGroupedWholeInput(value) {
    if (value === '') return '';
    const parsed = parseGroupedWholeNumber(value);
    return Number.isNaN(parsed) ? null : formatWholeNumber(parsed);
}

export function formatCompactWholeNumber(value) {
    const numeric = Number(value) || 0;
    const absolute = Math.abs(numeric);
    if (absolute >= 1_000_000_000) return `${Number((numeric / 1_000_000_000).toFixed(1))}B`;
    if (absolute >= 1_000_000) return `${Number((numeric / 1_000_000).toFixed(1))}M`;
    if (absolute >= 1_000) return `${Number((numeric / 1_000).toFixed(1))}K`;
    return formatWholeNumber(numeric);
}
