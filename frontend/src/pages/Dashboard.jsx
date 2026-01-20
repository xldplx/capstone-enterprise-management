import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom'; // Added Link
import { ArrowLeft } from 'lucide-react'; // Added Icon

export default function Dashboard() {
    const [credentials, setCredentials] = useState({ username: '', password: '' });
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();

    const handleChange = (e) => {
        setCredentials({ ...credentials, [e.target.name]: e.target.value });
        setError('');
    };

    const handleLogin = (e) => {
        e.preventDefault();
        setIsLoading(true);

        if (credentials.username === 'USER' && credentials.password === 'PASS') {
            navigate('/dashboard/main');
        } else {
            setError('Invalid credentials. Please use USER / PASS.');
            setIsLoading(false);
        }

    };

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 relative overflow-hidden">

            {/* Back to Home Button */}
            <Link
                to="/"
                className="absolute top-8 left-8 z-20 flex items-center gap-2 text-slate-500 hover:text-emerald-600 transition-all transform hover:-translate-x-1 font-medium"
            >
                <ArrowLeft className="w-5 h-5" />
                Back to Home
            </Link>

            {/* Animated Background Decoration */}
            <div className="absolute inset-0 w-full h-full pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-emerald-200/40 rounded-full blur-[80px] animate-pulse"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-200/40 rounded-full blur-[80px] animate-pulse delay-1000"></div>
            </div>

            {/* Glassmorphic Card */}
            <div className="relative w-full max-w-md bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/50 overflow-hidden transform transition-all duration-500 hover:shadow-emerald-900/10">

                {/* Header */}
                <div className="bg-gradient-to-r from-emerald-700 to-emerald-600 px-8 py-8 text-center relative overflow-hidden">
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                    <h2 className="text-3xl font-bold text-white tracking-tight relative z-10">Welcome Back</h2>
                    <p className="text-emerald-100 text-sm mt-2 relative z-10 font-medium">Enterprise Project Control System</p>
                </div>

                {/* Form Section */}
                <div className="p-8 pt-10">
                    <form onSubmit={handleLogin} className="space-y-6">

                        {/* Error Alert with Animation */}
                        {error && (
                            <div className="animate-bounce-short p-4 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm flex items-start gap-3 shadow-sm">
                                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                <span>{error}</span>
                            </div>
                        )}

                        {/* Username Input */}
                        <div className="group">
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 ml-1 group-focus-within:text-emerald-600 transition-colors">
                                Username ID
                            </label>
                            <div className="relative">
                                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                </span>
                                <input
                                    type="text"
                                    name="username"
                                    value={credentials.username}
                                    onChange={handleChange}
                                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-slate-800 placeholder-slate-400"
                                    placeholder="Enter your ID"
                                />
                            </div>
                        </div>

                        {/* Password Input */}
                        <div className="group">
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 ml-1 group-focus-within:text-emerald-600 transition-colors">
                                Password
                            </label>
                            <div className="relative">
                                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                </span>
                                <input
                                    type="password"
                                    name="password"
                                    value={credentials.password}
                                    onChange={handleChange}
                                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-slate-800 placeholder-slate-400"
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>

                        {/* Action Button with Loading State */}
                        <button
                            type="submit"
                            disabled={isLoading}
                            className={`w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-lg text-sm font-semibold text-white transition-all transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 ${isLoading ? 'bg-emerald-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 hover:shadow-emerald-500/30'}`}
                        >
                            {isLoading ? (
                                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            ) : (
                                'Sign In to Dashboard'
                            )}
                        </button>

                        <div className="flex items-center justify-between mt-6">
                            <div className="text-sm">
                                <a href="#" className="font-medium text-emerald-600 hover:text-emerald-500 transition-colors">
                                    Forgot Password?
                                </a>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}