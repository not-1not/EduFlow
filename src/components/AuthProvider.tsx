import React, { createContext, useContext, useEffect, useState } from 'react';
import { UserRole } from '../types';

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
        // Check session storage for existing session
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
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await response.json();
            
            if (data.status === 'success') {
                setUser(data.user);
                setRole(data.role);
                setStudentId(data.studentId || null);
                
                // Save to session
                sessionStorage.setItem('eduflow_session', JSON.stringify({
                    user: data.user,
                    role: data.role,
                    studentId: data.studentId || null
                }));
                
                return { success: true };
            } else {
                return { success: false, message: data.message };
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
