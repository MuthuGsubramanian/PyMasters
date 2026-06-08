import axios from 'axios';

console.log('[PyMasters API] Module loaded — error interceptor v2 active');
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
// Also normalize ALL non-string values in error.response.data to prevent
// React "Objects are not valid as a React child" crashes
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('pm_user');
      if (window.location.pathname !== '/login' && window.location.pathname !== '/') {
        window.location.href = '/login';
      }
    }
    console.log('[PyMasters API] Error interceptor caught:', error?.response?.status, typeof error?.response?.data?.detail, error?.response?.data?.detail);
    // CRITICAL SAFETY: Normalize ALL non-string error data
    // Pydantic 422 returns detail as [{type, loc, msg, input}] which crashes React
    try {
      if (error?.response?.data) {
        const data = error.response.data;
        // Normalize detail field
        if (data.detail !== undefined && typeof data.detail !== 'string') {
          if (Array.isArray(data.detail)) {
            data.detail = data.detail
              .map((d) => (typeof d === 'string' ? d : d?.msg || JSON.stringify(d)))
              .filter(Boolean)
              .join('; ') || 'Validation error';
          } else if (typeof data.detail === 'object' && data.detail !== null) {
            data.detail = data.detail.msg || data.detail.message || JSON.stringify(data.detail);
          } else {
            data.detail = String(data.detail);
          }
        }
        // Also normalize message field
        if (data.message !== undefined && typeof data.message !== 'string') {
          data.message = typeof data.message === 'object' ? JSON.stringify(data.message) : String(data.message);
        }
      }
    } catch (e) {
      // If normalization itself fails, don't break the error chain
      console.warn('[api interceptor] Error normalizing response:', e);
    }
    return Promise.reject(error);
  }
);

export const loginUser = (username, password) => api.post('/auth/login', { username, password });
export const changePassword = (userId, currentPassword, newPassword) =>
    api.post('/auth/change-password', { user_id: userId, current_password: currentPassword, new_password: newPassword });
export const forgotPassword = (identifier) => api.post('/auth/forgot-password', { identifier });
export const resetPassword = (token, newPassword) => api.post('/auth/reset-password', { token, new_password: newPassword });
export const registerUser = (username, password, name, account_type = 'individual') =>
    api.post('/auth/register', { username, password, name, account_type });
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
export const sendVaathiyaarFeedback = (pairId, helpful) => api.post('/classroom/feedback', { pair_id: pairId, helpful });
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

// Organizations
export const createOrg = (data) => api.post('/org', data);
export const getMyOrgs = (userId) => api.get('/org/my', { params: { user_id: userId } });
export const getOrg = (orgId, userId) => api.get(`/org/${orgId}`, { params: { user_id: userId } });
export const updateOrg = (orgId, data) => api.put(`/org/${orgId}`, data);
export const getOrgMembers = (orgId, userId) => api.get(`/org/${orgId}/members`, { params: { user_id: userId } });
export const inviteToOrg = (orgId, data) => api.post(`/org/${orgId}/invite`, data);
export const bulkInviteToOrg = (orgId, data) => api.post(`/org/${orgId}/invite/bulk`, data);
export const joinOrg = (token, data) => api.post(`/org/join/${token}`, data);
export const getInviteInfo = (token) => api.get(`/org/invite/${token}`);
export const updateMemberRole = (orgId, memberId, data) => api.put(`/org/${orgId}/members/${memberId}/role`, data);
export const removeMember = (orgId, memberId, userId) => api.delete(`/org/${orgId}/members/${memberId}`, { params: { user_id: userId } });
export const getOrgAnalytics = (orgId, userId) => api.get(`/org/${orgId}/analytics`, { params: { user_id: userId } });
export const getOrgProgress = (orgId, userId, group) =>
  api.get(`/org/${orgId}/progress`, { params: { user_id: userId, ...(group ? { group } : {}) } });
export const getOrgGroups = (orgId, userId) =>
  api.get(`/org/${orgId}/groups`, { params: { user_id: userId } });
export const setMemberGroups = (orgId, memberId, groups) =>
  api.put(`/org/${orgId}/members/${memberId}/groups`, { groups });
export const getStudentDetail = (orgId, memberId, userId) =>
  api.get(`/org/${orgId}/students/${memberId}`, { params: { user_id: userId } });

// Platform super-admin
export const getAdminCheck = (userId) => api.get('/admin/check', { params: { user_id: userId } });
export const getAdminOverview = (userId) => api.get('/admin/overview', { params: { user_id: userId } });
export const getAdminUsers = (userId, q = '', limit = 50, offset = 0) => api.get('/admin/users', { params: { user_id: userId, q, limit, offset } });
export const getAdminOrgs = (userId) => api.get('/admin/orgs', { params: { user_id: userId } });
export const getAdminUsage = (userId, days = 30) => api.get('/admin/usage', { params: { user_id: userId, days } });
export const adminBlockUser = (targetId, userId, blocked) => api.post(`/admin/users/${targetId}/block`, { user_id: userId, blocked });
export const adminSetPlan = (targetId, userId, plan) => api.post(`/admin/users/${targetId}/plan`, { user_id: userId, plan });
export const getAdminUserDetail = (userId, targetId) => api.get(`/admin/users/${targetId}`, { params: { user_id: userId } });
export const getAdminUserViewAs = (userId, targetId) => api.get(`/admin/users/${targetId}/view-as`, { params: { user_id: userId } });
export const adminUpdateUser = (userId, targetId, data) => api.patch(`/admin/users/${targetId}`, { user_id: userId, ...data });
export const adminDeleteUser = (userId, targetId) => api.delete(`/admin/users/${targetId}`, { params: { user_id: userId } });
export const adminSetSuperAdmin = (userId, targetId, value) => api.post(`/admin/users/${targetId}/super-admin`, { user_id: userId, value });
export const adminSetUserRole = (userId, targetId, org_id, role) => api.post(`/admin/users/${targetId}/role`, { user_id: userId, org_id, role });
export const adminResetPassword = (userId, targetId) => api.post(`/admin/users/${targetId}/reset-password`, { user_id: userId });
export const adminRevokeSessions = (userId, targetId) => api.post(`/admin/users/${targetId}/revoke-sessions`, { user_id: userId });
export const getAdminOrgDetail = (userId, orgId) => api.get(`/admin/orgs/${orgId}`, { params: { user_id: userId } });
export const adminSetOrgPlan = (userId, orgId, plan) => api.post(`/admin/orgs/${orgId}/plan`, { user_id: userId, plan });
export const adminSetOrgType = (userId, orgId, type) => api.post(`/admin/orgs/${orgId}/type`, { user_id: userId, type });
export const adminDeleteOrg = (userId, orgId) => api.delete(`/admin/orgs/${orgId}`, { params: { user_id: userId } });
export const getAdminAudit = (userId, params = {}) => api.get('/admin/audit', { params: { user_id: userId, ...params } });
export const deleteOrg = (orgId, userId) =>
    api.delete(`/org/${orgId}`, { params: { user_id: userId } });
export const saveOrgOnboarding = (data) => api.post('/profile/onboarding/org', data);

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

// Release notes
export const getReleaseNotes = () => api.get('/release-notes');

// Weekly challenges
export const getWeeklyChallenge = () => api.get('/challenges/weekly');
export const submitChallenge = (data) => api.post('/challenges/submit', data);
export const getChallengeLeaderboard = () => api.get('/challenges/leaderboard');

// Quick reference
export const getQuickReference = (topic) => api.get(`/reference/${topic}`);
export const getQuickReferenceTopics = () => api.get('/reference/topics');

export default api;
