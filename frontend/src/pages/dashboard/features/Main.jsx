import React from 'react';
import { Activity, TrendingUp, BarChart3, Download } from 'lucide-react';

export default function Main() {
    return (
        <div className="space-y-8">

            {/* HEADER SECTION */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-slate-800 tracking-tight">Project Overview</h2>
                    <p className="text-slate-500 mt-1">Real-time performance metrics & S-Curve analysis</p>
                </div>
            </div>

            {/* KPI GRID */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                {/* KPI 1: Schedule Performance */}
                <div className="group bg-white p-6 rounded-3xl border border-slate-100 shadow-[0_2px_10px_-3px_rgba(6,182,212,0.1)] hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-blue-50 rounded-2xl text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                            <Activity className="w-6 h-6" />
                        </div>
                        <span className="text-slate-400 font-bold text-xs bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">
                            SPI: --
                        </span>
                    </div>
                    <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider">Schedule Variance</h3>
                    <div className="flex items-baseline gap-2 mt-1">
                        <p className="text-3xl font-bold text-slate-800">--</p>
                        <span className="text-sm font-medium text-slate-400">No Data</span>
                    </div>
                </div>

                {/* KPI 2: Cost Performance */}
                <div className="group bg-white p-6 rounded-3xl border border-slate-100 shadow-[0_2px_10px_-3px_rgba(16,185,129,0.1)] hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                            <TrendingUp className="w-6 h-6" />
                        </div>
                        <span className="text-slate-400 font-bold text-xs bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">
                            CPI: --
                        </span>
                    </div>
                    <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider">Cost Performance</h3>
                    <div className="flex items-baseline gap-2 mt-1">
                        <p className="text-3xl font-bold text-slate-800">--</p>
                        <span className="text-sm font-medium text-slate-400">No Data</span>
                    </div>
                </div>

                {/* KPI 3: Physical Progress */}
                <div className="group bg-white p-6 rounded-3xl border border-slate-100 shadow-[0_2px_10px_-3px_rgba(99,102,241,0.1)] hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                            <BarChart3 className="w-6 h-6" />
                        </div>
                        <span className="text-slate-400 font-bold text-xs bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">
                            Target: 0%
                        </span>
                    </div>
                    <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider">Physical Progress</h3>
                    <div className="flex items-baseline gap-2 mt-1">
                        <p className="text-3xl font-bold text-slate-800">0%</p>
                        <span className="text-sm font-medium text-slate-400">--%</span>
                    </div>
                </div>
            </div>

            {/* S-CURVE VISUALIZATION SECTION */}
            <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden">
                <div className="flex justify-between items-center mb-8 relative z-10">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">Cumulative Cost S-Curve</h3>
                        <p className="text-slate-400 text-sm">Planned vs Actual Expenditure</p>
                    </div>
                    <button className="text-sm font-semibold text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-4 py-2 rounded-lg transition-colors flex items-center gap-2">
                        <Download className="w-4 h-4" /> Download Report
                    </button>
                </div>

                {/* CSS Chart Construction */}
                <div className="h-80 w-full bg-slate-50/50 rounded-2xl border border-slate-100 relative group">
                    {/* Grid Lines */}
                    <div className="absolute inset-0 flex flex-col justify-between py-6 px-8">
                        <div className="border-t border-slate-200 w-full"></div>
                        <div className="border-t border-slate-200 w-full"></div>
                        <div className="border-t border-slate-200 w-full"></div>
                        <div className="border-t border-slate-200 w-full"></div>
                        <div className="border-t border-slate-200 w-full"></div>
                    </div>

                    {/* Placeholder Lines (Flat / No Data) */}
                    <svg className="absolute inset-0 w-full h-full p-8 overflow-visible" preserveAspectRatio="none">
                        {/* Planned Line (Dashed Gray) - Flat at bottom */}
                        <path
                            d="M0,280 L800,280"
                            fill="none"
                            stroke="#94a3b8"
                            strokeWidth="3"
                            strokeDasharray="8 8"
                            className="opacity-50"
                        />

                        {/* Actual Line (Solid Emerald) - Flat at bottom */}
                        <path
                            d="M0,280 L800,280"
                            fill="none"
                            stroke="#10b981"
                            strokeWidth="4"
                            className="drop-shadow-sm opacity-50"
                        />
                    </svg>

                    {/* Empty State Overlay */}
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-slate-400 font-medium bg-white/50 px-4 py-2 rounded-lg backdrop-blur-sm border border-slate-100">
                            Waiting for Project Baseline Data
                        </span>
                    </div>

                    {/* Legend */}
                    <div className="absolute bottom-4 right-8 flex gap-6 bg-white/80 backdrop-blur px-4 py-2 rounded-lg border border-slate-100 shadow-sm">
                        <div className="flex items-center text-xs font-bold text-slate-600">
                            <div className="w-3 h-3 bg-emerald-500 rounded-full mr-2"></div> Actual
                        </div>
                        <div className="flex items-center text-xs font-bold text-slate-400">
                            <div className="w-3 h-1 bg-slate-400 rounded-full mr-2 border-t border-b border-white"></div> Planned
                        </div>
                    </div>
                </div>
            </div>

        </div>
    );
}