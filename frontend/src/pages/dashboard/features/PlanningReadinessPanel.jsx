import { useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertTriangle, ArrowRight, CheckCircle2, CircleAlert, GitCompareArrows,
    Info, Loader2, Lock, RefreshCw, ShieldCheck, Unlink, X,
} from 'lucide-react';
import { apiFetch } from '../../../utils/api';

const STATUS = {
    blocked: {
        label: 'Blocked',
        description: 'Resolve every blocker before locking the baseline.',
        className: 'text-rose-700 bg-rose-50 border-rose-200',
        icon: CircleAlert,
    },
    ready_with_warnings: {
        label: 'Ready with warnings',
        description: 'The plan can be locked. Review the warnings before confirming.',
        className: 'text-amber-700 bg-amber-50 border-amber-200',
        icon: AlertTriangle,
    },
    ready: {
        label: 'Ready',
        description: 'No structural blockers or planning warnings were found.',
        className: 'text-emerald-700 bg-emerald-50 border-emerald-200',
        icon: CheckCircle2,
    },
};

const SEVERITY = {
    blocker: { label: 'Blockers', icon: CircleAlert, text: 'text-rose-700', selected: 'bg-rose-50' },
    warning: { label: 'Warnings', icon: AlertTriangle, text: 'text-amber-700', selected: 'bg-amber-50' },
    info: { label: 'Information', icon: Info, text: 'text-slate-600', selected: 'bg-slate-100' },
};

const findingKey = finding => {
    const edge = finding.edge ? `${finding.edge.predecessorId}>${finding.edge.successorId}` : '';
    return `${finding.code}|${(finding.taskIds || []).join(',')}|${edge}`;
};

