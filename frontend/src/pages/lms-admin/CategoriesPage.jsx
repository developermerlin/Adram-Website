import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { lmsAdminAPI, parseApiErrors } from '../../services/api';
import PortalLayout from '../../components/layout/PortalLayout';
import { Alert, TextField } from '../../components/ui/Form';
import ConfirmDialog from '../../components/admin/ConfirmDialog';
import { ImageField } from '../../components/admin/contentFields';
import BrandIcon from '../../components/brand/BrandIcon';
import { assetUrl } from '../../utils/assets';
import '../../styles/lms-admin.css';

const BLANK = { id: null, name: '', slug: '', parent: '', description: '', icon: '', image: '', sort_order: 0, is_active: true };

const Row = ({ c, child, onEdit, onDelete }) => (
  <div className={`la-tree__row${child ? ' la-tree__row--child' : ''}`}>
    <span className="la-tree__icon">{c.image ? <img src={assetUrl(c.image)} alt="" /> : c.icon ? <BrandIcon name={c.icon} size={20} /> : <i className="fas fa-folder" aria-hidden="true" />}</span>
    <div className="la-tree__main">
      <strong>{c.name} {!c.is_active && <span className="badge badge--gray">Hidden</span>}</strong>
      <small className="muted">/{c.slug} · {c.course_count} published course{c.course_count === 1 ? '' : 's'}</small>
    </div>
    <div className="la-actions">
      <button type="button" className="btn btn--outline btn--sm" onClick={() => onEdit(c)}>Edit</button>
      <button type="button" className="icon-btn icon-btn--danger" aria-label={`Delete ${c.name}`} onClick={() => onDelete(c)}><i className="fas fa-trash-can" /></button>
    </div>
  </div>
);

/** Categories and subcategories students browse courses by. */
export const CategoriesPage = () => {
  const [tree, setTree] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(() => lmsAdminAPI.categories().then(({ data }) => setTree(data)).catch(() => setError('The categories could not be loaded.')), []);
  useEffect(() => {
    load();
  }, [load]);

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const input = (key) => ({ name: key, value: form[key] ?? '', error: errors[key], onChange: (e) => set(key)(e.target.value) });
  const edit = (c) => {
    setForm({ ...BLANK, ...c, parent: c.parent || '' });
    setErrors({});
  };
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { ...form, parent: form.parent || null, sort_order: Number(form.sort_order) || 0 };
      delete body.id;
      delete body.children;
      delete body.course_count;
      await lmsAdminAPI.saveCategory(form.id, body);
      toast.success(form.id ? 'Category saved' : 'Category created');
      setForm(BLANK);
      setErrors({});
      load();
    } catch (err) {
      setErrors(parseApiErrors(err));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    try {
      await lmsAdminAPI.removeCategory(deleting.id);
      toast.success('Category deleted');
      if (form.id === deleting.id) setForm(BLANK);
      load();
    } catch {
      toast.error('The category could not be deleted.');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <PortalLayout title="Categories" subtitle="How courses are grouped on the Training page, in search and in filters.">
      <div className="la-page">
        <Alert>{error}</Alert>
        <div className="la-cats">
          <section className="card">
            {!tree && !error && <div className="skeleton skeleton--block" />}
            {tree && tree.length === 0 && <div className="la-empty"><i className="fas fa-folder-tree" /><strong>No categories yet</strong><p>Create a few top-level categories (e.g. Technology, Business, Design), then subcategories inside them.</p></div>}
            <ul className="la-tree">
              {tree?.map((c) => (
                <li key={c.id}>
                  <Row c={c} onEdit={edit} onDelete={setDeleting} />
                  {c.children.length > 0 && <ul>{c.children.map((k) => <li key={k.id}><Row c={k} child onEdit={edit} onDelete={setDeleting} /></li>)}</ul>}
                </li>
              ))}
            </ul>
          </section>

          <form className="card panel la-cats__form la-form" onSubmit={save} noValidate>
            <h2 className="h3">{form.id ? `Edit “${form.name}”` : 'New category'}</h2>
            <TextField label="Name" required maxLength={80} {...input('name')} />
            <div className="field">
              <label htmlFor="cat-parent">Parent</label>
              <select id="cat-parent" className="input" value={form.parent} onChange={(e) => set('parent')(e.target.value)}>
                <option value="">None: a top-level category</option>
                {(tree || []).filter((c) => c.id !== form.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {errors.parent ? <p className="field-error">{errors.parent}</p> : <p className="hint">Choose a parent to make this a subcategory.</p>}
            </div>
            <div className="field">
              <label htmlFor="cat-desc">Description</label>
              <textarea id="cat-desc" className="input" rows={3} maxLength={2000} value={form.description} onChange={(e) => set('description')(e.target.value)} />
            </div>
            <div className="form-row">
              <TextField label="Web address (slug)" maxLength={90} hint="Blank = made from the name." {...input('slug')} />
              <TextField label="Icon name" maxLength={30} hint="A brand icon, e.g. web, ai, design." {...input('icon')} />
            </div>
            <ImageField field={{ label: 'Image (optional)' }} value={form.image || ''} onChange={set('image')} id="cat-image" />
            <div className="form-row">
              <TextField label="Order" type="number" min="0" {...input('sort_order')} />
            </div>
            <label className="la-inline-check"><input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active')(e.target.checked)} /> Show on the website</label>
            <Alert>{errors.form}</Alert>
            <div className="la-form__actions">
              <button type="submit" className="btn btn--primary" disabled={busy || !form.name.trim()}>{busy ? <span className="btn-spinner" /> : null} {form.id ? 'Save category' : 'Create category'}</button>
              {form.id && <button type="button" className="btn btn--text" onClick={() => setForm(BLANK)}>Cancel</button>}
            </div>
          </form>
        </div>
      </div>
      {deleting && (
        <ConfirmDialog config={{ title: `Delete “${deleting.name}”?`, text: deleting.parent ? 'Courses in this subcategory keep working; they just lose the subcategory.' : 'Its subcategories are deleted too. Courses keep working; they just lose the category.', confirm: 'Delete' }}
          onClose={() => setDeleting(null)} onConfirm={remove} />
      )}
    </PortalLayout>
  );
};

export default CategoriesPage;
