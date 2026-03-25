import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api';
import { useAuth } from './AuthContext';

const ProfileContext = createContext();

export function ProfileProvider({ children }) {
    const { user } = useAuth();
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(false);

    const fetchProfile = async () => {
        if (!user?.id) return;
        setLoading(true);
        try {
            const res = await api.get(`/profile/${user.id}`);
            setProfile(res.data);
        } catch (err) {
            console.error('Failed to fetch profile:', err);
            setProfile(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProfile();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]);

    const refreshProfile = () => fetchProfile();

    return (
        <ProfileContext.Provider value={{ profile, loading, refreshProfile }}>
            {children}
        </ProfileContext.Provider>
    );
}

export function useProfile() {
    return useContext(ProfileContext);
}
