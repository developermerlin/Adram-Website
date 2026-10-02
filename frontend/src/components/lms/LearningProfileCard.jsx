import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { lmsAPI, parseApiErrors } from '../../services/api';
import { Alert, TextField } from '../ui/Form';
import Stars from './Stars';
import { formatDate } from '../../utils/format';
import '../../styles/shop.css';

const LINK_FIELDS = [
  ['website', 'Website'],
  ['linkedin', 'LinkedIn'],
  ['twitter', 'X (Twitter)'],
  ['youtube', 'YouTube'],
  ['github', 'GitHub'],
  ['facebook', 'Facebook'],
];

/** Tags typed one at a time (expertise, interests). */
const TagInput = ({ id, label, hint, value, onChange }) => {
  const [draft, setDraft] = useState('');
  const add = () => {
    const tag = draft.trim();
    if (tag && !value.includes(tag) && value.length < 20) onChange([...value, tag]);
    setDraft('');
  };
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} className="input" value={draft} maxLength={60} onChange={(e) => setDraft(e.target.value)} placeholder="Type and press Enter"
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }} onBlur={add} />
      {hint && <p className="hint">{hint}</p>}
      {value.length > 0 && (
        <div className="lp-tags">
          {value.map((t) => (
            <span key={t} className="tag">{t}<button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}>×</button></span>
          ))}
        </div>
      )}
    </div>
  );
};

/** The public side of the account: headline, biography, expertise or interests, links, and learning statistics. */
export const LearningProfileCard = () => {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [courses, setCourses] = useState([]);
  const [certificates, setCertificates] = useState([]);

  useEffect(() => {
    let live = true;
    lmsAPI.myProfile().then(({ data: d }) => {
      if (!live) return;
      setData(d);
      setForm(d.profile);
    }).catch(() => live && setErrors({ form: 'Your learning profile could not be loaded.' }));
    lmsAPI.mine().then(({ data: d }) => live && setCourses(d)).catch(() => {});
    lmsAPI.myCertificates().then(({ data: d }) => live && setCertificates(d)).catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  if (!form) return errors.form ? <Alert>{errors.form}</Alert> : null;
  const teacher = data.user.role === 'INSTRUCTOR';
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const input = (key) => ({ name: key, value: form[key] || '', error: errors[key], onChange: (e) => set(key)(e.target.value) });

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data: d } = await lmsAPI.saveMyProfile(form);
      setData(d);
      setForm(d.profile);
      setErrors({});
      toast.success('Profile saved');
    } catch (err) {
      setErrors(parseApiErrors(err));
    } finally {
      setSaving(false);
    }
  };
  const s = data.stats;

  return (
    <div className="grid grid-2 align-start">
      <form className="card panel form-grid lp-card" onSubmit={save} noValidate>
        <div>
          <h2 className="h3">{teacher ? 'Instructor profile' : 'Learning profile'}</h2>
          <p className="muted small">
            {teacher ? 'Shown on your public instructor page and your course pages.' : 'Your interests help us recommend courses for you.'}
            {teacher && <> <Link to={`/instructors/${data.user.id}`}>View public profile</Link></>}
          </p>
        </div>
        <TextField label="Headline" maxLength={160} placeholder={teacher ? 'e.g. Senior web developer and trainer' : 'e.g. Aspiring data analyst'} {...input('headline')} />
        <div className="field">
          <label htmlFor="lp-bio">{teacher ? 'Biography' : 'About me'}</label>
          <textarea id="lp-bio" className="input" rows={5} maxLength={5000} value={form.bio || ''} onChange={(e) => set('bio')(e.target.value)} />
        </div>
        {teacher
          ? <TagInput id="lp-expertise" label="Expertise" hint="Skills students can expect you to teach." value={form.expertise || []} onChange={set('expertise')} />
          : <TagInput id="lp-interests" label="Interests" hint="Subjects you want to learn, e.g. Python, design, networking." value={form.interests || []} onChange={set('interests')} />}
        <div className="lp-links">
          {LINK_FIELDS.map(([key, label]) => <TextField key={key} label={label} type="url" placeholder="https://…" {...input(key)} />)}
        </div>
        {teacher && <TextField label="Intro video (optional)" type="url" placeholder="A YouTube or Vimeo link introducing yourself" {...input('intro_video_url')} />}
        {teacher && (
          <div className="field">
            <label htmlFor="lp-payout">How you want to be paid <span className="optional">(private)</span></label>
            <textarea id="lp-payout" className="input" rows={2} maxLength={1000} value={form.payout_details || ''} onChange={(e) => set('payout_details')(e.target.value)} placeholder="e.g. Orange Money 076 123 456, name on the account" />
          </div>
        )}
        <Alert>{errors.form}</Alert>
        <div><button type="submit" className="btn btn--primary" disabled={saving}>{saving ? <span className="btn-spinner" /> : <i className="fas fa-floppy-disk" />} Save profile</button></div>
      </form>

      <section className="card panel lp-card">
        <h2 className="h3">Learning statistics</h2>
        <div className="lp-stats">
          <div><strong>{s.hours}</strong><small>hours learning</small></div>
          <div><strong>{s.enrolled}</strong><small>courses enrolled</small></div>
          <div><strong>{s.in_progress}</strong><small>in progress</small></div>
          <div><strong>{s.completed}</strong><small>completed</small></div>
          <div><strong>{s.quiz_average}%</strong><small>quiz average</small></div>
          <div><strong>{s.certificates}</strong><small>certificates</small></div>
        </div>
        {courses.length > 0 && (
          <>
            <h3 className="h4">My courses</h3>
            <ul className="lp-list">
              {courses.map((c) => (
                <li key={c.course.slug}>
                  <Link to={`/courses/${c.course.slug}`}>{c.course.title}</Link>
                  <small className={c.certificate_code ? 'lp-done' : 'muted'}>{c.certificate_code ? 'Completed' : `${c.progress.percent}% complete`}</small>
                </li>
              ))}
            </ul>
          </>
        )}
        {certificates.length > 0 && (
          <>
            <h3 className="h4">Certificates</h3>
            <ul className="lp-list">
              {certificates.map((c) => (
                <li key={c.code}><Link to={`/certificate/${c.code}`}><i className="fas fa-certificate" aria-hidden="true" /> {c.course_title}</Link><small className="muted">{formatDate(c.issued_at)}</small></li>
              ))}
            </ul>
          </>
        )}
        {data.reviews.length > 0 && (
          <>
            <h3 className="h4">My reviews</h3>
            <ul className="ip-reviews">
              {data.reviews.map((r) => (
                <li key={`${r.course_slug}-${r.created_at}`}>
                  <Link to={`/courses/${r.course_slug}`}><strong>{r.course}</strong></Link> <Stars value={r.rating} size={12} />
                  <div className="muted small">{formatDate(r.created_at)}</div>
                  {r.comment && <p>{r.comment}</p>}
                </li>
              ))}
            </ul>
          </>
        )}
        {!teacher && <Link to="/student/certificates" className="link-arrow">My certificates <i className="fas fa-arrow-right" /></Link>}
      </section>
    </div>
  );
};

export default LearningProfileCard;
