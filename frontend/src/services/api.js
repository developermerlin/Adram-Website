import axios from 'axios';
import { withAffiliate } from '../utils/referral';

// In development Vite proxies /api to Django (see vite.config.js), so a relative URL works.
// For production set VITE_API_URL to the backend's full URL, e.g. https://api.example.com/api
const API_ROOT = import.meta.env.VITE_API_URL || '/api';

// "Keep me signed in" keeps the session in localStorage (survives closing the browser);
// otherwise it lives in sessionStorage and ends with the browser session.
const AUTH_KEYS = ['access_token', 'refresh_token', 'user'];
const activeStore = () => (sessionStorage.getItem('access_token') ? sessionStorage : localStorage);

export const tokenStorage = {
  get access() {
    return activeStore().getItem('access_token');
  },
  get refresh() {
    return activeStore().getItem('refresh_token');
  },
  get user() {
    return activeStore().getItem('user');
  },
  // `remember` is only passed at sign-in; refreshes keep writing to whichever store is in use.
  save({ access, refresh }, remember) {
    let store = activeStore();
    if (remember !== undefined) {
      this.clear();
      store = remember ? localStorage : sessionStorage;
    }
    if (access) store.setItem('access_token', access);
    if (refresh) store.setItem('refresh_token', refresh);
  },
  saveUser(user) {
    activeStore().setItem('user', JSON.stringify(user));
  },
  clear() {
    AUTH_KEYS.forEach((key) => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });
  },
};

