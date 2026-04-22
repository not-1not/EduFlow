import React, { useState } from 'react';
import { useAuth } from './AuthProvider';
import { Layout, User, Lock, ArrowRight } from 'lucide-react';

export const Login: React.FC = () => {
    const { login } = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        
        const result = await login(username, password);
        if (!result.success) {
            setError(result.message || 'Login gagal.');
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-4">
            <div className="w-full max-w-[420px] space-y-8">
                <div className="text-center space-y-4">
                    <div className="mx-auto w-16 h-16 bg-slate-900 rounded-3xl flex items-center justify-center text-yellow-400 border border-slate-800 shadow-2xl shadow-slate-900/20 transform -rotate-6">
                        <Layout size={32} />
                    </div>
                    <div>
                        <h1 className="text-4xl font-black tracking-tighter text-slate-900 uppercase">EduManage</h1>
                        <p className="text-slate-500 font-medium">Sistem Informasi Akademik Terpadu</p>
                    </div>
                </div>

                <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-xl shadow-slate-900/5 space-y-6">
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {error && (
                            <div className="p-4 bg-red-50 border border-red-100 text-red-600 rounded-2xl text-xs font-bold flex items-center gap-2">
                                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                                {error}
                            </div>
                        )}
                        
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Username / NISN</label>
                            <div className="relative group">
                                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-900 transition-colors" size={18} />
                                <input
                                    type="text"
                                    placeholder="Masukkan username"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-12 pr-4 py-4 outline-none focus:bg-white focus:border-slate-900 focus:ring-4 focus:ring-slate-900/5 transition-all font-bold text-slate-900"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Password</label>
                            <div className="relative group">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-900 transition-colors" size={18} />
                                <input
                                    type="password"
                                    placeholder="••••••••"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-12 pr-4 py-4 outline-none focus:bg-white focus:border-slate-900 focus:ring-4 focus:ring-slate-900/5 transition-all font-bold text-slate-900"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-4 bg-slate-900 text-yellow-400 font-black rounded-2xl shadow-xl shadow-slate-900/20 hover:bg-slate-950 hover:scale-[1.02] active:scale-95 transition-all duration-300 uppercase tracking-widest text-xs flex items-center justify-center gap-3 disabled:opacity-50 mt-4"
                        >
                            {loading ? 'Memverifikasi...' : (
                                <>
                                    Masuk ke Dashboard
                                    <ArrowRight size={16} />
                                </>
                            )}
                        </button>
                    </form>


                </div>

                <div className="text-center">
                    <p className="text-[11px] text-slate-400 font-medium">Bantuan teknis? Hubungi Administrator Sekolah</p>
                </div>
            </div>
        </div>
    );
};
