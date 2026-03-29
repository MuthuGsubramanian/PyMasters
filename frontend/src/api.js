import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8001/api';

const api = axios.create({
  baseURL: API_URL,
});

// Attach auth token to all requests
api.interceptors.request.use((config) => {
  try {
    const userData = JSON.parse(localStorage.getItem('pm_user'));
    if (userData?.token) {
      config.headers.Authorization = `Bearer ${userData.token}`;
    }
  } catch {}
  return config;
});

// Handle 401 responses — clear stale session
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('pm_user');
      if (window.location.pathname !== '/login' && window.location.pathname !== '/') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const loginUser = (username, password) => api.post('/auth/login', { username, password });
export const registerUser = (username, password, name) => api.post('/auth/register', { username, password, name });
export const runCode = (code) => api.post('/run', { code });
export const chatAI = (prompt, context = "") => api.post('/ai/chat', { prompt, context });
export const getModules = () => api.get('/content/modules');
export const getModule = (id) => api.get(`/content/module/${id}`);
export const completeModule = (userId, moduleId, score) => api.post('/content/complete', { user_id: userId, module_id: moduleId, score });
export const getCompletions = (userId) => api.get(`/content/completions/${userId}`);

// Profile
export const getProfile = (userId) => api.get(`/profile/${userId}`);
export const saveOnboarding = (data) => api.post('/profile/onboarding', data);
export const recordSignal = (data) => api.post('/profile/signal', data);

// Classroom
export const classroomChat = (data) => api.post('/classroom/chat', data);
export const getLesson = (lessonId, userId) => api.get(`/classroom/lesson/${lessonId}?user_id=${userId}`);
export const listLessons = () => api.get('/classroom/lessons');
export const evaluateCode = (data) => api.post('/classroom/evaluate', data);
export const submitDiagnostic = (data) => api.post('/classroom/diagnostic', data);

// Language
export const getLanguages = () => api.get('/languages');
export const checkLanguage = (code) => api.get(`/languages/check/${code}`);

// Notifications
export const getNotifications = (userId, unreadOnly = false) =>
    api.get(`/notifications?user_id=${userId}&unread_only=${unreadOnly}`);
export const markNotificationRead = (notifId, userId) =>
    api.put(`/notifications/${notifId}/read?user_id=${userId}`);
export const markAllNotificationsRead = (userId) =>
    api.patch(`/notifications/read-all?user_id=${userId}`);

// Module generation
export const requestModule = (userId, topic) =>
    api.post('/modules/request', { user_id: userId, topic });
export const getModuleStatus = (jobId) =>
    api.get(`/modules/status/${jobId}`);
export const getGeneratedModules = (userId) =>
    api.get(`/modules/generated/${userId}`);

// Profile settings
export const updateProfileSettings = (userId, settings) =>
    api.put(`/profile/${userId}/settings`, settings);
export const getProfileStats = (userId) =>
    api.get(`/profile/${userId}/stats`);
export const getProfileAchievements = (userId) =>
    api.get(`/profile/${userId}/achievements`);
export const getDailyRecommendation = (userId) =>
    api.get(`/profile/${userId}/daily-recommendation`);

// Trending
export const getTrending = (count = 10, category = '') =>
    api.get(`/trending`, { params: { count, category: category || undefined } });
export const getPersonalizedTrending = (userId) =>
    api.get(`/trending/personalized/${userId}`);
export const getTrendingCategories = () =>
    api.get(`/trending/categories`);
export const searchTrending = (query) =>
    api.get(`/trending/search`, { params: { q: query } });
export const getTrendingTopic = (topicId) =>
    api.get(`/trending/topic/${topicId}`);
export const getDailyContent = (userId) =>
    api.get(`/trending/daily/${userId}`);

// Paths
export const getPaths = () => api.get('/paths');
export const getPath = (pathId) => api.get(`/paths/${pathId}`);
export const startPath = (pathId, userId) => api.post(`/paths/${pathId}/start`, { user_id: userId });

// Helper for raw fetch calls (streaming endpoints)
export function getAuthHeaders() {
  try {
    const userData = JSON.parse(localStorage.getItem('pm_user'));
    if (userData?.token) {
      return { Authorization: `Bearer ${userData.token}` };
    }
  } catch {}
  return {};
}

export default api;
