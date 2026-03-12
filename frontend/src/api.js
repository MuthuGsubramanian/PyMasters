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
export const getActivity = (userId, limit = 15) => api.get(`/activity/${userId}?limit=${limit}`);
export const getUserProfile = (userId) => api.get(`/user/${userId}`);
export const saveSettings = (userId, hfToken) => api.post('/settings/save', { user_id: userId, hf_token: hfToken });

export default api;
