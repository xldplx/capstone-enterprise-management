import React from 'react';
import { Construction, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Empty() {
    return (
        <div className="h-full flex flex-col items-center justify-center text-center space-y-6 animate-fade-in-up">

            {/* Icon Circle */}
            <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mb-2 shadow-sm">
                <Construction className="w-10 h-10 text-slate-400" />
            </div>

            {/* Text Content */}
            <div className="max-w-md space-y-2">
                <h2 className="text-2xl font-bold text-slate-800">Feature Under Development</h2>
                <p className="text-slate-500">
                    This module is currently being built. Please check back later for updates or contact your administrator.
                </p>
            </div>

            {/* Action Button */}
            <Link
                to="/dashboard/main"
                className="flex items-center gap-2 px-6 py-2.5 bg-white border border-slate-200 text-slate-600 font-medium rounded-lg hover:border-emerald-500 hover:text-emerald-600 transition-colors shadow-sm"
            >
                <ArrowLeft className="w-4 h-4" />
                Return to Overview
            </Link>

        </div>
    );
}