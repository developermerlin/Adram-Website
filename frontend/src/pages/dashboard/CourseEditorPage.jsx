import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { COURSE_ICONS } from '../../data/courses';
import { invalidateCatalog } from '../../data/useCatalog';
import { adminAPI, catalogAPI, lmsAPI } from '../../services/api';
import { formatDateTime } from '../../utils/format';
import PortalLayout from '../../components/layout/PortalLayout';
import BrandIcon from '../../components/brand/BrandIcon';
import { Spinner } from '../../components/ui/Section';
import { Alert, TextField } from '../../components/ui/Form';
import ConfirmDialog from '../../components/admin/ConfirmDialog';
import { ListEditor, PublishBadge } from '../../components/admin/catalog';
import { ImageField } from '../../components/admin/contentFields';
import { DELETE_CONFIRM, slugify, useCatalogEditor } from '../../components/admin/useCatalogAdmin';
import FaqEditor from '../../components/lms/FaqEditor';
import CourseCard from '../../components/lms/CourseCard';
import { HIGHLIGHT_LABELS } from '../../components/lms/courseUtils';
import { StatusPill } from '../../components/lms/Price';
import '../../styles/marketplace.css';

const BLANK = {
  title: '', icon: 'laptop', summary: '', topics: [''], duration: '', fee: '', price: '', next_intake: '', slug: '', is_published: false,
  description: '', learn_points: [''], requirements: [''], audience: [''], level: 'all', language: 'English',
  thumbnail: '', promo_video_url: '', instructor_name: '', instructor_title: '', instructor_bio: '', instructor_photo: '', enrollment_mode: 'approval',
  subtitle: '', discount_price: '', category: '', subcategory: '', faqs: [], instructor: '', is_premium: false, highlight: '', format_label: 'Course',
};

