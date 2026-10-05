import { useEffect, useState } from 'react';
import { usePageContent } from '../../content/useContent';
import { partnersAPI, parseApiErrors } from '../../services/api';
import { assetUrl } from '../../utils/assets';
import { IconTile, PageHero, SectionHeading } from '../../components/ui/Section';
import { AboutArt } from '../../components/brand/Illustrations';
import '../../styles/partners.css';

/** A partner's logo, or its initials on a calm tile when no logo was uploaded. */
const Logo = ({ partner }) => (partner.logo
  ? <img src={assetUrl(partner.logo)} alt={partner.name} loading="lazy" />
  : <span className="pt-logo__name">{partner.name}</span>);

const LogoCard = ({ partner }) => {
  const inner = (
    <>
      <span className="pt-logo"><Logo partner={partner} /></span>
      <span className="pt-card__info">
        <strong>{partner.name}</strong>
        {partner.description && <span>{partner.description}</span>}
        {partner.since && <small>Partner since {partner.since}</small>}
      </span>
    </>
  );
  return partner.website
    ? <a className="pt-card" href={partner.website} target="_blank" rel="noopener noreferrer" aria-label={`${partner.name} (opens their website)`}>{inner}</a>
    : <div className="pt-card">{inner}</div>;
};

/** The hero picture: a wall of partner logos (the About illustration until partners are added). */
const LogoWall = ({ partners }) => (
  <div className="pt-wall" aria-hidden="true">
    {partners.slice(0, 6).map((p) => <span key={p.id} className="pt-wall__tile"><Logo partner={p} /></span>)}
  </div>
);

const ApplyForm = ({ apply }) => {
  const blank = { organisation: '', contact_name: '', email: '', phone: '', website: '', partnership_type: '', message: '', company_site: '' };
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState({});
  const [state, setState] = useState({ busy: false, done: '' });
  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setErrors((x) => ({ ...x, [key]: undefined }));
  };
  const submit = async (e) => {
    e.preventDefault();
    setState({ busy: true, done: '' });
    try {
      const { data } = await partnersAPI.apply(form);
      setState({ busy: false, done: data.detail });
      setForm(blank);
    } catch (err) {
      setErrors(parseApiErrors(err, 'Something went wrong. Please try again.'));
      setState({ busy: false, done: '' });
    }
  };
  if (state.done) {
    return (
      <div className="pt-done" role="status">
        <i className="fas fa-circle-check" aria-hidden="true" />
        <h3>Application sent</h3>
        <p>{state.done}</p>
      </div>
    );
  }
  const field = (key, label, props = {}) => (
    <label className="field">
      <span className="field__label">{label}</span>
      <input className="input" value={form[key]} onChange={set(key)} aria-invalid={Boolean(errors[key])} {...props} />
      {errors[key] && <small className="pt-error">{errors[key]}</small>}
    </label>
  );
  return (
    <form className="pt-form" onSubmit={submit} noValidate>
      {(errors.detail || errors.form) && <p className="pt-error pt-error--box" role="alert">{errors.detail || errors.form}</p>}
      <div className="pt-form__row">
        {field('organisation', 'Organisation', { autoComplete: 'organization', maxLength: 150 })}
        {field('contact_name', 'Your name', { autoComplete: 'name', maxLength: 120 })}
      </div>
      <div className="pt-form__row">
        {field('email', 'Work email', { type: 'email', autoComplete: 'email', maxLength: 254 })}
        {field('phone', 'Phone (optional)', { type: 'tel', autoComplete: 'tel', maxLength: 40 })}
      </div>
      <div className="pt-form__row">
        {field('website', 'Website (optional)', { placeholder: 'yourcompany.com', maxLength: 300 })}
        <label className="field">
          <span className="field__label">Type of partnership</span>
          <select className="input" value={form.partnership_type} onChange={set('partnership_type')}>
            <option value="">Choose one</option>
            {(apply.types || []).filter(Boolean).map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </div>
      <label className="field">
        <span className="field__label">How would you like to work together?</span>
        <textarea className="input" rows={5} maxLength={3000} value={form.message} onChange={set('message')} aria-invalid={Boolean(errors.message)} />
        {errors.message && <small className="pt-error">{errors.message}</small>}
      </label>
      <input type="text" name="company_site" tabIndex={-1} autoComplete="off" className="pt-trap" aria-hidden="true" value={form.company_site} onChange={set('company_site')} />
      <div className="pt-form__foot">
        <button type="submit" className="btn btn--primary" disabled={state.busy}>
          {state.busy ? <span className="btn-spinner" /> : <i className="fas fa-paper-plane" />} {apply.button}
        </button>
        <span className="muted small">We only use these details to reply to you.</span>
      </div>
    </form>
  );
};

