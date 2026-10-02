// Helpers for the learner side: the course player and the "My learning" dashboard.

/** Every kind of lesson, with its icon and label (utils/lms.js KINDS predates documents and assignments). */
export const LESSON_KINDS = {
  video: { icon: 'fa-circle-play', label: 'Video' },
  text: { icon: 'fa-file-lines', label: 'Reading' },
  document: { icon: 'fa-file-pdf', label: 'Document' },
  quiz: { icon: 'fa-circle-question', label: 'Quiz' },
  assignment: { icon: 'fa-file-pen', label: 'Assignment' },
};
export const kindOf = (kind) => LESSON_KINDS[kind] || { icon: 'fa-circle', label: 'Lesson' };

/** 755 -> "12:35", 3723 -> "1:02:03" (a video position) */
export const clock = (seconds) => {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
};

/** Whole seconds from now until an ISO date (0 once it has passed). */
export const secondsUntil = (iso) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 1000));

// ---- playback speed, remembered in this browser
export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const SPEED_KEY = 'adram:video-speed';

export const readSpeed = () => {
  try {
    const value = Number(window.localStorage.getItem(SPEED_KEY));
    return SPEEDS.includes(value) ? value : 1;
  } catch {
    return 1;
  }
};

export const saveSpeed = (value) => {
  try {
    window.localStorage.setItem(SPEED_KEY, String(value));
  } catch {
    /* private mode: the speed just isn't remembered */
  }
};

// ---- quiz answers in progress survive a reload (per attempt, this tab only)
const answersKey = (attemptId) => `adram:quiz-answers:${attemptId}`;

export const readAnswers = (attemptId) => {
  try {
    return JSON.parse(window.sessionStorage.getItem(answersKey(attemptId)) || '{}') || {};
  } catch {
    return {};
  }
};

export const saveAnswers = (attemptId, answers) => {
  try {
    if (answers) window.sessionStorage.setItem(answersKey(attemptId), JSON.stringify(answers));
    else window.sessionStorage.removeItem(answersKey(attemptId));
  } catch {
    /* not remembered */
  }
};

/** Reasons someone can give when reporting a question or answer (the backend's Report.REASONS). */
export const REPORT_REASONS = [
  ['spam', 'Spam or advertising'],
  ['abuse', 'Harassment or hate'],
  ['inappropriate', 'Inappropriate content'],
  ['copyright', 'Copyright problem'],
  ['misleading', 'Misleading or wrong'],
  ['other', 'Something else'],
];

/** "1.5 h", "40 min", "0 h" for a learning-hours figure. */
export const hoursLabel = (hours) => {
  const h = Number(hours) || 0;
  if (h > 0 && h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  return `${h % 1 ? h.toFixed(1) : h} h`;
};

/** Whether a quiz answer counts as given. */
export const answered = (value) => (Array.isArray(value) ? value.some((v) => answered(v)) : value !== undefined && value !== null && String(value).trim() !== '');
