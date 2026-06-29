import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api';
import { useAuth } from './AuthContext';
import { updateProfileSettings } from '../api';

const ProfileContext = createContext();

export function ProfileProvider({ children }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [language, setLanguageState] = useState(() => {
    try { return localStorage.getItem('pm_language') || 'en'; } catch { return 'en'; }
  });

  const fetchProfile = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const res = await api.get(`/profile/${user.id}`);
      // GET /profile/{id} returns { profile, onboarding_completed, created_at }.
      // Unwrap to the inner profile object (matching Profile.jsx); reading
      // preferred_language off the wrapper left the app-wide language unset,
      // so the server-side language preference never hydrated the context.
      const data = res.data?.profile || res.data;
      setProfile(data);
      const lang = data?.preferred_language;
      if (lang) {
        setLanguageState(lang);
        try { localStorage.setItem('pm_language', lang); } catch { /* ignore */ }
      }
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

  const setLanguage = (code) => {
    if (!code) return;
    setLanguageState(code);
    try { localStorage.setItem('pm_language', code); } catch { /* ignore */ }
    if (user?.id) {
      updateProfileSettings(user.id, { preferred_language: code }).catch(() => { /* best-effort */ });
    }
    setProfile((p) => (p ? { ...p, preferred_language: code } : p));
  };

  const refreshProfile = () => fetchProfile();

  return (
    <ProfileContext.Provider value={{ profile, loading, refreshProfile, language, setLanguage }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  return useContext(ProfileContext);
}
