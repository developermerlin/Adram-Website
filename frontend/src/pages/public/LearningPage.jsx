import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageContent } from '../../content/useContent';
import { useAuth } from '../../context/AuthContext';
import { learningAPI } from '../../services/api';
import BrandIcon from '../../components/brand/BrandIcon';
import { PageHero } from '../../components/ui/Section';
import { KindBadge, LearnCta, LevelDots, ProgressBar } from '../../components/learning/LearningParts';
import { hoursText, levelList } from '../../components/learning/levels';
import { VideoSection } from '../../components/ui/VideoSection';

/** Search across every published note, as you type. */
const NoteSearch = ({ c }) => {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState(null);
  const term = q.trim();
  useEffect(() => {
    if (term.length < 2) return undefined;
    const t = setTimeout(() => {
      learningAPI.search(term).then(({ data }) => setHits({ term, results: data.results })).catch(() => setHits({ term, results: [] }));
    }, 250);
    return () => clearTimeout(t);
  }, [term]);
  const shown = term.length >= 2 && hits?.term === term ? hits.results : null;
  const levels = levelList(c);
  return (
    <div className="lh-search">
      <label className="lh-search__box">
        <i className="fas fa-magnifying-glass" aria-hidden="true" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={c.labels.search} aria-label={c.labels.search} />
      </label>
      {shown && (
        <div className="lh-search__results" aria-live="polite">
          {shown.length === 0 ? <p className="lh-muted">{c.labels.searchEmpty}</p> : (
            <ul>
              {shown.map((n) => (
                <li key={`${n.field.slug}/${n.slug}`}>
                  <Link to={`/learning/${n.field.slug}/${n.slug}`}>
                    <span className="lh-search__icon"><BrandIcon name={n.field.icon || 'network'} size={20} /></span>
                    <span className="lh-search__text">
                      <strong>{n.title}</strong>
                      <small>{n.field.name} · {levels[n.level - 1]?.name} · {n.topic}</small>
                    </span>
                    <KindBadge kind={n.kind} kinds={c.kinds} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

/** One field on the hub: what it covers and, for a signed-in learner, how far they've got. */
const FieldCard = ({ f, c, levels }) => {
  const started = f.done > 0;
  return (
    <article className="lh-field">
      <div className="lh-field__head">
        <span className="lh-field__icon"><BrandIcon name={f.icon || 'network'} size={30} /></span>
        <LevelDots levels={f.levels} names={levels} />
      </div>
      <h3><Link to={`/learning/${f.slug}`}>{f.name}</Link></h3>
      {f.summary && <p>{f.summary}</p>}
      <ul className="lh-field__meta">
        <li><i className="fas fa-layer-group" aria-hidden="true" /> {f.topics} {c.labels.topics}</li>
        <li><i className="fas fa-file-lines" aria-hidden="true" /> {f.notes} {c.labels.notes}</li>
        {f.labs > 0 && <li><i className="fas fa-laptop-code" aria-hidden="true" /> {f.labs} {c.labels.labs}</li>}
        <li><i className="far fa-clock" aria-hidden="true" /> {hoursText(f.minutes)}</li>
      </ul>
      {started && <ProgressBar done={f.done} total={f.notes} label={c.labels.progress} />}
      <Link to={`/learning/${f.slug}`} className={`btn ${started ? 'btn--primary' : 'btn--outline'} lh-field__btn`}>
        {started ? c.labels.continue : c.labels.start} <i className="fas fa-arrow-right" aria-hidden="true" />
      </Link>
    </article>
  );
};

/** /learning — the Learning hub: every field, a search across all notes, and how the zero-to-hero path works. */
export const LearningPage = () => {
  const c = usePageContent('learning');
  const { isAuthenticated } = useAuth();
  const [fields, setFields] = useState(null);
  const [mine, setMine] = useState([]);
  const levels = levelList(c);

  useEffect(() => {
    learningAPI.fields().then(({ data }) => setFields(data.results)).catch(() => setFields([]));
  }, [isAuthenticated]);
  useEffect(() => {
    if (!isAuthenticated) return;
    learningAPI.mine().then(({ data }) => setMine(data.results.filter((f) => f.next))).catch(() => {});
  }, [isAuthenticated]);

  return (
    <>
      <PageHero eyebrow={c.hero.eyebrow} title={c.hero.title} background={c.hero.image || undefined}>
        {c.hero.lead}
      </PageHero>

      <div className="container lh-search-wrap">
        <NoteSearch c={c} />
      </div>

      {isAuthenticated && mine.length > 0 && (
        <section className="container lh-continue" aria-labelledby="lh-continue">
          <h2 id="lh-continue" className="lh-h2">{c.labels.continueTitle}</h2>
          <div className="lh-continue__list">
            {mine.map((f) => (
              <Link key={f.slug} to={`/learning/${f.slug}/${f.next.slug}`} className="lh-continue__item">
                <span className="lh-field__icon lh-field__icon--sm"><BrandIcon name={f.icon || 'network'} size={22} /></span>
                <span className="lh-continue__text">
                  <strong>{f.name}</strong>
                  <small>{c.labels.next}: {f.next.title}</small>
                  <span className="lh-progress__bar lh-progress__bar--thin" aria-hidden="true"><span style={{ width: `${Math.round((f.done / f.notes) * 100)}%` }} /></span>
                </span>
                <i className="fas fa-arrow-right" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="section lh-section">
        <div className="container">
          <h2 className="lh-h2">{c.labels.fieldsTitle}</h2>
          {fields === null ? (
            <div className="lh-fields" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="lh-field"><div className="skeleton skeleton--block" /></div>)}</div>
          ) : fields.length === 0 ? (
            <div className="lh-empty">
              <span className="lh-empty__icon"><i className="fas fa-book-open-reader" aria-hidden="true" /></span>
              <p>{c.labels.empty}</p>
            </div>
          ) : (
            <div className="lh-fields">{fields.map((f) => <FieldCard key={f.slug} f={f} c={c} levels={levels} />)}</div>
          )}
        </div>
      </section>

      <VideoSection video={c.video} />

      <section className="section lh-how">
        <div className="container">
          <div className="lh-how__head">
            <h2 className="lh-h2">{c.howTitle}</h2>
            <p>{c.howLead}</p>
          </div>
          <ol className="lh-path">
            {levels.map((l) => (
              <li key={l.level} className={`lh-path__step lh-path__step--${l.level}`}>
                <span className="lh-path__num">{l.level}</span>
                <strong>{l.name}</strong>
                {l.text && <p>{l.text}</p>}
              </li>
            ))}
          </ol>
          {!isAuthenticated && (
            <p className="lh-how__signin"><i className="fas fa-chart-line" aria-hidden="true" /> <Link to="/login">{c.labels.signIn}</Link></p>
          )}
        </div>
      </section>

      <LearnCta cta={c.cta} />
    </>
  );
};

export default LearningPage;
