import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8001/api';

const api = axios.create({
  baseURL: API_URL,
});

export const loginUser = (username, password) => api.post('/auth/login', { username, password });
export const registerUser = (username, password, name) => api.post('/auth/register', { username, password, name });
export const runCode = (code) => api.post('/run', { code });
export const chatAI = (prompt, context = "") => api.post('/ai/chat', { prompt, context });
export const getModules = () => api.get('/content/modules');
export const getModule = (id) => api.get(`/content/module/${id}`);
export const completeModule = (userId, moduleId, score) => api.post('/content/complete', { user_id: userId, module_id: moduleId, score });

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

export default api;
