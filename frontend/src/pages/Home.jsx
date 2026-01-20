import React from 'react';
import { Link } from 'react-router-dom';

export default function Home() {
    return (
        <div className="min-h-screen bg-slate-50 pt-20 select-none">

            {/* HERO SECTION */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
                <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6">
                    Enterprise Project <br />
                    <span className="text-emerald-600">Control & Management</span>
                </h1>
                <p className="text-lg text-slate-600 mb-10 max-w-2xl mx-auto">
                    A comprehensive Plan vs Actual platform. Track resources, manage schedules,
                    and visualize S-Curves in real-time.
                </p>

                <div className="flex justify-center gap-4 mb-16">
                    <Link to="/dashboard" className="px-8 py-3 bg-emerald-600 text-white font-semibold rounded-lg shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all">
                        Get Started
                    </Link>
                    <button className="px-8 py-3 bg-white text-slate-700 font-semibold hover:cursor-pointer rounded-lg border border-slate-200 hover:bg-slate-50 transition-all">
                        Learn More
                    </button>
                </div>

                {/* HERO IMAGE PLACEHOLDER (Dashboard Preview) */}
                <div className="w-full h-96 bg-slate-200 rounded-xl border border-slate-300 flex items-center justify-center relative overflow-hidden shadow-2xl">
                    <span className="text-slate-400 font-medium text-xl">
                        [ Main Dashboard Preview Image ]
                    </span>
                    {/* Decorative elements to make it look like a UI */}
                    <div className="absolute top-4 left-4 right-4 h-4 bg-white/50 rounded-full"></div>
                    <div className="absolute top-12 left-4 w-1/4 h-64 bg-white/50 rounded-lg"></div>
                    <div className="absolute top-12 left-[30%] right-4 h-64 bg-white/50 rounded-lg"></div>
                </div>
            </section>

            {/* STATS / KPI PLACEHOLDERS */}
            <section className="bg-white py-12 border-y border-slate-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                        {[1, 2, 3, 4].map((item) => (
                            <div key={item} className="text-center">
                                <div className="h-8 w-24 bg-slate-200 mx-auto rounded mb-2"></div>
                                <div className="h-4 w-16 bg-slate-100 mx-auto rounded"></div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* FEATURES SECTION (Based on PDF Modules) */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
                <div className="text-center mb-16">
                    <h2 className="text-3xl font-bold text-slate-800">Core Capabilities</h2>
                    <p className="text-slate-500 mt-2">Full resource control and scheduling</p>
                </div>

                <div className="grid md:grid-cols-3 gap-8">
                    {/* Feature 1: Scheduling */}
                    <div className="p-6 bg-white rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                        <div className="w-12 h-12 bg-emerald-100 rounded-lg mb-4"></div>
                        <h3 className="text-xl font-semibold text-slate-800 mb-2">Card Title</h3>
                        <p className="text-slate-500 mb-4 text-sm">Card Description.</p>
                        <div className="w-full h-32 bg-slate-50 rounded border border-dashed border-slate-300 flex items-center justify-center">
                            <span className="text-xs text-slate-400">[Gantt Chart Placeholder]</span>
                        </div>
                    </div>

                    {/* Feature 2: S-Curve Analysis */}
                    <div className="p-6 bg-white rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                        <div className="w-12 h-12 bg-blue-100 rounded-lg mb-4"></div>
                        <h3 className="text-xl font-semibold text-slate-800 mb-2">Card Title</h3>
                        <p className="text-slate-500 mb-4 text-sm">Card Description.</p>
                        <div className="w-full h-32 bg-slate-50 rounded border border-dashed border-slate-300 flex items-center justify-center">
                            <span className="text-xs text-slate-400">[Chart Placeholder]</span>
                        </div>
                    </div>

                    {/* Feature 3: Resource Management */}
                    <div className="p-6 bg-white rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                        <div className="w-12 h-12 bg-orange-100 rounded-lg mb-4"></div>
                        <h3 className="text-xl font-semibold text-slate-800 mb-2">Card Title</h3>
                        <p className="text-slate-500 mb-4 text-sm">Card Description.</p>
                        <div className="w-full h-32 bg-slate-50 rounded border border-dashed border-slate-300 flex items-center justify-center">
                            <span className="text-xs text-slate-400">[Inventory Placeholder]</span>
                        </div>
                    </div>
                </div>
            </section>

        </div>
    );
}