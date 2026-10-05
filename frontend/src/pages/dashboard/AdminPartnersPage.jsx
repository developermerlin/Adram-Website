import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import PortalLayout from '../../components/layout/PortalLayout';
import { ImageField } from '../../components/admin/contentFields';
import { partnersAPI, parseApiErrors } from '../../services/api';
import { assetUrl } from '../../utils/assets';
import { formatDateTime } from '../../utils/format';
import '../../styles/partners-admin.css';

const BLANK = { name: '', logo: '', website: '', group_id: '', description: '', since: '', featured: false, quote: '', quote_author: '', quote_role: '', visible: true };

/** Add or edit one partner. */
const PartnerForm = ({ partner, groups, onSaved, onClose }) => {
  const [form, setForm] = useState(partner ? { ...BLANK, ...partner, group_id: partner.group_id || '', since: partner.since || '' } : BLANK);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (key) => (value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (partner) await partnersAPI.updatePartner(partner.id, form);
      else await partnersAPI.createPartner(form);
      toast.success(partner ? 'Partner saved.' : 'Partner added.');
      onSaved();
    } catch (err) {
      setErrors(parseApiErrors(err));
    } finally {
      setBusy(false);
    }
  };
  const input = (key, label, props = {}) => (
    <label className="field"><span className="field__label">{label}</span>
      <input className="input" value={form[key] ?? ''} aria-invalid={Boolean(errors[key])} onChange={(e) => set(key)(e.target.value)} {...props} />
      {errors[key] && <small className="pa-error">{errors[key]}</small>}
    </label>
  );
  return (
    <form className="card panel pa-form" onSubmit={save}>
      <div className="pa-form__head">
        <h2 className="pa-title">{partner ? `Edit ${partner.name}` : 'Add a partner'}</h2>
        <button type="button" className="btn btn--text btn--sm" onClick={onClose}>Close</button>
      </div>
      <div className="pa-form__grid">
        <div className="pa-form__col">
          {input('name', 'Name', { maxLength: 120, required: true })}
          {input('website', 'Website (optional)', { placeholder: 'partner.com', maxLength: 300 })}
          <label className="field"><span className="field__label">Group</span>
            <select className="input" value={form.group_id} onChange={(e) => set('group_id')(e.target.value ? Number(e.target.value) : '')}>
              <option value="">No group</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
          <label className="field"><span className="field__label">About the partnership (optional)</span>
            <textarea className="input" rows={3} maxLength={400} value={form.description} onChange={(e) => set('description')(e.target.value)}
              placeholder="e.g. Provides internships for our web development graduates." /></label>
          {input('since', 'Partner since (year, optional)', { type: 'number', min: 1950, max: 2100, placeholder: '2023' })}
        </div>
        <div className="pa-form__col">
          <ImageField field={{ label: 'Logo', hint: 'A PNG with a transparent background looks best.' }} value={form.logo} onChange={set('logo')} id="pa-logo" />
          {errors.logo && <small className="pa-error">{errors.logo}</small>}
          <label className="checkbox">
            <input type="checkbox" checked={form.visible} onChange={(e) => set('visible')(e.target.checked)} />
            <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
            <span>Show on the Partners page</span>
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={form.featured} onChange={(e) => set('featured')(e.target.checked)} />
            <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
            <span>Feature with a quote<small>Shown in “What our partners say”.</small></span>
          </label>
          {form.featured && (
            <>
              <label className="field"><span className="field__label">Quote</span>
                <textarea className="input" rows={3} maxLength={600} value={form.quote} aria-invalid={Boolean(errors.quote)} onChange={(e) => set('quote')(e.target.value)} />
                {errors.quote && <small className="pa-error">{errors.quote}</small>}
              </label>
              <div className="form-row">
                {input('quote_author', 'Who said it', { maxLength: 120 })}
                {input('quote_role', 'Their job title', { maxLength: 120 })}
              </div>
            </>
          )}
        </div>
      </div>
      <div><button type="submit" className="btn btn--primary btn--sm" disabled={busy}>{busy && <span className="btn-spinner" />} {partner ? 'Save partner' : 'Add partner'}</button></div>
    </form>
  );
};

