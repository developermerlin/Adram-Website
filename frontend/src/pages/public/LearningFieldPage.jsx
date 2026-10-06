import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { usePageContent, useSite } from '../../content/useContent';
import { useAuth } from '../../context/AuthContext';
import { learningAPI } from '../../services/api';
import { assetUrl } from '../../utils/assets';
import Markdown from '../../components/blog/Markdown';
import BrandIcon from '../../components/brand/BrandIcon';
import { KindBadge, LearnCta, ProgressBar } from '../../components/learning/LearningParts';
import { hoursText, KIND_ICONS, levelList } from '../../components/learning/levels';
import { DownloadPdfButton } from '../../components/learning/DownloadPdfButton';
import { NotFoundPage } from './StatusPages';

/** /learning/:field — one field: what it covers and its roadmap, level by level, topic by topic. */
export const LearningFieldPage = () => {
  const { field } = useParams();
  const c = usePageContent('learning');
  const L = c.labels;
  const site = useSite();
  const { isAuthenticated } = useAuth();
  const [loaded, setLoaded] = useState({ key: null, data: undefined });
  const key = `${field}:${isAuthenticated}`;
  const f = loaded.key === key ? loaded.data : undefined;
  const levels = levelList(c);

  useEffect(() => {
    learningAPI.field(field).then(({ data }) => setLoaded({ key, data })).catch(() => setLoaded({ key, data: null }));
  }, [field, key]);

  useEffect(() => {
    if (!f) return undefined;
    const before = document.title;
    document.title = `${f.name} from zero to hero | ${site.name}`;
    return () => { document.title = before; };
  }, [f, site.name]);

  if (f === null) return <NotFoundPage />;
  if (f === undefined) return <div className="container lh-loading" aria-busy="true"><div className="skeleton skeleton--block" style={{ height: 300 }} /></div>;

  const first = f.roadmap[0]?.topics[0]?.notes[0];
  const target = f.next || first;
  const finished = f.notes > 0 && f.done === f.notes;
  const started = f.done > 0;

  return (
    <>
      {f.draft && <div className="pj-draft" role="note"><i className="fas fa-eye" aria-hidden="true" /> Preview: this field isn’t published yet, so only administrators can see it.</div>}
      <section className={`lh-hero${f.cover ? ' lh-hero--photo' : ''}`} style={f.cover ? { '--hero-photo': `url("${assetUrl(f.cover)}")` } : undefined}>
        <div className="container lh-hero__inner">
          <div>
            <nav className="breadcrumb" aria-label="Breadcrumb">
              <Link to="/">Home</Link>
              <span className="breadcrumb__item"><span aria-hidden="true">/</span><Link to="/learning">{c.hero.eyebrow}</Link></span>
              <span className="breadcrumb__item"><span aria-hidden="true">/</span><span>{f.name}</span></span>
            </nav>
            <div className="lh-hero__title">
              <span className="lh-hero__icon"><BrandIcon name={f.icon || 'network'} size={36} /></span>
              <h1>{f.name}</h1>
            </div>
            {f.summary && <p className="lh-hero__lead">{f.summary}</p>}
            <ul className="lh-hero__meta">
              <li><i className="fas fa-layer-group" aria-hidden="true" /> {f.topics} {L.topics}</li>
              <li><i className="fas fa-file-lines" aria-hidden="true" /> {f.notes} {L.notes}</li>
              {f.labs > 0 && <li><i className="fas fa-laptop-code" aria-hidden="true" /> {f.labs} {L.labs}</li>}
              <li><i className="far fa-clock" aria-hidden="true" /> {hoursText(f.minutes)}</li>
            </ul>
            {target && (
              <div className="lh-hero__actions">
                <Link to={`/learning/${f.slug}/${target.slug}`} className="btn btn--primary">
                  {finished ? L.review : started ? `${L.continue}: ${target.title}` : L.start} <i className="fas fa-arrow-right" aria-hidden="true" />
                </Link>
                <DownloadPdfButton slug={f.slug} name={f.name} className="btn btn--ghost-light" />
                {!isAuthenticated && <Link to="/login" className="lh-hero__signin"><i className="fas fa-chart-line" aria-hidden="true" /> {L.signIn}</Link>}
              </div>
            )}
          </div>
          {isAuthenticated && f.notes > 0 && (
            <div className="lh-hero__progress">
              <ProgressBar done={f.done} total={f.notes} label={L.progress} />
              {finished && <p><i className="fas fa-trophy" aria-hidden="true" /> {L.finished}</p>}
            </div>
          )}
        </div>
      </section>

      <section className="section lh-section">
        <div className="container lh-field-grid">
          <div className="lh-roadmap">
            {f.description?.trim() && <div className="prose lh-about"><Markdown source={f.description} /></div>}
            <h2 className="lh-h2">{L.roadmap}</h2>
            <ol className="lh-stages">
              {f.roadmap.map((stage) => {
                const lv = levels[stage.level - 1];
                const notes = stage.topics.flatMap((t) => t.notes);
                const doneHere = notes.filter((n) => n.done).length;
                return (
                  <li key={stage.level} className="lh-stage">
                    <div className="lh-stage__head">
                      <span className="lh-stage__num" aria-hidden="true">{stage.level}</span>
                      <div>
                        <span className="lh-stage__eyebrow">{L.level} {stage.level}</span>
                        <h3>{lv.name}</h3>
                        {lv.text && <p>{lv.text}</p>}
                      </div>
                      {isAuthenticated && <span className={`lh-stage__count${doneHere === notes.length ? ' is-done' : ''}`}>{doneHere}/{notes.length}</span>}
                    </div>
                    <div className="lh-topics">
                      {stage.topics.map((t) => (
                        <section key={t.id} className="lh-topic">
                          <h4>{t.title}</h4>
                          {t.summary && <p>{t.summary}</p>}
                          <ul>
                            {t.notes.map((n) => (
                              <li key={n.id}>
                                <Link to={`/learning/${f.slug}/${n.slug}`} className={`lh-row${n.done ? ' is-done' : ''}`}>
                                  <span className="lh-row__check" aria-hidden="true">
                                    <i className={`fas ${n.done ? 'fa-circle-check' : KIND_ICONS[n.kind] || KIND_ICONS.note}`} />
                                  </span>
                                  <span className="lh-row__title">{n.title}{n.draft && <em> (draft)</em>}</span>
                                  {n.kind !== 'note' && <KindBadge kind={n.kind} kinds={c.kinds} />}
                                  <span className="lh-row__time">{n.minutes} min</span>
                                  {n.done && <span className="sr-only">({L.done})</span>}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </section>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          <aside className="lh-aside">
            <div className="lh-aside__card">
              <h3>{c.howTitle}</h3>
              <ol className="lh-legend">
                {levels.map((l) => (
                  <li key={l.level} className={f.levels.includes(l.level) ? 'is-on' : ''}>
                    <span>{l.level}</span> {l.name}
                  </li>
                ))}
              </ol>
              {target && (
                <Link to={`/learning/${f.slug}/${target.slug}`} className="btn btn--primary lh-aside__btn">
                  {started && !finished ? L.continue : L.start} <i className="fas fa-arrow-right" aria-hidden="true" />
                </Link>
              )}
              <DownloadPdfButton slug={f.slug} name={f.name} className="btn btn--outline lh-aside__btn" label="Download all notes (PDF)" />
              <Link to="/learning" className="lh-aside__all"><i className="fas fa-arrow-left" aria-hidden="true" /> {L.allFields}</Link>
            </div>
          </aside>
        </div>
      </section>

      <LearnCta cta={c.cta} />
    </>
  );
};

export default LearningFieldPage;
