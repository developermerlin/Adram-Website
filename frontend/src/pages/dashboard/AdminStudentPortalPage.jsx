import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { catalogAPI, parseApiErrors, staffPortalAPI } from '../../services/api';
import { formatDateTime, timeAgo } from '../../utils/format';
import { STAGES } from '../../utils/applicationStages';
import PortalLayout from '../../components/layout/PortalLayout';
import Avatar from '../../components/ui/Avatar';
import { Alert } from '../../components/ui/Form';
import { Spinner } from '../../components/ui/Section';
import ConfirmDialog from '../../components/admin/ConfirmDialog';
import ApplicationCard from '../../components/portal/ApplicationCard';
import { ScholarshipRow, StudyGoalsForm } from '../../components/portal/PortalPieces';

// Icons for the activity timeline (portal events and account events).
const TIMELINE_ICONS = {
  viewed: 'fa-eye',
  opened_link: 'fa-arrow-up-right-from-square',
  saved: 'fa-bookmark',
  unsaved: 'fa-bookmark',
  application_started: 'fa-list-check',
  stage_changed: 'fa-arrow-right-arrow-left',
  document_done: 'fa-file-circle-check',
  goals_updated: 'fa-bullseye',
  service_requested: 'fa-handshake-angle',
  service_decision: 'fa-gavel',
  terms_accepted: 'fa-file-signature',
  document_uploaded: 'fa-file-arrow-up',
  payment_submitted: 'fa-receipt',
  document_reviewed: 'fa-file-circle-check',
  milestone_updated: 'fa-route',
  login: 'fa-right-to-bracket',
  registration: 'fa-user-plus',
  account_approved: 'fa-user-check',
  failed_login: 'fa-triangle-exclamation',
};

const DECISION_DONE = {
  approve: 'Guidelines shared with the student',
  decline: 'Request declined',
  confirm_payment: 'Payment confirmed',
  reject_payment: 'Student asked to upload the receipt again',
};

