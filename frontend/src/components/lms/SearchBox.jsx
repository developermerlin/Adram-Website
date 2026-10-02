import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { lmsAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { assetUrl } from '../../utils/assets';
import BrandIcon from '../brand/BrandIcon';
import '../../styles/search.css';

const TOPIC_ICON = { category: 'fa-folder', subcategory: 'fa-folder-open', topic: 'fa-tag' };

/**
 * The catalogue's search box. While typing it suggests courses, topics and instructors (and "Did you mean…");
 * when empty it offers recent, popular and saved searches. `onSearch(q)` runs a search; `onApply(params, replace)` applies
 * a topic's or instructor's filters, or replaces all filters with a saved search's.
 */
const SearchBox = ({ value, onChange, onSearch, onApply }) => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const listId = useId();
  const box = useRef(null);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [active, setActive] = useState(-1);
  const q = value.trim();

  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    const t = setTimeout(() => lmsAPI.suggest(q).then(({ data: d }) => live && setData({ q, ...d })).catch(() => {}), q ? 200 : 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, open]);
  useEffect(() => {
    const close = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  // One flat list of choices, for the keyboard (up/down/enter)
  const fresh = data && data.q === q;
  const items = [];
  if (fresh && q) {
    if (data.did_you_mean) items.push({ key: 'dym', run: () => { onChange(data.did_you_mean); onSearch(data.did_you_mean); } });
    data.courses?.forEach((c) => items.push({ key: `c${c.slug}`, course: c, run: () => navigate(`/courses/${c.slug}`) }));
    data.topics?.forEach((t) => items.push({
      key: `t${t.kind}${t.label}`, topic: t,
      run: () => (t.params.topic ? navigate(`/topics/${t.params.topic}`) : onApply(t.params)), // a topic has its own page
    }));
    data.instructors?.forEach((i) => items.push({ key: `i${i.id}`, instructor: i, run: () => { onChange(''); onApply({ instructor: String(i.id), q: '' }); } }));
  }
  if (fresh && !q) {
    data.saved?.forEach((s) => items.push({ key: `s${s.id}`, saved: s, run: () => { onChange(s.params.q || ''); onApply({ ...s.params }, true); } }));
    data.recent?.forEach((r) => items.push({ key: `r${r}`, recent: r, run: () => { onChange(r); onSearch(r); } }));
    data.popular?.filter((p) => !data.recent?.includes(p)).forEach((p) => items.push({ key: `p${p}`, popular: p, run: () => { onChange(p); onSearch(p); } }));
  }
  const pick = (item) => {
    setOpen(false);
    setActive(-1);
    item.run();
  };
  const onKey = (e) => {
    if (e.key === 'ArrowDown' && items.length) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % items.length);
    } else if (e.key === 'ArrowUp' && items.length) {
      e.preventDefault();
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'Enter' && open && active >= 0 && items[active]) {
      e.preventDefault();
      pick(items[active]);
    }
  };
  const submit = (e) => {
    e.preventDefault();
    setOpen(false);
    onSearch(q);
  };
  const clearRecent = async () => {
    await lmsAPI.clearSearches().catch(() => {});
    setData((d) => (d ? { ...d, recent: [] } : d));
  };
  const removeSaved = async (id) => {
    await lmsAPI.deleteSavedSearch(id).catch(() => toast.error('That search could not be deleted.'));
    setData((d) => (d ? { ...d, saved: d.saved.filter((s) => s.id !== id) } : d));
  };

  const row = (item, i, content) => (
    <li key={item.key} id={`${listId}-${i}`} role="option" aria-selected={active === i} className={`sb-item${active === i ? ' is-active' : ''}`}
      onPointerDown={(e) => e.preventDefault()} onClick={() => pick(item)} onPointerEnter={() => setActive(i)}>
      {content}
    </li>
  );
  const section = (title, list, render, extra) => (list.length > 0 && (
    <div className="sb-section">
      <div className="sb-section__head"><span>{title}</span>{extra}</div>
      <ul role="presentation">{list.map((item) => render(item, items.indexOf(item)))}</ul>
    </div>
  ));
  const of = (kind) => items.filter((it) => it[kind]);
  const showPanel = open && fresh && (items.length > 0 || q);

  return (
    <div className="sb" ref={box}>
      <form className="cf-search" onSubmit={submit} role="search">
        <i className="fas fa-magnifying-glass" aria-hidden="true" />
        <input
          type="search" className="input" placeholder="Search for anything: a skill, a tool, an instructor…" aria-label="Search courses"
          value={value} onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(-1); }} onFocus={() => setOpen(true)} onKeyDown={onKey}
          role="combobox" aria-expanded={Boolean(showPanel)} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined} autoComplete="off"
        />
        <button type="submit" className="btn btn--primary">Search</button>
      </form>

      {showPanel && (
        <div className="sb-panel" id={listId} role="listbox" aria-label="Search suggestions">
          {q && items.length === 0 && <p className="sb-empty">Press Enter to search for “{q}”.</p>}
          {data.did_you_mean && q && (
            <ul role="presentation">{row(items[0], 0, <><i className="fas fa-wand-magic-sparkles" aria-hidden="true" /> Did you mean <strong>{data.did_you_mean}</strong>?</>)}</ul>
          )}
          {section('Courses', of('course'), (it, i) => row(it, i, (
            <>
              <span className="sb-thumb">{it.course.thumbnail ? <img src={assetUrl(it.course.thumbnail)} alt="" /> : <BrandIcon name={it.course.icon} size={18} />}</span>
              <span className="sb-text"><strong>{it.course.title}</strong><small>{it.course.instructor}</small></span>
            </>
          )))}
          {section('Topics', of('topic'), (it, i) => row(it, i, <><i className={`fas ${TOPIC_ICON[it.topic.kind]}`} aria-hidden="true" /> {it.topic.label}</>))}
          {section('Instructors', of('instructor'), (it, i) => row(it, i, <><i className="fas fa-chalkboard-user" aria-hidden="true" /> {it.instructor.name}</>))}
          {section('Saved searches', of('saved'), (it, i) => row(it, i, (
            <>
              <i className="fas fa-bookmark" aria-hidden="true" /> <span className="sb-text">{it.saved.name}</span>
              <button type="button" className="sb-remove" aria-label={`Delete saved search ${it.saved.name}`} onClick={(e) => { e.stopPropagation(); removeSaved(it.saved.id); }}>
                <i className="fas fa-xmark" />
              </button>
            </>
          )))}
          {section('Recent searches', of('recent'), (it, i) => row(it, i, <><i className="fas fa-clock-rotate-left" aria-hidden="true" /> {it.recent}</>),
            isAuthenticated && <button type="button" className="sb-clear" onPointerDown={(e) => e.preventDefault()} onClick={clearRecent}>Clear</button>)}
          {section('Popular searches', of('popular'), (it, i) => row(it, i, <><i className="fas fa-arrow-trend-up" aria-hidden="true" /> {it.popular}</>))}
        </div>
      )}
    </div>
  );
};

export default SearchBox;
