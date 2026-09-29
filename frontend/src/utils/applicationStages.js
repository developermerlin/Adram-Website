// Application stages (must match Application.STAGE_CHOICES in backend/portal/models.py).
// The first five are the normal path; the last two end an application early.
export const STAGES = [
  { id: 'interested', label: 'Interested', icon: 'fa-lightbulb', tone: 'gray' },
  { id: 'preparing', label: 'Preparing', icon: 'fa-pen-to-square', tone: 'blue' },
  { id: 'submitted', label: 'Submitted', icon: 'fa-paper-plane', tone: 'blue' },
  { id: 'interview', label: 'Interview', icon: 'fa-comments', tone: 'amber' },
  { id: 'accepted', label: 'Accepted', icon: 'fa-trophy', tone: 'green' },
  { id: 'unsuccessful', label: 'Unsuccessful', icon: 'fa-circle-xmark', tone: 'red' },
  { id: 'withdrawn', label: 'Withdrawn', icon: 'fa-arrow-rotate-left', tone: 'gray' },
];

export const PATH = STAGES.slice(0, 5);
export const stageMeta = (id) => STAGES.find((s) => s.id === id) || STAGES[0];
export const isClosed = (id) => ['accepted', 'unsuccessful', 'withdrawn'].includes(id);

// How far along an application is (0–100): ADRAM's timeline when there is one, otherwise the stage.
export const progressOf = (a) => {
  if (a.milestones?.length) return Math.round((a.milestones.filter((m) => m.status === 'done').length / a.milestones.length) * 100);
  const i = PATH.findIndex((s) => s.id === a.stage);
  return i < 0 ? 100 : Math.round(((i + 1) / PATH.length) * 100);
};

// Days until a date ("YYYY-MM-DD"); negative once it has passed.
export const daysUntil = (date) => {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${date}T00:00`) - today) / 86400000);
};

// Why ADRAM returns a document (must match ApplicationDocument.RETURN_TAGS in backend/portal/models.py).
export const RETURN_TAGS = [
  { id: 'unreadable', label: 'Unclear / unreadable' },
  { id: 'wrong_document', label: 'Wrong document' },
  { id: 'expired', label: 'Expired' },
  { id: 'incomplete', label: 'Incomplete / pages missing' },
  { id: 'needs_certification', label: 'Needs certification or stamp' },
  { id: 'name_mismatch', label: 'Name doesn’t match' },
  { id: 'needs_translation', label: 'Needs an English translation' },
  { id: 'other', label: 'Other' },
];

// A document's review state, from the student's point of view.
export const reviewState = (doc) => {
  if (doc.review_status === 'accepted') return 'accepted';
  if (doc.review_status === 'returned') return 'returned';
  if (doc.has_file) return doc.resubmitted ? 'resubmitted' : 'in_review';
  return 'missing';
};

// Where the scholarship result stands, from the application stage (set by ADRAM on applications it handles).
// tone: amber while waiting, green when awarded, red when unsuccessful.
export const resultState = (stage) =>
  ({
    submitted: { key: 'waiting', tone: 'amber', icon: 'fa-hourglass-half', title: 'Waiting for scholarship result' },
    interview: { key: 'waiting', tone: 'amber', icon: 'fa-comments', title: 'Interview stage: waiting for scholarship result' },
    accepted: { key: 'awarded', tone: 'green', icon: 'fa-trophy', title: 'Congratulations! You have successfully been awarded the scholarship.' },
    unsuccessful: { key: 'unsuccessful', tone: 'red', icon: 'fa-circle-xmark', title: 'Sorry! You did not succeed in the scholarship.' },
  })[stage] || null;
