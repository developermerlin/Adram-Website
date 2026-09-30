import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { officeStatus, telHref } from '../../config/site';
import { fill } from '../../content/merge';
import { usePageContent, useSite } from '../../content/useContent';
import { contactAPI, parseApiErrors } from '../../services/api';
import { IconTile, PageHero } from '../../components/ui/Section';
import { ContactArt } from '../../components/brand/Illustrations';
import { Alert, TextField } from '../../components/ui/Form';
import SocialLinks from '../../components/ui/SocialLinks';
import '../../styles/pages.css';

const emptyForm = { name: '', email: '', subject: '', message: '' };

const contactMethods = (site, m) => [
  { icon: 'phone', title: m.callTitle, value: site.phones[0], href: telHref(site.phones[0]), action: m.callAction },
  ...(site.whatsappHref ? [{ icon: 'discover', title: m.whatsappTitle, value: m.whatsappValue, href: site.whatsappHref, action: m.whatsappAction, external: true }] : []),
  { icon: 'mail', title: m.emailTitle, value: site.email, href: `mailto:${site.email}`, action: m.emailAction },
  { icon: 'location', title: m.visitTitle, value: site.location, href: site.mapsHref, action: m.visitAction, external: true },
];

const ContactForm = () => {
  const { whatsappHref } = useSite();
  const { form: f, topics } = usePageContent('contact');
  const [params] = useSearchParams();
  // Pages link here with ?subject=... to pre-fill the enquiry type.
  const [form, setForm] = useState({ ...emptyForm, subject: params.get('subject') || '' });
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('idle'); // idle | sending | sent

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name] || errors.form) setErrors((prev) => ({ ...prev, [name]: undefined, form: undefined }));
  };

  const pickTopic = (topic) => {
    setForm((prev) => ({ ...prev, subject: `${topic} enquiry` }));
    setErrors((prev) => ({ ...prev, subject: undefined }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('sending');
    setErrors({});
    try {
      await contactAPI.send({ ...form, name: form.name.trim(), email: form.email.trim() });
      setForm(emptyForm);
      setStatus('sent');
    } catch (error) {
      setErrors(parseApiErrors(error, 'Your message could not be sent. Please try again.'));
      setStatus('idle');
    }
  };

  if (status === 'sent') {
    return (
      <div className="contact-form-card contact-sent" role="status">
        <span className="contact-sent__icon"><i className="fas fa-check" /></span>
        <h2>{f.sentTitle}</h2>
        <p>{f.sentText}</p>
        <div className="contact-sent__actions">
          <button type="button" className="btn btn--outline" onClick={() => setStatus('idle')}>
            <i className="fas fa-pen" /> {f.sentAgainLabel}
          </button>
          {whatsappHref && (
            <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="btn btn--whatsapp">
              <i className="fab fa-whatsapp" /> {f.sentWhatsappLabel}
            </a>
          )}
        </div>
      </div>
    );
  }

  const activeTopic = topics.find((t) => form.subject === `${t} enquiry`);

  return (
    <div className="contact-form-card">
      <div className="contact-form-card__head">
        <div>
          <h2>{f.title}</h2>
          <p>{f.intro}</p>
        </div>
        <span className="reply-badge"><i className="fas fa-bolt" /> {f.badge}</span>
      </div>

      <Alert>{errors.form}</Alert>

      <form className="form-grid" onSubmit={handleSubmit}>
        <div className="field">
          <span className="field__label">{f.topicsLabel}</span>
          <div className="topic-chips" role="group" aria-label="Choose a topic">
            {topics.map((t) => (
              <button
                key={t}
                type="button"
                className={`topic-chip${activeTopic === t ? ' is-active' : ''}`}
                aria-pressed={activeTopic === t}
                onClick={() => pickTopic(t)}
              >
                {activeTopic === t && <i className="fas fa-check" aria-hidden="true" />} {t}
              </button>
            ))}
          </div>
        </div>
        <div className="form-row">
          <TextField name="name" label={f.nameLabel} required autoComplete="name" placeholder={f.namePlaceholder} value={form.name} onChange={handleChange} error={errors.name} />
          <TextField name="email" label={f.emailLabel} type="email" required autoComplete="email" placeholder={f.emailPlaceholder} value={form.email} onChange={handleChange} error={errors.email} />
        </div>
        <TextField name="subject" label={f.subjectLabel} required placeholder={f.subjectPlaceholder} value={form.subject} onChange={handleChange} error={errors.subject} />
        <div className="field">
          <label htmlFor="message">{f.messageLabel}</label>
          <textarea
            id="message"
            name="message"
            className="input"
            required
            rows={6}
            placeholder={f.messagePlaceholder}
            value={form.message}
            onChange={handleChange}
            aria-invalid={Boolean(errors.message)}
          />
          {errors.message && <p className="field-error">{errors.message}</p>}
        </div>
        <div className="contact-form-card__foot">
          <p><i className="fas fa-lock" /> {f.privacyNote}</p>
          <button type="submit" className="btn btn--primary btn--lg" disabled={status === 'sending'}>
            {status === 'sending' ? <><span className="btn-spinner" /> Sending…</> : <><i className="fas fa-paper-plane" /> {f.sendLabel}</>}
          </button>
        </div>
      </form>
    </div>
  );
};

export const ContactPage = () => {
  const site = useSite();
  const c = usePageContent('contact');
  const { whatsappHref, mapsHref } = site;
  const methods = contactMethods(site, c.methods);
  const { today, open } = officeStatus(new Date(), site.hours);

  return (
    <>
      <PageHero
        eyebrow={c.hero.eyebrow}
        title={c.hero.title}
        art={<div className="art-frame art-frame--dark"><ContactArt /></div>}
        actions={
          <>
            <a href={telHref(site.phones[0])} className="btn btn--primary">
              <i className="fas fa-phone" /> {fill(c.hero.callLabel, { phone: site.phones[0] })}
            </a>
            {whatsappHref && (
              <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="btn btn--ghost-light">
                <i className="fab fa-whatsapp" /> {c.hero.whatsappLabel}
              </a>
            )}
          </>
        }
      >
        {c.hero.lead}
      </PageHero>

      {/* Ways to reach us */}
      <section className="contact-methods">
        <div className="container contact-methods__grid">
          {methods.map((m) => (
            <a
              key={m.title}
              href={m.href}
              className="contact-method"
              {...(m.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              <IconTile name={m.icon} />
              <div>
                <h3>{m.title}</h3>
                <p>{m.value}</p>
                <span className="contact-method__action">
                  {m.action} <i className="fas fa-arrow-right" />
                </span>
              </div>
            </a>
          ))}
        </div>
      </section>

      <section className="section contact-main">
        <div className="container contact-layout">
          <ContactForm />

          <aside className="contact-aside">
            <div className="aside-card">
              <div className="aside-card__head">
                <h3><i className="far fa-clock" /> {c.hours.title}</h3>
                <span className={`status-pill${open ? ' is-open' : ''}`}>
                  <span className="status-pill__dot" /> {open ? c.hours.openLabel : c.hours.closedLabel}
                </span>
              </div>
              <dl className="hours-list">
                {site.hours.map((h) => (
                  <div key={h.days} className={h === today ? 'is-today' : ''}>
                    <dt>{h.short}{h === today && <span className="today-tag">{c.hours.todayLabel}</span>}</dt>
                    <dd>{h.time}</dd>
                  </div>
                ))}
              </dl>
              <p className="aside-note">{c.hours.note}</p>
            </div>

            <div className="aside-card">
              <h3><i className="fas fa-share-nodes" /> {c.follow.title}</h3>
              <p className="aside-note aside-note--top">{c.follow.text}</p>
              <SocialLinks labeled />
            </div>

            <div className="aside-card aside-card--soft">
              <h3><i className="fas fa-graduation-cap" /> {c.students.title}</h3>
              <p className="aside-note aside-note--top">{c.students.text}</p>
              <Link to="/register" className="link-arrow">
                {c.students.link} <i className="fas fa-arrow-right" />
              </Link>
            </div>
          </aside>
        </div>
      </section>

      <section className="map-section">
        <iframe
          title={`${site.name} location: ${site.location}`}
          src={`https://maps.google.com/maps?q=${encodeURIComponent(site.location)}&z=12&output=embed`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
        <div className="container map-section__overlay">
          <div className="map-card">
            <IconTile name="location" />
            <div>
              <h3>{site.name}</h3>
              <p>{site.location}</p>
              <a href={mapsHref} target="_blank" rel="noopener noreferrer" className="btn btn--primary btn--sm">
                <i className="fas fa-diamond-turn-right" /> {c.map.button}
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

export default ContactPage;
