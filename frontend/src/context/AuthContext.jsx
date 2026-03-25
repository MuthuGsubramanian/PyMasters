import { createContext, useContext, useState } from 'react';

const AuthContext = createContext();

export function AuthProvider({ children }) {
    const [user, setUser] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('pm_user'));
        } catch {
            return null;
        }
    });

    const login = (userData) => {
        setUser(userData);
        localStorage.setItem('pm_user', JSON.stringify(userData));
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('pm_user');
    };

    const updateProgress = (points, unlocked) => {
        const updated = { ...user, points, unlocked };
        setUser(updated);
        localStorage.setItem('pm_user', JSON.stringify(updated));
    };

    const updateUser = (data) => {
        const updated = { ...user, ...data };
        setUser(updated);
        localStorage.setItem('pm_user', JSON.stringify(updated));
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, updateProgress, updateUser }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
