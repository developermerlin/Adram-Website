import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCourses } from '../../data/useCatalog';
import { COURSE_GROUPS, courseMeta } from '../../data/courseMeta';
import usePortal from '../../data/usePortal';
import { useAuth } from '../../context/AuthContext';
import { site, telHref } from '../../config/site';
import { formatDate } from '../../utils/format';
import { CtaBand, IconTile, PageHero, SectionHeading } from '../../components/ui/Section';
import { TrainingArt } from '../../components/brand/Illustrations';
import BrandIcon from '../../components/brand/BrandIcon';
import '../../styles/pages.css';

// Photo behind the top of the page (web-sized, from public/typing)
const HERO_PHOTO = '/typing/typing-hero.jpg';

const reasons = [
  { icon: 'laptop', title: 'Hands-on lab time', text: 'You learn by doing, on real equipment, in every session.' },
  { icon: 'build', title: 'Real projects', text: 'Every programme ends with work you can show to employers or clients.' },
  { icon: 'people', title: 'Taught by practitioners', text: 'Your trainers build software, networks and systems for a living.' },
  { icon: 'certificate', title: 'Certificate of completion', text: 'A certificate for every programme you finish.' },
];

const steps = [
  { title: 'Choose a programme', text: 'Browse the programmes above, or tell us your goal and we will suggest where to start.' },
  { title: 'Enrol', text: 'Create a free account and enrol in one click. Your programme then appears in your student portal.' },
  { title: 'Learn and practise', text: 'Attend the sessions, work through the exercises and build your project with your trainer’s feedback.' },
  { title: 'Finish and get certified', text: 'Complete your project, collect your certificate and take the next step in your studies or career.' },
];

const faqs = [
  { q: 'Do I need any experience?', a: 'Not for our foundation programmes such as Touch Typing and Programming Foundations. They start from zero. If you are unsure whether a programme suits you, ask us and we will advise.' },
  { q: 'How do I enrol?', a: 'Create a free account, then press Enroll on the programme you want. Your enrolment appears in your student portal, and we contact you with the start date and next steps.' },
  { q: 'How much do programmes cost, and when do they start?', a: 'Each programme shows its fee and next intake once they are confirmed. If they are not shown yet, use “Ask about dates & fees” and we will reply within one working day.' },
  { q: 'Will I get a certificate?', a: 'Yes. Everyone who completes a programme receives a certificate of completion.' },
  { q: 'Can you train our staff or students as a group?', a: 'Yes. We deliver corporate and group training at your organisation, tailored to your team’s needs. Contact us with your goals and group size.' },
];

const formats = [
  { icon: 'classroom', title: 'In-person classes', text: 'Instructor-led sessions in Freetown with hands-on lab time.' },
  { icon: 'building', title: 'Corporate training', text: 'Courses delivered at your organisation, tailored to your team’s needs.' },
  { icon: 'certificate', title: 'Certificates', text: 'A certificate of completion for every programme you finish.' },
];

// Only the details the admin has filled in are shown; without a fee or date people are asked to enquire.
const CourseFacts = ({ course }) => {
  const facts = [
    course.duration && { icon: 'fa-hourglass-half', text: course.duration },
    course.next_intake && { icon: 'fa-calendar-days', text: `Next intake ${formatDate(`${course.next_intake}T00:00`)}` },
    course.fee && { icon: 'fa-tag', text: course.fee },
  ].filter(Boolean);
  if (!facts.length) return null;
  return (
    <ul className="program-card__facts">
      {facts.map((f) => (
        <li key={f.icon}><i className={`fas ${f.icon}`} aria-hidden="true" /> {f.text}</li>
      ))}
    </ul>
  );
};

// Enroll: students sign up from here and the programme appears in their portal; visitors join first.
const EnrollButton = ({ course, portal, signedIn }) => {
  if (!signedIn) {
    return (
      <Link to={`/join?next=${encodeURIComponent('/courses')}`} className="btn btn--primary btn--sm">
        <i className="fas fa-user-plus" /> Enroll
      </Link>
    );
  }
  if (!portal.isStudent) return null;
  const enrollment = portal.enrollmentFor(course.slug);
  if (enrollment) {
    return (
      <Link to="/student/training" className="btn btn--outline btn--sm">
        <i className="fas fa-circle-check" /> {enrollment.status_display}
      </Link>
    );
  }
  return (
    <button type="button" className="btn btn--primary btn--sm" disabled={!portal.data} onClick={() => portal.enroll(course)}>
      <i className="fas fa-user-plus" /> Enroll
    </button>
  );
};