export const CourseEditorPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { form, set, loaded, notFound, errors, saving, dirty, save } = useCatalogEditor('courses', id, BLANK);
  const [deleting, setDeleting] = useState(false);
  const [categories, setCategories] = useState([]);
  const [teachers, setTeachers] = useState([]);

  useEffect(() => {
    let live = true;
    lmsAPI.categories().then(({ data }) => live && setCategories(data)).catch(() => {});
    adminAPI.getUsers({ role: 'INSTRUCTOR' }).then(({ data }) => live && setTeachers(data.results || data)).catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const subs = categories.find((c) => String(c.id) === String(form.category ?? ''))?.children || [];
  // The card exactly as students will see it, from what is typed in the form
  const teacher = teachers.find((u) => String(u.id) === String(form.instructor ?? ''));
  const price = Number(form.price) || 0;
  const sale = form.discount_price !== '' && form.discount_price != null && Number(form.discount_price) < price ? Number(form.discount_price) : price;
  const cardPreview = { ...form, price: price || null, sale_price: sale, is_free: !sale, stats: form.stats || {}, currency: 'NLe',
    instructor: { name: teacher ? teacher.full_name || teacher.email : form.instructor_name || 'ADRAM Technologies' } };

  const input = (field) => ({ name: field, value: form[field] ?? '', error: errors[field], onChange: (e) => set(field)(e.target.value) });

  const submit = async (e) => {
    e.preventDefault();
    const saved = await save();
    if (!saved) return;
    toast.success(id ? 'Changes saved.' : 'Programme created.');
    if (!id) navigate(`/admin/courses/${saved.id}`, { replace: true });
  };

  if (notFound) {
    return (
      <PortalLayout title="Programme not found">
        <Alert>This programme doesn’t exist any more. It may have been deleted.</Alert>
        <Link to="/admin/courses" className="btn btn--outline btn--sm"><i className="fas fa-arrow-left" /> All programmes</Link>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout
      title={id ? form.title || 'Edit programme' : 'New programme'}
      subtitle={<Link to="/admin/courses" className="back-link"><i className="fas fa-arrow-left" /> All programmes</Link>}
    >
      {!loaded ? (
        <Spinner label="Loading programme…" />
      ) : (
        <form className="editor" onSubmit={submit} noValidate>
          <div className="editor__main">
            <Alert>{errors.form}</Alert>

            <section className="card panel editor__section">
              <h2 className="h3">Programme</h2>
              <div className="form-grid">
                <TextField label="Title" required maxLength={200} placeholder="e.g. Web Development" {...input('title')} />
                <TextField label="Subtitle" maxLength={250} placeholder="One line under the title on the course page" {...input('subtitle')} />
                <div className="form-row">
                  <div className="field">
                    <label htmlFor="category">Category</label>
                    <select id="category" className="input" value={form.category ?? ''} onChange={(e) => { set('category')(e.target.value); set('subcategory')(''); }}>
                      <option value="">None</option>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    {errors.category ? <p className="field-error">{errors.category}</p> : <p className="hint">Manage categories under <Link to="/admin/categories">Categories</Link>.</p>}
                  </div>
                  <div className="field">
                    <label htmlFor="subcategory">Subcategory</label>
                    <select id="subcategory" className="input" value={form.subcategory ?? ''} onChange={(e) => set('subcategory')(e.target.value)} disabled={!subs.length}>
                      <option value="">None</option>
                      {subs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    {errors.subcategory && <p className="field-error">{errors.subcategory}</p>}
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="summary">Summary</label>
                  <textarea id="summary" className="input" rows={3} required value={form.summary} aria-invalid={Boolean(errors.summary)} onChange={(e) => set('summary')(e.target.value)} placeholder="One sentence on what students will be able to do." />
                  {errors.summary ? <p className="field-error">{errors.summary}</p> : <p className="hint">Keep it short: it’s shown on the programme card.</p>}
                </div>
                <fieldset className="field">
                  <legend className="field__label">Icon</legend>
                  <div className="icon-picker" role="radiogroup" aria-label="Icon">
                    {COURSE_ICONS.map((name) => (
                      <button key={name} type="button" role="radio" aria-checked={form.icon === name} aria-label={name} title={name} className={`icon-picker__option${form.icon === name ? ' is-active' : ''}`} onClick={() => set('icon')(name)}>
                        <BrandIcon name={name} size={26} />
                      </button>
                    ))}
                  </div>
                </fieldset>
              </div>
            </section>

            <section className="card panel editor__section">
              <ListEditor id="topics" label="Topics" hint="Up to 8 short tags, e.g. “React” or “Git & GitHub”." items={form.topics} onChange={set('topics')} placeholder="e.g. HTML, CSS, JavaScript" max={8} maxLength={60} error={errors.topics} />
            </section>

            <section className="card panel editor__section">
              <h2 className="h3">Course page</h2>
              <p className="muted small">What students read on the course’s own page before they enrol, like the page of a course on Udemy. Anything left blank is simply not shown.</p>
              <div className="form-grid">
                <ImageField field={{ label: 'Course picture', hint: 'Shown on the course card and its page. A wide picture, 1280 × 720, looks best.' }} value={form.thumbnail || ''} onChange={set('thumbnail')} id="thumbnail" />
                <div className="field">
                  <label htmlFor="description">Description</label>
                  <textarea id="description" className="input" rows={7} value={form.description || ''} maxLength={8000} onChange={(e) => set('description')(e.target.value)} placeholder="Describe the course in a few paragraphs. Leave a blank line between paragraphs." />
                </div>
                <div className="form-row">
                  <div className="field">
                    <label htmlFor="level">Level</label>
                    <select id="level" className="input" value={form.level} onChange={(e) => set('level')(e.target.value)}>
                      <option value="all">All levels</option>
                      <option value="beginner">Beginner</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="advanced">Advanced</option>
                    </select>
                  </div>
                  <TextField label="Language" maxLength={40} placeholder="e.g. English" {...input('language')} />
                </div>
                <TextField label="Trailer video (optional)" maxLength={500} placeholder="https://www.youtube.com/watch?v=…" hint="A YouTube or Vimeo link. Students can play it from the course page before enrolling." {...input('promo_video_url')} />
              </div>
            </section>

            <section className="card panel editor__section">
              <ListEditor id="learn_points" label="What students will learn" hint="Up to 12 short points, each starting with a verb, e.g. “Build a responsive website”." items={form.learn_points?.length ? form.learn_points : ['']} onChange={set('learn_points')} placeholder="e.g. Build a responsive website" max={12} maxLength={200} error={errors.learn_points} />
            </section>
            <section className="card panel editor__section">
              <ListEditor id="requirements" label="Requirements" hint="What students need before they start, e.g. “A computer with internet access”." items={form.requirements?.length ? form.requirements : ['']} onChange={set('requirements')} placeholder="e.g. A laptop or computer" max={10} maxLength={200} error={errors.requirements} />
            </section>
            <section className="card panel editor__section">
              <ListEditor id="audience" label="Who this course is for" hint="Up to 8 short lines." items={form.audience?.length ? form.audience : ['']} onChange={set('audience')} placeholder="e.g. Complete beginners" max={8} maxLength={200} error={errors.audience} />
            </section>

            <section className="card panel editor__section">
              <h2 className="h3">Frequently asked questions</h2>
              <FaqEditor items={form.faqs || []} onChange={set('faqs')} error={errors.faqs} />
            </section>

            <section className="card panel editor__section">
              <h2 className="h3">Instructor</h2>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="instructor">Instructor account</label>
                  <select id="instructor" className="input" value={form.instructor ?? ''} onChange={(e) => set('instructor')(e.target.value)}>
                    <option value="">None: taught by ADRAM</option>
                    {teachers.map((u) => <option key={u.id} value={u.id}>{u.full_name || u.email} ({u.email})</option>)}
                  </select>
                  {errors.instructor ? <p className="field-error">{errors.instructor}</p> : <p className="hint">The instructor can then edit the course, answer questions and earn from sales. Their profile replaces the details below on the course page.</p>}
                </div>
                <div className="form-row">
                  <TextField label="Name" maxLength={120} placeholder="e.g. Ibrahim Kamara" {...input('instructor_name')} />
                  <TextField label="Title" maxLength={160} placeholder="e.g. Senior software engineer" {...input('instructor_title')} />
                </div>
                <div className="field">
                  <label htmlFor="instructor_bio">About the instructor</label>
                  <textarea id="instructor_bio" className="input" rows={4} value={form.instructor_bio || ''} onChange={(e) => set('instructor_bio')(e.target.value)} placeholder="A few sentences about their background." />
                </div>
                <ImageField field={{ label: 'Instructor photo', hint: 'A square photo. Without one, their initials are shown.' }} value={form.instructor_photo || ''} onChange={set('instructor_photo')} id="instructor_photo" />
              </div>
            </section>

            <section className="card panel editor__section">
              <h2 className="h3">Dates &amp; fees</h2>
              <p className="muted small">Optional. Anything left blank shows as “Ask about dates &amp; fees” on the website.</p>
              <div className="form-row">
                <TextField label="Duration" maxLength={100} placeholder="e.g. 8 weeks, evenings" {...input('duration')} />
                <TextField label="Fee (text)" maxLength={100} placeholder="e.g. NLe 2,500" {...input('fee')} />
                <TextField label="Price to pay online (NLe)" inputMode="decimal" placeholder="Leave empty for a free course" hint="Students buy through the cart and pay by mobile money; lessons unlock when you confirm the payment under Orders." {...input('price')} />
                <TextField label="Sale price (NLe, optional)" inputMode="decimal" placeholder="Lower than the price" {...input('discount_price')} />
                <TextField label="Next intake" type="date" {...input('next_intake')} />
              </div>
            </section>
          </div>

          <aside className="editor__aside">
            <section className="card panel editor__card-preview">
              <h2 className="h3">Course card</h2>
              <p className="muted small">How the course looks in the catalogue. Changes show here as you type.</p>
              <CourseCard course={cardPreview} preview />
              <label className="checkbox">
                <input type="checkbox" checked={Boolean(form.is_premium)} onChange={(e) => set('is_premium')(e.target.checked)} />
                <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
                <span>Premium badge<small>Shows “Premium” on the picture.</small></span>
              </label>
              <div className="field">
                <label htmlFor="highlight">Label</label>
                <select id="highlight" className="input" value={form.highlight || ''} onChange={(e) => set('highlight')(e.target.value)}>
                  <option value="">None</option>
                  {Object.entries(HIGHLIGHT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
              <TextField label="Type" maxLength={30} placeholder="Course" hint="e.g. Course, Bootcamp, Workshop." {...input('format_label')} />
            </section>

            <section className="card panel editor__publish">
              <div className="panel__head">
                <h2 className="h3">Publishing</h2>
                <PublishBadge published={Boolean(form.is_published)} />
              </div>
              {id && form.status && (
                <div className="field">
                  <span className="field__label">Review status</span>
                  <p><StatusPill status={form.status} /> <Link to="/admin/course-reviews" className="small">Review queue</Link></p>
                  {form.review_note && <p className="muted small">Note: {form.review_note}</p>}
                </div>
              )}
              <label className="checkbox">
                <input type="checkbox" checked={Boolean(form.is_published)} onChange={(e) => set('is_published')(e.target.checked)} />
                <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
                <span>
                  Show on the website
                  <small>Published programmes appear on the Training page and in the site menu.</small>
                </span>
              </label>

              <div className="field">
                <label htmlFor="enrollment_mode">Enrollment</label>
                <select id="enrollment_mode" className="input" value={form.enrollment_mode || 'approval'} onChange={(e) => set('enrollment_mode')(e.target.value)}>
                  <option value="approval">By approval: ADRAM confirms each place</option>
                  <option value="open">Open: instant access</option>
                </select>
                <p className="hint">Open courses unlock every lesson the moment a student enrols. With approval, you confirm each request first.</p>
              </div>

              <div className="field">
                <label htmlFor="slug">Page address</label>
                <div className="prefix-input">
                  <span>/courses/</span>
                  <input id="slug" className="input" value={form.slug} maxLength={80} aria-invalid={Boolean(errors.slug)} placeholder={slugify(form.title) || 'made-from-the-title'} onChange={(e) => set('slug')(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} />
                </div>
                {errors.slug ? <p className="field-error">{errors.slug}</p> : <p className="hint">{id ? 'Changing it breaks links to this programme.' : 'Leave blank to make it from the title.'}</p>}
              </div>

              <button type="submit" className="btn btn--primary btn--block" disabled={saving || (id && !dirty)}>
                {saving ? <span className="btn-spinner" /> : <i className="fas fa-floppy-disk" />} {id ? (dirty ? 'Save changes' : 'Saved') : 'Create programme'}
              </button>
              {dirty && id && <p className="editor__unsaved"><i className="fas fa-circle" /> Unsaved changes</p>}

              {id && (
                <dl className="editor__meta">
                  <div><dt>Last edited</dt><dd>{formatDateTime(form.updated_at)}{form.updated_by_name ? ` by ${form.updated_by_name}` : ''}</dd></div>
                  <div><dt>Created</dt><dd>{formatDateTime(form.created_at)}</dd></div>
                </dl>
              )}
            </section>

            {id && (
              <section className="card panel editor__links">
                <Link to={`/admin/courses/${form.slug}/content`} className="btn btn--primary btn--sm btn--block">
                  <i className="fas fa-clapperboard" /> Course content (lessons &amp; videos)
                </Link>
                {form.is_published && (
                  <Link to={`/courses#${form.slug}`} className="btn btn--outline btn--sm btn--block">
                    <i className="fas fa-arrow-up-right-from-square" /> View on website
                  </Link>
                )}
                <button type="button" className="btn btn--text btn--sm btn--block text-danger" onClick={() => setDeleting(true)}>
                  <i className="fas fa-trash-can" /> Delete programme
                </button>
              </section>
            )}
          </aside>
        </form>
      )}

      {deleting && (
        <ConfirmDialog
          config={DELETE_CONFIRM('programme')}
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            try {
              await catalogAPI.manage('courses').remove(id);
              invalidateCatalog();
              toast.success('Programme deleted.');
              navigate('/admin/courses', { replace: true });
            } catch {
              toast.error('Could not delete the programme.');
              setDeleting(false);
            }
          }}
        />
      )}
    </PortalLayout>
  );
};

export default CourseEditorPage;
