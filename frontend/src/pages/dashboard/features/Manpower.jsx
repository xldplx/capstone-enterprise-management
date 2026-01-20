import React from 'react';
import { Plus, Users, Search } from 'lucide-react';

export default function Manpower() {

    // Initial Empty State
    const personnel = [];

    // Empty data for histogram
    const weeklyData = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    return (
        <div className="space-y-8">

            {/* HEADER */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-slate-800 tracking-tight">Manpower Resources</h2>
                    <p className="text-slate-500 mt-1">Daily attendance & allocation by zone</p>
                </div>
                <button className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl font-semibold shadow-lg shadow-emerald-200 transition-all transform hover:-translate-y-0.5 flex items-center gap-2">
                    <Plus className="w-5 h-5" />
                    Add Personnel
                </button>
            </div>

            {/* MANPOWER HISTOGRAM CARD */}
            <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
                <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                    Resource Loading
                    <span className="text-xs font-normal text-slate-400 bg-slate-100 px-2 py-0.5 rounded">Histogram</span>
                </h3>

                {/* Visual Histogram */}
                <div className="h-64 flex items-end justify-between gap-2 md:gap-4 border-b border-slate-100 pb-2">
                    {weeklyData.map((height, index) => (
                        <div key={index} className="flex-1 flex flex-col justify-end group relative h-full">
                            {/* The Bar */}
                            <div
                                style={{ height: `${height}%` }}
                                className="w-full bg-emerald-100 rounded-t-lg transition-all duration-300 relative overflow-hidden min-h-[4px]"
                            >
                            </div>
                            <span className="text-[10px] text-slate-300 text-center mt-2 font-mono">W{index + 1}</span>
                        </div>
                    ))}
                </div>
                <div className="text-center text-xs text-slate-400 mt-2 italic">
                    No resource loading data available
                </div>
            </div>

            {/* DETAILED LIST TABLE */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-50 flex justify-between items-center">
                    <h3 className="font-bold text-slate-700">Active Personnel List</h3>
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search ID or Name..."
                            className="text-sm bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-1.5 outline-none focus:border-emerald-500 transition-colors"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/80 text-xs uppercase tracking-wider text-slate-500 font-bold">
                                <th className="px-6 py-4">Employee ID</th>
                                <th className="px-6 py-4">Full Name</th>
                                <th className="px-6 py-4">Designation</th>
                                <th className="px-6 py-4">Zone</th>
                                <th className="px-6 py-4">Last Check-in</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4"></th>
                            </tr>
                        </thead>
                        <tbody className="text-sm font-medium text-slate-600 divide-y divide-slate-50">
                            {personnel.length > 0 ? (
                                personnel.map((person) => (
                                    <tr key={person.id}>
                                        {/* Row data would go here */}
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="7" className="px-6 py-12 text-center text-slate-400">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <Users className="w-12 h-12 text-slate-200" />
                                            <p>No personnel records found.</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Table Footer */}
                <div className="bg-slate-50 p-4 flex justify-center border-t border-slate-100">
                    <span className="text-xs text-slate-400">Showing 0 of 0 records</span>
                </div>
            </div>

        </div>
    );
}