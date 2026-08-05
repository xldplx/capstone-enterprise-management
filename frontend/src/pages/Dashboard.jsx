import React, { useState } from 'react';
import { Loader2, Eye, EyeOff, Lock, ArrowRight, Hammer, User, Layers, ShieldCheck, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../utils/api';

export default function Login() {
    const [credentials, setCredentials] = useState({ username: '', password: '' });
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            const data = await authApi.login(credentials.username, credentials.password);
            if (data.success) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('userRole', data.role);
                localStorage.setItem('userName', data.username);
                if (data.email) localStorage.setItem('userEmail', data.email);
                if (data.full_name) localStorage.setItem('userFullName', data.full_name);
                navigate('/dashboard/overview');
            } else {
                setError(data.message || 'Login failed. Please check your credentials.');
            }
        } catch {
            setError('Cannot reach server. Please check your connection.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex bg-slate-950 select-none relative overflow-hidden font-sans">

            {/* Background Mesh Grid & Ambient Glows */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />
            <div className="absolute -top-40 -left-40 w-[700px] h-[700px] bg-emerald-500/10 blur-[180px] rounded-full pointer-events-none" />
            <div className="absolute -bottom-40 -right-40 w-[700px] h-[700px] bg-emerald-900/10 blur-[180px] rounded-full pointer-events-none" />

            {/* Full-Width Grid Split */}
            <div className="relative z-10 w-full min-h-screen grid lg:grid-cols-12">

                {/* Left Side: Brand & Detailed System Modules (Dark Slate Panel) */}
                <div className="hidden lg:flex lg:col-span-7 bg-slate-900/40 p-12 xl:p-16 flex-col justify-between border-r border-slate-800/80 relative">
                    
                    {/* Brand Top Header */}
                    <div>
                        <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-500 bg-clip-text text-transparent leading-none">
                            Leafy
                        </h1>
                        <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mt-2">Project Management System</p>
                    </div>

                    {/* Center Core Features */}
                    <div className="max-w-2xl my-auto py-8 space-y-6">
                        <div>
                            <h2 className="text-3xl xl:text-4xl font-bold text-white tracking-tight leading-tight">
                                Integrated Project Control & Baseline Analytics
                            </h2>
                            <p className="text-slate-400 text-sm leading-relaxed mt-3 font-normal">
                                Connect WBS task structures, EVM performance metrics, site resource logs, and daily budget tracking in one platform.
                            </p>
                        </div>

                        {/* Clean System Modules Grid */}
                        <div className="grid grid-cols-2 gap-4 pt-2">

                            {/* Card 1 */}
                            <div className="p-5 rounded-2xl bg-slate-950/60 border border-slate-800/80">
                                <div className="flex items-center gap-2.5 text-emerald-400 mb-2">
                                    <Activity className="w-4.5 h-4.5" />
                                    <h4 className="text-sm font-bold text-slate-200">EVM & S-Curve</h4>
                                </div>
                                <p className="text-xs text-slate-400 leading-relaxed">
                                    Track CPI, SPI, Planned Value, Earned Value, and Actual Cost metrics.
                                </p>
                            </div>

                            {/* Card 2 */}
                            <div className="p-5 rounded-2xl bg-slate-950/60 border border-slate-800/80">
                                <div className="flex items-center gap-2.5 text-emerald-400 mb-2">
                                    <Layers className="w-4.5 h-4.5" />
                                    <h4 className="text-sm font-bold text-slate-200">WBS & Tasks</h4>
                                </div>
                                <p className="text-xs text-slate-400 leading-relaxed">
                                    Manage Work Breakdown Structures, critical path float, and task schedules.
                                </p>
                            </div>

                            {/* Card 3 */}
                            <div className="p-5 rounded-2xl bg-slate-950/60 border border-slate-800/80">
                                <div className="flex items-center gap-2.5 text-emerald-400 mb-2">
                                    <ShieldCheck className="w-4.5 h-4.5" />
                                    <h4 className="text-sm font-bold text-slate-200">Budget Sync</h4>
                                </div>
                                <p className="text-xs text-slate-400 leading-relaxed">
                                    Sync project cost categories, expense actuals, and site logs automatically.
                                </p>
                            </div>

                            {/* Card 4 */}
                            <div className="p-5 rounded-2xl bg-slate-950/60 border border-slate-800/80">
                                <div className="flex items-center gap-2.5 text-emerald-400 mb-2">
                                    <User className="w-4.5 h-4.5" />
                                    <h4 className="text-sm font-bold text-slate-200">Site Resources</h4>
                                </div>
                                <p className="text-xs text-slate-400 leading-relaxed">
                                    Monitor manpower, heavy machinery logs, materials, and tool checkouts.
                                </p>
                            </div>

                        </div>
                    </div>

                </div>

                {/* Right Side: Form Panel (Full Height Centered) */}
                <div className="lg:col-span-5 flex flex-col justify-center p-8 sm:p-14 md:p-20 bg-slate-950/90 relative">

                    {/* Mobile Brand Header */}
                    <div className="lg:hidden mb-8">
                        <h2 className="text-3xl font-black tracking-tight bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-500 bg-clip-text text-transparent leading-none">Leafy</h2>
                        <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mt-1.5">Project Management System</p>
                    </div>

                    <div className="max-w-md w-full mx-auto">
                        <div className="mb-8">
                            <h2 className="text-3xl font-black text-white tracking-tight">
                                Sign In
                            </h2>
                            <p className="text-xs text-slate-400 mt-2 font-medium">
                                Access your project management dashboard
                            </p>
                        </div>

                        {/* Error Notification */}
                        {error && (
                            <div className="flex items-start gap-3 p-4 rounded-2xl bg-rose-950/30 border border-rose-800/50 text-rose-300 text-xs font-semibold mb-6">
                                <span className="shrink-0 w-4 h-4 rounded-full bg-rose-900 flex items-center justify-center text-rose-200 font-bold">!</span>
                                <span>{error}</span>
                            </div>
                        )}

                        <form onSubmit={handleLogin} className="space-y-5">

                            {/* Username Input */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                                    Username
                                </label>
                                <div className="relative group/input">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500 group-focus-within/input:text-emerald-400 transition-colors">
                                        <User className="w-4 h-4" />
                                    </div>
                                    <input
                                        id="username"
                                        type="text"
                                        required
                                        autoComplete="username"
                                        className="w-full pl-11 pr-4 py-4 bg-slate-900/80 border border-slate-800 rounded-2xl text-slate-100 text-sm placeholder:text-slate-600 outline-none focus:bg-slate-900 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all duration-300"
                                        placeholder="Enter your username"
                                        value={credentials.username}
                                        onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
                                    />
                                </div>
                            </div>

                            {/* Password Input */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                                    Password
                                </label>
                                <div className="relative group/input">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500 group-focus-within/input:text-emerald-400 transition-colors">
                                        <Lock className="w-4 h-4" />
                                    </div>
                                    <input
                                        id="password"
                                        type={showPassword ? 'text' : 'password'}
                                        required
                                        autoComplete="current-password"
                                        className="w-full pl-11 pr-12 py-4 bg-slate-900/80 border border-slate-800 rounded-2xl text-slate-100 text-sm placeholder:text-slate-600 outline-none focus:bg-slate-900 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all duration-300"
                                        placeholder="••••••••"
                                        value={credentials.password}
                                        onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors p-1"
                                        tabIndex={-1}
                                        aria-label="Toggle password visibility"
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            {/* Submit Button */}
                            <button
                                type="submit"
                                id="login-submit"
                                disabled={isLoading}
                                className="w-full pt-2"
                            >
                                <div className="bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] disabled:opacity-70 text-slate-950 font-black py-4 rounded-2xl transition-all duration-300 flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50">
                                    {isLoading ? (
                                        <><Loader2 className="animate-spin w-4 h-4 text-slate-950" /> Authenticating...</>
                                    ) : (
                                        <>
                                            Sign In
                                            <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                                        </>
                                    )}
                                </div>
                            </button>

                        </form>

                        {/* IT Admin Support Notice */}
                        <div className="mt-8 text-center border-t border-slate-800/80 pt-6">
                            <p className="text-xs text-slate-400 font-medium">
                                Forgot password or having trouble signing in? Please contact your IT Administrator.
                            </p>
                        </div>
                    </div>

                </div>

            </div>

        </div>
    );
}



