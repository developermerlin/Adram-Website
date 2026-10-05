import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import PortalLayout from '../../components/layout/PortalLayout';
import { blogAPI, parseApiErrors } from '../../services/api';
import { assetUrl } from '../../utils/assets';
import { formatDate } from '../../utils/format';
import '../../styles/blog-admin.css';

const STATES = [['', 'All'], ['published', 'Published'], ['scheduled', 'Scheduled'], ['draft', 'Drafts']];
const BADGE = { published: ['badge--green', 'Published'], scheduled: ['badge--blue', 'Scheduled'], draft: ['badge--gray', 'Draft'] };

const Posts = () => {
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);
  const load = useCallback(() => blogAPI.managePosts({ status: status || undefined, q: search || undefined })
    .then(({ data: d }) => setData(d)).catch(() => toast.error('Could not load the posts.')), [status, search]);
  useEffect(() => {
    load();
  }, [load]);

  const remove = async (post) => {
    if (!window.confirm(`Delete “${post.title}”? This can’t be undone.`)) return;
    await blogAPI.removePost(post.id);
    toast.success('Post deleted.');
    load();
  };

  return (
    <section className="card table-card">
      <div className="ba-toolbar">
        <div className="ba-search">
          <i className="fas fa-magnifying-glass" aria-hidden="true" />
          <input className="input" type="search" placeholder="Search posts" aria-label="Search posts" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="ba-filters" role="tablist" aria-label="Filter by status">
          {STATES.map(([id, label]) => (
            <button key={id || 'all'} type="button" role="tab" aria-selected={status === id} className={`ba-filter${status === id ? ' is-active' : ''}`} onClick={() => setStatus(id)}>
              {label}{data && <span className="ba-filter__count">{data.counts[id || 'all']}</span>}
            </button>
          ))}
        </div>
        <Link to="/admin/blog/new" className="btn btn--primary btn--sm ba-toolbar__new"><i className="fas fa-pen" /> New post</Link>
      </div>
      {!data ? <p className="muted ba-pad">Loading…</p> : data.results.length === 0 ? (
        <div className="ba-empty">
          <i className="fas fa-pen-nib" aria-hidden="true" />
          <p>{search || status ? 'No posts match.' : 'No posts yet. Write your first article.'}</p>
          {!search && !status && <Link to="/admin/blog/new" className="btn btn--primary btn--sm">Write a post</Link>}
        </div>
      ) : (
        <div className="table-scroll">
          <table className="table ba-table">
            <thead><tr><th>Post</th><th>Status</th><th>Category</th><th>Date</th><th className="num">Views</th><th className="num">Helpful</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {data.results.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link to={`/admin/blog/${p.id}`} className="ba-post">
                      {p.cover ? <img src={assetUrl(p.cover)} alt="" /> : <span className="ba-post__blank"><i className="fas fa-image" /></span>}
                      <span><strong>{p.title}</strong><small>By {p.author.name}{p.featured && <> · <i className="fas fa-star" /> Featured</>} · /blog/{p.slug}</small></span>
                    </Link>
                  </td>
                  <td><span className={`badge ${BADGE[p.state][0]}`}>{BADGE[p.state][1]}</span></td>
                  <td>{p.category?.name || <span className="muted">—</span>}</td>
                  <td>{p.state === 'draft' ? <span className="muted">Edited {formatDate(p.updated_at)}</span> : formatDate(p.published_at)}</td>
                  <td className="num">{p.views}</td>
                  <td className="num" title={p.helpful ? `${p.helpful.yes} yes · ${p.helpful.no} no` : ''}>
                    {p.helpful && p.helpful.yes + p.helpful.no > 0 ? `${Math.round((p.helpful.yes / (p.helpful.yes + p.helpful.no)) * 100)}% (${p.helpful.yes + p.helpful.no})` : '—'}
                  </td>
                  <td className="ba-actions">
                    <Link to={`/admin/blog/${p.id}`} className="btn btn--text btn--sm">Edit</Link>
                    {p.state === 'published' && <a href={p.url} target="_blank" rel="noreferrer" className="btn btn--text btn--sm" aria-label={`View ${p.title}`}><i className="fas fa-arrow-up-right-from-square" /></a>}
                    <button type="button" className="btn btn--text btn--sm ba-danger" aria-label={`Delete ${p.title}`} onClick={() => remove(p)}><i className="fas fa-trash-can" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

const CategoryRow = ({ cat, onChanged }) => {
  const [form, setForm] = useState({ name: cat.name, description: cat.description });
  const [error, setError] = useState('');
  const dirty = form.name !== cat.name || form.description !== cat.description;
  const save = async () => {
    try {
      await blogAPI.updateCategory(cat.id, form);
      setError('');
      toast.success('Category saved.');
      onChanged();
    } catch (err) {
      setError(parseApiErrors(err).name || 'Could not save.');
    }
  };
  const remove = async () => {
    if (!window.confirm(`Delete the category “${cat.name}”? Its ${cat.count} post(s) stay, without a category.`)) return;
    await blogAPI.removeCategory(cat.id);
    onChanged();
  };
  return (
    <li className="ba-cat">
      <input className="input" aria-label="Category name" value={form.name} maxLength={60} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
      <input className="input" aria-label="Description" placeholder="Short description (optional)" value={form.description} maxLength={200}
        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
      <span className="ba-cat__count">{cat.count} post{cat.count === 1 ? '' : 's'}</span>
      <span className="ba-cat__actions">
        <button type="button" className="btn btn--outline btn--sm" disabled={!dirty} onClick={save}>Save</button>
        <button type="button" className="btn btn--text btn--sm ba-danger" aria-label={`Delete ${cat.name}`} onClick={remove}><i className="fas fa-trash-can" /></button>
      </span>
      {error && <small className="ba-error">{error}</small>}
    </li>
  );
};

const Categories = () => {
  const [list, setList] = useState(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(() => blogAPI.manageCategories().then(({ data }) => setList(data)).catch(() => setList([])), []);
  useEffect(() => {
    load();
  }, [load]);
  const add = async (e) => {
    e.preventDefault();
    try {
      await blogAPI.createCategory({ name });
      setName('');
      setError('');
      load();
    } catch (err) {
      setError(parseApiErrors(err).name || 'Could not add.');
    }
  };
  return (
    <section className="card panel ba-cats">
      <div>
        <h2 className="h3">Categories</h2>
        <p className="muted small">Readers filter the blog by these. Categories without published posts are hidden on the website.</p>
      </div>
      <form className="ba-cats__add" onSubmit={add}>
        <input className="input" placeholder="New category, e.g. Tech tips" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-label="New category name" />
        <button type="submit" className="btn btn--primary btn--sm" disabled={!name.trim()}><i className="fas fa-plus" /> Add category</button>
      </form>
      {error && <small className="ba-error">{error}</small>}
      {!list ? <p className="muted">Loading…</p> : list.length === 0 ? <p className="muted">No categories yet.</p> : (
        <ul className="ba-cats__list">{list.map((c) => <CategoryRow key={`${c.id}-${c.name}-${c.description}`} cat={c} onChanged={load} />)}</ul>
      )}
    </section>
  );
};

/** Admin → Blog: the posts, the categories, and a link to the page wording in Site content. */
export const AdminBlogPage = () => {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'categories' ? 'categories' : 'posts';
  return (
    <PortalLayout title="Blog" subtitle="Write, schedule and publish articles for the blog on your website.">
      <div className="ba-head">
        <div className="tabs" role="tablist" aria-label="Blog">
          <button type="button" role="tab" aria-selected={tab === 'posts'} className={`tabs__tab${tab === 'posts' ? ' is-active' : ''}`} onClick={() => setParams({})}>
            <i className="fas fa-file-lines" aria-hidden="true" /> Posts
          </button>
          <button type="button" role="tab" aria-selected={tab === 'categories'} className={`tabs__tab${tab === 'categories' ? ' is-active' : ''}`} onClick={() => setParams({ tab: 'categories' })}>
            <i className="fas fa-folder" aria-hidden="true" /> Categories
          </button>
        </div>
        <div className="ba-head__links">
          <Link to="/admin/content/blog" className="btn btn--text btn--sm"><i className="fas fa-sliders" /> Page heading & menu</Link>
          <a href="/blog" target="_blank" rel="noreferrer" className="btn btn--outline btn--sm"><i className="fas fa-arrow-up-right-from-square" /> View blog</a>
        </div>
      </div>
      {tab === 'posts' ? <Posts /> : <Categories />}
    </PortalLayout>
  );
};

export default AdminBlogPage;
