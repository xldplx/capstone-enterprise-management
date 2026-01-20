import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import {
    LayoutDashboard,
    Users,
    Truck,
    Package,
    Banknote,
    LogOut
} from 'lucide-react';

export default function DashboardLayout() {
    const location = useLocation();

    // Helper to determine active state
    const isActive = (path) => location.pathname === path;

    // Navigation Items
    const navItems = [
        {
            name: 'Overview',
            path: '/dashboard/main',
            icon: <LayoutDashboard className="w-5 h-5" />
        },
        {
            name: 'Manpower',
            path: '/dashboard/manpower',
            icon: <Package className="w-5 h-5" />
        },
        {
            name: 'Equipment',
            path: '/dashboard/empty',
            icon: <Package className="w-5 h-5" />
        },
        {
            name: 'Consumables',
            path: '/dashboard/empty',
            icon: <Package className="w-5 h-5" />
        },
        {
            name: 'Materials',
            path: '/dashboard/empty',
            icon: <Package className="w-5 h-5" />
        },
        {
            name: 'Tools',
            path: '/dashboard/empty',
            icon: <Package className="w-5 h-5" />
        },
        {
            name: 'Budget',
            path: '/dashboard/empty',
            icon: <Package className="w-5 h-5" />
        },
    ];

    return (
        <div className="min-h-screen bg-slate-50 flex font-sans text-slate-600">

            {/* SIDEBAR */}
            <aside className="w-72 bg-white border-r border-slate-200 flex flex-col fixed h-full z-20 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
                {/* Brand */}
                <div className="h-24 flex items-center px-8 border-b border-slate-100">
                    <div className="flex flex-col">
                        <h1 className="text-xl font-bold text-slate-800 tracking-tight">Capstone</h1>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Enterprise System</span>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-4 py-8 space-y-1">
                    {navItems.map((item) => (
                        <Link
                            key={item.name}
                            to={item.path}
                            className={`flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-all duration-200 group
                                ${isActive(item.path)
                                    ? 'bg-emerald-50 text-emerald-700 shadow-sm'
                                    : 'text-slate-500 hover:bg-slate-50 hover:text-emerald-600'
                                }`}
                        >
                            <span className={`transition-colors ${isActive(item.path) ? 'text-emerald-600' : 'text-slate-400 group-hover:text-emerald-500'}`}>
                                {item.icon}
                            </span>
                            {item.name}
                            {isActive(item.path) && (
                                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            )}
                        </Link>
                    ))}
                </nav>

                {/* User Profile Snippet */}
                <div className="p-4 border-t border-slate-100">
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                        <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold text-sm shadow-emerald-200">
                            AS
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-800 truncate">Alden Sayidina</p>
                            <p className="text-xs text-slate-500 truncate">Project Manager</p>
                        </div>
                        <Link to="/dashboard" className="text-slate-400 hover:text-red-500 transition-colors">
                            <LogOut className="w-5 h-5" />
                        </Link>
                    </div>
                </div>
            </aside>

            {/* MAIN CONTENT AREA */}
            <main className="flex-1 ml-72 p-8 lg:p-12 overflow-y-auto">
                <Outlet />
            </main>

        </div>
    );
}