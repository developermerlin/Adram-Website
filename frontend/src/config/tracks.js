// A student account can use the training side (courses), the scholarships side, or both. Each side has its
// own dashboard, sidebar and pages; messages, notifications and the profile are shared.

export const TRACKS = {
  training: {
    label: 'Training',
    icon: 'fa-laptop-code',
    home: '/student/dashboard/training',
    browse: '/courses',
    join: 'Start training',
    pitch: 'Take courses, follow your progress, earn certificates and manage your purchases.',
  },
  scholarships: {
    label: 'Scholarships',
    icon: 'fa-graduation-cap',
    home: '/student/dashboard/scholarships',
    browse: '/scholarships',
    join: 'Start with scholarships',
    pitch: 'Save scholarships, track your applications, upload documents and let ADRAM apply for you.',
  },
};

export const TRACK_ORDER = ['training', 'scholarships'];

// Pages that belong to one side (anything else, like messages or the profile, is shared).
const PATHS = {
  training: ['/student/dashboard/training', '/student/learning', '/student/progress', '/student/referrals', '/student/affiliate', '/student/certificates', '/student/purchases', '/student/training'],
  scholarships: ['/student/dashboard/scholarships', '/student/applications', '/student/saved'],
};

export const trackOfPath = (pathname) =>
  TRACK_ORDER.find((t) => PATHS[t].some((p) => pathname === p || pathname.startsWith(`${p}/`))) || null;

export const tracksOf = (user) => user?.tracks || [];

const KEY = 'adram:student-side';
export const rememberTrack = (track) => {
  try {
    localStorage.setItem(KEY, track);
  } catch {
    /* storage unavailable: the side just isn't remembered */
  }
};
const remembered = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

/** The side a student is looking at: the page's own side, else the last one they used, else their first. */
export const currentTrack = (user, pathname) => {
  const mine = tracksOf(user);
  const fromPage = trackOfPath(pathname);
  if (fromPage && mine.includes(fromPage)) return fromPage;
  const last = remembered();
  return mine.includes(last) ? last : mine[0] || null;
};
