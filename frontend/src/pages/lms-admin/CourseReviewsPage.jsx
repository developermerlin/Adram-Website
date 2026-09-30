import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { lmsAdminAPI, parseApiErrors } from '../../services/api';
import PortalLayout from '../../components/layout/PortalLayout';
import { Alert } from '../../components/ui/Form';
import { StatusPill } from '../../components/lms/Price';
import NoteDialog from '../../components/lms/NoteDialog';
import { money, useCourseImage } from '../../components/lms/courseUtils';
import { assetUrl } from '../../utils/assets';
import { formatDateTime } from '../../utils/format';
import '../../styles/marketplace.css';
import '../../styles/lms-admin.css';

const TABS = [
  ['pending', 'Waiting for review', (c) => c.submitted + c.in_review],
  ['changes_requested', 'Changes requested', (c) => c.changes_requested],
  ['approved', 'Approved', (c) => c.approved],
  ['published', 'Published', (c) => c.published],
  ['rejected', 'Rejected', (c) => c.rejected],
  ['draft', 'Drafts', (c) => c.draft],
  ['', 'All', (c) => Object.values(c).reduce((a, b) => a + b, 0)],
];

// Which decisions make sense for a course in each state
const ACTIONS = {
  submitted: ['start', 'approve', 'request_changes', 'reject'],
  in_review: ['approve', 'request_changes', 'reject'],
  changes_requested: ['approve', 'reject'],
  rejected: ['approve'],
  approved: ['publish', 'request_changes', 'reject'],
  published: ['unpublish'],
  draft: ['publish'],
};
const LABELS = {
  start: ['Start review', 'btn--outline', 'fa-magnifying-glass'],
  approve: ['Approve', 'btn--primary', 'fa-check'],
  request_changes: ['Request changes', 'btn--outline', 'fa-pen-to-square'],
  reject: ['Reject', 'btn--danger-outline', 'fa-xmark'],
  publish: ['Publish', 'btn--primary', 'fa-rocket'],
  unpublish: ['Unpublish', 'btn--outline', 'fa-eye-slash'],
};
const NOTES = {
  request_changes: ['Request changes', 'Tell the instructor exactly what to change. They’ll see this note and get a notification.', true],
  reject: ['Reject this course', 'Explain why the course can’t be approved. The instructor will see this note.', true],
  approve: ['Approve this course', 'Optionally add a note for the instructor. They can then publish it.', false],
};

/** The course approval queue: draft → submitted → under review → approved → published. */
export const CourseReviewsPage = () => {
  const imageOf = useCourseImage();
  const [status, setStatus] = useState('pending');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState(null); // { course, action }

  const load = useCallback(() => lmsAdminAPI.courses(status).then(({ data: d }) => {
    setData(d);
    setError('');
  }).catch(() => setError('The courses could not be loaded.')), [status]);
  useEffect(() => {
    load();
  }, [load]);

  const decide = async (course, action, note = '') => {
    try {
      await lmsAdminAPI.reviewCourse(course.slug, action, note);
      toast.success({ start: 'Review started', approve: 'Course approved', request_changes: 'Changes requested', reject: 'Course rejected', publish: 'Course published', unpublish: 'Course unpublished' }[action]);
      setDialog(null);
      load();
    } catch (err) {
      const e = parseApiErrors(err);
      throw new Error(e.note || e.form || 'That did not work.', { cause: err });
    }
  };
  const act = (course, action) => (NOTES[action] ? setDialog({ course, action }) : decide(course, action).catch((e) => toast.error(e.message)));

  return (
    <PortalLayout title="Course reviews" subtitle="Approve instructors’ courses before they go live.">
      <div className="la-page">
        <div className="lms-tabs la-tabs" role="tablist">
          {TABS.map(([id, label, count]) => (
            <button key={id || 'all'} type="button" role="tab" aria-selected={status === id} className={status === id ? 'is-active' : ''} onClick={() => setStatus(id)}>
              {label}{data && count(data.counts) > 0 && <span className="lms-tabs__count">{count(data.counts)}</span>}
            </button>
          ))}
        </div>
        <Alert>{error}</Alert>
        {!data && !error && <div className="skeleton skeleton--block" />}
        {data && data.courses.length === 0 && (
          <div className="card la-empty"><i className="fas fa-clipboard-check" /><strong>Nothing here</strong><p>{status === 'pending' ? 'No courses are waiting for review.' : 'No courses with this status.'}</p></div>
        )}
        <ul className="la-queue">
          {data?.courses.map((c) => {
            const image = imageOf(c);
            return (
              <li key={c.slug} className="card la-queue__item">
                <span className="la-thumb">{image ? <img src={assetUrl(image)} alt="" /> : <i className="fas fa-laptop-code" aria-hidden="true" />}</span>
                <div>
                  <h3 className="la-queue__title"><a href={`/courses/${c.slug}`} target="_blank" rel="noreferrer">{c.title}</a> <StatusPill status={c.status} label={c.status_display} /></h3>
                  {c.subtitle && <p className="muted small">{c.subtitle}</p>}
                  <p className="la-meta">
                    <span><i className="fas fa-chalkboard-user" />{c.instructor ? `${c.instructor.name} (${c.instructor.email})` : 'ADRAM (no instructor account)'}</span>
                    {c.category && <span><i className="fas fa-folder" />{c.category}</span>}
                    <span><i className="fas fa-tag" />{c.price ? money(c.price) : 'Free'}</span>
                    <span><i className="fas fa-list" />{c.stats.lesson_count} lessons</span>
                    <span><i className="fas fa-user-graduate" />{c.stats.student_count} students</span>
                    {c.submitted_at && <span><i className="far fa-clock" />Submitted {formatDateTime(c.submitted_at)}</span>}
                  </p>
                  {c.review_note && <p className={`la-note${['changes_requested', 'rejected'].includes(c.status) ? ' la-note--warn' : ''}`}><strong>Review note:</strong> {c.review_note}</p>}
                </div>
                <div className="la-queue__side">
                  <div className="la-actions">
                    {(ACTIONS[c.status] || []).map((action) => {
                      const [label, cls, icon] = LABELS[action];
                      return <button key={action} type="button" className={`btn ${cls} btn--sm`} onClick={() => act(c, action)}><i className={`fas ${icon}`} /> {label}</button>;
                    })}
                  </div>
                  <div className="la-actions">
                    <a href={`/courses/${c.slug}`} target="_blank" rel="noreferrer" className="btn btn--text btn--sm">Preview</a>
                    <Link to={`/admin/courses/${c.slug}/content`} className="btn btn--text btn--sm">Curriculum</Link>
                    <Link to={`/admin/courses/${c.id}`} className="btn btn--text btn--sm">Details</Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      {dialog && (
        <NoteDialog
          title={NOTES[dialog.action][0]}
          text={`${dialog.course.title}. ${NOTES[dialog.action][1]}`}
          required={NOTES[dialog.action][2]}
          label="Note for the instructor"
          confirm={LABELS[dialog.action][0]}
          tone={dialog.action === 'reject' ? 'danger' : 'primary'}
          onConfirm={(note) => decide(dialog.course, dialog.action, note)}
          onClose={() => setDialog(null)}
        />
      )}
    </PortalLayout>
  );
};

export default CourseReviewsPage;
