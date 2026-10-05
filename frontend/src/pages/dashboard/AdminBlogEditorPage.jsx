import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import PortalLayout from '../../components/layout/PortalLayout';
import { ImageField, ImageLibrary } from '../../components/admin/contentFields';
import Markdown from '../../components/blog/Markdown';
import { blogAPI, parseApiErrors } from '../../services/api';
import { useSite } from '../../content/useContent';
import { readingMinutes } from '../../utils/markdown';
import { formatDateTime } from '../../utils/format';
import '../../styles/blog.css';
import '../../styles/blog-admin.css';

const BLANK = {
  title: '', slug: '', excerpt: '', body: '', cover: '', cover_alt: '', category_id: '', tags: [], author_id: '', author_name: '',
  author_title: '', featured: false, seo_title: '', seo_description: '', status: 'draft', published_at: null,
};
const toForm = (p) => ({ ...BLANK, ...Object.fromEntries(Object.keys(BLANK).map((k) => [k, p[k] ?? BLANK[k]])), category_id: p.category_id || '', author_id: p.author_id || '' });
// <input type="datetime-local"> works in local time without a zone
const toLocal = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const slugify = (text) => text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s-]/g, '').trim().replace(/[\s-]+/g, '-').slice(0, 120);

const TOOLS = [
  ['h2', 'fa-heading', 'Section heading', { line: '## ' }],
  ['h3', 'fa-h', 'Smaller heading', { line: '### ' }],
  ['bold', 'fa-bold', 'Bold', { wrap: ['**', '**', 'bold text'] }],
  ['italic', 'fa-italic', 'Italic', { wrap: ['*', '*', 'italic text'] }],
  ['link', 'fa-link', 'Link', { wrap: ['[', '](https://)', 'link text'] }],
  ['ul', 'fa-list-ul', 'Bullet list', { line: '- ' }],
  ['ol', 'fa-list-ol', 'Numbered list', { line: '1. ' }],
  ['quote', 'fa-quote-left', 'Quote', { line: '> ' }],
  ['code', 'fa-code', 'Code', { wrap: ['```\n', '\n```', 'code'] }],
  ['hr', 'fa-minus', 'Divider', { insert: '\n---\n' }],
];

