import { formatDate } from '../../utils/format';
import { daysUntil } from '../../utils/applicationStages';

const fmt = (date) => formatDate(`${date}T00:00`);

const countdown = (days) => (days < 0 ? 'closed' : days === 0 ? 'closes today' : days === 1 ? '1 day left' : `${days} days left`);

// The admin's key dates plus the official deadline (added if the timeline doesn't already have that date).
const entriesFor = (s) => {
  const entries = [...(s.timeline || [])];
  if (s.deadline && !entries.some((e) => e.date === s.deadline)) {
    entries.push({ label: 'Application deadline', date: s.deadline, text: '', isDeadline: true });
  }
  return entries.map((e) => ({ ...e, isDeadline: e.isDeadline || e.date === s.deadline }));
};

/**
 * One-line deadline for cards and lists: the date with a countdown, or the usual application window,
 * or "not announced yet". `compact` drops the window text.
 */
export const DeadlineBadge = ({ scholarship: s, compact = false }) => {
  const days = daysUntil(s.deadline);
  if (days !== null) {
    const tone = days < 0 ? 'past' : days <= 14 ? 'urgent' : days <= 45 ? 'soon' : 'open';
    return (
      <span className={`deadline-badge deadline-badge--${tone}`}>
        <i className="fas fa-hourglass-half" aria-hidden="true" />
        <span>Deadline <strong>{fmt(s.deadline)}</strong></span>
        <em>{countdown(days)}</em>
      </span>
    );
  }
  return (
    <span className="deadline-badge deadline-badge--tba">
      <i className="far fa-calendar" aria-hidden="true" />
      <span>{!compact && s.application_window ? s.application_window : 'Deadline not announced yet'}</span>
    </span>
  );
};

/** Vertical timeline of key dates; past dates are ticked and the next one is highlighted. */
export const KeyDatesTimeline = ({ scholarship: s }) => {
  const entries = entriesFor(s);
  if (!entries.length) {
    return (
      <p className="key-dates__empty">
        <i className="far fa-calendar" aria-hidden="true" /> {s.application_window || 'Dates for the next intake haven’t been announced yet.'}
      </p>
    );
  }
  const nextIndex = entries.findIndex((e) => e.date && daysUntil(e.date) >= 0);
  return (
    <ol className="key-dates">
      {entries.map((e, i) => {
        const days = e.date ? daysUntil(e.date) : null;
        const state = days !== null && days < 0 ? 'is-past' : i === nextIndex ? 'is-next' : '';
        return (
          <li key={`${e.label}-${i}`} className={`key-dates__item ${state}${e.isDeadline ? ' is-deadline' : ''}`}>
            <span className="key-dates__dot" aria-hidden="true">{state === 'is-past' ? <i className="fas fa-check" /> : e.isDeadline ? <i className="fas fa-flag-checkered" /> : null}</span>
            <div>
              <strong>{e.label}</strong>
              <span className="key-dates__when">
                {e.date ? fmt(e.date) : e.text}
                {days !== null && days >= 0 && <em> · {days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`}</em>}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
};
