import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { usePageContent, useSite } from '../../content/useContent';
import { useAuth } from '../../context/AuthContext';
import { learningAPI } from '../../services/api';
import { formatDate } from '../../utils/format';
import Markdown from '../../components/blog/Markdown';
import BrandIcon from '../../components/brand/BrandIcon';
import { KindBadge } from '../../components/learning/LearningParts';
import { KIND_ICONS, levelList, RESOURCE_ICONS } from '../../components/learning/levels';
import { NotFoundPage } from './StatusPages';

/** The field's outline beside the note: every level, topic and note, with ticks and the current one marked. */
const Outline = ({ field, outline, current, levels, open, onClose }) => (
  <nav className={`lh-outline${open ? ' is-open' : ''}`} aria-label="Field outline">
    <div className="lh-outline__head">
      <Link to={`/learning/${field.slug}`} className="lh-outline__field">
        <BrandIcon name={field.icon || 'network'} size={20} /> {field.name}
      </Link>
      <button type="button" className="lh-outline__close" onClick={onClose} aria-label="Close the outline"><i className="fas fa-xmark" /></button>
    </div>
    <div className="lh-outline__progress" aria-hidden="true"><span style={{ width: `${field.notes ? Math.round((field.done / field.notes) * 100) : 0}%` }} /></div>
    {outline.map((stage) => (
      <div key={stage.level} className="lh-outline__stage">
        <p className="lh-outline__level"><span>{stage.level}</span> {levels[stage.level - 1].name}</p>
        {stage.topics.map((t) => (
          <div key={t.id} className="lh-outline__topic">
            <p className="lh-outline__topic-title">{t.title}</p>
            <ul>
              {t.notes.map((n) => (
                <li key={n.id}>
                  <Link to={`/learning/${field.slug}/${n.slug}`} className={`${n.slug === current ? 'is-current' : ''}${n.done ? ' is-done' : ''}`}
                    aria-current={n.slug === current ? 'page' : undefined}>
                    <i className={`fas ${n.done ? 'fa-circle-check' : KIND_ICONS[n.kind] || KIND_ICONS.note}`} aria-hidden="true" />
                    <span>{n.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    ))}
  </nav>
);

/** /learning/:field/:note — reading one note, ticking it off and moving on to the next. */
export const LearningNotePage = () => {
  const { field, note } = useParams();
  const { pathname } = useLocation();
  const c = usePageContent('learning');
  const L = c.labels;
  const site = useSite();
  const { isAuthenticated } = useAuth();
  const levels = levelList(c);
  const key = `${field}/${note}:${isAuthenticated}`;
  const [loaded, setLoaded] = useState({ key: null, data: undefined });
  const n = loaded.key === key ? loaded.data : undefined;
  const [busy, setBusy] = useState(false);
  const [outlineFor, setOutlineFor] = useState(null); // the outline drawer on phones belongs to one page
  const outlineOpen = outlineFor === pathname;

  useEffect(() => {
    learningAPI.note(field, note).then(({ data }) => setLoaded({ key, data })).catch(() => setLoaded({ key, data: null }));
  }, [field, note, key]);

  useEffect(() => {
    if (!n) return undefined;
    const before = document.title;
    document.title = `${n.title} | ${n.field.name} | ${site.name}`;
    return () => { document.title = before; };
  }, [n, site.name]);

  if (n === null) return <NotFoundPage />;
  if (n === undefined) return <div className="container lh-loading" aria-busy="true"><div className="skeleton skeleton--block" style={{ height: 420 }} /></div>;

  const toggleDone = async () => {
    setBusy(true);
    try {
      const { data } = n.done ? await learningAPI.markUndone(n.id) : await learningAPI.markDone(n.id);
      // tick it in the outline too, and update the field's numbers
      const outline = n.outline.map((s) => ({ ...s, topics: s.topics.map((t) => ({ ...t, notes: t.notes.map((x) => (x.id === n.id ? { ...x, done: data.done } : x)) })) }));
      setLoaded({ key, data: { ...n, done: data.done, outline, field: { ...n.field, done: data.field_done } } });
      if (data.done && data.field_done === data.field_notes) toast.success(L.finished);
    } catch {
      toast.error('That didn’t save. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  const level = levels[n.topic.level - 1];

  return (
    <div className="lh-reader-page">
      {n.draft && <div className="pj-draft" role="note"><i className="fas fa-eye" aria-hidden="true" /> Preview: this note (or its field) isn’t published yet, so only administrators can see it.</div>}
      <div className="container lh-reader">
        <Outline field={n.field} outline={n.outline} current={n.slug} levels={levels} open={outlineOpen} onClose={() => setOutlineFor(null)} />
        {outlineOpen && <div className="lh-outline__backdrop" onClick={() => setOutlineFor(null)} aria-hidden="true" />}

        <article className="lh-note">
          <nav className="lh-crumbs" aria-label="Breadcrumb">
            <Link to="/learning">{c.hero.eyebrow}</Link><span aria-hidden="true">/</span>
            <Link to={`/learning/${n.field.slug}`}>{n.field.name}</Link><span aria-hidden="true">/</span>
            <span>{n.topic.title}</span>
          </nav>
          <button type="button" className="btn btn--outline btn--sm lh-outline__toggle" onClick={() => setOutlineFor(pathname)} aria-expanded={outlineOpen}>
            <i className="fas fa-list-ul" aria-hidden="true" /> {L.outline} <span>{n.position}/{n.field.notes}</span>
          </button>

          <header className="lh-note__head">
            <div className="lh-note__tags">
              <span className={`lh-level lh-level--${n.topic.level}`}>{L.level} {n.topic.level} · {level.name}</span>
              <KindBadge kind={n.kind} kinds={c.kinds} />
            </div>
            <h1>{n.title}</h1>
            {n.summary && <p className="lh-note__lead">{n.summary}</p>}
            <p className="lh-note__meta">
              <span><i className="far fa-clock" aria-hidden="true" /> {n.minutes} {L.minutes}</span>
              <span><i className="far fa-calendar" aria-hidden="true" /> {L.updated} {formatDate(n.updated_at)}</span>
              {n.done && <span className="lh-note__done"><i className="fas fa-circle-check" aria-hidden="true" /> {L.done}</span>}
            </p>
          </header>

          {n.objectives?.length > 0 && (
            <section className="lh-objectives" aria-labelledby="lh-objectives">
              <h2 id="lh-objectives"><i className="fas fa-bullseye" aria-hidden="true" /> {L.objectives}</h2>
              <ul>{n.objectives.map((o) => <li key={o}>{o}</li>)}</ul>
            </section>
          )}

          <div className="prose lh-note__body"><Markdown source={n.body} /></div>

          {n.resources?.length > 0 && (
            <section className="lh-resources" aria-labelledby="lh-resources">
              <h2 id="lh-resources">{L.resources}</h2>
              <ul>
                {n.resources.map((r) => (
                  <li key={r.url + r.title}>
                    <a href={r.url} target="_blank" rel="noopener noreferrer" {...(r.kind === 'file' ? { download: '' } : {})}>
                      <span className={`lh-resources__icon lh-resources__icon--${r.kind}`}><i className={`fas ${RESOURCE_ICONS[r.kind] || RESOURCE_ICONS.link}`} aria-hidden="true" /></span>
                      <span>{r.title}</span>
                      <i className={`fas ${r.kind === 'file' ? 'fa-download' : 'fa-arrow-up-right-from-square'} lh-resources__go`} aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="lh-complete">
            {isAuthenticated ? (
              <button type="button" className={`btn ${n.done ? 'btn--outline' : 'btn--primary'}`} onClick={toggleDone} disabled={busy || n.draft}>
                {busy ? <span className="btn-spinner" /> : <i className={`fas ${n.done ? 'fa-rotate-left' : 'fa-check'}`} aria-hidden="true" />}
                {n.done ? ` ${L.done} · undo` : ` ${L.markDone}`}
              </button>
            ) : (
              <Link to="/login" className="btn btn--outline"><i className="fas fa-chart-line" aria-hidden="true" /> {L.signIn}</Link>
            )}
          </div>

          <nav className="lh-pager" aria-label="Previous and next notes">
            {n.prev ? (
              <Link to={`/learning/${n.field.slug}/${n.prev.slug}`} className="lh-pager__link">
                <small><i className="fas fa-arrow-left" aria-hidden="true" /> {L.previous}</small><strong>{n.prev.title}</strong>
              </Link>
            ) : <span />}
            {n.next ? (
              <Link to={`/learning/${n.field.slug}/${n.next.slug}`} className="lh-pager__link lh-pager__link--next">
                <small>{L.next} <i className="fas fa-arrow-right" aria-hidden="true" /></small><strong>{n.next.title}</strong>
              </Link>
            ) : (
              <Link to={`/learning/${n.field.slug}`} className="lh-pager__link lh-pager__link--next">
                <small>{L.roadmap} <i className="fas fa-flag-checkered" aria-hidden="true" /></small><strong>{n.field.name}</strong>
              </Link>
            )}
          </nav>
        </article>
      </div>
    </div>
  );
};

export default LearningNotePage;
