import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { destinations, FUNDING, LEVELS } from '../../data/scholarships';
import { formatDateTime } from '../../utils/format';
import PortalLayout from '../../components/layout/PortalLayout';
import { Spinner } from '../../components/ui/Section';
import { Alert, TextField } from '../../components/ui/Form';
import { CopyLink } from '../../components/ui/ShareLink';
import ConfirmDialog from '../../components/admin/ConfirmDialog';
import { ListEditor, PublishBadge, TimelineEditor } from '../../components/admin/catalog';
import { DELETE_CONFIRM, slugify, useCatalogEditor } from '../../components/admin/useCatalogAdmin';
import { catalogAPI } from '../../services/api';
import { invalidateCatalog } from '../../data/useCatalog';

const BLANK = {
  name: '', provider: '', country: '', levels: [], funding: 'full', url: '', duration: '', fields: '',
  application_window: '', deadline: '', summary: '', covers: [''], eligibility: [''], steps: [''], slug: '', is_published: false,
  timeline: [], service_enabled: true, service_fee: '', service_includes: [''], service_requirements: [''], service_cutoff: '', service_note: '',
  hide_official_link: false, members_only: false,
};

export const ScholarshipEditorPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { form, set, loaded, notFound, errors, saving, dirty, save } = useCatalogEditor('scholarships', id, BLANK);
  const [deleting, setDeleting] = useState(false);

  const input = (field) => ({ name: field, value: form[field] ?? '', error: errors[field], onChange: (e) => set(field)(e.target.value) });
  const toggleLevel = (level) => set('levels')(form.levels.includes(level) ? form.levels.filter((l) => l !== level) : [...form.levels, level]);

  const submit = async (e) => {
    e.preventDefault();
    const saved = await save();
    if (!saved) return;
    toast.success(id ? 'Changes saved.' : 'Scholarship created.');
    if (!id) navigate(`/admin/scholarships/${saved.id}`, { replace: true });
  };

  if (notFound) {
    return (
      <PortalLayout title="Scholarship not found">
        <Alert>This scholarship doesn’t exist any more. It may have been deleted.</Alert>
        <Link to="/admin/scholarships" className="btn btn--outline btn--sm"><i className="fas fa-arrow-left" /> All scholarships</Link>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout
      title={id ? form.name || 'Edit scholarship' : 'New scholarship'}
      subtitle={<Link to="/admin/scholarships" className="back-link"><i className="fas fa-arrow-left" /> All scholarships</Link>}
    >
      {!loaded ? (
        <Spinner label="Loading scholarship…" />
      ) : (
        <form className="editor" onSubmit={submit} noValidate>
          <div className="editor__main">
            <Alert>{errors.form}</Alert>

            <section className="card panel editor__section">
              <h2 className="h3">Basics</h2>
              <div className="form-grid">
                <TextField label="Scholarship name" required maxLength={200} placeholder="e.g. Chevening Scholarships" {...input('name')} />
                <TextField label="Offered by" required maxLength={255} placeholder="Government, foundation or university" {...input('provider')} />
                <div className="form-row">
                  <div className="field">
                    <label htmlFor="country">Destination</label>
                    <select id="country" className="input" required value={form.country} aria-invalid={Boolean(errors.country)} onChange={(e) => set('country')(e.target.value)}>
                      <option value="" disabled>Choose a destination</option>
                      {Object.entries(destinations).map(([code, d]) => <option key={code} value={code}>{d.name}</option>)}
                    </select>
                    {errors.country && <p className="field-error">{errors.country}</p>}
                  </div>
                  <div className="field">
                    <span className="field__label">Funding</span>
                    <div className="segmented segmented--block" role="radiogroup" aria-label="Funding">
                      {Object.entries(FUNDING).map(([value, label]) => (
                        <button key={value} type="button" role="radio" aria-checked={form.funding === value} className={form.funding === value ? 'is-active' : ''} onClick={() => set('funding')(value)}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <fieldset className="field">
                  <legend className="field__label">Levels of study</legend>
                  <div className="check-row">
                    {LEVELS.map((level) => (
                      <label key={level} className="checkbox">
                        <input type="checkbox" checked={form.levels.includes(level)} onChange={() => toggleLevel(level)} />
                        <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
                        {level}
                      </label>
                    ))}
                  </div>
                  {errors.levels && <p className="field-error">{errors.levels}</p>}
                </fieldset>
                <TextField label="Official website" type="url" required maxLength={500} placeholder="https://" hint="Where students check the current rules and apply." {...input('url')} />
              </div>
            </section>

            <section className="card panel editor__section">
              <h2 className="h3">Details</h2>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="summary">Summary</label>
                  <textarea id="summary" className="input" rows={4} required value={form.summary} aria-invalid={Boolean(errors.summary)} onChange={(e) => set('summary')(e.target.value)} placeholder="Two or three sentences: who it’s for and what makes it special." />
                  {errors.summary ? <p className="field-error">{errors.summary}</p> : <p className="hint">Shown at the top of the scholarship’s page.</p>}
                </div>
                <div className="form-row">
                  <TextField label={<>Duration <span className="optional">(optional)</span></>} maxLength={200} placeholder="e.g. 1 year (one-year master’s)" {...input('duration')} />
                  <TextField label={<>Fields of study <span className="optional">(optional)</span></>} maxLength={255} placeholder="e.g. Any subject" {...input('fields')} />
                </div>
              </div>
            </section>

            <section className="card panel editor__section">
              <h2 className="h3">Deadline &amp; timeline</h2>
              <div className="form-grid">
                <div className="form-row">
                  <TextField label="Application deadline" type="date" hint="Shown with a countdown on every card. Leave blank until it’s confirmed." {...input('deadline')} />
                  <TextField label={<>Usual application window <span className="optional">(if no date yet)</span></>} maxLength={255} placeholder="e.g. Applications typically open in August." {...input('application_window')} />
                </div>
                <TimelineEditor entries={form.timeline || []} onChange={set('timeline')} error={errors.timeline} />
              </div>
            </section>

            <section className="card panel editor__section">
              <div className="panel__head">
                <div>
                  <h2 className="h3">ADRAM applies for you</h2>
                  <p className="muted small">What students who are interested in this scholarship are offered. They see it in their portal with an “Ask ADRAM to apply for me” button.</p>
                </div>
              </div>
              <label className="checkbox service-toggle">
                <input type="checkbox" checked={Boolean(form.service_enabled)} onChange={(e) => set('service_enabled')(e.target.checked)} />
                <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
                <span>Offer to apply on the student’s behalf</span>
              </label>
              {form.service_enabled && (
                <div className="form-grid service-fields">
                  <div className="form-row">
                    <TextField label={<>Service fee <span className="optional">(optional)</span></>} maxLength={100} placeholder="e.g. Free, or NLe 1,500" {...input('service_fee')} />
                    <TextField label={<>Students must send everything by <span className="optional">(optional)</span></>} type="date" hint="Give yourself time before the official deadline." {...input('service_cutoff')} />
                  </div>
                  <div className="field">
                    <label htmlFor="service_note">Instructions for students <span className="optional">(optional)</span></label>
                    <textarea id="service_note" className="input" rows={3} value={form.service_note || ''} onChange={(e) => set('service_note')(e.target.value)} placeholder="e.g. We’ll book a call to plan your essays once you send your documents." />
                  </div>
                  <ListEditor id="service_includes" label="What ADRAM does" items={form.service_includes || []} onChange={set('service_includes')} placeholder="e.g. Review and edit your four Chevening essays" error={errors.service_includes} />
                  <ListEditor id="service_requirements" label="What we need from the student" hint="Becomes the documents checklist for students who track this scholarship." items={form.service_requirements || []} onChange={set('service_requirements')} placeholder="e.g. Scanned degree certificate" error={errors.service_requirements} />
                </div>
              )}
            </section>

            <section className="card panel editor__section">
              <ListEditor id="covers" label="What it covers" hint="The first three appear on the scholarship’s card. Press Enter to add another line." items={form.covers} onChange={set('covers')} placeholder="e.g. University tuition fees" error={errors.covers} />
            </section>
            <section className="card panel editor__section">
              <ListEditor id="eligibility" label="Who can apply" items={form.eligibility} onChange={set('eligibility')} placeholder="e.g. Citizen of Sierra Leone" error={errors.eligibility} />
            </section>
            <section className="card panel editor__section">
              <ListEditor id="steps" label="How to apply" hint="In the order students should do them." numbered items={form.steps} onChange={set('steps')} placeholder="e.g. Complete the online application" error={errors.steps} />
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
                  <small>Drafts are only visible to editors.</small>
                </span>
              </label>

              <div className="field">
                <label htmlFor="slug">Web address</label>
                <div className="prefix-input">
                  <span>/scholarships/</span>
                  <input id="slug" className="input" value={form.slug} maxLength={80} aria-invalid={Boolean(errors.slug)} placeholder={slugify(form.name) || 'made-from-the-name'} onChange={(e) => set('slug')(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} />
                </div>
                {errors.slug ? <p className="field-error">{errors.slug}</p> : <p className="hint">{id ? 'Changing it breaks links people have saved.' : 'Leave blank to make it from the name.'}</p>}
              </div>

              <button type="submit" className="btn btn--primary btn--block" disabled={saving || (id && !dirty)}>
                {saving ? <span className="btn-spinner" /> : <i className="fas fa-floppy-disk" />} {id ? (dirty ? 'Save changes' : 'Saved') : 'Create scholarship'}
              </button>
              {dirty && id && <p className="editor__unsaved"><i className="fas fa-circle" /> Unsaved changes</p>}

              {id && (
                <dl className="editor__meta">
                  <div><dt>Last edited</dt><dd>{formatDateTime(form.updated_at)}{form.updated_by_name ? ` by ${form.updated_by_name}` : ''}</dd></div>
                  <div><dt>Created</dt><dd>{formatDateTime(form.created_at)}</dd></div>
                </dl>
              )}
            </section>

            <section className="card panel editor__access">
              <h2 className="h3">Access</h2>
              <label className="checkbox">
                <input type="checkbox" checked={Boolean(form.members_only)} onChange={(e) => set('members_only')(e.target.checked)} />
                <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
                <span>
                  Sign-in to view details
                  <small>Visitors see the summary and what it covers; eligibility, steps and the official link need a free ADRAM account.</small>
                </span>
              </label>
              <label className="checkbox">
                <input type="checkbox" checked={Boolean(form.hide_official_link)} onChange={(e) => set('hide_official_link')(e.target.checked)} />
                <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
                <span>
                  Hide official link
                  <small>The provider’s website isn’t shown to anyone on the site; students are sent to ADRAM for help instead.</small>
                </span>
              </label>
            </section>

            {id && (
              <section className="card panel editor__links">
                <span className="field__label">Shareable link</span>
                <CopyLink path={`/scholarships/${form.slug}`} />
                <Link to={`/scholarships/${form.slug}`} className="btn btn--outline btn--sm btn--block">
                  <i className="fas fa-arrow-up-right-from-square" /> {form.is_published ? 'View on website' : 'Preview draft'}
                </Link>
                <button type="button" className="btn btn--text btn--sm btn--block text-danger" onClick={() => setDeleting(true)}>
                  <i className="fas fa-trash-can" /> Delete scholarship
                </button>
              </section>
            )}
          </aside>
        </form>
      )}

      {deleting && (
        <ConfirmDialog
          config={DELETE_CONFIRM('scholarship')}
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            try {
              await catalogAPI.manage('scholarships').remove(id);
              invalidateCatalog();
              toast.success('Scholarship deleted.');
              navigate('/admin/scholarships', { replace: true });
            } catch {
              toast.error('Could not delete the scholarship.');
              setDeleting(false);
            }
          }}
        />
      )}
    </PortalLayout>
  );
};

export default ScholarshipEditorPage;
