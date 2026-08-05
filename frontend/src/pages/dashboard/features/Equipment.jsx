
import { useState, useEffect, useMemo } from 'react';
import {
    Plus, Search, X, Loader2, CheckCircle2, AlertTriangle,
    Wrench, Pencil, Trash2, Download, Activity
} from 'lucide-react';
import { BarChart, Bar, CartesianGrid, Cell, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { apiFetch } from '../../../utils/api';
import { exportWorkbook, exportFilename } from '../../../utils/excelExport';
import { equipmentVarianceView } from '../../../utils/resourceMetrics';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const STATUS_BADGE = {
    available: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    in_use: 'bg-blue-50 text-blue-700 border-blue-100',
    maintenance: 'bg-amber-50 text-amber-700 border-amber-100',
    out_of_service: 'bg-red-50 text-red-700 border-red-100',
};

export default function Equipment({ initialProjectId, onConsumeInitial }) {
    const [equipment, setEquipment] = useState([]);
    const [projects, setProjects] = useState([]);
    const [selectedProjectId, setSelectedProjectId] = useState('');
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    // Add / Edit modal
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingEquipment, setEditingEquipment] = useState(null);
    const [addForm, setAddForm] = useState({
        name: '', type: '', operator: '', location: '', status: 'available', last_service: '', utilization: 0,
        planned_utilization: 0, actual_utilization: 0
    });
    const [addError, setAddError] = useState('');
    const [savingAdd, setSavingAdd] = useState(false);

    // Delete confirm
    const [deletingId, setDeletingId] = useState(null);
    const [deletingEquipment, setDeletingEquipment] = useState(false);
    const [deleteError, setDeleteError] = useState('');

    const [toast, setToast] = useState({ msg: '', type: 'success' });

    const userRole = localStorage.getItem('userRole');
    const canEdit = ['Project Manager', 'Planner'].includes(userRole);
    const canDelete = userRole === 'Project Manager';

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast({ msg: '', type: 'success' }), 3000);
    };

    // Fetch projects and equipment
    const fetchProjects = async () => {
        try {
            const res = await apiFetch('/projects');
            if (res.success && res.data) {
                setProjects(res.data);
                if (res.data.length > 0) {
                    const initialId = initialProjectId || res.data[0].id;
                    setSelectedProjectId(String(initialId));
                }
            }
        } catch (e) { console.error(e); }
    };

    const fetchEquipment = async (projectId) => {
        if (!projectId) return;
        setLoading(true);
        try {
            const res = await apiFetch(`/equipment?project_id=${projectId}`);
            setEquipment(res.data || []);
        } catch (e) {
            showToast(e.message || 'Failed to load equipment.', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchProjects(); }, [initialProjectId]);

    useEffect(() => {
        if (selectedProjectId) fetchEquipment(selectedProjectId);
    }, [selectedProjectId]);

    useEffect(() => {
        if (initialProjectId && onConsumeInitial) {
            onConsumeInitial();
        }
    }, [initialProjectId, onConsumeInitial]);

    useEffect(() => {
        const handler = (e) => { if (e.key === 'Escape') { setIsAddModalOpen(false); setDeletingId(null); } };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, []);

    // KPI
    const counts = useMemo(() => ({
        total: equipment.length,
        available: equipment.filter(e => e.status === 'available').length,
        inUse: equipment.filter(e => e.status === 'in_use').length,
        maintenance: equipment.filter(e => e.status === 'maintenance').length,
        averageUtilization: equipment.length
            ? equipment.reduce((sum, item) => sum + (Number(item.utilization) || 0), 0) / equipment.length
            : 0,
    }), [equipment]);

    // Filter
    const filtered = useMemo(() => equipment.filter(e => {
        if (search && !e.name.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    }), [equipment, search]);
    const varianceRows = useMemo(() => equipmentVarianceView(filtered), [filtered]);

    // Add / Edit
    const openAddModal = () => {
        setEditingEquipment(null);
        setAddForm({ name: '', type: '', operator: '', location: '', status: 'available', last_service: '', utilization: 0, planned_utilization: 0, actual_utilization: 0 });
        setAddError(''); setIsAddModalOpen(true);
    };

    const openEditModal = (equip) => {
        setEditingEquipment(equip);
        setAddForm({
            name: equip.name,
            type: equip.type || '',
            operator: equip.operator || '',
            location: equip.location || '',
            status: equip.status || 'available',
            last_service: equip.last_service || '',
            utilization: parseFloat(equip.utilization) || 0,
            planned_utilization: parseFloat(equip.planned_utilization) || 0,
            actual_utilization: parseFloat(equip.actual_utilization) || 0
        });
        setAddError(''); setIsAddModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault(); setAddError('');
        if (!addForm.name.trim()) { setAddError('Name is required.'); return; }
        const utilizationFields = [
            ['Current utilization', addForm.utilization],
            ['Planned utilization', addForm.planned_utilization],
            ['Actual utilization', addForm.actual_utilization],
        ];
        const invalidUtilization = utilizationFields.find(([, value]) => value === '' || Number.isNaN(Number(value)) || Number(value) < 0 || Number(value) > 100);
        if (invalidUtilization) { setAddError(`${invalidUtilization[0]} must be between 0 and 100.`); return; }
        setSavingAdd(true);
        try {
            if (editingEquipment) {
                await apiFetch(`/equipment/${editingEquipment.id}`, {
                    method: 'PUT',
                    body: JSON.stringify(addForm),
                });
                showToast(`"${addForm.name}" updated successfully.`);
            } else {
                await apiFetch('/equipment', {
                    method: 'POST',
                    body: JSON.stringify({
                        ...addForm,
                        project_id: parseInt(selectedProjectId)
                    }),
                });
                showToast(`"${addForm.name}" added successfully.`);
            }
            setIsAddModalOpen(false);
            fetchEquipment(selectedProjectId);
        } catch (err) { setAddError(err.message || 'Failed.'); }
        finally { setSavingAdd(false); }
    };

    // Delete
    const handleDelete = async () => {
        if (!deletingId) return;
        setDeleteError(''); setDeletingEquipment(true);
        try {
            await apiFetch(`/equipment/${deletingId}`, { method: 'DELETE' });
            showToast('Equipment deleted successfully.');
            setDeletingId(null);
            fetchEquipment(selectedProjectId);
        } catch (err) { setDeleteError(err.message || 'Failed.'); }
        finally { setDeletingEquipment(false); }
    };

    // Export
    const handleExport = () => {
        const rows = equipment.map(e => ({
            Name: e.name,
            Type: e.type,
            Operator: e.operator,
            Location: e.location,
            Status: e.status,
            "Last Service": e.last_service,
            Utilization: e.utilization,
            "Planned Utilization": e.planned_utilization,
            "Actual Utilization": e.actual_utilization,
        }));
        exportWorkbook(exportFilename('Equipment'), [{ name: 'Equipment', rows }]);
    };

    const statusLabel = (s) => {
        switch (s) {
            case 'available': return 'Available';
            case 'in_use': return 'In Use';
            case 'maintenance': return 'Maintenance';
            case 'out_of_service': return 'Out of Service';
            default: return 'Unknown';
        }
    };
    const inputCls = "w-full px-4 py-3 bg-white/50 border border-slate-200 rounded-lg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all text-slate-700 text-sm";

    return (
        <div className="space-y-8">
            {/* Toast */}
            {toast.msg && (
                <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm font-semibold animate-in slide-in-from-top-2 fade-in duration-200 ${
                    toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white shadow-emerald-200'
                }`}>
                    {toast.type === 'error' ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                    {toast.msg}
                </div>
            )}

            {/* ACTIONS */}
            <div className="flex justify-end gap-3 mb-6">
                <button onClick={handleExport} disabled={equipment.length === 0}
                    className="bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 px-6 py-2.5 rounded-xl font-semibold shadow-sm transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                    <Download className="w-5 h-5" /> Export
                </button>
                {canEdit && (
                    <button onClick={openAddModal}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl font-semibold shadow-lg shadow-emerald-200 transition-all transform hover:-translate-y-0.5 flex items-center gap-2">
                        <Plus className="w-5 h-5" /> Add Equipment
                    </button>
                )}
            </div>

            {/* Project Selector */}
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest ml-1">Select Project</label>
                <select value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="mt-2 w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all text-slate-700 text-sm">
                    {projects.map(p => (
                        <option key={p.id} value={p.id}>{p.project_code} - {p.project_name}</option>
                    ))}
                </select>
            </div>

            {/* Compact fleet summary */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 grid grid-cols-2 lg:grid-cols-5 gap-4" aria-label="Fleet summary">
                {[
                    ['Fleet', counts.total, 'text-slate-800'],
                    ['Available', counts.available, 'text-emerald-700'],
                    ['In use', counts.inUse, 'text-blue-700'],
                    ['Maintenance', counts.maintenance, 'text-amber-700'],
                    ['Avg. current utilization', `${counts.averageUtilization.toFixed(1)}%`, 'text-slate-800'],
                ].map(([label, value, color]) => (
                    <div key={label} className="min-w-0 border-l-2 border-slate-100 pl-3 first:border-l-0 first:pl-0">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                        <p className={`mt-1 text-xl font-black ${color}`}>{value}</p>
                    </div>
                ))}
            </div>

            {/* Plan vs Actual */}
            <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-6">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Activity className="w-5 h-5" /> Plan vs Actual Utilization</h3>
                        <p className="text-xs text-slate-500 mt-1">Top {varianceRows.length} absolute variances after search · fixed 0–100% scale</p>
                    </div>
                    <span className="text-xs font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">Fleet average current utilization: {counts.averageUtilization.toFixed(1)}%</span>
                </div>
                {varianceRows.length ? (
                    <>
                        <div style={{ height: Math.max(300, varianceRows.length * 58) }} role="img" aria-label="Equipment planned versus actual utilization chart">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={varianceRows} layout="vertical" margin={{ top: 10, right: 48, left: 16, bottom: 10 }} barGap={3}>
                                    <CartesianGrid stroke="#f1f5f9" horizontal={false} />
                                    <XAxis type="number" domain={[0, 100]} tickFormatter={value => `${value}%`} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                    <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 10, fontWeight: 700, fill: '#475569' }} axisLine={false} tickLine={false} />
                                    <Tooltip formatter={(value, name) => [`${Number(value).toFixed(1)}%`, name]} />
                                    <Legend />
                                    <Bar dataKey="planned" name="Plan" fill="#64748b" radius={[0, 6, 6, 0]}>
                                        <LabelList dataKey="planned" position="right" formatter={value => `${Number(value).toFixed(1)}%`} className="fill-slate-500 text-[9px]" />
                                    </Bar>
                                    <Bar dataKey="actual" name="Actual" radius={[0, 6, 6, 0]}>
                                        {varianceRows.map(row => <Cell key={row.id || row.name} fill={row.state === 'on_target' ? '#10b981' : row.state === 'small_shortfall' ? '#f59e0b' : '#f43f5e'} />)}
                                        <LabelList dataKey="actual" position="right" formatter={value => `${Number(value).toFixed(1)}%`} className="fill-slate-500 text-[9px]" />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        <ul className="mt-5 grid sm:grid-cols-2 gap-2" aria-label="Written equipment variances">
                            {varianceRows.map(row => (
                                <li key={row.id || row.name} className="flex items-center justify-between gap-3 bg-slate-50 rounded-xl px-3 py-2 text-xs">
                                    <span className="font-semibold text-slate-700 truncate">{row.name}</span>
                                    <span className={`font-bold whitespace-nowrap ${row.state === 'on_target' ? 'text-emerald-700' : row.state === 'small_shortfall' ? 'text-amber-700' : 'text-rose-700'}`}>{row.varianceLabel}</span>
                                </li>
                            ))}
                        </ul>
                    </>
                ) : <p className="py-16 text-center text-sm text-slate-400">No equipment matches the current search.</p>}
            </div>

            {/* Filters */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="relative w-full md:w-auto">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="text" placeholder="Search equipment..." value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full md:w-auto text-sm bg-white border border-slate-200 rounded-xl pl-9 pr-9 py-2 outline-none focus:border-emerald-500 transition-colors min-w-[240px] shadow-sm" />
                    {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>}
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4 text-slate-400">
                        <Loader2 className="w-10 h-10 animate-spin text-emerald-500" />
                        <p className="text-xs font-bold uppercase tracking-widest">Loading...</p>
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50/80 text-xs uppercase tracking-wider text-slate-500 font-bold">
                                        <th className="px-6 py-4">Name</th>
                                        <th className="px-6 py-4">Type</th>
                                        <th className="px-6 py-4">Operator</th>
                                        <th className="px-6 py-4">Location</th>
                                        <th className="px-6 py-4">Status</th>
                                        <th className="px-6 py-4">Last Service</th>
                                        <th className="px-6 py-4">Current Utilization</th>
                                        <th className="px-6 py-4">Plan / Actual</th>
                                        <th className="px-6 py-4">Variance</th>
                                        <th className="px-6 py-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm font-medium text-slate-600 divide-y divide-slate-50">
                                    {filtered.length > 0 ? filtered.map(equip => {
                                        return (
                                            <tr key={equip.id} className="hover:bg-slate-50/50 transition-colors group">
                                                <td className="px-6 py-4 font-semibold text-slate-700">{equip.name}</td>
                                                <td className="px-6 py-4 text-slate-500">{equip.type || '—'}</td>
                                                <td className="px-6 py-4 text-slate-500">{equip.operator || '—'}</td>
                                                <td className="px-6 py-4 text-slate-500">{equip.location || '—'}</td>
                                                <td className="px-6 py-4">
                                                    <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-lg border ${STATUS_BADGE[equip.status] || STATUS_BADGE.available}`}>
                                                        {statusLabel(equip.status)}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-slate-400 text-xs">{fmtDate(equip.last_service)}</td>
                                                <td className="px-6 py-4 font-bold text-slate-700">{(parseFloat(equip.utilization) || 0).toFixed(1)}%</td>
                                                <td className="px-6 py-4 text-xs text-slate-500">{(Number(equip.planned_utilization) || 0).toFixed(1)}% / {(Number(equip.actual_utilization) || 0).toFixed(1)}%</td>
                                                <td className="px-6 py-4 text-xs font-bold text-slate-600">{((Number(equip.actual_utilization) || 0) - (Number(equip.planned_utilization) || 0)).toFixed(1)}%</td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center justify-end gap-1">
                                                        {canEdit && (
                                                            <button onClick={() => openEditModal(equip)} title="Edit"
                                                                className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors">
                                                                <Pencil className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                        {canDelete && (
                                                            <button onClick={() => { setDeleteError(''); setDeletingId(equip.id); }} title="Delete"
                                                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    }) : (
                                        <tr>
                                            <td colSpan="10" className="px-6 py-16 text-center text-slate-400">
                                                <div className="flex flex-col items-center gap-3">
                                                    <Wrench className="w-12 h-12 text-slate-200" />
                                                    <p>No equipment found.</p>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="bg-slate-50 p-4 flex justify-between items-center border-t border-slate-100">
                            <span className="text-xs text-slate-400">Showing {filtered.length} of {equipment.length}</span>
                            <span className="text-xs text-slate-400">{counts.total} total</span>
                        </div>
                    </>
                )}
            </div>

            {/* Add / Edit Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setIsAddModalOpen(false)}>
                    <div role="dialog" className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className={`p-2.5 rounded-xl ${editingEquipment ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                    {editingEquipment ? <Pencil className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                                </div>
                                <h3 className="text-xl font-bold text-slate-800">{editingEquipment ? 'Edit Equipment' : 'Add Equipment'}</h3>
                            </div>
                            <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                        </div>
                        {addError && (
                            <div className="p-3 mb-4 rounded-xl bg-red-50 border border-red-100 text-red-600 text-xs font-bold flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 shrink-0" /> {addError}
                            </div>
                        )}
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">Name <span className="text-red-500">*</span></label>
                                <input type="text" required value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })}
                                    placeholder="e.g. Excavator CAT 320" className={inputCls} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">Type</label>
                                    <input type="text" value={addForm.type} onChange={e => setAddForm({ ...addForm, type: e.target.value })}
                                        placeholder="e.g. Excavator" className={inputCls} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">Operator</label>
                                    <input type="text" value={addForm.operator} onChange={e => setAddForm({ ...addForm, operator: e.target.value })}
                                        placeholder="e.g. John Doe" className={inputCls} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">Location</label>
                                    <input type="text" value={addForm.location} onChange={e => setAddForm({ ...addForm, location: e.target.value })}
                                        placeholder="e.g. Zone A" className={inputCls} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">Status</label>
                                    <select value={addForm.status} onChange={e => setAddForm({ ...addForm, status: e.target.value })}
                                        className={inputCls}>
                                        <option value="available">Available</option>
                                        <option value="in_use">In Use</option>
                                        <option value="maintenance">Maintenance</option>
                                        <option value="out_of_service">Out of Service</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">Last Service</label>
                                    <input type="date" value={addForm.last_service} onChange={e => setAddForm({ ...addForm, last_service: e.target.value })}
                                        className={inputCls} />
                                </div>
                                <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">Current Utilization (%)</label>
                                    <input type="number" step="0.1" min="0" max="100" value={addForm.utilization} onChange={e => setAddForm({ ...addForm, utilization: e.target.value })}
                                        className={inputCls} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">Planned Utilization (%)</label>
                                    <input type="number" step="0.1" min="0" max="100" value={addForm.planned_utilization} onChange={e => setAddForm({ ...addForm, planned_utilization: e.target.value })}
                                        className={inputCls} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">Actual Utilization (%)</label>
                                    <input type="number" step="0.1" min="0" max="100" value={addForm.actual_utilization} onChange={e => setAddForm({ ...addForm, actual_utilization: e.target.value })}
                                        className={inputCls} />
                                </div>
                            </div>
                            <div className="flex gap-3 pt-4">
                                <button type="button" onClick={() => setIsAddModalOpen(false)}
                                    className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-semibold hover:bg-slate-200 transition-all">
                                    Cancel
                                </button>
                                <button type="submit" disabled={savingAdd}
                                    className="flex-1 px-6 py-3 bg-emerald-600 text-white rounded-xl font-semibold shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 disabled:opacity-60">
                                    {savingAdd ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : (editingEquipment ? 'Save Changes' : 'Add Equipment')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirm */}
            {deletingId && (
                <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => !deletingEquipment && setDeletingId(null)}>
                    <div role="dialog" className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2.5 bg-red-50 rounded-xl text-red-600"><Trash2 className="w-5 h-5" /></div>
                            <h3 className="text-xl font-bold text-slate-800">Delete Equipment</h3>
                        </div>
                        <p className="text-sm text-slate-500 mb-6">This action cannot be undone.</p>
                        {deleteError && (
                            <div className="p-3 mb-4 rounded-xl bg-red-50 border border-red-100 text-red-600 text-xs font-bold flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 shrink-0" /> {deleteError}
                            </div>
                        )}
                        <div className="flex gap-3">
                            <button onClick={() => setDeletingId(null)} disabled={deletingEquipment}
                                className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-semibold hover:bg-slate-200 transition-all disabled:opacity-60">
                                Cancel
                            </button>
                            <button onClick={handleDelete} disabled={deletingEquipment}
                                className="flex-1 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold shadow-lg shadow-red-100 transition-all flex items-center justify-center gap-2 disabled:opacity-60">
                                {deletingEquipment ? <><Loader2 className="w-4 h-4 animate-spin" /> Deleting...</> : <><Trash2 className="w-4 h-4" /> Delete</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
