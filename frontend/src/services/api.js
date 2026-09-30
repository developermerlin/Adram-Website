import axios from 'axios';

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
  getUsers: ({ role, search, page, status, ordering } = {}) =>
    api.get('/v1/auth/users/', {
      params: { role: role || undefined, search: search || undefined, status: status || undefined, ordering: ordering || undefined, page },
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
  categories: () => api.get('/v1/lms/categories/'),
  related: (slug) => api.get(`/v1/lms/courses/${slug}/related/`),
  viewed: (slug) => api.post(`/v1/lms/courses/${slug}/view/`),
  instructor: (id) => api.get(`/v1/lms/instructors/${id}/`),
  // a course and its lessons
  outline: (slug) => api.get(`/v1/lms/courses/${slug}/`),
  lesson: (id) => api.get(`/v1/lms/lessons/${id}/`),
  // {completed?, position?, spent?}: `spent` is seconds since the last heartbeat
  saveProgress: (id, data) => api.post(`/v1/lms/lessons/${id}/progress/`, data),
  startQuiz: (id) => api.post(`/v1/lms/lessons/${id}/quiz/start/`),
  // answers: {questionId: choiceId | [choiceIds] | 'text'}
  submitQuiz: (id, answers, attempt) => api.post(`/v1/lms/lessons/${id}/quiz/`, { answers, ...(attempt ? { attempt } : {}) }),
  submissions: (id) => api.get(`/v1/lms/lessons/${id}/submissions/`),
  submitAssignment: (id, { text, file }) => api.post(`/v1/lms/lessons/${id}/submissions/`, toForm({ text: text || '', file }), multipart),
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
  removeResource: (id) => api.delete(`/v1/lms/manage/resources/${id}/`),
  reorderResources: (lessonId, ids) => api.post(`/v1/lms/manage/lessons/${lessonId}/resources/order/`, { ids }),
  // quiz settings (pass_mark, time_limit_minutes, max_attempts, questions_per_attempt, shuffle_questions, shuffle_choices,
  // show_answers, is_required) and questions [{kind: single|multiple|true_false|short, text, explanation, points, choices, accepted_answers}]
  saveQuiz: (lessonId, data) => api.put(`/v1/lms/manage/lessons/${lessonId}/quiz/`, data),
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
  checkout: (coupon) => api.post('/v1/lms/cart/checkout/', coupon ? { coupon } : {}),
  buyNow: (slug, coupon) => api.post(`/v1/lms/courses/${slug}/buy/`, coupon ? { coupon } : {}),
  orders: () => api.get('/v1/lms/me/orders/'),
  order: (id) => api.get(`/v1/lms/orders/${id}/`),
  pay: (id, { method, transactionId, receipt }) =>
    api.post(`/v1/lms/orders/${id}/payment/`, toForm({ method, transaction_id: transactionId, receipt }), multipart),
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
  earnings: () => api.get('/v1/lms/instructor/earnings/'),
  questions: (params = {}) => api.get('/v1/lms/instructor/questions/', { params }),
  reviews: (params = {}) => api.get('/v1/lms/instructor/reviews/', { params }),
};

// Administrators: the course marketplace
export const lmsAdminAPI = {
  dashboard: (days = 30) => api.get('/v1/lms/admin/dashboard/', { params: { days } }),
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
  settings: () => api.get('/v1/lms/manage/settings/'),
  saveSettings: (data) => api.put('/v1/lms/manage/settings/', data),
  earnings: () => api.get('/v1/lms/manage/earnings/'),
  payouts: (instructor) => api.get('/v1/lms/manage/payouts/', { params: instructor ? { instructor } : {} }),
  addPayout: (data) => api.post('/v1/lms/manage/payouts/', data),
};

// The student's own portal
export const portalAPI = {
  me: () => api.get('/v1/portal/me/'),
  summary: () => api.get('/v1/portal/me/summary/'),
  actions: () => api.get('/v1/portal/me/actions/'),
  enroll: (slug) => api.post('/v1/portal/me/training/', { slug }),
  cancelEnrollment: (id) => api.delete(`/v1/portal/me/training/${id}/`),
  saveGoals: (data) => api.put('/v1/portal/me/goals/', data),
  save: (slug) => api.post('/v1/portal/me/saved/', { slug }),
  unsave: (slug) => api.delete(`/v1/portal/me/saved/${slug}/`),
  startApplication: (slug) => api.post('/v1/portal/me/applications/', { slug }),
  updateApplication: (id, data) => api.patch(`/v1/portal/me/applications/${id}/`, data),
  application: (id) => api.get(`/v1/portal/me/applications/${id}/`),
  requestService: (id) => api.post(`/v1/portal/me/applications/${id}/request-service/`),
  acceptTerms: (id) => api.post(`/v1/portal/me/applications/${id}/service/accept-terms/`),
  submitPayment: (id, { paymentMethod, transactionId, receipt }) => {
    const body = new FormData();
    body.append('payment_method', paymentMethod);
    body.append('transaction_id', transactionId);
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