const Partners = () => {
  const [list, setList] = useState(null);
  const [groups, setGroups] = useState([]);
  const [editing, setEditing] = useState(null); // null, 'new' or a partner
  const load = useCallback(() => Promise.all([partnersAPI.managePartners(), partnersAPI.groups()])
    .then(([p, g]) => { setList(p.data); setGroups(g.data); }).catch(() => toast.error('Could not load partners.')), []);
  useEffect(() => {
    load();
  }, [load]);

  const move = async (index, step) => {
    const next = [...list];
    [next[index], next[index + step]] = [next[index + step], next[index]];
    setList(next);
    await partnersAPI.reorder(next.map((p) => p.id));
  };
  const toggle = async (p, key) => {
    try {
      await partnersAPI.updatePartner(p.id, { [key]: !p[key] });
      load();
    } catch (err) {
      toast.error(Object.values(parseApiErrors(err))[0] || 'Could not change it.');
    }
  };
  const remove = async (p) => {
    if (!window.confirm(`Remove ${p.name} from the Partners page?`)) return;
    await partnersAPI.removePartner(p.id);
    toast.success(`${p.name} removed.`);
    load();
  };

  return (
    <div className="pa-stack">
      {editing && <PartnerForm key={editing === 'new' ? 'new' : editing.id} partner={editing === 'new' ? null : editing} groups={groups}
        onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      <section className="card table-card">
        <div className="pa-toolbar">
          <div><h2 className="pa-title">Partners</h2><p className="muted small">Shown on the Partners page in this order. Use the arrows to change it.</p></div>
          <button type="button" className="btn btn--primary btn--sm" onClick={() => setEditing('new')}><i className="fas fa-plus" /> Add partner</button>
        </div>
        {!list ? <p className="muted pa-pad">Loading…</p> : list.length === 0 ? (
          <div className="pa-empty"><i className="fas fa-handshake" aria-hidden="true" /><p>No partners yet. Add the organisations you work with.</p></div>
        ) : (
          <ul className="pa-list">
            {list.map((p, i) => (
              <li key={p.id} className={`pa-row${p.visible ? '' : ' is-hidden'}`}>
                <span className="pa-order">
                  <button type="button" aria-label={`Move ${p.name} up`} disabled={i === 0} onClick={() => move(i, -1)}><i className="fas fa-chevron-up" /></button>
                  <button type="button" aria-label={`Move ${p.name} down`} disabled={i === list.length - 1} onClick={() => move(i, 1)}><i className="fas fa-chevron-down" /></button>
                </span>
                <span className="pa-logo">{p.logo ? <img src={assetUrl(p.logo)} alt="" /> : <span>{p.name.slice(0, 2)}</span>}</span>
                <span className="pa-row__main">
                  <strong>{p.name}</strong>
                  <small>{[p.group || 'No group', p.website && p.website.replace(/^https?:\/\//, '')].filter(Boolean).join(' · ')}</small>
                </span>
                <span className="pa-row__flags">
                  {p.featured && <span className="badge badge--blue"><i className="fas fa-quote-left" /> Featured</span>}
                  {!p.visible && <span className="badge badge--gray">Hidden</span>}
                </span>
                <span className="pa-row__actions">
                  <button type="button" className="btn btn--text btn--sm" onClick={() => toggle(p, 'visible')}>{p.visible ? 'Hide' : 'Show'}</button>
                  <button type="button" className="btn btn--text btn--sm" onClick={() => setEditing(p)}>Edit</button>
                  <button type="button" className="btn btn--text btn--sm pa-danger" aria-label={`Remove ${p.name}`} onClick={() => remove(p)}><i className="fas fa-trash-can" /></button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

const GroupRow = ({ g, onChanged }) => {
  const [form, setForm] = useState({ name: g.name, description: g.description });
  const dirty = form.name !== g.name || form.description !== g.description;
  const save = async () => {
    try {
      await partnersAPI.updateGroup(g.id, form);
      toast.success('Group saved.');
      onChanged();
    } catch (err) {
      toast.error(parseApiErrors(err).name || 'Could not save.');
    }
  };
  const remove = async () => {
    if (!window.confirm(`Delete the group “${g.name}”? Its partners stay, without a group.`)) return;
    await partnersAPI.removeGroup(g.id);
    onChanged();
  };
  return (
    <li className="pa-group">
      <input className="input" aria-label="Group name" value={form.name} maxLength={80} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
      <input className="input" aria-label="Description" placeholder="Short description (optional)" value={form.description} maxLength={240}
        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
      <span className="muted small">{g.count} partner{g.count === 1 ? '' : 's'}</span>
      <span className="pa-group__actions">
        <button type="button" className="btn btn--outline btn--sm" disabled={!dirty} onClick={save}>Save</button>
        <button type="button" className="btn btn--text btn--sm pa-danger" aria-label={`Delete ${g.name}`} onClick={remove}><i className="fas fa-trash-can" /></button>
      </span>
    </li>
  );
};

const Groups = () => {
  const [list, setList] = useState(null);
  const [name, setName] = useState('');
  const load = useCallback(() => partnersAPI.groups().then(({ data }) => setList(data)).catch(() => setList([])), []);
  useEffect(() => {
    load();
  }, [load]);
  const add = async (e) => {
    e.preventDefault();
    try {
      await partnersAPI.createGroup({ name });
      setName('');
      load();
    } catch (err) {
      toast.error(parseApiErrors(err).name || 'Could not add.');
    }
  };
  return (
    <section className="card panel pa-groups">
      <div><h2 className="pa-title">Groups</h2><p className="muted small">Sections of the Partners page, e.g. Technology partners, Education partners, Clients. Groups without partners are hidden.</p></div>
      <form className="pa-groups__add" onSubmit={add}>
        <input className="input" placeholder="New group, e.g. Technology partners" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-label="New group name" />
        <button type="submit" className="btn btn--primary btn--sm" disabled={!name.trim()}><i className="fas fa-plus" /> Add group</button>
      </form>
      {!list ? <p className="muted">Loading…</p> : list.length === 0 ? <p className="muted">No groups yet. Partners without a group are shown together.</p> : (
        <ul className="pa-groups__list">{list.map((g) => <GroupRow key={`${g.id}-${g.name}-${g.description}`} g={g} onChanged={load} />)}</ul>
      )}
    </section>
  );
};

const STATUSES = [['new', 'New', 'badge--blue'], ['contacted', 'Contacted', 'badge--amber'], ['approved', 'Approved', 'badge--green'], ['declined', 'Declined', 'badge--gray']];

const Applications = () => {
  const [filter, setFilter] = useState('');
  const [data, setData] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [notes, setNotes] = useState('');
  const load = useCallback(() => partnersAPI.applications({ status: filter || undefined }).then(({ data: d }) => setData(d)).catch(() => toast.error('Could not load applications.')), [filter]);
  useEffect(() => {
    load();
  }, [load]);
  const open = data?.results.find((a) => a.id === openId) || data?.results[0];
  const select = (a) => { setOpenId(a.id); setNotes(a.notes); };
  const update = async (patch, message) => {
    await partnersAPI.updateApplication(open.id, patch);
    toast.success(message);
    load();
  };
  const remove = async () => {
    if (!window.confirm(`Delete the application from ${open.organisation}?`)) return;
    await partnersAPI.removeApplication(open.id);
    setOpenId(null);
    load();
  };
  const tone = (s) => STATUSES.find((x) => x[0] === s) || STATUSES[0];

  return (
    <section className="card pa-inbox">
      <div className="pa-inbox__filters" role="tablist" aria-label="Filter applications">
        <button type="button" role="tab" aria-selected={!filter} className={`pa-filter${!filter ? ' is-active' : ''}`} onClick={() => setFilter('')}>All</button>
        {STATUSES.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={filter === id} className={`pa-filter${filter === id ? ' is-active' : ''}`} onClick={() => setFilter(id)}>
            {label}{data && <span>{data.counts[id]}</span>}
          </button>
        ))}
      </div>
      {!data ? <p className="muted pa-pad">Loading…</p> : data.results.length === 0 ? (
        <div className="pa-empty"><i className="fas fa-inbox" aria-hidden="true" /><p>No applications{filter ? ' here' : ' yet. They arrive from the form on the Partners page'}.</p></div>
      ) : (
        <div className="pa-inbox__body">
          <ul className="pa-inbox__list">
            {data.results.map((a) => (
              <li key={a.id}>
                <button type="button" className={`pa-app${open?.id === a.id ? ' is-open' : ''}`} onClick={() => select(a)}>
                  <span className="pa-app__top"><strong>{a.organisation}</strong><span className={`badge ${tone(a.status)[2]}`}>{a.status_display}</span></span>
                  <span className="pa-app__meta">{a.contact_name} · {formatDateTime(a.created_at)}</span>
                  <span className="pa-app__preview">{a.message}</span>
                </button>
              </li>
            ))}
          </ul>
          {open && (
            <article className="pa-detail" key={open.id}>
              <header>
                <h3>{open.organisation}</h3>
                <p className="muted small">Received {formatDateTime(open.created_at)}{open.partnership_type && <> · {open.partnership_type}</>}</p>
              </header>
              <dl className="pa-detail__facts">
                <div><dt>Contact</dt><dd>{open.contact_name}</dd></div>
                <div><dt>Email</dt><dd><a href={`mailto:${open.email}`}>{open.email}</a></dd></div>
                {open.phone && <div><dt>Phone</dt><dd><a href={`tel:${open.phone}`}>{open.phone}</a></dd></div>}
                {open.website && <div><dt>Website</dt><dd><a href={open.website} target="_blank" rel="noreferrer">{open.website.replace(/^https?:\/\//, '')}</a></dd></div>}
              </dl>
              <p className="pa-detail__message">{open.message}</p>
              <div className="pa-detail__status">
                <span className="field__label">Status</span>
                <div className="pa-detail__chips">
                  {STATUSES.map(([id, label]) => (
                    <button key={id} type="button" className={`pa-filter${open.status === id ? ' is-active' : ''}`} onClick={() => update({ status: id }, `Marked as ${label.toLowerCase()}.`)}>{label}</button>
                  ))}
                </div>
              </div>
              <label className="field"><span className="field__label">Private notes</span>
                <textarea className="input" rows={3} value={openId === open.id ? notes : open.notes} onFocus={() => openId !== open.id && select(open)}
                  onChange={(e) => { setOpenId(open.id); setNotes(e.target.value); }} placeholder="Only your team sees these." /></label>
              <div className="pa-detail__actions">
                <a className="btn btn--primary btn--sm" href={`mailto:${open.email}?subject=${encodeURIComponent(`Partnership with ADRAM Technologies`)}`}><i className="fas fa-reply" /> Reply by email</a>
                <button type="button" className="btn btn--outline btn--sm" disabled={openId !== open.id || notes === open.notes} onClick={() => update({ notes }, 'Notes saved.')}>Save notes</button>
                <button type="button" className="btn btn--text btn--sm pa-danger" onClick={remove}><i className="fas fa-trash-can" /> Delete</button>
              </div>
            </article>
          )}
        </div>
      )}
    </section>
  );
};

const TABS = [['partners', 'Partners', 'fa-handshake'], ['groups', 'Groups', 'fa-layer-group'], ['applications', 'Applications', 'fa-inbox']];

/** Admin → Partners: the partners on the Partners page, their groups, and applications to become one. */
export const AdminPartnersPage = () => {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([id]) => id === params.get('tab')) ? params.get('tab') : 'partners';
  return (
    <PortalLayout title="Partners" subtitle="The organisations shown on your Partners page, and applications from those who want to partner with you.">
      <div className="pa-head">
        <div className="tabs" role="tablist" aria-label="Partners">
          {TABS.map(([id, label, icon]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={`tabs__tab${tab === id ? ' is-active' : ''}`} onClick={() => setParams(id === 'partners' ? {} : { tab: id })}>
              <i className={`fas ${icon}`} aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
        <div className="pa-head__links">
          <Link to="/admin/content/partners" className="btn btn--text btn--sm"><i className="fas fa-sliders" /> Page wording</Link>
          <a href="/partners" target="_blank" rel="noreferrer" className="btn btn--outline btn--sm"><i className="fas fa-arrow-up-right-from-square" /> View page</a>
        </div>
      </div>
      {tab === 'partners' && <Partners />}
      {tab === 'groups' && <Groups />}
      {tab === 'applications' && <Applications />}
    </PortalLayout>
  );
};

export default AdminPartnersPage;
