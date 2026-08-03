import { useState, useRef, useEffect } from 'react';
import { Upload, CheckCircle2, AlertTriangle, FileSpreadsheet, X, ArrowRight, Download, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { INPUT_CLASS } from '../../../utils/uiConstants';
import { recordAudit } from '../../../utils/auditLog';
import { TASK_COLUMNS as TASK_FIELDS, TASK_TEMPLATE_ROWS } from '../../../utils/taskSchema';
import { apiFetch } from '../../../utils/api';
import { autoDetectMapping, validateRow, parseTask } from '../../../utils/excelImportParse';

export default function ExcelImport() {
    const userRole  = localStorage.getItem('userRole');
    const canImport = ['Project Manager', 'Planner'].includes(userRole);
    // Replace deletes existing tasks first, but DELETE /tasks/:id is Project-Manager-only
    // (server.js authorize), so a Planner's Replace import 403s mid-way. Gate it to PM.
    // NOTE: the replace flow is still non-atomic (delete-all then insert) — a failed insert
    // leaves the project empty; a transactional bulk-replace endpoint is a follow-up.
    const canReplace = userRole === 'Project Manager';

    const [selectedProjectId, setSelectedProjectId] = useState('');
    const [fileName, setFileName]                   = useState('');
    const [headers, setHeaders]                     = useState([]);
    const [dataRows, setDataRows]                   = useState([]);
    const [mapping, setMapping]                     = useState({});
    const [step, setStep]                           = useState('upload'); // 'upload' | 'mapping' | 'validation' | 'done'
    const [validationResults, setValidationResults] = useState([]);
    const [importedCount, setImportedCount]         = useState(0);
    const [isDragging, setIsDragging]               = useState(false);
    const [isImporting, setIsImporting]             = useState(false);
    const [importError, setImportError]             = useState('');
    const [importMode, setImportMode]               = useState('append'); // 'append' | 'replace'
    const fileInputRef = useRef(null);

    // Real data from API — replaces dummyProjectsEvm
    const [projects, setProjects] = useState([]);

    useEffect(() => {
        apiFetch('/projects').then(r => setProjects(r.data || [])).catch(console.error);
    }, []);

    const handleFile = (file) => {
        if (!file) return;
        const validTypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            'text/csv',
        ];
        if (!validTypes.includes(file.type) && !file.name.match(/\.(xlsx?|csv)$/i)) {
            alert('Please upload an .xlsx, .xls, or .csv file.');
            return;
        }

        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            // cellDates keeps real Excel date cells as Date objects instead of
            // raw serial numbers; toISODate (excelImportParse) converts them.
            const wb   = XLSX.read(data, { type: 'array', cellDates: true });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const raw   = XLSX.utils.sheet_to_json(sheet, { header: 1 });

            if (raw.length < 2) {
                alert('Spreadsheet must have at least a header row and one data row.');
                return;
            }

            const hdrs = raw[0].map(h => (h ?? '').toString());
            const rows = raw.slice(1).filter(r => r.some(cell => cell !== undefined && cell !== ''));

            if (rows.length === 0) {
                alert('No data rows found below the header row.');
                return;
            }

            setHeaders(hdrs);
            setDataRows(rows);
            setMapping(autoDetectMapping(hdrs));
            setStep('mapping');
        };
        reader.readAsArrayBuffer(file);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        handleFile(file);
    };

    const handleValidate = () => {
        if (dataRows.length === 0) return;
        const results = dataRows.map((row, idx) => ({
            rowIndex: idx,
            errors:   validateRow(row, mapping),
            data:     row,
        }));
        setValidationResults(results);
        setStep('validation');
    };

    const validRows   = validationResults.filter(r => r.errors.length === 0);
    const invalidRows = validationResults.filter(r => r.errors.length > 0);

    // Every required field must be mapped before validation is meaningful.
    const requiredMapped = TASK_FIELDS
        .filter(f => f.required)
        .every(f => mapping[f.key] !== undefined && mapping[f.key] !== '');

    const handleDownloadTemplate = () => {
        // Template columns come from the shared schema, so they match the export exactly.
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(TASK_TEMPLATE_ROWS);
        ws['!cols'] = [{ wch: 24 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 8 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Task Import Template');
        XLSX.writeFile(wb, 'Task_Import_Template.xlsx');
    };

    // Wire to real API — POST /api/projects/:id/tasks/import
    const handleImport = async () => {
        if (validRows.length === 0 || !selectedProjectId) return;
        if (importMode === 'replace' &&
            !window.confirm('Replace all tasks for this project? This permanently deletes the current tasks before importing.')) {
            return;
        }
        setIsImporting(true);
        setImportError('');
        try {
            const tasks = validRows.map(r => parseTask(r.data, mapping));
            if (importMode === 'replace') {
                const existing = await apiFetch(`/projects/${selectedProjectId}/tasks`);
                for (const t of (existing.data || [])) {
                    await apiFetch(`/tasks/${t.id}`, { method: 'DELETE' });
                }
            }
            const res   = await apiFetch(`/projects/${selectedProjectId}/tasks/import`, {
                method: 'POST',
                body:   JSON.stringify({ tasks }),
            });
            if (!res.success) throw new Error(res.message || 'Import failed.');
            const count = res.imported || tasks.length;
            setImportedCount(count);
            recordAudit({ action: importMode === 'replace' ? 'UPDATE' : 'CREATE', resource_type: 'task', resource_id: `${count} tasks`, detail: `Imported ${count} tasks from ${fileName} (${importMode})` });
            setStep('done');
        } catch (e) {
            setImportError(e.message);
        } finally {
            setIsImporting(false);
        }
    };

    const handleReset = () => {
        setFileName('');
        setHeaders([]);
        setDataRows([]);
        setMapping({});
        setValidationResults([]);
        setImportedCount(0);
        setImportError('');
        setStep('upload');
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const inputClass = INPUT_CLASS;

    if (!canImport) {
        return (
            <div className="space-y-8">

                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-16">
                    <div className="flex flex-col items-center justify-center gap-2">
                        <Upload className="w-12 h-12 text-slate-200" />
                        <p className="text-slate-400">Only Project Managers and Planners can import task data.</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8">

            {/* ACTIONS */}
            {step !== 'upload' && step !== 'done' && (
                <div className="flex justify-end mb-6">
                    <button onClick={handleReset} className="text-sm font-semibold text-slate-500 hover:text-slate-700 bg-slate-100 px-4 py-2.5 rounded-xl transition-colors flex items-center gap-2">
                        <X className="w-4 h-4" /> Start Over
                    </button>
                </div>
            )}

            {/* STEP INDICATOR */}
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
                {['Upload', 'Map Columns', 'Validate', 'Import'].map((label, i) => {
                    const stepMap    = ['upload', 'mapping', 'validation', 'done'];
                    const currentIdx = stepMap.indexOf(step);
                    const isActive   = i === currentIdx;
                    const isDone     = i < currentIdx;
                    return (
                        <div key={label} className="flex items-center gap-2">
                            {i > 0 && <ArrowRight className="w-3 h-3 text-slate-300" />}
                            <span className={`px-3 py-1.5 rounded-lg border ${
                                isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                isDone   ? 'bg-emerald-500 text-white border-emerald-500' :
                                           'bg-slate-50 text-slate-400 border-slate-200'
                            }`}>
                                {isDone ? '✓' : ''} {label}
                            </span>
                        </div>
                    );
                })}
            </div>

            {/* PROJECT SELECTOR */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-5">Target Project</h3>
                <div className="max-w-md space-y-1">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">Project</label>
                    <select
                        value={selectedProjectId}
                        onChange={e => setSelectedProjectId(e.target.value)}
                        className={inputClass}
                    >
                        <option value="">Select a project...</option>
                        {projects.map(p => (
                            <option key={p.id} value={p.id}>{p.project_code} — {p.project_name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* STEP 1: FILE UPLOAD */}
            {step === 'upload' && (
                <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`bg-white rounded-3xl border-2 border-dashed p-16 text-center cursor-pointer transition-all duration-200 ${
                        isDragging
                            ? 'border-emerald-400 bg-emerald-50/50'
                            : 'border-slate-200 hover:border-emerald-300 hover:bg-slate-50'
                    }`}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={(e) => handleFile(e.target.files[0])}
                        className="hidden"
                    />
                    <div className="flex flex-col items-center gap-3">
                        <div className={`p-4 rounded-2xl transition-colors ${isDragging ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                            <Upload className="w-8 h-8" />
                        </div>
                        <div>
                            <p className="font-semibold text-slate-700">Drop your Excel file here, or click to browse</p>
                            <p className="text-xs text-slate-400 mt-1">Accepts .xlsx, .xls, and .csv files</p>
                        </div>
                        <button
                            onClick={(e) => { e.stopPropagation(); handleDownloadTemplate(); }}
                            className="mt-2 text-xs font-semibold text-slate-500 bg-white px-4 py-2 rounded-lg border border-slate-200 transition-all flex items-center gap-1.5 hover:bg-slate-50 hover:text-slate-700 hover:border-slate-300"
                        >
                            <Download className="w-3.5 h-3.5" /> Download Template
                        </button>
                    </div>
                </div>
            )}

            {/* STEP 2: COLUMN MAPPING */}
            {step === 'mapping' && (
                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-50 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-emerald-50 rounded-xl text-emerald-600">
                                <FileSpreadsheet className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-700">Column Mapping</h3>
                                <p className="text-xs text-slate-400 mt-0.5">{fileName} — {dataRows.length} data rows detected</p>
                            </div>
                        </div>
                        <button
                            onClick={handleValidate}
                            disabled={!requiredMapped}
                            title={!requiredMapped ? 'Map all required (*) fields first' : undefined}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-semibold text-sm shadow-lg shadow-emerald-200 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                        >
                            Validate <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="p-6 space-y-4">
                        <p className="text-sm text-slate-500">Map each task field to a column from your spreadsheet. Auto-detected mappings are pre-selected.</p>
                        {!requiredMapped && (
                            <p className="text-xs font-semibold text-amber-600 flex items-center gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5" /> Map all required (*) fields to enable validation.
                            </p>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {TASK_FIELDS.map(field => (
                                <div key={field.key} className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">
                                        {field.label}
                                        {field.required && <span className="text-red-500 ml-0.5">*</span>}
                                    </label>
                                    <select
                                        value={mapping[field.key] ?? ''}
                                        onChange={e => setMapping({ ...mapping, [field.key]: e.target.value === '' ? '' : parseInt(e.target.value) })}
                                        className={inputClass}
                                    >
                                        <option value="">— Skip —</option>
                                        {headers.map((h, i) => (
                                            <option key={i} value={i}>Col {i + 1}: {h}</option>
                                        ))}
                                    </select>
                                </div>
                            ))}
                        </div>

                        {/* Preview first 5 rows */}
                        <div className="mt-6">
                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Preview (first 5 rows)</h4>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50/80 text-xs uppercase tracking-wider text-slate-500 font-bold">
                                            <th className="px-3 py-3">#</th>
                                            {TASK_FIELDS.filter(f => mapping[f.key] !== undefined && mapping[f.key] !== '').map(f => (
                                                <th key={f.key} className="px-3 py-3">{f.label}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="text-sm font-medium text-slate-600 divide-y divide-slate-50">
                                        {dataRows.slice(0, 5).map((row, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50/50">
                                                <td className="px-3 py-2.5 text-slate-400">{idx + 1}</td>
                                                {TASK_FIELDS.filter(f => mapping[f.key] !== undefined && mapping[f.key] !== '').map(f => (
                                                    <td key={f.key} className="px-3 py-2.5">{row[mapping[f.key]] ?? ''}</td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* STEP 3: VALIDATION RESULTS */}
            {step === 'validation' && (
                <div className="space-y-4">
                    {/* Summary chips */}
                    <div className="flex flex-wrap gap-3">
                        <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-sm font-semibold">
                            <CheckCircle2 className="w-4 h-4" />
                            {validRows.length} valid rows
                        </div>
                        {invalidRows.length > 0 && (
                            <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 border border-red-100 text-red-700 rounded-xl text-sm font-semibold">
                                <AlertTriangle className="w-4 h-4" />
                                {invalidRows.length} rows with errors
                            </div>
                        )}
                    </div>

                    {/* Import error */}
                    {importError && (
                        <div className="flex items-center gap-3 px-5 py-4 bg-red-50 border border-red-100 rounded-2xl text-red-700 text-sm font-semibold">
                            <AlertTriangle className="w-4 h-4 shrink-0" /> {importError}
                        </div>
                    )}

                    {/* Validation table */}
                    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                        <div className="p-6 border-b border-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <h3 className="font-bold text-slate-700">Validation Results</h3>
                                <p className="text-xs text-slate-400 mt-0.5">{validRows.length} of {validationResults.length} rows ready to import</p>
                                {importMode === 'replace' && (
                                    <p className="text-[11px] font-semibold text-red-500 mt-1">Replace deletes this project's current tasks first.</p>
                                )}
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl" role="group" aria-label="Import mode">
                                    {[['append', 'Append'], ...(canReplace ? [['replace', 'Replace all']] : [])].map(([m, label]) => (
                                        <button
                                            key={m}
                                            type="button"
                                            onClick={() => setImportMode(m)}
                                            className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${
                                                importMode === m
                                                    ? (m === 'replace' ? 'bg-white text-red-600 shadow-sm' : 'bg-white text-emerald-700 shadow-sm')
                                                    : 'text-slate-400 hover:text-slate-600'
                                            }`}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    onClick={handleImport}
                                    disabled={validRows.length === 0 || !selectedProjectId || isImporting}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-semibold text-sm shadow-lg shadow-emerald-200 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                                >
                                    {isImporting
                                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing...</>
                                        : <><Upload className="w-4 h-4" /> Import {validRows.length} Tasks</>
                                    }
                                </button>
                            </div>
                        </div>

                        <div className="overflow-x-auto max-h-96">
                            <table className="w-full text-left border-collapse">
                                <thead className="sticky top-0">
                                    <tr className="bg-slate-50/80 text-xs uppercase tracking-wider text-slate-500 font-bold">
                                        <th className="px-4 py-3">Row</th>
                                        <th className="px-4 py-3">Status</th>
                                        <th className="px-4 py-3">Task Name</th>
                                        <th className="px-4 py-3">WBS</th>
                                        <th className="px-4 py-3">Details / Errors</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm font-medium text-slate-600 divide-y divide-slate-50">
                                    {validationResults.map(r => {
                                        const isValid     = r.errors.length === 0;
                                        const taskNameIdx = mapping.task_name;
                                        const wbsIdx      = mapping.wbs_code;
                                        return (
                                            <tr key={r.rowIndex} className={`${isValid ? 'hover:bg-slate-50/50' : 'bg-red-50/30'} transition-colors`}>
                                                <td className="px-4 py-3 text-slate-400">{r.rowIndex + 1}</td>
                                                <td className="px-4 py-3">
                                                    {isValid ? (
                                                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                                    ) : (
                                                        <AlertTriangle className="w-4 h-4 text-red-500" />
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 font-semibold text-slate-700">
                                                    {taskNameIdx !== undefined ? r.data[taskNameIdx] || '—' : '—'}
                                                </td>
                                                <td className="px-4 py-3 font-mono text-xs text-slate-400">
                                                    {wbsIdx !== undefined ? r.data[wbsIdx] || '—' : '—'}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {isValid ? (
                                                        <span className="text-emerald-600 text-xs">Ready to import</span>
                                                    ) : (
                                                        <div className="space-y-0.5">
                                                            {r.errors.map((err, i) => (
                                                                <p key={i} className="text-red-600 text-xs">{err}</p>
                                                            ))}
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* STEP 4: SUCCESS */}
            {step === 'done' && (
                <div className="bg-white rounded-3xl border border-emerald-100 shadow-sm p-12">
                    <div className="flex flex-col items-center justify-center gap-4">
                        <div className="p-4 bg-emerald-50 rounded-2xl text-emerald-600">
                            <CheckCircle2 className="w-10 h-10" />
                        </div>
                        <div className="text-center">
                            <h3 className="text-xl font-bold text-slate-800">Import Complete</h3>
                            <p className="text-slate-500 mt-1">
                                Successfully imported <strong className="text-emerald-700">{importedCount} tasks</strong> from {fileName}
                            </p>
                        </div>
                        <button
                            onClick={handleReset}
                            className="mt-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl font-semibold text-sm shadow-lg shadow-emerald-200 transition-all"
                        >
                            Import Another File
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}