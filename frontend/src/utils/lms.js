// Small helpers for the course portal.

export const KINDS = {
  video: { icon: 'fa-circle-play', label: 'Video' },
  text: { icon: 'fa-file-lines', label: 'Reading' },
  document: { icon: 'fa-file-pdf', label: 'Document' },
  quiz: { icon: 'fa-circle-question', label: 'Quiz' },
  assignment: { icon: 'fa-file-pen', label: 'Assignment' },
};

/** 125 -> "2 min", 3725 -> "1 h 2 min", 40 -> "40 sec" */
export const formatDuration = (seconds) => {
  const s = Number(seconds) || 0;
  if (!s) return '';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return m ? `${h} h ${m} min` : `${h} h`;
  if (m) return `${m} min`;
  return `${s} sec`;
};

/** 1536000 -> "1.5 MB" */
export const formatSize = (bytes) => {
  const b = Number(bytes) || 0;
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(b >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  if (b >= 1024) return `${Math.round(b / 1024)} KB`;
  return `${b} B`;
};

/** Text with blank lines between paragraphs -> an array of paragraphs */
export const paragraphs = (text) => (text || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

/** "2026-10-12T17:00" for a datetime-local input, in the browser's time zone. */
export const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
