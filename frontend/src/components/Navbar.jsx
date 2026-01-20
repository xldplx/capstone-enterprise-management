import React from 'react';
import { Link } from 'react-router-dom';

export default function Navbar() {
    return (
        <nav className="fixed w-full z-50 top-0 start-0 border-b border-gray-100 bg-white/90 backdrop-blur-md">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-20">

                    {/* Brand Text Only */}
                    <Link to="/" className="flex flex-col">
                        <h1 className="text-xl font-bold text-slate-800 tracking-tight leading-none">
                            Enterprise
                        </h1>
                        <span className="text-xs text-slate-400 font-medium tracking-wide uppercase">
                            Management
                        </span>
                    </Link>

                    {/* Navigation Links */}
                    <div className="hidden md:flex items-center gap-8 uppercase tracking-wider">
                        <Link
                            to="/"
                            className="text-sm font-medium text-slate-600 hover:text-emerald-600 transition-colors"
                        >
                            Home
                        </Link>
                        <Link
                            to="/about"
                            className="text-sm font-medium text-slate-600 hover:text-emerald-600 transition-colors"
                        >
                            About
                        </Link>
                        <Link
                            to="/contact"
                            className="text-sm font-medium text-slate-600 hover:text-emerald-600 transition-colors"
                        >
                            Contact
                        </Link>
                    </div>

                    {/* Right Side Action */}
                    <div className="flex items-center gap-4">
                        <Link
                            to="/dashboard"
                            className="hidden md:flex px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg shadow-md shadow-emerald-100 transition-all transform hover:-translate-y-0.5"
                        >
                            Dashboard
                        </Link>
                    </div>

                </div>
            </div>
        </nav>
    );
}