import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { contentAPI, parseApiErrors } from '../../services/api';
import { defaults } from '../../content/defaults';
import { diffFromDefaults, getPath, mergeContent, setPath, stable } from '../../content/merge';
import { contentPage } from '../../content/schema';
import { publishContent } from '../../content/useContent';
import { formatDateTime } from '../../utils/format';
import PortalLayout from '../../components/layout/PortalLayout';
import { Spinner } from '../../components/ui/Section';
import { Alert } from '../../components/ui/Form';
import ConfirmDialog from '../../components/admin/ConfirmDialog';
import ContentField from '../../components/admin/contentFields';

// One form per website page, built from the page's description in content/schema.js.
const ContentEditor = ({ slug }) => {
  const page = contentPage(slug);
  const base = defaults[slug];

  const [saved, setSaved] = useState(null); // what the server has: only the parts the admin changed
  const [meta, setMeta] = useState({});
  const [form, setForm] = useState(null); // the whole page as the form shows it
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [history, setHistory] = useState(null); // null = closed, otherwise the list of past changes
  const [restoring, setRestoring] = useState(null);

  useEffect(() => {
    if (!page) return undefined;
    let live = true;
    contentAPI
      .manage(slug)
      .then(({ data }) => {
        if (!live) return;
        setSaved(data.data || {});
        setMeta({ updated_at: data.updated_at, updated_by_name: data.updated_by_name });
        setForm(mergeContent(base, data.data || {}));
      })
      .catch((err) => {
        if (!live) return;
        // A server error here almost always means the database hasn't been updated with the newest migrations
        setError(
          err?.response?.status >= 500
            ? 'The server could not load this page’s content. The website’s database probably needs updating: run "python manage.py migrate" in the backend folder, then refresh this page.'
            : 'Could not load this page’s content. Please refresh and try again.',
        );
      });
    return () => {
      live = false;
    };
  }, [slug, page, base]);

  // Only the differences from the original wording are saved, so untouched text keeps following the defaults.
  // (Pages can tidy their form first, e.g. giving new services a page address.)
  const tidy = useMemo(() => (form && page?.normalize ? page.normalize(form) : form), [form, page]);
  const changes = useMemo(() => (tidy ? diffFromDefaults(tidy, base) || {} : {}), [tidy, base]);
  const dirty = form && saved && stable(changes) !== stable(saved);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (!page) {
    return (
      <PortalLayout title="Page not found">
        <Alert>This page can’t be edited here.</Alert>
        <Link to="/admin/content" className="btn btn--outline btn--sm"><i className="fas fa-arrow-left" /> All pages</Link>
      </PortalLayout>
    );
  }

  const change = (path) => (value) => setForm((f) => setPath(f, path, value));

  const loadHistory = () =>
    contentAPI
      .history(slug)
      .then(({ data }) => setHistory(data))
      .catch(() => {
        setHistory([]);
        toast.error('Could not load the change history.');
      });
  // Keep an open history list current after a save, reset or restore
  const refreshHistory = () => history !== null && loadHistory();

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { data } = await contentAPI.save(slug, changes);
      setForm(tidy);
      setSaved(data.data || {});
      setMeta({ updated_at: data.updated_at, updated_by_name: data.updated_by_name });
      publishContent(slug, data.data || {});
      refreshHistory();
      toast.success('Changes saved. They are live on the website.');
    } catch (err) {
      const errors = parseApiErrors(err);
      setError(errors.data || errors.form || errors.detail || 'The changes could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    try {
      await contentAPI.reset(slug);
      setSaved({});
      setMeta({});
      setForm(mergeContent(base, {}));
      publishContent(slug, {});
      refreshHistory();
      toast.success('The page is back to its original content.');
    } catch {
      toast.error('Could not reset the page.');
    } finally {
      setResetting(false);
    }
  };

  const restore = async () => {
    try {
      const { data } = await contentAPI.restore(slug, restoring.id);
      setSaved(data.data || {});
      setMeta({ updated_at: data.updated_at, updated_by_name: data.updated_by_name });
      setForm(mergeContent(base, data.data || {}));
      publishContent(slug, data.data || {});
      loadHistory();
      toast.success('That version is back on the website.');
    } catch {
      toast.error('Could not restore that version.');
    } finally {
      setRestoring(null);
    }
  };

  return (
    <PortalLayout
      title={page.label}
      subtitle={<Link to="/admin/content" className="back-link"><i className="fas fa-arrow-left" /> All pages</Link>}
      actions={
        <Link to={page.publicPath} className="btn btn--outline btn--sm" target="_blank">
          <i className="fas fa-arrow-up-right-from-square" /> View page
        </Link>
      }
    >
      {!form ? (
        error ? <Alert>{error}</Alert> : <Spinner label="Loading content…" />
      ) : (
        <form className="editor cf-editor" onSubmit={save} noValidate data-no-override>
          <div className="editor__main">
            <Alert>{error}</Alert>
            <p className="muted small cf-editor__intro">{page.description}</p>

            {page.sections.map((section) => (
              <section key={section.id} id={`section-${section.id}`} className="card panel editor__section cf-section">
                <h2 className="h3">{section.title}</h2>
                {section.description && <p className="muted small">{section.description}</p>}
                <div className="form-grid">
                  {section.fields.map((field) => (
                    <ContentField key={field.path} field={field} id={`f-${field.path}`} value={getPath(form, field.path)} onChange={change(field.path)} />
                  ))}
                </div>
              </section>
            ))}
          </div>

          <aside className="editor__aside">
            <section className="card panel editor__publish">
              <div className="panel__head">
                <h2 className="h3">Publishing</h2>
                {saved && Object.keys(saved).length > 0 ? (
                  <span className="badge badge--blue"><i className="fas fa-pen" /> Edited</span>
                ) : (
                  <span className="badge badge--gray">Original</span>
                )}
              </div>
              <p className="muted small">Saved changes go live on the website straight away.</p>
              <button type="submit" className="btn btn--primary btn--block" disabled={saving || !dirty}>
                {saving ? <span className="btn-spinner" /> : <i className="fas fa-floppy-disk" />} {dirty ? 'Save changes' : 'Saved'}
              </button>
              {dirty && <p className="editor__unsaved"><i className="fas fa-circle" /> Unsaved changes</p>}
              {meta.updated_at && (
                <dl className="editor__meta">
                  <div><dt>Last edited</dt><dd>{formatDateTime(meta.updated_at)}{meta.updated_by_name ? ` by ${meta.updated_by_name}` : ''}</dd></div>
                </dl>
              )}
            </section>

            <section className="card panel cf-jump">
              <h2 className="h3">On this page</h2>
              <ul>
                {page.sections.map((s) => (
                  <li key={s.id}><a href={`#section-${s.id}`}>{s.title}</a></li>
                ))}
              </ul>
            </section>

            <section className="card panel cf-history">
              <button type="button" className="cf-history__toggle" aria-expanded={history !== null} onClick={() => (history === null ? loadHistory() : setHistory(null))}>
                <span><i className="fas fa-clock-rotate-left" aria-hidden="true" /> Change history</span>
                <i className={`fas fa-chevron-${history === null ? 'down' : 'up'}`} aria-hidden="true" />
              </button>
              {history !== null && (
                history.length === 0 ? (
                  <p className="muted small cf-history__empty">No changes yet. Each save is recorded here, and you can go back to an earlier version.</p>
                ) : (
                  <ol className="cf-history__list">
                    {history.map((h, i) => (
                      <li key={h.id}>
                        <div>
                          <strong>{h.action === 'saved' ? 'Saved' : h.action === 'reset' ? 'Reset to original' : 'Restored an earlier version'}</strong>
                          <span>{formatDateTime(h.created_at)}{h.user_name ? ` · ${h.user_name}` : ''}</span>
                          {h.action !== 'reset' && h.changed.length > 0 && <small>Edited: {h.changed.join(', ')}</small>}
                        </div>
                        {i === 0 ? <span className="badge badge--green">Current</span> : (
                          <button type="button" className="btn btn--text btn--sm" onClick={() => setRestoring(h)}>Restore</button>
                        )}
                      </li>
                    ))}
                  </ol>
                )
              )}
            </section>

            <section className="card panel editor__links">
              <button type="button" className="btn btn--text btn--sm btn--block text-danger" onClick={() => setResetting(true)} disabled={!saved || Object.keys(saved).length === 0}>
                <i className="fas fa-rotate-left" /> Reset to original content
              </button>
            </section>
          </aside>
        </form>
      )}

      {restoring && (
        <ConfirmDialog
          config={{
            title: 'Restore this version?',
            text: `The page goes back to how it was on ${formatDateTime(restoring.created_at)}. Anything you have changed since is replaced, but the current version stays in the history so you can return to it.`,
            confirm: 'Restore',
          }}
          onClose={() => setRestoring(null)}
          onConfirm={restore}
        />
      )}

      {resetting && (
        <ConfirmDialog
          config={{
            title: 'Reset this page?',
            text: 'Every change you have saved on this page will be removed, and the original wording and photos come back. This can’t be undone.',
            confirm: 'Reset page',
          }}
          onClose={() => setResetting(false)}
          onConfirm={reset}
        />
      )}
    </PortalLayout>
  );
};

// Keyed by page, so moving between pages starts the editor afresh
export const ContentEditorPage = () => {
  const { slug } = useParams();
  return <ContentEditor key={slug} slug={slug} />;
};

export default ContentEditorPage;
