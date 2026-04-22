import React, { createContext, useContext, useEffect, useState } from 'react';
import { UserRole } from '../types';
import { supabase } from '../firebase';

interface AuthContextType {
    user: any | null;
    role: UserRole | null;
    studentId: string | null;
    loading: boolean;
    login: (username: string, password: string) => Promise<{ success: boolean; message?: string }>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    role: null,
    studentId: null,
    loading: true,
    login: async () => ({ success: false }),
    logout: async () => { }
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<any | null>(null);
    const [role, setRole] = useState<UserRole | null>(null);
    const [studentId, setStudentId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const savedSession = sessionStorage.getItem('eduflow_session');
        if (savedSession) {
            const { user, role, studentId } = JSON.parse(savedSession);
            setUser(user);
            setRole(role);
            setStudentId(studentId);
        }
        setLoading(false);
    }, []);

    const login = async (username: string, password: string) => {
        try {
            // --- Strategy 1: Try Supabase users table (Production/Vercel) ---
            if (supabase) {
                const { data, error } = await supabase
                    .from('users')
                    .select('*')
                    .eq('username', username)
                    .eq('password', password)
                    .single();

                if (!error && data) {
                    const sessionUser = {
                        uid: data.uid || data.id,
                        email: data.email,
                        displayName: data.displayName,
                        id: data.id
                    };
                    setUser(sessionUser);
                    setRole(data.role as UserRole);
                    setStudentId(data.studentId || null);
                    sessionStorage.setItem('eduflow_session', JSON.stringify({
                        user: sessionUser,
                        role: data.role,
                        studentId: data.studentId || null
                    }));
                    return { success: true };
                }

                return { success: false, message: 'Username atau password salah.' };
            }

            // --- Strategy 2: Fallback to local /api/login (dev mode without Supabase) ---
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const result = await response.json();

            if (result.status === 'success') {
                setUser(result.user);
                setRole(result.role);
                setStudentId(result.studentId || null);
                sessionStorage.setItem('eduflow_session', JSON.stringify({
                    user: result.user,
                    role: result.role,
                    studentId: result.studentId || null
                }));
                return { success: true };
            } else {
                return { success: false, message: result.message };
            }
        } catch (error) {
            return { success: false, message: 'Gagal terhubung ke server.' };
        }
    };

    const logout = async () => {
        setUser(null);
        setRole(null);
        setStudentId(null);
        sessionStorage.removeItem('eduflow_session');
    };

    return (
        <AuthContext.Provider value={{ user, role, studentId, loading, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