/** /partners — who ADRAM works with, why to partner, and the application form. */
export const PartnersPage = () => {
  const c = usePageContent('partners');
  const [data, setData] = useState(null);
  const [group, setGroup] = useState('all');

  useEffect(() => {
    partnersAPI.list().then(({ data: d }) => setData(d)).catch(() => setData({ groups: [], featured: [], count: 0 }));
  }, []);

  const all = data ? data.groups.flatMap((g) => g.partners) : [];
  const groups = data ? data.groups.filter((g) => g.name) : [];
  const shown = !data ? [] : group === 'all' ? data.groups : data.groups.filter((g) => String(g.id) === group);
  const stats = (c.stats || []).filter((s) => s.value);

  return (
    <div className="partners">
      <PageHero
        eyebrow={c.hero.eyebrow}
        title={c.hero.title}
        art={all.length >= 3 ? <LogoWall partners={all} /> : <div className="art-frame art-frame--dark"><AboutArt /></div>}
        actions={
          <>
            {c.apply.enabled && <a href="#apply" className="btn btn--primary"><i className="fas fa-handshake" /> {c.hero.primaryLabel}</a>}
            <a href="#partners" className="btn btn--ghost-light">{c.hero.secondaryLabel}</a>
          </>
        }
      >
        {c.hero.lead}
      </PageHero>

      {stats.length > 0 && (
        <section className="pt-stats" aria-label="Key numbers">
          <div className="container pt-stats__inner">
            {stats.map((s) => (
              <div key={s.label} className="pt-stat"><strong>{s.value}</strong><span>{s.label}</span></div>
            ))}
          </div>
        </section>
      )}

      <section className="section" id="partners">
        <div className="container">
          <SectionHeading title={c.logosTitle} center>{c.logosLead}</SectionHeading>
          {groups.length > 1 && (
            <div className="pt-tabs" role="tablist" aria-label="Partner groups">
              <button type="button" role="tab" aria-selected={group === 'all'} className={`pt-tab${group === 'all' ? ' is-active' : ''}`} onClick={() => setGroup('all')}>All partners</button>
              {groups.map((g) => (
                <button key={g.id} type="button" role="tab" aria-selected={group === String(g.id)} className={`pt-tab${group === String(g.id) ? ' is-active' : ''}`}
                  onClick={() => setGroup(String(g.id))}>{g.name}</button>
              ))}
            </div>
          )}
          {!data && <div className="pt-grid pt-grid--loading">{[0, 1, 2, 3].map((i) => <span key={i} />)}</div>}
          {data && all.length === 0 && <p className="pt-empty">Our partners will appear here soon.</p>}
          {shown.map((g) => (
            <div key={g.id ?? 'other'} className="pt-group">
              {group === 'all' && g.name && groups.length > 1 && (
                <div className="pt-group__head"><h3>{g.name}</h3>{g.description && <p>{g.description}</p>}</div>
              )}
              {group !== 'all' && g.description && <p className="pt-group__lead">{g.description}</p>}
              <div className="pt-grid">{g.partners.map((p) => <LogoCard key={p.id} partner={p} />)}</div>
            </div>
          ))}
        </div>
      </section>

      {data?.featured.length > 0 && (
        <section className="section section--dark pt-spotlight">
          <div className="container">
            <SectionHeading title={c.spotlightTitle} center />
            <div className="pt-quotes">
              {data.featured.map((p) => (
                <figure key={p.id} className="pt-quote">
                  <span className="pt-quote__logo"><Logo partner={p} /></span>
                  <blockquote>“{p.quote}”</blockquote>
                  <figcaption><strong>{p.quote_author || p.name}</strong>{(p.quote_role || p.quote_author) && <span>{p.quote_role ? `${p.quote_role}, ${p.name}` : p.name}</span>}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {(c.benefits || []).length > 0 && (
        <section className="section">
          <div className="container">
            <SectionHeading title={c.benefitsTitle} center>{c.benefitsLead}</SectionHeading>
            <div className="pt-benefits">
              {c.benefits.filter((b) => b.title).map((b) => (
                <article key={b.title} className="pt-benefit">
                  <IconTile name={b.icon || 'partnership'} />
                  <h3>{b.title}</h3>
                  <p>{b.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {(c.steps || []).length > 0 && (
        <section className="section pt-steps-section">
          <div className="container">
            <SectionHeading title={c.stepsTitle} center />
            <ol className="pt-steps">
              {c.steps.filter((s) => s.title).map((s, i) => (
                <li key={s.title} className="pt-step">
                  <span className="pt-step__num" aria-hidden="true">{i + 1}</span>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {c.apply.enabled && (
        <section className="section" id="apply">
          <div className="container pt-apply">
            <div className="pt-apply__intro">
              <span className="eyebrow">{c.hero.eyebrow}</span>
              <h2>{c.apply.title}</h2>
              <p>{c.apply.lead}</p>
              <ul className="pt-apply__points">
                <li><i className="fas fa-clock" aria-hidden="true" /> A reply within two working days</li>
                <li><i className="fas fa-user-tie" aria-hidden="true" /> A dedicated partnership contact</li>
                <li><i className="fas fa-lock" aria-hidden="true" /> Your details stay private</li>
              </ul>
            </div>
            <div className="card pt-apply__card"><ApplyForm apply={c.apply} /></div>
          </div>
        </section>
      )}
    </div>
  );
};

export default PartnersPage;
