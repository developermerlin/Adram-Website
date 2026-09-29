import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { mapsHref, officeStatus, site, telHref, whatsappHref } from '../../config/site';
import { contactAPI, parseApiErrors } from '../../services/api';
import { IconTile, PageHero } from '../../components/ui/Section';
import { ContactArt } from '../../components/brand/Illustrations';
import { Alert, TextField } from '../../components/ui/Form';
import SocialLinks from '../../components/ui/SocialLinks';
import '../../styles/pages.css';

const emptyForm = { name: '', email: '', subject: '', message: '' };

// Quick topics fill in the subject; people can still type their own.
const topics = [
  'Web development',
  'Mobile app',
  'Custom software',
  'Networking',
  'AI & automation',
  'IT consultancy',
  'Training',
  'Scholarships',
];

const methods = [
  { icon: 'phone', title: 'Call us', value: site.phones[0], href: telHref(site.phones[0]), action: 'Call now' },
  { icon: 'discover', title: 'WhatsApp', value: 'Chat with our team', href: whatsappHref, action: 'Start chat', external: true },
  { icon: 'mail', title: 'Email', value: site.email, href: `mailto:${site.email}`, action: 'Send email' },
  { icon: 'location', title: 'Visit us', value: site.location, href: mapsHref, action: 'Get directions', external: true },
];

const ContactForm = () => {
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
        <h2>Message sent. Thank you!</h2>
        <p>
          We’ve received your message and will reply within one working day. For anything urgent, call or WhatsApp us.
        </p>
        <div className="contact-sent__actions">
          <button type="button" className="btn btn--outline" onClick={() => setStatus('idle')}>
            <i className="fas fa-pen" /> Send another message
          </button>
          <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="btn btn--whatsapp">
            <i className="fab fa-whatsapp" /> Chat on WhatsApp
          </a>
        </div>
      </div>
    );
  }

  const activeTopic = topics.find((t) => form.subject === `${t} enquiry`);

  return (
    <div className="contact-form-card">
      <div className="contact-form-card__head">
        <div>
          <h2>Send us a message</h2>
          <p>Fill in the form and the right person on our team will get back to you.</p>
        </div>
        <span className="reply-badge"><i className="fas fa-bolt" /> Replies within 1 working day</span>
      </div>

      <Alert>{errors.form}</Alert>

      <form className="form-grid" onSubmit={handleSubmit}>
        <div className="field">
          <span className="field__label">What can we help with?</span>
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
          <TextField name="name" label="Full name" required autoComplete="name" placeholder="Your name" value={form.name} onChange={handleChange} error={errors.name} />
          <TextField name="email" label="Email address" type="email" required autoComplete="email" placeholder="you@example.com" value={form.email} onChange={handleChange} error={errors.email} />
        </div>
        <TextField name="subject" label="Subject" required placeholder="e.g. New website for our school" value={form.subject} onChange={handleChange} error={errors.subject} />
        <div className="field">
          <label htmlFor="message">Message</label>
          <textarea
            id="message"
            name="message"
            className="input"
            required
            rows={6}
            placeholder="Tell us about your project, timeline and any questions you have…"
            value={form.message}
            onChange={handleChange}
            aria-invalid={Boolean(errors.message)}
          />
          {errors.message && <p className="field-error">{errors.message}</p>}
        </div>
        <div className="contact-form-card__foot">
          <p><i className="fas fa-lock" /> Your details are only used to reply to your enquiry.</p>
          <button type="submit" className="btn btn--primary btn--lg" disabled={status === 'sending'}>
            {status === 'sending' ? <><span className="btn-spinner" /> Sending…</> : <><i className="fas fa-paper-plane" /> Send message</>}
          </button>
        </div>
      </form>
    </div>
  );
};

export const ContactPage = () => {
  const { today, open } = officeStatus();

  return (
    <>
      <PageHero
        eyebrow="Contact"
        title="Let’s talk about your next project"
        art={<div className="art-frame art-frame--dark"><ContactArt /></div>}
        actions={
          <>
            <a href={telHref(site.phones[0])} className="btn btn--primary">
              <i className="fas fa-phone" /> Call {site.phones[0]}
            </a>
            <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="btn btn--ghost-light">
              <i className="fab fa-whatsapp" /> WhatsApp us
            </a>
          </>
        }
      >
        Whether it’s a new project, a training programme or a scholarship question, our team is ready to help.
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
                <h3><i className="far fa-clock" /> Office hours</h3>
                <span className={`status-pill${open ? ' is-open' : ''}`}>
                  <span className="status-pill__dot" /> {open ? 'Open now' : 'Closed now'}
                </span>
              </div>
              <dl className="hours-list">
                {site.hours.map((h) => (
                  <div key={h.days} className={h === today ? 'is-today' : ''}>
                    <dt>{h.short}{h === today && <span className="today-tag">Today</span>}</dt>
                    <dd>{h.time}</dd>
                  </div>
                ))}
              </dl>
              <p className="aside-note">All times are Freetown time (GMT).</p>
            </div>

            <div className="aside-card">
              <h3><i className="fas fa-share-nodes" /> Follow us</h3>
              <p className="aside-note aside-note--top">News, projects, training intakes and scholarship updates.</p>
              <SocialLinks labeled />
            </div>

            <div className="aside-card aside-card--soft">
              <h3><i className="fas fa-graduation-cap" /> Students</h3>
              <p className="aside-note aside-note--top">
                Asking about a scholarship or course? Create a free account to track your applications.
              </p>
              <Link to="/register" className="link-arrow">
                Create an account <i className="fas fa-arrow-right" />
              </Link>
            </div>
          </aside>
        </div>
      </section>

      <section className="map-section">
        <iframe
          title="ADRAM Technologies location: Freetown, Sierra Leone"
          src="https://maps.google.com/maps?q=Freetown%2C%20Sierra%20Leone&z=12&output=embed"
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
                <i className="fas fa-diamond-turn-right" /> Get directions
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

export default ContactPage;