const ENROLLMENT_STATUSES = [
  { id: 'requested', label: 'Requested' },
  { id: 'active', label: 'Enrolled' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
];

// One enrollment: status, start date and a note for the student (saved together).
const EnrollmentRow = ({ enrollment: e, onSave }) => {
  const [form, setForm] = useState({ status: e.status, start_date: e.start_date || '', note: e.note || '' });
  const changed = form.status !== e.status || form.start_date !== (e.start_date || '') || form.note !== (e.note || '');
  return (
    <li className={`enroll-row enroll-row--${e.status}`}>
      <div className="enroll-row__head">
        <strong>{e.course.title}</strong>
        <small className="muted">Requested {timeAgo(e.created_at)}</small>
      </div>
      <div className="enroll-row__fields">
        <select className="input input--sm" aria-label={`Status of ${e.course.title}`} value={form.status} onChange={(ev) => setForm((f) => ({ ...f, status: ev.target.value }))}>
          {ENROLLMENT_STATUSES.map((st) => <option key={st.id} value={st.id}>{st.label}</option>)}
        </select>
        <input type="date" className="input input--sm" aria-label="Start date" value={form.start_date} onChange={(ev) => setForm((f) => ({ ...f, start_date: ev.target.value }))} />
      </div>
      <input className="input input--sm" maxLength={500} placeholder="Note for the student, e.g. class times" aria-label="Note for the student" value={form.note} onChange={(ev) => setForm((f) => ({ ...f, note: ev.target.value }))} />
      {changed && (
        <button type="button" className="btn btn--primary btn--sm" onClick={() => onSave(e.id, { ...form, start_date: form.start_date || null })}>
          {form.status === 'active' && e.status !== 'active' ? 'Confirm enrollment & email student' : 'Save'}
        </button>
      )}
    </li>
  );
};

const BLANK_APP = { scholarship_slug: '', scholarship_name: '', stage: 'interested', deadline: '', next_step: '' };

const AddApplicationForm = ({ scholarships, taken, onAdd }) => {
  const [form, setForm] = useState(BLANK_APP);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const other = form.scholarship_slug === '__other';

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const payload = { ...form, scholarship_slug: other ? '' : form.scholarship_slug, deadline: form.deadline || null };
    if (!other) delete payload.scholarship_name;
    const errs = await onAdd(payload);
    setBusy(false);
    if (errs) setErrors(errs);
    else {
      setForm(BLANK_APP);
      setErrors({});
    }
  };

  return (
    <form className="add-app" onSubmit={submit}>
      <div className="form-row">
        <div className="field">
          <label htmlFor="new-sch">Scholarship</label>
          <select id="new-sch" className="input" required value={form.scholarship_slug} aria-invalid={Boolean(errors.scholarship_slug)} onChange={(e) => setForm((f) => ({ ...f, scholarship_slug: e.target.value }))}>
            <option value="" disabled>Choose a scholarship</option>
            {scholarships.map((s) => (
              <option key={s.slug} value={s.slug} disabled={taken.includes(s.slug)}>{s.name}{taken.includes(s.slug) ? ' (already tracked)' : ''}</option>
            ))}
            <option value="__other">Other (not listed on the website)…</option>
          </select>
          {errors.scholarship_slug && <p className="field-error">{errors.scholarship_slug}</p>}
        </div>
        {other && (
          <div className="field">
            <label htmlFor="new-name">Scholarship name</label>
            <input id="new-name" className="input" required maxLength={200} value={form.scholarship_name} onChange={(e) => setForm((f) => ({ ...f, scholarship_name: e.target.value }))} />
          </div>
        )}
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="new-stage">Stage</label>
          <select id="new-stage" className="input" value={form.stage} onChange={(e) => setForm((f) => ({ ...f, stage: e.target.value }))}>
            {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="new-deadline">Deadline <span className="optional">(optional)</span></label>
          <input id="new-deadline" type="date" className="input" value={form.deadline} onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="new-next">Next step for the student <span className="optional">(optional)</span></label>
        <input id="new-next" className="input" maxLength={300} value={form.next_step} placeholder="e.g. Send us your transcripts" onChange={(e) => setForm((f) => ({ ...f, next_step: e.target.value }))} />
      </div>
      <button type="submit" className="btn btn--primary btn--sm" disabled={busy || !form.scholarship_slug}>
        <i className="fas fa-plus" /> Add application
      </button>
    </form>
  );
};

export const AdminStudentPortalPage = () => {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [scholarships, setScholarships] = useState([]);
  const [courses, setCourses] = useState([]);
  const [newCourse, setNewCourse] = useState('');
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState('');
  const [removing, setRemoving] = useState(null);

  const load = useCallback(
    () =>
      staffPortalAPI
        .student(id)
        .then(({ data: d }) => setData(d))
        .catch((err) => setError(err.response?.status === 404 ? 'This user doesn’t exist.' : 'Could not load this portal.')),
    [id],
  );

  useEffect(() => {
    load();
    catalogAPI.manage('scholarships').list().then(({ data: list }) => setScholarships(list)).catch(() => {});
    catalogAPI.courses().then(({ data: list }) => setCourses(list)).catch(() => {});
  }, [load]);

  // "View" in the Applications table links here with ?application=<id>: open that card and bring it into view, once.
  const [params] = useSearchParams();
  const focusId = Number(params.get('application')) || null;
  const focused = useRef(null);
  useEffect(() => {
    if (!data || !focusId || focused.current === focusId) return;
    const card = document.getElementById(`application-${focusId}`);
    if (!card) return;
    focused.current = focusId;
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    card.classList.add('is-focused');
    setTimeout(() => card.classList.remove('is-focused'), 2600);
  }, [data, focusId]);

  // Every change reloads the portal so the timeline and counts stay in step.
  const act = async (request, success) => {
    try {
      await request();
      if (success) toast.success(success);
      await load();
      return null;
    } catch (err) {
      const parsed = parseApiErrors(err);
      toast.error(parsed.form || Object.values(parsed)[0]);
      return parsed;
    }
  };

  const actions = {
    update: (appId, patch) => act(() => staffPortalAPI.updateApplication(appId, patch), 'Application updated'),
    addDocument: (appId, name) => act(() => staffPortalAPI.addDocument(appId, name)),
    updateDocument: (docId, patch) => act(() => staffPortalAPI.updateDocument(docId, patch)),
    removeDocument: (docId) => act(() => staffPortalAPI.removeDocument(docId)),
    remove: (application) => setRemoving(application),
    reviewDocument: async (docId, payload) =>
      !(await act(() => staffPortalAPI.reviewDocument(docId, payload),
        { accepted: 'Document accepted', returned: 'Document returned: the student has been emailed', pending: 'Review cleared' }[payload.status])),
    resultFiles: {
      // Throws on failure so the uploader can show why (e.g. file too large).
      upload: async (appId, file, title) => {
        await staffPortalAPI.uploadResultFile(appId, file, title);
        toast.success('Uploaded: the student has been emailed');
        await load();
      },
      remove: (id) => act(() => staffPortalAPI.removeResultFile(id), 'Document removed'),
    },
    milestones: {
      add: (appId, data) => act(() => staffPortalAPI.addMilestone(appId, data), 'Step added'),
      update: (id, data) => act(() => staffPortalAPI.updateMilestone(id, data), 'Timeline updated'),
      remove: (id) => act(() => staffPortalAPI.removeMilestone(id), 'Step removed'),
      reorder: (appId, ids) => act(() => staffPortalAPI.reorderMilestones(appId, ids)),
    },
    // Returns true when it worked, so the panel can reset its form.
    decideService: async (appId, payload) => !(await act(() => staffPortalAPI.decide(appId, payload), DECISION_DONE[payload.action])),
  };

  if (error) {
    return (
      <PortalLayout title="Student portal">
        <Alert>{error}</Alert>
        <Link to="/admin/users" className="btn btn--outline btn--sm"><i className="fas fa-arrow-left" /> Users</Link>
      </PortalLayout>
    );
  }
  if (!data) return <PortalLayout title="Student portal"><Spinner label="Loading portal…" /></PortalLayout>;

  const { student, stats } = data;
  const kpis = [
    { label: 'Applications', value: data.applications.length, icon: 'fa-list-check' },
    { label: 'Saved', value: data.saved.length, icon: 'fa-bookmark' },
    { label: 'Scholarships viewed', value: stats.viewed, icon: 'fa-eye' },
    { label: 'Official sites opened', value: stats.opened_links, icon: 'fa-arrow-up-right-from-square' },
    { label: 'Sign-ins', value: stats.sign_ins, icon: 'fa-right-to-bracket' },
  ];

  return (
    <PortalLayout
      title={student.full_name}
      subtitle={<Link to="/admin/users" className="back-link"><i className="fas fa-arrow-left" /> Users</Link>}
      actions={<a href={`mailto:${student.email}`} className="btn btn--outline btn--sm"><i className="fas fa-envelope" /> Email student</a>}
    >
      <section className="card panel student-head">
        <Avatar person={student} size={64} />
        <div className="student-head__info">
          <strong>{student.full_name}</strong>
          <span>{student.email}{student.phone_number ? ` · ${student.phone_number}` : ''}{student.country ? ` · ${student.country}` : ''}</span>
          <small>{student.role_display} · joined {formatDateTime(student.created_at)} · last active {stats.last_active ? timeAgo(stats.last_active) : 'never'}</small>
        </div>
        <dl className="student-head__kpis">
          {kpis.map((k) => (
            <div key={k.label}>
              <dt><i className={`fas ${k.icon}`} aria-hidden="true" /> {k.label}</dt>
              <dd>{k.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="dash-grid">
        <div className="stack-lg">
          <section className="card panel">
            <div className="panel__head">
              <div>
                <h2 className="h3">Applications</h2>
                <p className="muted small">The student sees stages, deadlines, documents, the next step and your note.</p>
              </div>
              <button type="button" className="btn btn--primary btn--sm" onClick={() => setAdding((v) => !v)} aria-expanded={adding}>
                <i className={`fas ${adding ? 'fa-xmark' : 'fa-plus'}`} /> {adding ? 'Cancel' : 'Add application'}
              </button>
            </div>
            {adding && (
              <AddApplicationForm
                scholarships={scholarships}
                taken={data.applications.map((a) => a.scholarship_slug).filter(Boolean)}
                onAdd={async (payload) => {
                  const errs = await act(() => staffPortalAPI.addApplication(student.id, payload), 'Application added');
                  if (!errs) setAdding(false);
                  return errs;
                }}
              />
            )}
            {data.applications.length === 0 && !adding && <p className="muted">No applications yet. Add one to start tracking this student’s progress.</p>}
            <div className="app-list">
              {data.applications.map((a) => <ApplicationCard key={a.id} application={a} actions={actions} staff defaultOpen={a.id === focusId} />)}
            </div>
          </section>

          <section className="card panel">
            <div className="panel__head">
              <h2 className="h3">Saved scholarships</h2>
              <span className="panel__meta">{data.saved.length}</span>
            </div>
            {data.saved.length === 0 && <p className="muted">Nothing saved yet.</p>}
            <ul className="sch-rows">
              {data.saved.map((s) => <ScholarshipRow key={s.slug} scholarship={s} note={`Saved ${timeAgo(s.saved_at)}`} />)}
            </ul>
          </section>

          <section className="card panel">
            <div className="panel__head">
              <div>
                <h2 className="h3">Recommended to this student</h2>
                <p className="muted small">What their portal suggests, from their study goals.</p>
              </div>
            </div>
            <ul className="sch-rows">
              {data.recommended.map((s) => <ScholarshipRow key={s.slug} scholarship={s} />)}
            </ul>
          </section>
        </div>

        <aside className="stack-lg">
          <section className="card panel">
            <div className="panel__head">
              <div>
                <h2 className="h3">Private notes</h2>
                <p className="muted small"><i className="fas fa-lock" /> Staff only. The student never sees these.</p>
              </div>
            </div>
            <form
              className="note-form"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!note.trim()) return;
                if (!(await act(() => staffPortalAPI.addNote(student.id, note.trim()), 'Note added'))) setNote('');
              }}
            >
              <textarea className="input" rows={3} value={note} placeholder="e.g. Called on Monday; will send transcripts by Friday." aria-label="New note" onChange={(e) => setNote(e.target.value)} />
              <button type="submit" className="btn btn--outline btn--sm" disabled={!note.trim()}><i className="fas fa-plus" /> Add note</button>
            </form>
            <ul className="notes">
              {data.notes.map((n) => (
                <li key={n.id}>
                  <p>{n.body}</p>
                  <span>
                    {n.author_name} · {timeAgo(n.created_at)}
                    <button type="button" className="link-button" onClick={() => act(() => staffPortalAPI.removeNote(n.id), 'Note deleted')}>Delete</button>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card panel">
            <div className="panel__head">
              <div>
                <h2 className="h3">Training</h2>
                <p className="muted small">Programmes appear in the student’s portal only once they’re enrolled.</p>
              </div>
            </div>
            {data.all_training.length === 0 && <p className="muted small">Not enrolled in any programme.</p>}
            <ul className="enroll-list">
              {data.all_training.map((e) => (
                <EnrollmentRow
                  key={`${e.id}-${e.updated_at}`}
                  enrollment={e}
                  onSave={(id, patch) => act(() => staffPortalAPI.updateEnrollment(id, patch), 'Enrollment updated')}
                />
              ))}
            </ul>
            <div className="doc-list__add">
              <select className="input input--sm" aria-label="Programme to enroll in" value={newCourse} onChange={(e) => setNewCourse(e.target.value)}>
                <option value="">Enroll in a programme…</option>
                {courses.filter((c) => !data.all_training.some((e) => e.course.slug === c.slug)).map((c) => <option key={c.slug} value={c.slug}>{c.title}</option>)}
              </select>
              <button
                type="button"
                className="btn btn--outline btn--sm"
                disabled={!newCourse}
                onClick={async () => {
                  if (!(await act(() => staffPortalAPI.enrollStudent(student.id, newCourse), 'Student enrolled'))) setNewCourse('');
                }}
              >
                <i className="fas fa-plus" /> Enroll
              </button>
            </div>
          </section>

          <section className="card panel">
            <div className="panel__head"><h2 className="h3">Study goals</h2></div>
            <StudyGoalsForm key={JSON.stringify(data.goals)} goals={data.goals} readOnly />
          </section>

          <section className="card panel">
            <div className="panel__head">
              <div>
                <h2 className="h3">Activity</h2>
                <p className="muted small">What the student did on the website and in their portal.</p>
              </div>
            </div>
            {data.timeline.length === 0 && <p className="muted">No activity yet.</p>}
            <ol className="timeline-feed">
              {data.timeline.map((e) => (
                <li key={e.id} className={`timeline-feed__item timeline-feed__item--${e.source}`}>
                  <span className="timeline-feed__icon"><i className={`fas ${TIMELINE_ICONS[e.kind] || 'fa-circle-dot'}`} /></span>
                  <div>
                    <p>
                      <strong>{e.kind_display}</strong>
                      {e.label && (e.scholarship_slug ? <> · <Link to={`/scholarships/${e.scholarship_slug}`}>{e.label}</Link></> : <> · {e.label}</>)}
                    </p>
                    {e.detail && <small>{e.detail}</small>}
                    <time dateTime={e.created_at} title={formatDateTime(e.created_at)}>{timeAgo(e.created_at)}</time>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>

      {removing && (
        <ConfirmDialog
          config={{ title: 'Remove this application?', text: `“${removing.scholarship_name}” and its documents checklist will be deleted for the student too.`, confirm: 'Remove' }}
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            await act(() => staffPortalAPI.removeApplication(removing.id), 'Application removed');
            setRemoving(null);
          }}
        />
      )}
    </PortalLayout>
  );
};

export default AdminStudentPortalPage;
