import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { instructorAPI, lmsAPI, parseApiErrors } from '../../services/api';
import PortalLayout from '../../components/layout/PortalLayout';
import { Alert, TextField } from '../../components/ui/Form';
import { Spinner } from '../../components/ui/Section';
import ConfirmDialog from '../../components/admin/ConfirmDialog';
import { ListEditor } from '../../components/admin/catalog';
import { ImageField } from '../../components/admin/contentFields';
import FaqEditor from '../../components/lms/FaqEditor';
import { StatusPill } from '../../components/lms/Price';
import { LEVEL_OPTIONS, money } from '../../components/lms/courseUtils';
import { formatDateTime } from '../../utils/format';
import '../../styles/marketplace.css';
import '../../styles/instructor.css';

const STEPS = [
  ['info', 'Course information', 'fa-circle-info'],
  ['landing', 'Landing page', 'fa-window-maximize'],
  ['pricing', 'Pricing', 'fa-tag'],
  ['curriculum', 'Curriculum', 'fa-layer-group'],
  ['publish', 'Review & publish', 'fa-rocket'],
];
const FIELDS = ['title', 'subtitle', 'summary', 'topics', 'category', 'subcategory', 'level', 'language', 'description', 'learn_points',
  'requirements', 'audience', 'thumbnail', 'promo_video_url', 'faqs', 'price', 'discount_price'];

const BANNERS = {
  draft: ['fa-pen-ruler', 'Draft', 'Only you can see this course. When it’s ready, submit it for review.'],
  submitted: ['fa-paper-plane', 'Submitted for review', 'ADRAM will review your course soon. You can keep improving it meanwhile.'],
  in_review: ['fa-magnifying-glass', 'Under review', 'An ADRAM reviewer is looking at your course now.'],
  changes_requested: ['fa-pen-to-square', 'Changes requested', 'Make the changes below, then submit the course again.'],
  rejected: ['fa-circle-xmark', 'Not approved', 'Read the reviewer’s note. You can improve the course and submit it again.'],
  approved: ['fa-circle-check', 'Approved', 'Your course is approved. Publish it whenever you’re ready.'],
  published: ['fa-globe', 'Published', 'Your course is live on the website.'],
};

const pick = (course) => ({
  ...Object.fromEntries(FIELDS.map((f) => [f, course[f] ?? ''])),
  topics: course.topics || [],
  learn_points: course.learn_points?.length ? course.learn_points : [''],
  requirements: course.requirements?.length ? course.requirements : [''],
  audience: course.audience?.length ? course.audience : [''],
  faqs: course.faqs || [],
  category: course.category ?? '',
  subcategory: course.subcategory ?? '',
  price: course.price ?? '',
  discount_price: course.discount_price ?? '',
});

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// What is sent: only changed fields, with empty values as null where the server wants numbers or ids
const payload = (form, saved) => {
  const out = {};
  FIELDS.forEach((f) => {
    if (same(form[f], saved[f])) return;
    let v = form[f];
    if (['learn_points', 'requirements', 'audience', 'topics'].includes(f)) v = v.filter((x) => x.trim());
    if (f === 'faqs') v = v.filter((x) => x.question.trim() || x.answer.trim());
    if (['category', 'subcategory', 'price', 'discount_price'].includes(f) && v === '') v = null;
    out[f] = v;
  });
  if ('category' in out && !('subcategory' in out)) out.subcategory = form.subcategory === '' ? null : form.subcategory;
  return out;
};