const ProgramCard = ({ course, portal, signedIn }) => {
  const meta = courseMeta[course.slug];
  return (
    <article id={course.slug} className={`card card--hover program-card${meta?.image ? ' program-card--media' : ''}`}>
      {meta?.image && (
        <span className="program-card__media">
          <img src={meta.image} alt="" loading="lazy" width="1100" height="688" />
        </span>
      )}
      <div className="program-card__body">
        <IconTile name={course.icon} />
        <h3>{course.title}</h3>
        <p>{course.summary}</p>
        <div className="program-card__topics">
          {course.topics.map((t) => (
            <span key={t} className="tag">{t}</span>
          ))}
        </div>
        <CourseFacts course={course} />
        <div className="program-card__actions">
          <EnrollButton course={course} portal={portal} signedIn={signedIn} />
          <Link to={`/contact?subject=${encodeURIComponent(`Training enquiry: ${course.title}`)}`} className="link-arrow">
            {course.fee && course.next_intake ? 'Ask a question' : 'Ask about dates & fees'} <i className="fas fa-arrow-right" />
          </Link>
        </div>
        {meta?.service && (
          <Link to={`/services/${meta.service}`} className="program-card__service">
            <BrandIcon name="consult" size={16} /> We also offer this as a service
          </Link>
        )}
      </div>
    </article>
  );
};

export const CoursesPage = () => {
  const { data: programs, error } = useCourses();
  const { isAuthenticated } = useAuth();
  const portal = usePortal();
  const [group, setGroup] = useState('all');
  // Filter buttons only for groups that have a programme; programmes not listed in courseMeta stay under "All"
  const groups = COURSE_GROUPS.filter((g) => programs?.some((p) => courseMeta[p.slug]?.group === g.id));
  const shown = programs?.filter((p) => group === 'all' || courseMeta[p.slug]?.group === group);

  return (
    <>
      <PageHero
        eyebrow="Training"
        title="Learn the skills the digital economy runs on"
        background={HERO_PHOTO}
        art={<div className="art-frame art-frame--dark"><TrainingArt /></div>}
        actions={
          <>
            <a href="#programmes" className="btn btn--primary">
              <i className="fas fa-graduation-cap" /> Browse programmes
            </a>
            <a href={telHref(site.phones[0])} className="btn btn--ghost-light">
              <i className="fas fa-phone" /> Call us
            </a>
          </>
        }
      >
        Practical, project-based programmes taught by people who build software and networks for a living.
      </PageHero>

      <section className="train-stats" aria-label="Training at a glance">
        <div className="container train-stats__inner">
          <div><strong>{programs ? programs.length : '…'}</strong><span>programmes</span></div>
          <div><strong>100%</strong><span>hands-on and project-based</span></div>
          <div><strong>Certificate</strong><span>on every completed programme</span></div>
          <div><strong>Freetown</strong><span>in-person and corporate classes</span></div>
        </div>
      </section>

      <section className="section" id="programmes">
        <div className="container">
          <SectionHeading eyebrow="Programmes" title="Choose your track">
            Every programme ends with a real project you can show to employers.
          </SectionHeading>
          {groups.length > 1 && (
            <div className="program-filter" role="group" aria-label="Filter programmes">
              {[{ id: 'all', label: 'All programmes' }, ...groups].map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className={`program-filter__btn${group === g.id ? ' is-active' : ''}`}
                  aria-pressed={group === g.id}
                  onClick={() => setGroup(g.id)}
                >
                  {g.label}
                </button>
              ))}
            </div>
          )}
          {error && <p className="muted">Programmes couldn’t be loaded right now. Please refresh the page or contact us for details.</p>}
          <div className="grid grid-3" aria-busy={!programs && !error}>
            {!programs && !error && [0, 1, 2].map((i) => <div key={i} className="card program-card"><span className="skeleton skeleton--block" /></div>)}
            {shown?.map((p) => (
              <ProgramCard key={p.slug} course={p} portal={portal} signedIn={isAuthenticated} />
            ))}
          </div>
        </div>
      </section>

      <section className="section section--surface">
        <div className="container">
          <SectionHeading eyebrow="Why train with ADRAM" title="Skills you can use on Monday" center />
          <div className="grid grid-4">
            {reasons.map((r) => (
              <div key={r.title} className="card card--hover">
                <IconTile name={r.icon} />
                <h3>{r.title}</h3>
                <p className="muted">{r.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container train-how">
          <SectionHeading eyebrow="How it works" title="From first question to certificate">
            Four simple steps, with our team on hand at every one.
          </SectionHeading>
          <ol className="timeline">
            {steps.map((step, i) => (
              <li key={step.title}>
                <span className="timeline__num">{i + 1}</span>
                <div>
                  <h4>{step.title}</h4>
                  <p>{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section section--surface">
        <div className="container">
          <SectionHeading eyebrow="How you learn" title="Flexible ways to train" center />
          <div className="grid grid-3">
            {formats.map((f) => (
              <div key={f.title} className="card">
                <IconTile name={f.icon} />
                <h3>{f.title}</h3>
                <p className="muted">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container train-faq">
          <SectionHeading eyebrow="Questions" title="Good to know before you enrol" />
          <div className="faq">
            {faqs.map((f, i) => (
              <details key={f.q} open={i === 0}>
                <summary>
                  {f.q}
                  <i className="fas fa-chevron-down" aria-hidden="true" />
                </summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <CtaBand title="Ready to start learning?" text="Tell us which programme interests you and we’ll send the next intake dates and fees." />
    </>
  );
};

export default CoursesPage;
