import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { lmsAPI } from '../../services/api';
import { formatDateTime } from '../../utils/format';
import '../../styles/assignments.css';

/** Assignments due soon or overdue on the student's courses (hidden when there are none). */
export const DeadlinesCard = () => {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    lmsAPI.deadlines().then(({ data }) => setRows(data)).catch(() => setRows([]));
  }, []);
  if (!rows?.length) return null;
  return (
    <section className="card panel">
      <div className="panel__head"><h2 className="h3">Deadlines</h2></div>
      <ul className="dl-list">
        {rows.map((r) => (
          <li key={`${r.course.slug}-${r.lesson.id}`} className={r.closed ? 'is-closed' : r.overdue ? 'is-late' : ''}>
            <i className={`fas ${r.overdue ? 'fa-hourglass-end' : 'fa-calendar-day'}`} aria-hidden="true" />
            <span>
              <Link to={`/learn/${r.course.slug}/lesson/${r.lesson.id}`}><strong>{r.lesson.title}</strong></Link>
              <small className="muted">{r.course.title}{r.redo ? ' · hand in again' : ''}</small>
              <small className="dl-list__due">{r.closed ? 'Closed' : r.overdue ? 'Overdue since' : 'Due'} {formatDateTime(r.due_at)}</small>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default DeadlinesCard;
