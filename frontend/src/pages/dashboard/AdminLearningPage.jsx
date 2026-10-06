import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import PortalLayout from '../../components/layout/PortalLayout';
import BrandIcon from '../../components/brand/BrandIcon';
import { learningAPI } from '../../services/api';

/** Admin → Learning hub: the fields (Networking, Web development...), in the order visitors see them. */
export const AdminLearningPage = () => {
  const navigate = useNavigate();
  const [fields, setFields] = useState(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => learningAPI.manageFields().then(({ data }) => setFields(data.results)).catch(() => setFields([])), []);
  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await learningAPI.createField({ name });
      toast.success('Field created. Now add its topics and notes.');
      navigate(`/admin/learning/${data.id}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not create the field.');
    } finally {
      setBusy(false);
    }
  };
  const move = async (index, by) => {
    const next = [...fields];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    setFields(next);
    try { await learningAPI.reorderFields(next.map((f) => f.id)); } catch { toast.error('Could not save the order.'); load(); }
  };
  const togglePublish = async (f) => {
    try {
      await learningAPI.updateField(f.id, { is_published: !f.is_published });
      toast.success(f.is_published ? 'Hidden from the website.' : 'Published on the Learning hub.');
      load();
    } catch (err) { toast.error(err.response?.data?.detail || 'Could not save.'); }
  };
  const remove = async (f) => {
    if (!window.confirm(`Delete “${f.name}” with all its ${f.topics} topic(s) and ${f.notes} note(s)? This can’t be undone.`)) return;
    await learningAPI.removeField(f.id);
    toast.success('Field deleted.');
    load();
  };

  return (
    <PortalLayout title="Learning hub" subtitle="Free study material organised from zero to hero: fields, their topics at each level, and the notes inside.">
      <div className="lha-head">
        <form className="lha-new" onSubmit={create}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="New field, e.g. Networking" aria-label="New field name" />
          <button type="submit" className="btn btn--primary btn--sm" disabled={!name.trim() || busy}>{busy ? <span className="btn-spinner" /> : <i className="fas fa-plus" />} Add field</button>
        </form>
        <div className="lha-head__links">
          <Link to="/admin/content/learning" className="btn btn--text btn--sm"><i className="fas fa-sliders" /> Page wording & level names</Link>
          <a href="/learning" target="_blank" rel="noreferrer" className="btn btn--outline btn--sm"><i className="fas fa-arrow-up-right-from-square" /> View hub</a>
        </div>
      </div>

      <section className="card lha-help">
        <h2 className="h3">How it is organised</h2>
        <ol>
          <li><strong>Field</strong>: a subject area, such as Networking.</li>
          <li><strong>Level</strong>: every field runs through five stages, from Zero (complete beginners) to Hero (experts).</li>
          <li><strong>Topic</strong>: a group of notes at one level, such as “IP addressing &amp; subnetting”.</li>
          <li><strong>Note</strong>: the material itself (a note, research note, hands-on lab or cheat sheet), with links, videos and files.</li>
        </ol>
      </section>

      {!fields ? <div className="card panel"><div className="skeleton skeleton--block" /></div> : fields.length === 0 ? (
        <div className="card lha-empty">
          <i className="fas fa-book-open-reader" aria-hidden="true" />
          <p>No fields yet. Add the first one above, e.g. <strong>Networking</strong>.</p>
        </div>
      ) : (
        <ul className="lha-fields">
          {fields.map((f, i) => (
            <li key={f.id} className="card lha-field">
              <Link to={`/admin/learning/${f.id}`} className="lha-field__main">
                <span className="lha-field__icon"><BrandIcon name={f.icon || 'network'} size={26} /></span>
                <span className="lha-field__text">
                  <strong>{f.name}</strong>
                  <small>{f.topics} topic{f.topics === 1 ? '' : 's'} · {f.published_notes} of {f.notes} note{f.notes === 1 ? '' : 's'} published</small>
                </span>
              </Link>
              {f.is_published && f.published_notes === 0
                ? <span className="badge badge--amber" title="Publish at least one note so visitors can see this field">Not visible yet: no published notes</span>
                : <span className={`badge ${f.is_published ? 'badge--green' : 'badge--gray'}`}>{f.is_published ? 'Published' : 'Hidden'}</span>}
              <span className="lha-tools">
                <button type="button" className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${f.name} up`} title="Move up"><i className="fas fa-arrow-up" /></button>
                <button type="button" className="icon-btn" disabled={i === fields.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${f.name} down`} title="Move down"><i className="fas fa-arrow-down" /></button>
                <button type="button" className="icon-btn" onClick={() => togglePublish(f)} aria-label={f.is_published ? `Hide ${f.name}` : `Publish ${f.name}`} title={f.is_published ? 'Hide' : 'Publish'}>
                  <i className={`fas ${f.is_published ? 'fa-eye-slash' : 'fa-paper-plane'}`} />
                </button>
                <Link to={`/admin/learning/${f.id}`} className="icon-btn" aria-label={`Edit ${f.name}`} title="Edit"><i className="fas fa-pen" /></Link>
                <button type="button" className="icon-btn lha-danger" onClick={() => remove(f)} aria-label={`Delete ${f.name}`} title="Delete"><i className="fas fa-trash-can" /></button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </PortalLayout>
  );
};

export default AdminLearningPage;