const api = axios.create({
  baseURL: API_ROOT,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = tokenStorage.access;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// One refresh request at a time, shared by all requests that got a 401 together.
let refreshPromise = null;

const refreshAccessToken = async () => {
  const refresh = tokenStorage.refresh;
  if (!refresh) throw new Error('No refresh token');
  const { data } = await axios.post(`${API_ROOT}/v1/auth/token/refresh/`, { refresh });
  // The backend rotates refresh tokens, so store the new one too.
  tokenStorage.save(data);
  return data.access;
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const hadToken = Boolean(original?.headers?.Authorization);

    // Only authenticated requests can be retried; a 401 from /login just means wrong credentials.
    if (error.response?.status === 401 && hadToken && !original._retry) {
      original._retry = true;
      try {
        refreshPromise = refreshPromise || refreshAccessToken();
        const access = await refreshPromise;
        original.headers.Authorization = `Bearer ${access}`;
        return api(original);
      } catch (refreshError) {
        tokenStorage.clear();
        // AuthContext listens for this and resets the signed-in user.
        window.dispatchEvent(new Event('auth:expired'));
        return Promise.reject(refreshError);
      } finally {
        refreshPromise = null;
      }
    }

    return Promise.reject(error);
  },
);

export const authAPI = {
  register: (data) => api.post('/v1/auth/register/', data),
  // Sign-in is two steps: the password returns a challenge, then the emailed code returns tokens.
  login: (email, password, remember = true) => api.post('/v1/auth/login/', { email, password, remember }),
  verifyOtp: (challenge, code) => api.post('/v1/auth/otp/verify/', { challenge, code }),
  resendOtp: (challenge) => api.post('/v1/auth/otp/resend/', { challenge }),
  requestPasswordReset: (email) => api.post('/v1/auth/password-reset/request/', { email }),
  confirmPasswordReset: (data) => api.post('/v1/auth/password-reset/confirm/', data),
  logout: (refresh) => api.post('/v1/auth/logout/', { refresh }),
  getProfile: () => api.get('/v1/auth/profile/'),
  // Adds the training or scholarships side (and its dashboard) to a student's account
  joinTrack: (track) => api.post('/v1/auth/profile/tracks/', { track }),
  // Two-step sign-in with an authenticator app, and the signed-in devices
  twoStep: () => api.get('/v1/auth/2fa/'),
  twoStepSetup: () => api.post('/v1/auth/2fa/setup/'),
  twoStepConfirm: (code) => api.post('/v1/auth/2fa/confirm/', { code }),
  twoStepDisable: (password, code) => api.post('/v1/auth/2fa/disable/', { password, code }),
  recoveryCodes: (code) => api.post('/v1/auth/2fa/recovery-codes/', { code }),
  sessions: () => api.get('/v1/auth/sessions/'),
  revokeSession: (id) => api.delete(`/v1/auth/sessions/${id}/`),
  revokeOtherSessions: () => api.post('/v1/auth/sessions/revoke-others/'),
  updateProfile: (data) => api.patch('/v1/auth/profile/update/', data),
  // FormData must not go out as JSON (the client default), so name the multipart type; the browser adds the boundary.
  uploadProfilePicture: (file) => {
    const body = new FormData();
    body.append('profile_picture', file);
    return api.patch('/v1/auth/profile/update/', body, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  removeProfilePicture: () => api.patch('/v1/auth/profile/update/', { profile_picture: null }),
  changePassword: (data) => api.post('/v1/auth/change-password/', data),
  oauthExchange: (code) => api.post('/v1/auth/oauth/exchange/', { code }),
  getActivityLogs: (page = 1) => api.get('/v1/auth/activity-logs/', { params: { page } }),
  getActivityOverview: (days = 30) => api.get('/v1/auth/activity-logs/overview/', { params: { days } }),};

// Administrator user management
export const adminAPI = {
  getUsers: ({ role, track, search, page, status, ordering } = {}) =>
    api.get('/v1/auth/users/', {
      params: { role: role || undefined, track: track || undefined, search: search || undefined, status: status || undefined, ordering: ordering || undefined, page },
    }),
  getStats: () => api.get('/v1/auth/users/stats/'),
  getInsights: (days = 30) => api.get('/v1/auth/users/insights/', { params: { days } }),
  getOverview: () => api.get('/v1/auth/users/overview/'),
  activity: (params = {}) => api.get('/v1/auth/activity/', { params }),
  activityOverview: (days = 30) => api.get('/v1/auth/activity/overview/', { params: { days } }),
  getUser: (id) => api.get(`/v1/auth/users/${id}/`),
  // action: approve | reject | suspend (shown as Disable) | activate (shown as Enable) | set_role
  userAction: (id, action, extra = {}) => api.post(`/v1/auth/users/${id}/action/`, { action, ...extra }),
  bulkAction: (ids, action, extra = {}) => api.post('/v1/auth/users/bulk/', { ids, action, ...extra }),
  deleteUser: (id) => api.delete(`/v1/auth/users/${id}/`),
};

// Scholarships and training programmes. The public lists only return published items;
// `manage` (admin / scholarship manager) sees drafts too. kind: 'scholarships' | 'courses'
export const catalogAPI = {
  scholarships: () => api.get('/v1/catalog/scholarships/'),
  scholarship: (slug) => api.get(`/v1/catalog/scholarships/${slug}/`),
  courses: () => api.get('/v1/catalog/courses/'),
  manage: (kind) => ({
    list: () => api.get(`/v1/catalog/manage/${kind}/`),
    get: (id) => api.get(`/v1/catalog/manage/${kind}/${id}/`),
    create: (data) => api.post(`/v1/catalog/manage/${kind}/`, data),
    update: (id, data) => api.patch(`/v1/catalog/manage/${kind}/${id}/`, data),
    remove: (id) => api.delete(`/v1/catalog/manage/${kind}/${id}/`),
    reorder: (ids) => api.post(`/v1/catalog/manage/${kind}/reorder/`, { ids }),
  }),
};

// Editable website wording and images. `page` is public; the rest are for administrators.
export const contentAPI = {
  page: (slug) => api.get(`/v1/content/${slug}/`),
  manage: (slug) => api.get(`/v1/content/manage/${slug}/`),
  save: (slug, data) => api.put(`/v1/content/manage/${slug}/`, { data }),
  reset: (slug) => api.delete(`/v1/content/manage/${slug}/`),
  history: (slug) => api.get(`/v1/content/manage/${slug}/history/`),
  restore: (slug, id) => api.post(`/v1/content/manage/${slug}/restore/${id}/`),
  media: () => api.get('/v1/content/media/'),
  upload: (file, onProgress) => {
    const body = new FormData();
    body.append('image', file);
    return api.post('/v1/content/media/', body, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => e.total && onProgress?.(Math.round((e.loaded / e.total) * 100)),
    });
  },
  removeMedia: (id) => api.delete(`/v1/content/media/${id}/`),
};

// Course portal: finding courses, learning, quizzes, assignments, notes, progress and certificates.
const multipart = { headers: { 'Content-Type': 'multipart/form-data' } };
const toForm = (data) => {
  if (data instanceof FormData) return data;
  const body = new FormData();
  Object.entries(data).forEach(([k, v]) => v !== undefined && v !== null && body.append(k, v));
  return body;
};

export const lmsAPI = {
  // discovery
  catalog: (params = {}) => api.get('/v1/lms/catalog/', { params }),
  facets: () => api.get('/v1/lms/catalog/facets/'),
  homeRows: () => api.get('/v1/lms/catalog/home/'),
  topics: () => api.get('/v1/lms/topics/'),
  topic: (slug) => api.get(`/v1/lms/topics/${slug}/`),
  // search box: suggestions while typing; recent, popular and saved searches
  suggest: (q) => api.get('/v1/lms/search/suggest/', { params: q ? { q } : {} }),
  clearSearches: () => api.delete('/v1/lms/me/searches/'),
  savedSearches: () => api.get('/v1/lms/me/saved-searches/'),
  saveSearch: (name, params) => api.post('/v1/lms/me/saved-searches/', { name, params }),
  deleteSavedSearch: (id) => api.delete(`/v1/lms/me/saved-searches/${id}/`),
  categories: () => api.get('/v1/lms/categories/'),
  related: (slug) => api.get(`/v1/lms/courses/${slug}/related/`),
  alsoTaken: (slug) => api.get(`/v1/lms/courses/${slug}/also-taken/`),
  viewed: (slug) => api.post(`/v1/lms/courses/${slug}/view/`),
  instructor: (id) => api.get(`/v1/lms/instructors/${id}/`),
  follow: (id, following) => (following ? api.post(`/v1/lms/instructors/${id}/follow/`) : api.delete(`/v1/lms/instructors/${id}/follow/`)),
  following: () => api.get('/v1/lms/me/following/'),
  // bundles (several courses for one price) and gifts (buying for someone else, who redeems a code)
  bundles: (params = {}) => api.get('/v1/lms/bundles/', { params }),
  bundle: (slug) => api.get(`/v1/lms/bundles/${slug}/`),
  buyBundle: (slug, gift) => api.post(`/v1/lms/bundles/${slug}/buy/`, withAffiliate(gift ? { gift } : {})),
  giftBuy: (data) => api.post('/v1/lms/gifts/', withAffiliate(data)),
  // affiliates: counting a visit through a partner's link; my application or partner dashboard
  affiliateClick: (code) => api.post(`/v1/lms/affiliates/${encodeURIComponent(code)}/click/`),
  myAffiliate: (days = 30) => api.get('/v1/lms/me/affiliate/', { params: { days } }),
  // news and offers by email: my choice, and the one-click unsubscribe link (no sign-in)
  // Premium (a plan alongside buying) and paying in parts
  premium: () => api.get('/v1/lms/premium/'),
  subscribe: (planId) => api.post(`/v1/lms/premium/plans/${planId}/subscribe/`),
  premiumEnrol: (slug) => api.post(`/v1/lms/courses/${slug}/premium-enrol/`),
  startInstalments: (slug, parts) => api.post(`/v1/lms/courses/${slug}/instalments/`, withAffiliate({ parts })),
  myInstalments: () => api.get('/v1/lms/me/instalments/'),
  // study groups
  courseGroups: (slug) => api.get(`/v1/lms/courses/${slug}/groups/`),
  createGroup: (slug, data) => api.post(`/v1/lms/courses/${slug}/groups/`, data),
  myGroups: () => api.get('/v1/lms/me/groups/'),
  group: (id) => api.get(`/v1/lms/groups/${id}/`),
  updateGroup: (id, data) => api.patch(`/v1/lms/groups/${id}/`, data),
  deleteGroup: (id) => api.delete(`/v1/lms/groups/${id}/`),
  joinGroup: (id, code) => api.post(`/v1/lms/groups/${id}/join/`, code ? { code } : {}),
  joinGroupByCode: (code) => api.post('/v1/lms/groups/join/', { code }),
  leaveGroup: (id) => api.post(`/v1/lms/groups/${id}/leave/`),
  groupPost: (id, body) => api.post(`/v1/lms/groups/${id}/posts/`, { body }),
  removeGroupPost: (id) => api.delete(`/v1/lms/group-posts/${id}/`),
  pinGroupPost: (id) => api.post(`/v1/lms/group-posts/${id}/pin/`),
  removeGroupMember: (id, userId) => api.delete(`/v1/lms/groups/${id}/members/${userId}/`),
  emailPreferences: () => api.get('/v1/lms/me/email-preferences/'),
  saveEmailPreferences: (marketing) => api.put('/v1/lms/me/email-preferences/', { marketing_emails: marketing }),
  unsubscribeInfo: (token) => api.get(`/v1/lms/unsubscribe/${token}/`),
  unsubscribe: (token, subscribe = false) => api.post(`/v1/lms/unsubscribe/${token}/`, { subscribe }),
  applyAffiliate: (data) => api.post('/v1/lms/me/affiliate/', data),
  updateAffiliate: (data) => api.patch('/v1/lms/me/affiliate/', data),
  // inviting friends: my link, friends who joined, codes earned; adding a friend's code after joining
  referrals: () => api.get('/v1/lms/me/referrals/'),
  claimReferral: (code) => api.post('/v1/lms/me/referrals/claim/', { code }),
  gift: (code) => api.get(`/v1/lms/gifts/${encodeURIComponent(code)}/`),
  redeemGift: (code) => api.post(`/v1/lms/gifts/${encodeURIComponent(code)}/redeem/`),
  // a course and its lessons
  outline: (slug) => api.get(`/v1/lms/courses/${slug}/`),
  lesson: (id, params) => api.get(`/v1/lms/lessons/${id}/`, { params }),
  // {completed?, position?, spent?}: `spent` is seconds since the last heartbeat
  saveProgress: (id, data) => api.post(`/v1/lms/lessons/${id}/progress/`, data),
  // The last save when the student leaves: survives the page closing (a normal request can be cut off)
  saveProgressOnLeave: (id, data) => {
    const token = tokenStorage.access;
    if (!token) return;
    fetch(`${API_ROOT}/v1/lms/lessons/${id}/progress/`, {
      method: 'POST', keepalive: true, body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    }).catch(() => {});
  },
  // every downloadable file of a course (enrolled students), and a signed link to all of it as a ZIP
  materials: (slug) => api.get(`/v1/lms/courses/${slug}/materials/`),
  startQuiz: (id) => api.post(`/v1/lms/lessons/${id}/quiz/start/`),
  // answers: {questionId: choiceId | [choiceIds] | 'text'}
  submitQuiz: (id, answers, attempt) => api.post(`/v1/lms/lessons/${id}/quiz/`, { answers, ...(attempt ? { attempt } : {}) }),
  submissions: (id) => api.get(`/v1/lms/lessons/${id}/submissions/`),
  // `files` is a list of File objects (up to the assignment's max_files)
  submitAssignment: (id, { text, files = [] }) => {
    const body = toForm({ text: text || '' });
    files.forEach((f) => body.append('files', f));
    return api.post(`/v1/lms/lessons/${id}/submissions/`, body, multipart);
  },
  // peer review of assignments
  peerReview: (lessonId) => api.get(`/v1/lms/lessons/${lessonId}/peer-review/`),
  completePeerReview: (id, data) => api.post(`/v1/lms/peer-reviews/${id}/`, data),
  // assignments due soon or overdue on the student's courses
  deadlines: () => api.get('/v1/lms/me/deadlines/'),
  lessonNotes: (id) => api.get(`/v1/lms/lessons/${id}/notes/`),
  addNote: (id, data) => api.post(`/v1/lms/lessons/${id}/notes/`, data),
  courseNotes: (slug, q) => api.get(`/v1/lms/courses/${slug}/notes/`, { params: q ? { q } : {} }),
  updateNote: (id, body) => api.patch(`/v1/lms/notes/${id}/`, { body }),
  removeNote: (id) => api.delete(`/v1/lms/notes/${id}/`),
  certificate: (slug) => api.get(`/v1/lms/courses/${slug}/certificate/`),
  verifyCertificate: (code) => api.get(`/v1/lms/certificates/${encodeURIComponent(code)}/`),
  // the signed-in person
  mine: () => api.get('/v1/lms/me/'),
  dashboard: () => api.get('/v1/lms/me/dashboard/'),
  // The training side: the student's programmes and the counts for its sidebar (scholarships use portalAPI)
  trainingSummary: () => api.get('/v1/lms/me/summary/'),
  // My progress: daily minutes, streaks, the daily goal, results, skills and finish forecasts
  analytics: (days = 30) => api.get('/v1/lms/me/analytics/', { params: { days } }),
  saveGoal: (dailyMinutes) => api.put('/v1/lms/me/goal/', { daily_minutes: dailyMinutes }),
  enrollments: () => api.get('/v1/lms/me/enrollments/'),
  enroll: (slug) => api.post('/v1/lms/me/enrollments/', { slug }),
  cancelEnrollment: (id) => api.delete(`/v1/lms/me/enrollments/${id}/`),
  library: () => api.get('/v1/lms/me/library/'),
  myCertificates: () => api.get('/v1/lms/me/certificates/'),
  myProfile: () => api.get('/v1/lms/me/profile/'),
  saveMyProfile: (data) => api.put('/v1/lms/me/profile/', data),
  report: (data) => api.post('/v1/lms/reports/', data),
  // reviews
  reviews: (slug, params) => api.get(`/v1/lms/courses/${slug}/reviews/`, { params }),
  saveReview: (slug, data) => api.post(`/v1/lms/courses/${slug}/reviews/`, data),
  deleteReview: (slug) => api.delete(`/v1/lms/courses/${slug}/reviews/`),
  // wishlist
  wishlist: () => api.get('/v1/lms/me/wishlist/'),
  wish: (slug) => api.post(`/v1/lms/courses/${slug}/wishlist/`),
  unwish: (slug) => api.delete(`/v1/lms/courses/${slug}/wishlist/`),
  // announcements and Q&A
  announcements: (slug) => api.get(`/v1/lms/courses/${slug}/announcements/`),
  questions: (slug, params) => api.get(`/v1/lms/courses/${slug}/qa/`, { params }),
  ask: (slug, data) => api.post(`/v1/lms/courses/${slug}/qa/`, data),
  thread: (id) => api.get(`/v1/lms/qa/${id}/`),
  removeThread: (id) => api.delete(`/v1/lms/qa/${id}/`),
  reply: (id, body) => api.post(`/v1/lms/qa/${id}/replies/`, { body }),
  removeReply: (id) => api.delete(`/v1/lms/qa/replies/${id}/`),
  likeReply: (id, liked) => (liked ? api.post(`/v1/lms/qa/replies/${id}/like/`) : api.delete(`/v1/lms/qa/replies/${id}/like/`)),
  markAnswer: (id, answer = true) => api.post(`/v1/lms/qa/replies/${id}/mark/`, { answer }),
  // "I have this question too", pinning (course staff), and the asker accepting the answer that solved it
  voteQuestion: (id, voted) => (voted ? api.post(`/v1/lms/qa/${id}/vote/`) : api.delete(`/v1/lms/qa/${id}/vote/`)),
  pinQuestion: (id, pinned) => api.post(`/v1/lms/qa/${id}/pin/`, { pinned }),
  acceptAnswer: (id, accepted = true) => api.post(`/v1/lms/qa/replies/${id}/accept/`, { accepted }),
  // course staff (the course's instructor, or administrators)
  postAnnouncement: (slug, data) => api.post(`/v1/lms/manage/courses/${slug}/announcements/`, data),
  removeAnnouncement: (id) => api.delete(`/v1/lms/manage/announcements/${id}/`),
  curriculum: (slug) => api.get(`/v1/lms/manage/courses/${slug}/curriculum/`),
  addSection: (slug, title) => api.post(`/v1/lms/manage/courses/${slug}/sections/`, { title }),
  renameSection: (id, title) => api.patch(`/v1/lms/manage/sections/${id}/`, { title }),
  removeSection: (id) => api.delete(`/v1/lms/manage/sections/${id}/`),
  addLesson: (sectionId, data) => api.post(`/v1/lms/manage/sections/${sectionId}/lessons/`, data),
  // `data` is a plain object, or FormData when a video or document file goes with it
  saveLesson: (id, data, onProgress) =>
    api.patch(`/v1/lms/manage/lessons/${id}/`, data, {
      ...(data instanceof FormData ? multipart : {}),
      onUploadProgress: (e) => e.total && onProgress?.(Math.round((e.loaded / e.total) * 100)),
      timeout: 0,
    }),
  removeLesson: (id) => api.delete(`/v1/lms/manage/lessons/${id}/`),
  addResource: (lessonId, file, title) => api.post(`/v1/lms/manage/lessons/${lessonId}/resources/`, toForm({ file, title }), multipart),
  // subtitles for uploaded videos (.vtt or .srt)
  addCaption: (lessonId, file, language, label) => api.post(`/v1/lms/manage/lessons/${lessonId}/captions/`, toForm({ file, language, label }), multipart),
  removeCaption: (id) => api.delete(`/v1/lms/manage/captions/${id}/`),
  removeResource: (id) => api.delete(`/v1/lms/manage/resources/${id}/`),
  reorderResources: (lessonId, ids) => api.post(`/v1/lms/manage/lessons/${lessonId}/resources/order/`, { ids }),
  // quiz settings (pass_mark, time_limit_minutes, max_attempts, questions_per_attempt, shuffle_questions, shuffle_choices,
  // show_answers, is_required), questions [{kind: single|multiple|true_false|short|fill_blank|matching, text, explanation, points,
  // difficulty, choices, accepted_answers, data}] and rules [{bank, category, difficulty, count}] (random questions from banks)
  saveQuiz: (lessonId, data) => api.put(`/v1/lms/manage/lessons/${lessonId}/quiz/`, data),
  // question banks: reusable questions with categories and difficulty; quizzes copy from them or draw random ones (rules)
  banks: () => api.get('/v1/lms/manage/banks/'),
  bank: (id, params) => api.get(`/v1/lms/manage/banks/${id}/`, { params }),
  createBank: (data) => api.post('/v1/lms/manage/banks/', data),
  updateBank: (id, data) => api.patch(`/v1/lms/manage/banks/${id}/`, data),
  removeBank: (id, force = false) => api.delete(`/v1/lms/manage/banks/${id}/`, { params: force ? { force: 1 } : {} }),
  addBankCategory: (id, name) => api.post(`/v1/lms/manage/banks/${id}/categories/`, { name }),
  renameBankCategory: (id, name) => api.patch(`/v1/lms/manage/bank-categories/${id}/`, { name }),
  removeBankCategory: (id) => api.delete(`/v1/lms/manage/bank-categories/${id}/`),
  addBankQuestion: (id, data) => api.post(`/v1/lms/manage/banks/${id}/questions/`, data),
  updateBankQuestion: (id, data) => api.patch(`/v1/lms/manage/bank-questions/${id}/`, data),
  removeBankQuestion: (id) => api.delete(`/v1/lms/manage/bank-questions/${id}/`),
  importBank: (id, file) => api.post(`/v1/lms/manage/banks/${id}/import/`, toForm({ file }), multipart),
  bankTemplate: () => api.get('/v1/lms/manage/banks/import-template/', { responseType: 'blob' }),
  reorder: (slug, data) => api.post(`/v1/lms/manage/courses/${slug}/reorder/`, data),
  students: (slug) => api.get(`/v1/lms/manage/courses/${slug}/students/`),
  courseSubmissions: (slug, status) => api.get(`/v1/lms/manage/courses/${slug}/submissions/`, { params: status ? { status } : {} }),
  // {status: approved|rejected, grade, feedback}
  gradeSubmission: (id, data) => api.post(`/v1/lms/manage/submissions/${id}/grade/`, data),
};

// Cart, orders and purchase history
export const shopAPI = {
  cart: (coupon) => api.get('/v1/lms/cart/', { params: coupon ? { coupon } : {} }),
  addToCart: (slug) => api.post('/v1/lms/cart/', { slug }),
  removeFromCart: (slug) => api.delete(`/v1/lms/cart/${slug}/`),
  checkout: (coupon) => api.post('/v1/lms/cart/checkout/', withAffiliate(coupon ? { coupon } : {})),
  buyNow: (slug, coupon) => api.post(`/v1/lms/courses/${slug}/buy/`, withAffiliate(coupon ? { coupon } : {})),
  orders: () => api.get('/v1/lms/me/orders/'),
  order: (id) => api.get(`/v1/lms/orders/${id}/`),
  pay: (id, { method, transactionId, payer, receipt }) =>
    api.post(`/v1/lms/orders/${id}/payment/`, toForm({ method, transaction_id: transactionId, payer: payer || '', receipt }), multipart),
  cancel: (id) => api.post(`/v1/lms/orders/${id}/cancel/`),
  receipt: (id) => api.get(`/v1/lms/orders/${id}/receipt/`, { responseType: 'blob' }),
};

// The notification centre (bell)
export const notificationsAPI = {
  list: (params = {}) => api.get('/v1/lms/me/notifications/', { params }),
  markRead: (ids) => api.post('/v1/lms/me/notifications/read/', { ids }),
  markAllRead: () => api.post('/v1/lms/me/notifications/read/', { all: true }),
};

// Instructors (administrators may use these too)
export const instructorAPI = {
  dashboard: () => api.get('/v1/lms/instructor/dashboard/'),
  courses: () => api.get('/v1/lms/instructor/courses/'),
  createCourse: (data) => api.post('/v1/lms/instructor/courses/', data),
  course: (slug) => api.get(`/v1/lms/instructor/courses/${slug}/`),
  saveCourse: (slug, data) => api.patch(`/v1/lms/instructor/courses/${slug}/`, data),
  deleteCourse: (slug) => api.delete(`/v1/lms/instructor/courses/${slug}/`),
  submit: (slug) => api.post(`/v1/lms/instructor/courses/${slug}/submit/`),
  publish: (slug, publish = true) => api.post(`/v1/lms/instructor/courses/${slug}/publish/`, { publish }),
  analytics: (params = {}) => api.get('/v1/lms/instructor/analytics/', { params }),
  // from seeing a course to finishing it, step by step; and who follows me
  funnel: (params = {}) => api.get('/v1/lms/instructor/funnel/', { params }),
  followers: (days = 30) => api.get('/v1/lms/instructor/followers/', { params: { days } }),
  earnings: () => api.get('/v1/lms/instructor/earnings/'),
  // asking to be paid, tax details, and a yearly sales report (CSV)
  withdrawals: () => api.get('/v1/lms/instructor/withdrawals/'),
  requestWithdrawal: (data) => api.post('/v1/lms/instructor/withdrawals/', data),
  cancelWithdrawal: (id) => api.delete(`/v1/lms/instructor/withdrawals/${id}/`),
  taxInfo: () => api.get('/v1/lms/instructor/tax-info/'),
  saveTaxInfo: (data) => api.put('/v1/lms/instructor/tax-info/', data),
  earningsReport: (year) => api.get('/v1/lms/instructor/earnings/report/', { params: { year }, responseType: 'blob' }),
  questions: (params = {}) => api.get('/v1/lms/instructor/questions/', { params }),
  reviews: (params = {}) => api.get('/v1/lms/instructor/reviews/', { params }),
};

// Administrators: the course marketplace
export const lmsAdminAPI = {
  dashboard: (days = 30) => api.get('/v1/lms/admin/dashboard/', { params: { days } }),
  // Enrollment requests (courses "by approval"): status requested|active|completed|declined|cancelled|all
  enrollments: (params) => api.get('/v1/lms/admin/enrollments/', { params }),
  // {ids, decision: confirm|decline, note?, start_date?}
  decideEnrollments: (data) => api.post('/v1/lms/admin/enrollments/decide/', data),
  courses: (status) => api.get('/v1/lms/admin/courses/', { params: status ? { status } : {} }),
  // action: start | approve | request_changes | reject | publish | unpublish
  reviewCourse: (slug, action, note) => api.post(`/v1/lms/admin/courses/${slug}/review/`, { action, note }),
  categories: () => api.get('/v1/lms/admin/categories/'),
  saveCategory: (id, data) => (id ? api.patch(`/v1/lms/admin/categories/${id}/`, data) : api.post('/v1/lms/admin/categories/', data)),
  removeCategory: (id) => api.delete(`/v1/lms/admin/categories/${id}/`),
  reviews: (params = {}) => api.get('/v1/lms/admin/reviews/', { params }),
  moderateReview: (id, action, note) => api.post(`/v1/lms/admin/reviews/${id}/`, { action, note }),
  reports: (status) => api.get('/v1/lms/admin/reports/', { params: status ? { status } : {} }),
  decideReport: (id, data) => api.post(`/v1/lms/admin/reports/${id}/`, data),
  certificates: (params = {}) => api.get('/v1/lms/admin/certificates/', { params }),
  certificateAction: (code, action, reason) => api.post(`/v1/lms/admin/certificates/${code}/`, { action, reason }),
  // certificate designs: layout, colour, wording; `courses` (slugs) use the template
  referrals: () => api.get('/v1/lms/manage/referrals/'),
  affiliates: () => api.get('/v1/lms/manage/affiliates/'),
  // email campaigns and audiences
  insights: (days = 30) => api.get('/v1/lms/admin/insights/', { params: { days } }),
  plans: () => api.get('/v1/lms/manage/plans/'),
  createPlan: (data) => api.post('/v1/lms/manage/plans/', data),
  updatePlan: (id, data) => api.patch(`/v1/lms/manage/plans/${id}/`, data),
  removePlan: (id) => api.delete(`/v1/lms/manage/plans/${id}/`),
  campaigns: () => api.get('/v1/lms/manage/campaigns/'),
  campaign: (id) => api.get(`/v1/lms/manage/campaigns/${id}/`),
  createCampaign: (data) => api.post('/v1/lms/manage/campaigns/', data),
  updateCampaign: (id, data) => api.patch(`/v1/lms/manage/campaigns/${id}/`, data),
  removeCampaign: (id) => api.delete(`/v1/lms/manage/campaigns/${id}/`),
  testCampaign: (id) => api.post(`/v1/lms/manage/campaigns/${id}/test/`),
  sendCampaign: (id) => api.post(`/v1/lms/manage/campaigns/${id}/send/`),
  previewAudience: (rules) => api.post('/v1/lms/manage/audience/preview/', { rules }),
  segments: () => api.get('/v1/lms/manage/segments/'),
  createSegment: (data) => api.post('/v1/lms/manage/segments/', data),
  affiliateAction: (id, data) => api.post(`/v1/lms/manage/affiliates/${id}/`, data),
  affiliatePayout: (id, data) => api.post(`/v1/lms/manage/affiliates/${id}/payouts/`, data),
  bundles: () => api.get('/v1/lms/manage/bundles/'),
  createBundle: (data) => api.post('/v1/lms/manage/bundles/', data),
  updateBundle: (id, data) => api.patch(`/v1/lms/manage/bundles/${id}/`, data),
  removeBundle: (id) => api.delete(`/v1/lms/manage/bundles/${id}/`),
  certificateTemplates: () => api.get('/v1/lms/admin/certificate-templates/'),
  createCertificateTemplate: (data) => api.post('/v1/lms/admin/certificate-templates/', data),
  updateCertificateTemplate: (id, data) => api.patch(`/v1/lms/admin/certificate-templates/${id}/`, data),
  removeCertificateTemplate: (id) => api.delete(`/v1/lms/admin/certificate-templates/${id}/`),
  audit: (params = {}) => api.get('/v1/lms/admin/audit/', { params }),
  createUser: (data) => api.post('/v1/lms/admin/users/', data),
  editUser: (id, data) => api.patch(`/v1/lms/admin/users/${id}/`, data),
  // audience: students | instructors | everyone
  broadcast: (data) => api.post('/v1/lms/admin/notify/', data),
  userLearning: (id) => api.get(`/v1/lms/admin/users/${id}/learning/`),
  grantCourse: (id, slug) => api.post(`/v1/lms/admin/users/${id}/enroll/`, { slug }),
  // sales
  orders: (params = {}) => api.get('/v1/lms/manage/orders/', { params }),
  order: (id) => api.get(`/v1/lms/manage/orders/${id}/`),
  decideOrder: (id, action, note) => api.post(`/v1/lms/manage/orders/${id}/decision/`, { action, note }),
  refundOrder: (id, reason) => api.post(`/v1/lms/manage/orders/${id}/refund/`, { reason }),
  receipt: (id) => api.get(`/v1/lms/orders/${id}/receipt/`, { responseType: 'blob' }),
  coupons: () => api.get('/v1/lms/manage/coupons/'),
  saveCoupon: (id, data) => (id ? api.patch(`/v1/lms/manage/coupons/${id}/`, data) : api.post('/v1/lms/manage/coupons/', data)),
  removeCoupon: (id) => api.delete(`/v1/lms/manage/coupons/${id}/`),
  flashSales: () => api.get('/v1/lms/manage/flash-sales/'),
  createFlashSale: (data) => api.post('/v1/lms/manage/flash-sales/', data),
  updateFlashSale: (id, data) => api.patch(`/v1/lms/manage/flash-sales/${id}/`, data),
  deleteFlashSale: (id) => api.delete(`/v1/lms/manage/flash-sales/${id}/`),
  settings: () => api.get('/v1/lms/manage/settings/'),
  saveSettings: (data) => api.put('/v1/lms/manage/settings/', data),
  earnings: () => api.get('/v1/lms/manage/earnings/'),
  payouts: (instructor) => api.get('/v1/lms/manage/payouts/', { params: instructor ? { instructor } : {} }),
  addPayout: (data) => api.post('/v1/lms/manage/payouts/', data),
  withdrawals: (status = 'requested') => api.get('/v1/lms/manage/withdrawals/', { params: { status } }),
  payWithdrawal: (id, data) => api.post(`/v1/lms/manage/withdrawals/${id}/pay/`, data),
  rejectWithdrawal: (id, reason) => api.post(`/v1/lms/manage/withdrawals/${id}/reject/`, { reason }),
};

// The student's own portal
export const portalAPI = {
  me: () => api.get('/v1/portal/me/'),
  summary: () => api.get('/v1/portal/me/summary/'),
  actions: () => api.get('/v1/portal/me/actions/'),
  saveGoals: (data) => api.put('/v1/portal/me/goals/', data),
  save: (slug) => api.post('/v1/portal/me/saved/', { slug }),
  unsave: (slug) => api.delete(`/v1/portal/me/saved/${slug}/`),
  startApplication: (slug) => api.post('/v1/portal/me/applications/', { slug }),
  updateApplication: (id, data) => api.patch(`/v1/portal/me/applications/${id}/`, data),
  application: (id) => api.get(`/v1/portal/me/applications/${id}/`),
  requestService: (id) => api.post(`/v1/portal/me/applications/${id}/request-service/`),
  acceptTerms: (id) => api.post(`/v1/portal/me/applications/${id}/service/accept-terms/`),
  submitPayment: (id, { paymentMethod, transactionId, payer, receipt }) => {
    const body = new FormData();
    body.append('payment_method', paymentMethod);
    body.append('transaction_id', transactionId);
    body.append('payer', payer || '');
    body.append('receipt', receipt);
    return api.post(`/v1/portal/me/applications/${id}/service/payment/`, body, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  uploadDocument: (documentId, file) => {
    const body = new FormData();
    body.append('file', file);
    return api.post(`/v1/portal/me/documents/${documentId}/file/`, body, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  removeDocumentFile: (documentId) => api.delete(`/v1/portal/me/documents/${documentId}/file/`),
  addDocument: (applicationId, name) => api.post(`/v1/portal/me/applications/${applicationId}/documents/`, { name }),
  updateDocument: (id, data) => api.patch(`/v1/portal/me/documents/${id}/`, data),
  removeDocument: (id) => api.delete(`/v1/portal/me/documents/${id}/`),
  openedLink: (slug) => api.post('/v1/portal/me/events/', { kind: 'opened_link', slug }),
};

// Administrators: a student's portal and the application tracker
export const staffPortalAPI = {
  student: (userId) => api.get(`/v1/portal/staff/students/${userId}/`),
  addApplication: (userId, data) => api.post(`/v1/portal/staff/students/${userId}/applications/`, data),
  updateApplication: (id, data) => api.patch(`/v1/portal/staff/applications/${id}/`, data),
  removeApplication: (id) => api.delete(`/v1/portal/staff/applications/${id}/`),
  addDocument: (applicationId, name) => api.post(`/v1/portal/staff/applications/${applicationId}/documents/`, { name }),
  updateDocument: (id, data) => api.patch(`/v1/portal/staff/documents/${id}/`, data),
  removeDocument: (id) => api.delete(`/v1/portal/staff/documents/${id}/`),
  addNote: (userId, body) => api.post(`/v1/portal/staff/students/${userId}/notes/`, { body }),
  removeNote: (id) => api.delete(`/v1/portal/staff/notes/${id}/`),
  decide: (applicationId, payload) => api.post(`/v1/portal/staff/applications/${applicationId}/service/`, payload),
  addMilestone: (applicationId, data) => api.post(`/v1/portal/staff/applications/${applicationId}/milestones/`, data),
  updateMilestone: (id, data) => api.patch(`/v1/portal/staff/milestones/${id}/`, data),
  removeMilestone: (id) => api.delete(`/v1/portal/staff/milestones/${id}/`),
  reorderMilestones: (applicationId, ids) => api.post(`/v1/portal/staff/applications/${applicationId}/milestones/reorder/`, { ids }),
  // status: accepted | returned (with tag + note) | pending
  reviewDocument: (documentId, payload) => api.post(`/v1/portal/staff/documents/${documentId}/review/`, payload),
  uploadResultFile: (applicationId, file, title) => {
    const body = new FormData();
    body.append('file', file);
    if (title) body.append('title', title);
    return api.post(`/v1/portal/staff/applications/${applicationId}/result-files/`, body, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  removeResultFile: (id) => api.delete(`/v1/portal/staff/result-files/${id}/`),
  enrollments: () => api.get('/v1/portal/staff/training/'),
  enrollStudent: (userId, slug, status = 'active') => api.post(`/v1/portal/staff/students/${userId}/training/`, { slug, status }),
  updateEnrollment: (id, data) => api.patch(`/v1/portal/staff/training/${id}/`, data),
  summary: () => api.get('/v1/portal/staff/summary/'),
  insights: (days = 30) => api.get('/v1/portal/staff/insights/', { params: { days } }),
  applicationsOverview: () => api.get('/v1/portal/staff/applications/overview/'),
  scholarshipsOverview: () => api.get('/v1/portal/staff/scholarships/overview/'),
  trainingOverview: () => api.get('/v1/portal/staff/training/overview/'),
  paymentSettings: () => api.get('/v1/portal/staff/payment-settings/'),
  savePaymentSettings: (data) => api.put('/v1/portal/staff/payment-settings/', data),
  applications: ({ stage, search, page } = {}) =>
    api.get('/v1/portal/staff/applications/', { params: { stage: stage || undefined, search: search || undefined, page } }),
};

// A private file as a temporary object URL (for image thumbnails). Revoke it when done.
export const privateFileUrl = async (kind, id) => {
  const { data } = await api.get(`/v1/portal/files/${kind}/${id}/`, { responseType: 'blob' });
  return URL.createObjectURL(data);
};

// Private uploads (receipts, documents) need the sign-in token, so they're fetched and opened as a blob.
// kind: 'documents' | 'receipts' | 'results'
export const openPrivateFile = async (kind, id) => {
  const tab = window.open('', '_blank'); // open now, while we still have the click (pop-up blockers)
  try {
    const { data } = await api.get(`/v1/portal/files/${kind}/${id}/`, { responseType: 'blob' });
    const url = URL.createObjectURL(data);
    if (tab) tab.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) {
    tab?.close();
    throw err;
  }
};

// Social sign-in starts with a full-page visit to the API (not the Vite proxy), so the security
// cookie is set on the same host the provider redirects back to.
const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
export const oauthStartUrl = (provider, next) =>
  `${BACKEND_URL}/api/v1/auth/oauth/${provider}/start/${next ? `?next=${encodeURIComponent(next)}` : ''}`;

// Messages between people and the ADRAM team (one conversation per person; admins see them all).
// A message is { body, file?, voice?, duration? }; with a file it goes up as multipart with upload progress.
const messagePayload = ({ body = '', file, voice = false, duration }) => {
  if (!file) return { body };
  const form = new FormData();
  form.append('body', body);
  form.append('file', file);
  if (voice) form.append('voice', 'true');
  if (duration != null) form.append('duration', String(duration));
  return form;
};
// FormData must not go out as JSON (the client default), so name the multipart type; the browser adds the boundary.
const messageConfig = (message, onProgress) => ({
  ...(message.file ? { headers: { 'Content-Type': 'multipart/form-data' } } : {}),
  ...(onProgress ? { onUploadProgress: (e) => e.total && onProgress(Math.round((e.loaded / e.total) * 100)) } : {}),
});

export const messagesAPI = {
  unread: () => api.get('/v1/portal/messages/unread/'),
  stats: () => api.get('/v1/portal/messages/stats/'),
  mine: () => api.get('/v1/portal/me/messages/'),
  send: (message, onProgress) => api.post('/v1/portal/me/messages/', messagePayload(message), messageConfig(message, onProgress)),
  conversations: (params = {}) => api.get('/v1/portal/staff/conversations/', { params }),
  conversation: (userId) => api.get(`/v1/portal/staff/conversations/${userId}/`),
  reply: (userId, message, onProgress) =>
    api.post(`/v1/portal/staff/conversations/${userId}/`, messagePayload(message), messageConfig(message, onProgress)),
  deleteConversation: (userId) => api.delete(`/v1/portal/staff/conversations/${userId}/`),
  deleteMessage: (userId, messageId) => api.delete(`/v1/portal/staff/conversations/${userId}/messages/${messageId}/`),
};

// Voice and video calls: the server relays connection details and status; media goes browser to browser.
export const callsAPI = {
  config: () => api.get('/v1/portal/calls/config/'),
  start: (kind, offer, user) => api.post('/v1/portal/calls/', { kind, offer, ...(user ? { user } : {}) }),
  incoming: () => api.get('/v1/portal/calls/incoming/'),
  get: (id) => api.get(`/v1/portal/calls/${id}/`),
  answer: (id, answer) => api.post(`/v1/portal/calls/${id}/answer/`, { answer }),
  decline: (id) => api.post(`/v1/portal/calls/${id}/decline/`),
  end: (id) => api.post(`/v1/portal/calls/${id}/end/`),
};

export const contactAPI = {
  send: (data) => api.post('/contact/', data),
  // Admin only
  listMessages: ({ page, search, isRead } = {}) =>
    api.get('/contact/messages/', { params: { page, search: search || undefined, is_read: isRead } }),
  setRead: (id, isRead) => api.patch(`/contact/messages/${id}/`, { is_read: isRead }),
  deleteMessage: (id) => api.delete(`/contact/messages/${id}/`),
};

// Turns a DRF error response into { fieldName: 'message', form: 'message' }.
export const parseApiErrors = (error, fallback = 'Something went wrong. Please try again.') => {
  const data = error?.response?.data;
  if (!error?.response) return { form: 'Cannot reach the server. Check your connection and try again.' };
  if (!data || typeof data !== 'object') return { form: fallback };

  const errors = {};
  Object.entries(data).forEach(([key, value]) => {
    // Nested errors (e.g. one row of a list) just flag the field.
    const message = Array.isArray(value) && value.every((v) => typeof v === 'string') ? value.join(' ')
      : typeof value === 'string' ? value
      : key !== 'errors' && value && typeof value === 'object' ? 'Please check this field.' : null;
    if (!message) return;
    if (key === 'detail' || key === 'non_field_errors' || key === 'message') errors.form = message;
    else errors[key] = message;
  });
  if (data.errors && typeof data.errors === 'object') Object.assign(errors, parseApiErrors({ response: { data: data.errors } }));
  if (Object.keys(errors).length === 0) errors.form = fallback;
  return errors;
};

export default api;