const formatDate = value => {
    if (!value) return '—';
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

const formatVariance = days => {
    if (days == null) return 'Not available';
    if (days === 0) return 'On project finish';
    return `${days > 0 ? '+' : ''}${days} day${Math.abs(days) === 1 ? '' : 's'}`;
};

function ReadinessSkeleton() {
    return (
        <div className="grid lg:grid-cols-[minmax(260px,2fr)_minmax(0,3fr)] animate-pulse" aria-hidden="true">
            <div className="p-6 border-b lg:border-b-0 lg:border-r border-slate-200 space-y-3">
                {[72, 88, 64, 80].map(width => <div key={width} className="h-11 rounded-xl bg-slate-100" style={{ width: `${width}%` }} />)}
            </div>
            <div className="p-6 space-y-4">
                <div className="h-5 w-52 bg-slate-100 rounded" />
                <div className="h-4 w-full max-w-xl bg-slate-100 rounded" />
                <div className="h-24 w-full bg-slate-100 rounded-2xl" />
            </div>
        </div>
    );
}

function PreviewResult({ preview, tasks }) {
    const taskById = useMemo(() => new Map(tasks.map(task => [String(task.id), task])), [tasks]);
    const isRemoval = preview.remedy === 'remove_dependency';
    const predecessor = taskById.get(String(preview.sourceEdge.predecessorId));
    const successor = taskById.get(String(preview.sourceEdge.successorId));

    return (
        <div className="mt-6 border-t border-slate-200 pt-5" aria-live="polite">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Temporary comparison</p>
                    <p className="mt-1 text-sm text-slate-600">
                        {isRemoval
                            ? `Remove ${predecessor?.task_name || 'predecessor'} from ${successor?.task_name || 'successor'}.`
                            : 'Move only the selected successor and downstream tasks that would otherwise start too early.'}
                    </p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-slate-500">Not saved</span>
            </div>

            <dl className="mt-5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 text-sm">
                <div>
                    <dt className="text-xs text-slate-400">Before finish</dt>
                    <dd className="mt-1 font-semibold text-slate-700">{formatDate(preview.before.projectedFinish)}</dd>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-300" aria-hidden="true" />
                <div>
                    <dt className="text-xs text-slate-400">After finish</dt>
                    <dd className="mt-1 font-semibold text-slate-700">{formatDate(preview.after.projectedFinish)}</dd>
                </div>
                <div>
                    <dt className="text-xs text-slate-400">Before blockers</dt>
                    <dd className="mt-1 font-semibold text-slate-700">{preview.before.summary.blockers}</dd>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-300" aria-hidden="true" />
                <div>
                    <dt className="text-xs text-slate-400">After blockers</dt>
                    <dd className="mt-1 font-semibold text-slate-700">{preview.after.summary.blockers}</dd>
                </div>
                <div>
                    <dt className="text-xs text-slate-400">Before warnings</dt>
                    <dd className="mt-1 font-semibold text-slate-700">{preview.before.summary.warnings}</dd>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-300" aria-hidden="true" />
                <div>
                    <dt className="text-xs text-slate-400">After warnings</dt>
                    <dd className="mt-1 font-semibold text-slate-700">{preview.after.summary.warnings}</dd>
                </div>
            </dl>

            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-500">
                <span><strong className="text-slate-700">Project variance:</strong> {formatVariance(preview.after.projectEndVarianceDays)}</span>
                <span><strong className="text-slate-700">Resolved:</strong> {preview.resolvedFindings.length}</span>
                <span><strong className="text-slate-700">Introduced:</strong> {preview.introducedFindings.length}</span>
            </div>

            {preview.changes.length > 0 ? (
                <div className="mt-4 max-h-48 overflow-y-auto rounded-xl border border-slate-200" tabIndex="0" aria-label="Temporarily shifted tasks">
                    {preview.changes.map(change => (
                        <div key={change.taskId} className="px-4 py-3 border-b border-slate-100 last:border-b-0">
                            <p className="text-sm font-semibold text-slate-700 truncate">{change.taskName}</p>
                            <p className="mt-1 text-xs text-slate-500">
                                {formatDate(change.before.planned_start)}–{formatDate(change.before.planned_end)}
                                <ArrowRight className="inline w-3 h-3 mx-1.5" aria-hidden="true" />
                                {formatDate(change.after.planned_start)}–{formatDate(change.after.planned_end)}
                            </p>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="mt-4 text-sm text-slate-500">No task dates change in this preview.</p>
            )}

            <p className="mt-4 text-xs text-slate-500">
                This comparison is temporary. Use the existing task editor to make any real correction.
            </p>
        </div>
    );
}

export default function PlanningReadinessPanel({ projectId, tasks, canLock, onClose, onOpenTask, onRequestLock, onHighlightTasks }) {
    const headingRef = useRef(null);
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedKey, setSelectedKey] = useState('');
    const [preview, setPreview] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState('');

    const loadReadiness = async () => {
        setLoading(true);
        setError('');
        setPreview(null);
        setPreviewError('');
        try {
            const response = await apiFetch(`/projects/${projectId}/planning-readiness`);
            const nextReport = response.data;
            const firstFinding = nextReport.findings.find(finding => finding.severity === 'blocker')
                || nextReport.findings.find(finding => finding.severity === 'warning');
            setReport(nextReport);
            setSelectedKey(firstFinding ? findingKey(firstFinding) : '');
            onHighlightTasks(firstFinding?.taskIds || []);
        } catch (requestError) {
            setReport(null);
            setError(requestError.message || 'Could not check this plan.');
            onHighlightTasks([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        headingRef.current?.focus();
        loadReadiness();
        return () => onHighlightTasks([]);
        // This workspace intentionally reloads only when it is opened for a project.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId]);

    const selectedFinding = report?.findings.find(finding => findingKey(finding) === selectedKey) || null;
    const affectedTasks = (selectedFinding?.taskIds || [])
        .map(id => tasks.find(task => String(task.id) === String(id)))
        .filter(Boolean);
    const affectedWbsCodes = [...new Set(affectedTasks.map(task => task.wbs_code).filter(Boolean))];

    const selectFinding = finding => {
        setSelectedKey(findingKey(finding));
        setPreview(null);
        setPreviewError('');
        onHighlightTasks(finding.taskIds || []);
    };

    const runPreview = async remedy => {
        if (!selectedFinding?.edge) return;
        setPreviewLoading(true);
        setPreview(null);
        setPreviewError('');
        try {
            const response = await apiFetch(`/projects/${projectId}/planning-readiness/dependency-preview`, {
                method: 'POST',
                body: JSON.stringify({
                    predecessorId: selectedFinding.edge.predecessorId,
                    successorId: selectedFinding.edge.successorId,
                    remedy,
                }),
            });
            setPreview(response.data);
        } catch (requestError) {
            setPreviewError(requestError.message || 'Could not calculate this temporary preview.');
        } finally {
            setPreviewLoading(false);
        }
    };

    const status = STATUS[report?.state] || STATUS.blocked;
    const StatusIcon = status.icon;

    return (
        <section className="ml-0 lg:ml-14 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm" aria-labelledby="readiness-heading">
            <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div>
                    <div className="flex items-center gap-2.5">
                        <ShieldCheck className="w-5 h-5 text-slate-500" aria-hidden="true" />
                        <h3 id="readiness-heading" ref={headingRef} tabIndex="-1" className="text-lg font-bold text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded">
                            Baseline readiness
                        </h3>
                    </div>
                    {report && (
                        <p className="mt-1.5 text-sm text-slate-500">
                            {status.label}: {report.summary.blockers} blocker{report.summary.blockers === 1 ? '' : 's'} · {report.summary.warnings} warning{report.summary.warnings === 1 ? '' : 's'}
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <button type="button" onClick={loadReadiness} disabled={loading}
                        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3.5 text-sm font-semibold text-slate-600 transition duration-150 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50">
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Re-run
                    </button>
                    <button type="button" onClick={onClose} aria-label="Close baseline readiness"
                        className="inline-flex size-10 items-center justify-center rounded-xl text-slate-500 transition duration-150 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <div aria-live="polite">
                {loading ? <ReadinessSkeleton /> : error ? (
                    <div className="px-6 py-12 text-center">
                        <CircleAlert className="mx-auto w-7 h-7 text-rose-600" />
                        <p className="mt-3 font-semibold text-slate-800">Readiness check failed</p>
                        <p className="mt-1 text-sm text-slate-500">{error}</p>
                        <button type="button" onClick={loadReadiness}
                            className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-800 px-4 text-sm font-semibold text-white hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500">
                            <RefreshCw className="w-4 h-4" /> Retry
                        </button>
                    </div>
                ) : report && (
                    <>
                        <div className="grid lg:grid-cols-[minmax(260px,2fr)_minmax(0,3fr)]">
                            <div className="border-b border-slate-200 p-5 lg:border-b-0 lg:border-r lg:p-6">
                                {['blocker', 'warning', 'info'].map(severity => {
                                    const findings = report.findings.filter(finding => finding.severity === severity);
                                    if (!findings.length) return null;
                                    const config = SEVERITY[severity];
                                    const SeverityIcon = config.icon;
                                    return (
                                        <div key={severity} className="mb-6 last:mb-0">
                                            <h4 className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${config.text}`}>
                                                <SeverityIcon className="w-3.5 h-3.5" /> {config.label}
                                            </h4>
                                            <div className="mt-2 space-y-1">
                                                {findings.map(finding => {
                                                    const selected = findingKey(finding) === selectedKey;
                                                    return (
                                                        <button key={findingKey(finding)} type="button" onClick={() => selectFinding(finding)}
                                                            aria-current={selected ? 'true' : undefined}
                                                            className={`w-full rounded-xl px-3 py-2.5 text-left transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${selected ? config.selected : 'hover:bg-slate-50'}`}>
                                                            <span className="block text-sm font-semibold text-slate-700">{finding.title}</span>
                                                            <span className="mt-0.5 block text-xs text-slate-500">{finding.explanation}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="min-w-0 p-5 lg:p-6">
                                <div className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-bold ${status.className}`}>
                                    <StatusIcon className="w-3.5 h-3.5" /> {status.label}
                                </div>
                                {selectedFinding ? (
                                    <>
                                        <h4 className="mt-4 text-lg font-bold text-slate-800">{selectedFinding.title}</h4>
                                        <p className="mt-1.5 text-sm leading-6 text-slate-600">{selectedFinding.explanation}</p>

                                        {(affectedTasks.length > 0 || affectedWbsCodes.length > 0) && (
                                            <div className="mt-4 text-sm">
                                                {affectedTasks.length > 0 && (
                                                    <p className="text-slate-500"><span className="font-semibold text-slate-700">Affected tasks:</span> {affectedTasks.map(task => task.task_name).join(', ')}</p>
                                                )}
                                                {affectedWbsCodes.length > 0 && (
                                                    <p className="mt-1 text-slate-500"><span className="font-semibold text-slate-700">WBS:</span> {affectedWbsCodes.join(', ')}</p>
                                                )}
                                            </div>
                                        )}

                                        {selectedFinding.code === 'DATE_ORDER_CONFLICT' && (
                                            <div className="mt-5">
                                                {selectedFinding.previewAvailable ? (
                                                    <div className="flex flex-wrap gap-2">
                                                        <button type="button" onClick={() => runPreview('shift_successor_chain')} disabled={previewLoading}
                                                            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-800 px-4 text-sm font-semibold text-white transition duration-150 hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 disabled:opacity-50">
                                                            {previewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitCompareArrows className="w-4 h-4" />} Preview shift chain
                                                        </button>
                                                        <button type="button" onClick={() => runPreview('remove_dependency')} disabled={previewLoading}
                                                            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition duration-150 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50">
                                                            <Unlink className="w-4 h-4" /> Preview remove dependency
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                                                        Shift preview is unavailable until the dependency cycle is resolved.
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {previewError && <p role="alert" className="mt-4 text-sm font-semibold text-rose-700">{previewError}</p>}
                                        {preview && <PreviewResult preview={preview} tasks={tasks} />}

                                        {affectedTasks.length > 0 && (
                                            <button type="button" onClick={() => onOpenTask(affectedTasks[affectedTasks.length > 1 ? 1 : 0].id)}
                                                className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition duration-150 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
                                                Open task <ArrowRight className="w-4 h-4" />
                                            </button>
                                        )}
                                    </>
                                ) : (
                                    <div className="mt-5">
                                        <h4 className="text-lg font-bold text-slate-800">Plan checks complete</h4>
                                        <p className="mt-1.5 text-sm text-slate-600">{status.description}</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex flex-col gap-4 border-t border-slate-200 bg-slate-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                            <p className="text-sm font-semibold text-slate-600">{status.description}</p>
                            <div className="flex items-center gap-2 shrink-0">
                                <button type="button" onClick={loadReadiness}
                                    className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
                                    <RefreshCw className="w-4 h-4" /> Re-run
                                </button>
                                {canLock && (
                                    <button type="button" onClick={() => onRequestLock(report)} disabled={report.summary.blockers > 0}
                                        title={report.summary.blockers > 0 ? 'Resolve all blockers before locking' : 'Continue to baseline confirmation'}
                                        className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition duration-150 hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-300">
                                        <Lock className="w-4 h-4" /> {report.summary.blockers > 0 ? 'Lock disabled' : 'Continue to lock'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </section>
    );
}
