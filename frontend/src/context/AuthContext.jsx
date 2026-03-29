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

    const [activeOrg, setActiveOrgState] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('pm_active_org'));
        } catch {
            return null;
        }
    });

    const setOrg = (org) => {
        setActiveOrgState(org);
        if (org) {
            localStorage.setItem('pm_active_org', JSON.stringify(org));
        } else {
            localStorage.removeItem('pm_active_org');
        }
    };

    const login = (userData) => {
        setUser(userData);
        localStorage.setItem('pm_user', JSON.stringify(userData));
        // Auto-set org if userData includes one
        if (userData?.org) {
            setOrg(userData.org);
        }
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('pm_user');
    };

    const updateProgress = (points, unlocked) => {
        if (!user) return;
        const updated = { ...user, points, unlocked };
        setUser(updated);
        localStorage.setItem('pm_user', JSON.stringify(updated));
    };

    const updateUser = (data) => {
        if (!user) return;
        const updated = { ...user, ...data };
        setUser(updated);
        localStorage.setItem('pm_user', JSON.stringify(updated));
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, updateProgress, updateUser, activeOrg, setOrg }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