/** Admin → Blog → a post: write it, set its picture, category and search details, and publish or schedule it. */
export const AdminBlogEditorPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const site = useSite();
  const isNew = !id || id === 'new';
  const [post, setPost] = useState(isNew ? null : undefined); // the saved post (null = not saved yet)
  const [form, setForm] = useState(BLANK);
  const [saved, setSaved] = useState(JSON.stringify(BLANK));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState('');
  const [mode, setMode] = useState('write');
  const [picking, setPicking] = useState(false);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [categories, setCategories] = useState([]);
  const [authors, setAuthors] = useState([]);
  const [tagDraft, setTagDraft] = useState('');
  const body = useRef(null);

  useEffect(() => {
    blogAPI.manageCategories().then(({ data }) => setCategories(data)).catch(() => {});
    blogAPI.authors().then(({ data }) => setAuthors(data)).catch(() => {});
  }, []);
  useEffect(() => {
    if (isNew) return;
    blogAPI.managePost(id).then(({ data }) => {
      setPost(data);
      const f = toForm(data);
      setForm(f);
      setSaved(JSON.stringify(f));
    }).catch(() => setPost(false));
  }, [id, isNew]);

  const dirty = JSON.stringify(form) !== saved;
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const set = useCallback((key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }, []);
  const setTitle = (value) => {
    setForm((f) => ({ ...f, title: value, ...(slugTouched ? {} : { slug: slugify(value) }) }));
    setErrors((e) => ({ ...e, title: undefined }));
  };

  // Formatting buttons: wrap the selection, start the selected lines with a marker, or insert text
  const format = ({ wrap, line, insert }) => {
    const el = body.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e, value } = el;
    let next;
    let caret;
    if (wrap) {
      const chosen = value.slice(s, e) || wrap[2];
      next = value.slice(0, s) + wrap[0] + chosen + wrap[1] + value.slice(e);
      caret = [s + wrap[0].length, s + wrap[0].length + chosen.length];
    } else if (line) {
      const start = value.lastIndexOf('\n', s - 1) + 1;
      const block = value.slice(start, e) || '';
      const marked = block.split('\n').map((l, i) => (line === '1. ' ? `${i + 1}. ` : line) + l.replace(/^(#{1,4}\s|[-*]\s|\d+\.\s|>\s?)/, '')).join('\n');
      next = value.slice(0, start) + marked + value.slice(e);
      caret = [start + marked.length, start + marked.length];
    } else {
      next = value.slice(0, s) + insert + value.slice(e);
      caret = [s + insert.length, s + insert.length];
    }
    set('body', next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(...caret); });
  };
  const insertImage = (url) => {
    setPicking(false);
    format({ insert: `\n![Describe the picture](${url})\n` });
  };
  const insertVideo = () => {
    const url = window.prompt('Paste a YouTube link');
    if (url) format({ insert: `\n${url.trim()}\n` });
  };

  const addTag = (raw) => {
    const t = raw.replace(/,/g, '').trim();
    if (t && !form.tags.some((x) => x.toLowerCase() === t.toLowerCase()) && form.tags.length < 12) set('tags', [...form.tags, t]);
    setTagDraft('');
  };

  const save = async (patch = {}, message = 'Saved.') => {
    const payload = { ...form, ...patch };
    setBusy(patch.status || 'save');
    try {
      const { data } = post ? await blogAPI.updatePost(post.id, payload) : await blogAPI.createPost(payload);
      const f = toForm(data);
      setPost(data);
      setForm(f);
      setSaved(JSON.stringify(f));
      setSlugTouched(true);
      toast.success(message);
      if (!post) navigate(`/admin/blog/${data.id}`, { replace: true });
    } catch (err) {
      const errs = parseApiErrors(err);
      setErrors(errs);
      toast.error(errs.detail || Object.values(errs)[0] || 'Please check the highlighted fields.');
    } finally {
      setBusy('');
    }
  };

  if (post === undefined) return <PortalLayout title="Blog post"><div className="card panel"><p className="muted">Loading…</p></div></PortalLayout>;
  if (post === false) return <PortalLayout title="Blog post"><div className="card panel"><p>This post doesn’t exist. <Link to="/admin/blog">Back to the blog</Link></p></div></PortalLayout>;

  const state = post?.state || 'draft';
  const when = form.published_at ? new Date(form.published_at) : null;
  const future = when && when > new Date();
  const words = (form.body.match(/\w+/g) || []).length;
  const seoTitle = `${form.seo_title || form.title || 'Post title'} | ${site.name}`;
  const seoText = form.seo_description || form.excerpt || 'Add a short summary so search engines and readers know what this article is about.';
  const live = state === 'published';
  const badge = { published: ['badge--green', 'Published'], scheduled: ['badge--blue', `Scheduled for ${formatDateTime(post?.published_at)}`], draft: ['badge--gray', 'Draft'] }[state];

  return (
    <PortalLayout title={isNew ? 'New post' : 'Edit post'}>
      <div className="be-top">
        <Link to="/admin/blog" className="btn btn--text btn--sm"><i className="fas fa-arrow-left" /> All posts</Link>
        <span className={`badge ${badge[0]}`}>{badge[1]}</span>
        {dirty && <span className="be-unsaved"><i className="fas fa-circle" /> Unsaved changes</span>}
        <span className="be-top__spacer" />
        {live && <a href={`/blog/${post.slug}`} target="_blank" rel="noreferrer" className="btn btn--outline btn--sm"><i className="fas fa-arrow-up-right-from-square" /> View post</a>}
      </div>

      <div className="be-grid">
        <div className="be-main">
          <section className="card be-writer">
            <textarea className="be-title" rows={1} placeholder="Post title" value={form.title} maxLength={200} aria-label="Title" aria-invalid={Boolean(errors.title)}
              onChange={(e) => setTitle(e.target.value)} />
            {errors.title && <small className="ba-error">{errors.title}</small>}
            <textarea className="be-excerpt" rows={2} placeholder="A one or two sentence summary, shown on the blog page and in Google" value={form.excerpt} maxLength={300}
              aria-label="Summary" onChange={(e) => set('excerpt', e.target.value)} />

            <div className="be-toolbar" role="toolbar" aria-label="Formatting">
              <div className="be-modes" role="tablist">
                <button type="button" role="tab" aria-selected={mode === 'write'} className={mode === 'write' ? 'is-active' : ''} onClick={() => setMode('write')}>Write</button>
                <button type="button" role="tab" aria-selected={mode === 'preview'} className={mode === 'preview' ? 'is-active' : ''} onClick={() => setMode('preview')}>Preview</button>
              </div>
              {mode === 'write' && (
                <div className="be-tools">
                  {TOOLS.map(([key, icon, label, action]) => (
                    <button key={key} type="button" title={label} aria-label={label} onClick={() => format(action)}><i className={`fas ${icon}`} /></button>
                  ))}
                  <button type="button" title="Picture" aria-label="Picture" onClick={() => setPicking(true)}><i className="fas fa-image" /></button>
                  <button type="button" title="YouTube video" aria-label="YouTube video" onClick={insertVideo}><i className="fab fa-youtube" /></button>
                </div>
              )}
            </div>
            {mode === 'write' ? (
              <textarea ref={body} className="be-body" value={form.body} aria-label="Article" aria-invalid={Boolean(errors.body)} onChange={(e) => set('body', e.target.value)}
                placeholder={'Start writing…\n\n## A section heading\n\nParagraphs are separated by an empty line. Use the buttons above for headings, bold text, links, lists, quotes, pictures and videos.'} />
            ) : (
              <div className="be-preview prose">{form.body.trim() ? <Markdown source={form.body} /> : <p className="muted">Nothing to preview yet.</p>}</div>
            )}
            {errors.body && <small className="ba-error">{errors.body}</small>}
            <div className="be-stats">{words} words · {readingMinutes(form.body)} min read</div>
          </section>

          <section className="card panel be-seo">
            <h2 className="be-box__title">Search engines & sharing</h2>
            <div className="be-google" aria-label="Google preview">
              <span className="be-google__url">{site.url?.replace(/^https?:\/\//, '') || 'your-website'} › blog › {form.slug || 'post-address'}</span>
              <span className="be-google__title">{seoTitle}</span>
              <span className="be-google__text">{seoText}</span>
            </div>
            <label className="field"><span className="field__label">Search title <small className="muted">({(form.seo_title || form.title).length}/60)</small></span>
              <input className="input" maxLength={150} placeholder={form.title || 'Uses the post title'} value={form.seo_title} onChange={(e) => set('seo_title', e.target.value)} /></label>
            <label className="field"><span className="field__label">Search description <small className="muted">({(form.seo_description || form.excerpt).length}/160)</small></span>
              <textarea className="input" rows={2} maxLength={300} placeholder={form.excerpt || 'Uses the summary'} value={form.seo_description} onChange={(e) => set('seo_description', e.target.value)} /></label>
            <label className="field"><span className="field__label">Web address</span>
              <div className="be-slug"><span>/blog/</span>
                <input className="input" value={form.slug} maxLength={200} aria-invalid={Boolean(errors.slug)}
                  onChange={(e) => { setSlugTouched(true); set('slug', slugify(e.target.value)); }} /></div>
              {errors.slug ? <small className="ba-error">{errors.slug}</small> : live && <small className="hint">Changing the address of a published post breaks links people have shared.</small>}
            </label>
          </section>
        </div>

        <aside className="be-side">
          <section className="card panel be-box">
            <h2 className="be-box__title">Publish</h2>
            <label className="field"><span className="field__label">Publish date</span>
              <input className="input" type="datetime-local" value={toLocal(form.published_at)}
                onChange={(e) => set('published_at', e.target.value ? new Date(e.target.value).toISOString() : null)} />
              <small className="hint">{future ? 'In the future: the post goes live automatically then.' : 'Leave empty to use the moment you publish.'}</small>
              {errors.published_at && <small className="ba-error">{errors.published_at}</small>}
            </label>
            <label className="checkbox">
              <input type="checkbox" checked={form.featured} onChange={(e) => set('featured', e.target.checked)} />
              <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
              <span>Feature at the top of the blog<small>The newest featured post is shown large above the others.</small></span>
            </label>
            <div className="be-actions">
              {state === 'draft' ? (
                <>
                  <button type="button" className="btn btn--outline btn--sm" disabled={Boolean(busy)} onClick={() => save({ status: 'draft' }, 'Draft saved.')}>
                    {busy === 'draft' && <span className="btn-spinner" />} Save draft
                  </button>
                  <button type="button" className="btn btn--primary btn--sm" disabled={Boolean(busy)} onClick={() => save({ status: 'published' }, future ? 'Post scheduled.' : 'Post published.')}>
                    {busy === 'published' ? <span className="btn-spinner" /> : <i className={`fas ${future ? 'fa-clock' : 'fa-paper-plane'}`} />} {future ? 'Schedule' : 'Publish'}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="btn btn--primary btn--sm" disabled={Boolean(busy) || !dirty} onClick={() => save({ status: 'published' }, 'Post updated.')}>
                    {busy === 'published' && <span className="btn-spinner" />} Update
                  </button>
                  <button type="button" className="btn btn--outline btn--sm" disabled={Boolean(busy)} onClick={() => save({ status: 'draft' }, 'Moved back to drafts.')}>Unpublish</button>
                </>
              )}
            </div>
            {post && <p className="be-meta">Created {formatDateTime(post.created_at)}{live && <> · {post.views} views{post.helpful && post.helpful.yes + post.helpful.no > 0 && <> · {post.helpful.yes} of {post.helpful.yes + post.helpful.no} readers found it helpful</>}</>}</p>}
          </section>

          <section className="card panel be-box">
            <h2 className="be-box__title">Cover picture</h2>
            <ImageField field={{ label: 'Shown at the top of the post and on the blog page' }} value={form.cover} onChange={(v) => set('cover', v)} id="be-cover" />
            {errors.cover && <small className="ba-error">{errors.cover}</small>}
            {form.cover && (
              <label className="field"><span className="field__label">Describe the picture</span>
                <input className="input" maxLength={200} placeholder="For screen readers and search engines" value={form.cover_alt} onChange={(e) => set('cover_alt', e.target.value)} /></label>
            )}
          </section>

          <section className="card panel be-box">
            <h2 className="be-box__title">Category & tags</h2>
            <label className="field"><span className="field__label">Category</span>
              <select className="input" value={form.category_id} onChange={(e) => set('category_id', e.target.value ? Number(e.target.value) : '')}>
                <option value="">No category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <small className="hint"><Link to="/admin/blog?tab=categories">Manage categories</Link></small>
            </label>
            <div className="field">
              <label className="field__label" htmlFor="be-tags">Tags</label>
              {form.tags.length > 0 && (
                <ul className="be-tags">{form.tags.map((t) => (
                  <li key={t}>{t}<button type="button" aria-label={`Remove ${t}`} onClick={() => set('tags', form.tags.filter((x) => x !== t))}><i className="fas fa-xmark" /></button></li>
                ))}</ul>
              )}
              <input id="be-tags" className="input" placeholder="Type a tag and press Enter" value={tagDraft} maxLength={40}
                onChange={(e) => (e.target.value.endsWith(',') ? addTag(e.target.value) : setTagDraft(e.target.value))}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagDraft); } }}
                onBlur={() => tagDraft && addTag(tagDraft)} />
            </div>
          </section>

          <section className="card panel be-box">
            <h2 className="be-box__title">Author</h2>
            <label className="field"><span className="field__label">Account</span>
              <select className="input" value={form.author_id} onChange={(e) => set('author_id', e.target.value ? Number(e.target.value) : '')}>
                <option value="">No account</option>
                {authors.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.role})</option>)}
              </select></label>
            <label className="field"><span className="field__label">Name shown instead (optional)</span>
              <input className="input" maxLength={120} placeholder="e.g. The ADRAM Team" value={form.author_name} onChange={(e) => set('author_name', e.target.value)} /></label>
            <label className="field"><span className="field__label">Job title (optional)</span>
              <input className="input" maxLength={120} placeholder="e.g. Head of Training" value={form.author_title} onChange={(e) => set('author_title', e.target.value)} /></label>
          </section>

          {post && (
            <button type="button" className="btn btn--text btn--sm ba-danger be-delete" onClick={async () => {
              if (!window.confirm('Delete this post? This can’t be undone.')) return;
              await blogAPI.removePost(post.id);
              setSaved(JSON.stringify(form));
              toast.success('Post deleted.');
              navigate('/admin/blog');
            }}><i className="fas fa-trash-can" /> Delete post</button>
          )}
        </aside>
      </div>
      {picking && <ImageLibrary current="" onPick={insertImage} onClose={() => setPicking(false)} />}
    </PortalLayout>
  );
};

export default AdminBlogEditorPage;