/** The instructor's course workflow: information, landing page, pricing, curriculum, then review and publishing. */
export const InstructorCourseEditorPage = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(null);
  const [categories, setCategories] = useState([]);
  const [step, setStep] = useState('info');
  const [errors, setErrors] = useState({});
  const [problems, setProblems] = useState([]);
  const [busy, setBusy] = useState('');
  const [missing, setMissing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let live = true;
    instructorAPI.course(slug).then(({ data }) => {
      if (!live) return;
      setCourse(data);
      setForm(pick(data));
      setSaved(pick(data));
    }).catch(() => live && setMissing(true));
    lmsAPI.categories().then(({ data }) => live && setCategories(data)).catch(() => {});
    return () => {
      live = false;
    };
  }, [slug]);

  if (missing) {
    return (
      <PortalLayout title="Course not found">
        <Alert>This course doesn’t exist, or you don’t teach it.</Alert>
        <Link to="/instructor/courses" className="btn btn--outline btn--sm"><i className="fas fa-arrow-left" /> My courses</Link>
      </PortalLayout>
    );
  }
  if (!form) return <PortalLayout title="Course"><Spinner label="Loading course…" /></PortalLayout>;

  const changes = payload(form, saved);
  const dirty = Object.keys(changes).length > 0;
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const input = (key) => ({ name: key, value: form[key] ?? '', error: errors[key], onChange: (e) => set(key)(e.target.value) });
  const subs = categories.find((c) => String(c.id) === String(form.category))?.children || [];

  const save = async () => {
    if (!dirty) return true;
    setBusy('save');
    try {
      const { data } = await instructorAPI.saveCourse(slug, changes);
      setCourse(data);
      setSaved(pick(data));
      setForm(pick(data));
      setErrors({});
      toast.success('Changes saved');
      if (data.slug !== slug) navigate(`/instructor/courses/${data.slug}`, { replace: true });
      return true;
    } catch (err) {
      setErrors(parseApiErrors(err));
      toast.error('Some fields need attention.');
      return false;
    } finally {
      setBusy('');
    }
  };
  const go = (next) => {
    if (dirty && !window.confirm('You have unsaved changes on this step. Leave without saving?')) return;
    if (dirty) setForm(saved);
    setStep(next);
  };
  const submit = async () => {
    if (!(await save())) return;
    setBusy('submit');
    try {
      const { data } = await instructorAPI.submit(slug);
      setCourse(data);
      setProblems([]);
      toast.success('Submitted for review. We’ll let you know the outcome.');
    } catch (err) {
      setProblems(err.response?.data?.problems || []);
      toast.error(parseApiErrors(err).form || 'The course could not be submitted.');
    } finally {
      setBusy('');
    }
  };
  const publish = async (value) => {
    setBusy('publish');
    try {
      const { data } = await instructorAPI.publish(slug, value);
      setCourse(data);
      toast.success(value ? 'Your course is live!' : 'Your course is no longer live.');
    } catch (err) {
      toast.error(parseApiErrors(err).form || 'That did not work.');
    } finally {
      setBusy('');
    }
  };
  const remove = async () => {
    try {
      await instructorAPI.deleteCourse(slug);
      toast.success('Course deleted');
      navigate('/instructor/courses');
    } catch (err) {
      toast.error(parseApiErrors(err).form || 'The course could not be deleted.');
      setDeleting(false);
    }
  };

  const [icon, heading, lead] = BANNERS[course.status] || BANNERS.draft;
  const canSubmit = ['draft', 'changes_requested', 'rejected'].includes(course.status);
  const saveBar = (
    <div className="ie-save">
      <span className="muted small">{dirty ? 'You have unsaved changes.' : `Saved ${formatDateTime(course.updated_at)}`}</span>
      <button type="button" className="btn btn--primary" onClick={save} disabled={!dirty || busy === 'save'}>
        {busy === 'save' ? <span className="btn-spinner" /> : <i className="fas fa-floppy-disk" />} Save changes
      </button>
    </div>
  );

  return (
    <PortalLayout
      title={course.title}
      subtitle={<Link to="/instructor/courses" className="back-link"><i className="fas fa-arrow-left" /> My courses</Link>}
      actions={<><StatusPill status={course.status} /><a href={`/courses/${course.slug}`} target="_blank" rel="noreferrer" className="btn btn--outline btn--sm"><i className="fas fa-eye" /> Preview</a></>}
    >
      <div className={`ie-banner ie-banner--${course.status}`}>
        <i className={`fas ${icon}`} aria-hidden="true" />
        <div>
          <strong>{heading}</strong>
          <p>{lead}</p>
          {course.review_note && ['changes_requested', 'rejected', 'approved'].includes(course.status) && <p className="ie-banner__note"><strong>Reviewer’s note:</strong> {course.review_note}</p>}
        </div>
      </div>

      <div className="ie">
        <nav className="ie-steps" aria-label="Course setup">
          {STEPS.map(([id, label, stepIcon], i) => (
            <button key={id} type="button" className={step === id ? 'is-active' : ''} aria-current={step === id ? 'step' : undefined} onClick={() => go(id)}>
              <span className="ie-steps__num">{i + 1}</span><i className={`fas ${stepIcon}`} aria-hidden="true" /> {label}
            </button>
          ))}
        </nav>

        <div className="ie-main">
          <Alert>{errors.form}</Alert>
          {step === 'info' && (
            <section className="card panel form-grid">
              <h2 className="h3">Course information</h2>
              <TextField label="Title" required maxLength={200} {...input('title')} />
              <TextField label="Subtitle" maxLength={250} hint="One line under the title that sells the course, e.g. “Build real websites with HTML, CSS and JavaScript”." {...input('subtitle')} />
              <div className="field">
                <label htmlFor="ie-summary">Short summary</label>
                <textarea id="ie-summary" className="input" rows={3} maxLength={500} value={form.summary} onChange={(e) => set('summary')(e.target.value)} />
                {errors.summary ? <p className="field-error">{errors.summary}</p> : <p className="hint">Shown on course cards. One or two sentences.</p>}
              </div>
              <div className="form-row">
                <div className="field">
                  <label htmlFor="ie-cat">Category</label>
                  <select id="ie-cat" className="input" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value, subcategory: '' }))}>
                    <option value="">Choose…</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  {errors.category && <p className="field-error">{errors.category}</p>}
                </div>
                <div className="field">
                  <label htmlFor="ie-sub">Subcategory</label>
                  <select id="ie-sub" className="input" value={form.subcategory} onChange={(e) => set('subcategory')(e.target.value)} disabled={!subs.length}>
                    <option value="">{subs.length ? 'Choose…' : 'None'}</option>
                    {subs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  {errors.subcategory && <p className="field-error">{errors.subcategory}</p>}
                </div>
              </div>
              <div className="form-row">
                <div className="field">
                  <label htmlFor="ie-level">Level</label>
                  <select id="ie-level" className="input" value={form.level || 'all'} onChange={(e) => set('level')(e.target.value)}>
                    {LEVEL_OPTIONS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </select>
                </div>
                <TextField label="Language" maxLength={40} {...input('language')} />
              </div>
              <ListEditor id="topics" label="Skills and topics" hint="Up to 8 short tags students search for, e.g. “Python” or “Excel”." items={form.topics.length ? form.topics : ['']} onChange={set('topics')} placeholder="e.g. JavaScript" max={8} maxLength={60} error={errors.topics} />
              {saveBar}
            </section>
          )}

          {step === 'landing' && (
            <section className="card panel form-grid">
              <h2 className="h3">Course landing page</h2>
              <p className="muted small">This is what students read before they enrol. Be specific about what they’ll be able to do.</p>
              <div className="field">
                <label htmlFor="ie-desc">Description</label>
                <textarea id="ie-desc" className="input" rows={8} value={form.description} onChange={(e) => set('description')(e.target.value)} placeholder="What the course covers, how it’s taught and what students will build. Leave a blank line between paragraphs." />
                {errors.description && <p className="field-error">{errors.description}</p>}
              </div>
              <ListEditor id="learn_points" label="Learning objectives" hint="What students will be able to do, each starting with a verb." items={form.learn_points} onChange={set('learn_points')} placeholder="e.g. Build a responsive website" max={12} maxLength={200} error={errors.learn_points} />
              <ListEditor id="requirements" label="Requirements" hint="What students need before starting." items={form.requirements} onChange={set('requirements')} placeholder="e.g. A laptop with internet access" max={10} maxLength={200} error={errors.requirements} />
              <ListEditor id="audience" label="Who this course is for" items={form.audience} onChange={set('audience')} placeholder="e.g. Beginners who want a career in web development" max={8} maxLength={200} error={errors.audience} />
              <ImageField field={{ label: 'Course image', hint: 'A wide picture, 1280 × 720, looks best on course cards.' }} value={form.thumbnail || ''} onChange={set('thumbnail')} id="thumbnail" />
              {errors.thumbnail && <p className="field-error">{errors.thumbnail}</p>}
              <TextField label="Promotional video" type="url" placeholder="https://www.youtube.com/watch?v=…" hint="A short YouTube or Vimeo trailer shown on the course page." {...input('promo_video_url')} />
              <div className="field">
                <span className="field__label">Frequently asked questions</span>
                <FaqEditor items={form.faqs} onChange={set('faqs')} error={errors.faqs} />
              </div>
              {saveBar}
            </section>
          )}

          {step === 'pricing' && (
            <section className="card panel form-grid">
              <h2 className="h3">Pricing</h2>
              <div className="form-row">
                <TextField label="Price (NLe)" inputMode="decimal" placeholder="Leave empty for a free course" {...input('price')} />
                <TextField label="Sale price (NLe, optional)" inputMode="decimal" placeholder="e.g. a launch discount" hint="Must be lower than the price. Shown with the full price struck through." {...input('discount_price')} />
              </div>
              <p className="ie-price-preview">
                Students pay <strong>{Number(form.discount_price) > 0 && Number(form.discount_price) < Number(form.price) ? money(form.discount_price) : Number(form.price) > 0 ? money(form.price) : 'nothing (free course)'}</strong>.
                {' '}ADRAM keeps a platform commission on each sale; you receive the rest. See <Link to="/instructor/earnings">Earnings</Link>.
              </p>
              {saveBar}
            </section>
          )}

          {step === 'curriculum' && (
            <section className="card panel ie-curriculum">
              <h2 className="h3">Curriculum</h2>
              <p className="muted">Organise the course into sections, then add lessons: videos, readings, documents (PDF, slides), quizzes and assignments, with downloadable resources. Drag and drop to reorder.</p>
              <div className="ie-links">
                <Link to={`/instructor/courses/${course.slug}/curriculum`} className="btn btn--primary"><i className="fas fa-layer-group" /> Open the curriculum builder</Link>
                <Link to={`/instructor/courses/${course.slug}/students`} className="btn btn--outline">Students</Link>
                <Link to={`/instructor/courses/${course.slug}/qa`} className="btn btn--outline">Q&amp;A</Link>
                <Link to={`/instructor/courses/${course.slug}/announcements`} className="btn btn--outline">Announcements</Link>
                <Link to={`/instructor/courses/${course.slug}/submissions`} className="btn btn--outline">Assignments to grade</Link>
              </div>
            </section>
          )}

          {step === 'publish' && (
            <section className="card panel ie-publish">
              <h2 className="h3">Review &amp; publish</h2>
              <ol className="ie-flow">
                {['Draft', 'Submitted', 'Under review', 'Approved', 'Published'].map((label, i) => {
                  const order = { draft: 0, changes_requested: 0, rejected: 0, submitted: 1, in_review: 2, approved: 3, published: 4 }[course.status] ?? 0;
                  return <li key={label} className={i < order ? 'is-done' : i === order ? 'is-now' : ''}>{label}</li>;
                })}
              </ol>
              <p className="muted">Preview your course as students will see it before you submit: <a href={`/courses/${course.slug}`} target="_blank" rel="noreferrer">open the course page</a>.</p>
              {problems.length > 0 && (
                <div className="alert alert--error" role="alert">
                  <div><strong>Finish these before submitting:</strong><ul className="ie-problems">{problems.map((p) => <li key={p}>{p}</li>)}</ul></div>
                </div>
              )}
              <div className="ie-links">
                {canSubmit && <button type="button" className="btn btn--primary" onClick={submit} disabled={!!busy}>{busy === 'submit' ? <span className="btn-spinner" /> : <i className="fas fa-paper-plane" />} Submit for review</button>}
                {course.status === 'approved' && <button type="button" className="btn btn--primary" onClick={() => publish(true)} disabled={!!busy}><i className="fas fa-rocket" /> Publish now</button>}
                {course.status === 'published' && <button type="button" className="btn btn--outline" onClick={() => publish(false)} disabled={!!busy}><i className="fas fa-eye-slash" /> Unpublish</button>}
                {['draft', 'changes_requested', 'rejected'].includes(course.status) && <button type="button" className="btn btn--text text-danger" onClick={() => setDeleting(true)}><i className="fas fa-trash-can" /> Delete course</button>}
              </div>
            </section>
          )}
        </div>
      </div>

      {deleting && (
        <ConfirmDialog config={{ title: 'Delete this course?', text: `“${course.title}” and its whole curriculum will be deleted. This can’t be undone.`, confirm: 'Delete course' }}
          onClose={() => setDeleting(false)} onConfirm={remove} />
      )}
    </PortalLayout>
  );
};

export default InstructorCourseEditorPage;
