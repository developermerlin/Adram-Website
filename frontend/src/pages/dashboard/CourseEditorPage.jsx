import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { COURSE_ICONS } from '../../data/courses';
import { invalidateCatalog } from '../../data/useCatalog';
import { catalogAPI } from '../../services/api';
import { formatDateTime } from '../../utils/format';
import PortalLayout from '../../components/layout/PortalLayout';
import BrandIcon from '../../components/brand/BrandIcon';
import { Spinner } from '../../components/ui/Section';
import { Alert, TextField } from '../../components/ui/Form';
import ConfirmDialog from '../../components/admin/ConfirmDialog';
import { ListEditor, PublishBadge } from '../../components/admin/catalog';
import { DELETE_CONFIRM, slugify, useCatalogEditor } from '../../components/admin/useCatalogAdmin';

const BLANK = { title: '', icon: 'laptop', summary: '', topics: [''], duration: '', fee: '', next_intake: '', slug: '', is_published: false };

export const CourseEditorPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { form, set, loaded, notFound, errors, saving, dirty, save } = useCatalogEditor('courses', id, BLANK);
  const [deleting, setDeleting] = useState(false);

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
              <h2 className="h3">Dates &amp; fees</h2>
              <p className="muted small">Optional. Anything left blank shows as “Ask about dates &amp; fees” on the website.</p>
              <div className="form-row">
                <TextField label="Duration" maxLength={100} placeholder="e.g. 8 weeks, evenings" {...input('duration')} />
                <TextField label="Fee" maxLength={100} placeholder="e.g. NLe 2,500" {...input('fee')} />
                <TextField label="Next intake" type="date" {...input('next_intake')} />
              </div>
            </section>
          </div>

          <aside className="editor__aside">
            <section className="card panel editor__publish">
              <div className="panel__head">
                <h2 className="h3">Publishing</h2>
                <PublishBadge published={Boolean(form.is_published)} />
              </div>
              <label className="checkbox">
                <input type="checkbox" checked={Boolean(form.is_published)} onChange={(e) => set('is_published')(e.target.checked)} />
                <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
                <span>
                  Show on the website
                  <small>Published programmes appear on the Training page and in the site menu.</small>
                </span>
              </label>

              <div className="field">
                <label htmlFor="slug">Page anchor</label>
                <div className="prefix-input">
                  <span>/courses#</span>
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
