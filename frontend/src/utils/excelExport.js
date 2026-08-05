/**
 * excelExport.js — shared SheetJS workbook export helper.
 * Location: frontend/src/utils/excelExport.js
 *
 * Extracted from the inline export in PlanVsActual so every page exports the
 * same way. Column widths are auto-sized from cell contents instead of being
 * hand-tuned per call.
 */
import * as XLSX from 'xlsx';

// Excel hard-limits sheet names to 31 chars and forbids : \ / ? * [ ]
const cleanSheetName = (name) => String(name).replace(/[:\\/?*[\]]/g, ' ').slice(0, 31);

// Width = longest cell (header or value) in the column, clamped to a sane range.
const autoCols = (rows) => {
    if (!rows.length) return [];
    const keys = Object.keys(rows[0]);
    return keys.map((key) => {
        const longest = rows.reduce((max, row) => {
            const v = row[key];
            const len = v === null || v === undefined ? 0 : String(v).length;
            return len > max ? len : max;
        }, key.length);
        return { wch: Math.min(Math.max(longest + 2, 8), 60) };
    });
};

/**
 * Build and download an .xlsx workbook.
 * @param {string} filename - e.g. 'Projects_2026-06-13.xlsx'
 * @param {Array<{name: string, rows: object[], cols?: Array<{wch:number}>}>} sheets
 */
export function exportWorkbook(filename, sheets) {
    const wb = XLSX.utils.book_new();
    sheets.forEach(({ name, rows, cols }) => {
        // json_to_sheet needs at least one row to emit headers
        const data = rows && rows.length ? rows : [{}];
        const ws = XLSX.utils.json_to_sheet(data);
        ws['!cols'] = cols || autoCols(rows || []);
        XLSX.utils.book_append_sheet(wb, ws, cleanSheetName(name));
    });
    XLSX.writeFile(wb, filename);
}

/** `${prefix}_${code?}_${YYYY-MM-DD}.xlsx` — code segment omitted when falsy. */
export function exportFilename(prefix, code) {
    const now = new Date();
    const date = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
    ].join('-');
    return [prefix, code, date].filter(Boolean).join('_') + '.xlsx';
}
