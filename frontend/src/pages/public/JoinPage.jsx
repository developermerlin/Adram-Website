import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useScholarship } from '../../data/useCatalog';
import { IconTile, PageHero } from '../../components/ui/Section';
import Flag from '../../components/ui/Flag';
import '../../styles/pages.css';

const benefits = [
  { icon: 'globe', title: 'Official scholarship websites', text: 'Open the provider’s own site for every scholarship we list.' },
  { icon: 'award', title: 'Save and track applications', text: 'Keep a shortlist, follow each application’s stage and never miss a deadline.' },
  { icon: 'certificate', title: 'Documents checklist', text: 'Tick off your passport, transcripts, references and essays as you go.' },
  { icon: 'support', title: 'Help from a counsellor', text: 'ADRAM’s team can see your progress and guide your next steps.' },
];

const stepsFor = (training) => [
  'Create your free account',
  'Confirm your email with the 6-digit code we send',
  training
    ? 'You’re taken back to the Training page, where you can enroll in one click'
    : 'You’re taken straight back to the scholarship, with its official website unlocked',
];

// Only same-site paths, so the link can't be used to send people elsewhere.
const safeNext = (value) => (value && value.startsWith('/') && !value.startsWith('//') ? value : '/scholarships');

export const JoinPage = () => {
  const [params] = useSearchParams();
  const { isAuthenticated } = useAuth();
  const next = safeNext(params.get('next'));
  const slug = next.match(/^\/scholarships\/([\w-]+)$/)?.[1];
  const { data: scholarship } = useScholarship(slug || null);

  const training = next.startsWith('/courses');
  if (isAuthenticated) return <Navigate to={next} replace />;

  return (
    <>
      <PageHero eyebrow="Join ADRAM" title={training ? 'Create a free account to enroll in training' : 'Create a free account to see official scholarship websites'}>
        {training
          ? 'Enrolling, and following your programme in your own portal, is for ADRAM members. It takes about a minute.'
          : 'Official links, saved scholarships and application tracking are available to ADRAM members. It takes about a minute.'}
      </PageHero>

      <section className="section">
        <div className="container join-layout">
          <div className="join-card">
            {slug && scholarship && (
              <div className="join-card__target">
                <Flag code={scholarship.country} size={36} />
                <div>
                  <small>You’re about to open</small>
                  <strong>{scholarship.name}</strong>
                </div>
              </div>
            )}
            <h2>Join us to continue</h2>
            <ol className="join-steps">
              {stepsFor(training).map((step, i) => (
                <li key={step}><span>{i + 1}</span> {step}</li>
              ))}
            </ol>
            <div className="join-card__actions">
              <Link to="/register" state={{ from: next }} className="btn btn--primary btn--block">
                <i className="fas fa-user-plus" /> Create free account
              </Link>
              <Link to="/login" state={{ from: next }} className="btn btn--outline btn--block">
                <i className="fas fa-right-to-bracket" /> I already have an account
              </Link>
            </div>
            <Link to={next} className="join-card__back"><i className="fas fa-arrow-left" /> Back to {scholarship ? scholarship.name : 'scholarships'}</Link>
          </div>

          <div>
            <span className="eyebrow">Why join</span>
            <h2>Everything for your scholarship journey in one place</h2>
            <div className="join-benefits">
              {benefits.map((b) => (
                <div key={b.title} className="benefit">
                  <IconTile name={b.icon} />
                  <div>
                    <h4>{b.title}</h4>
                    <p>{b.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

export default JoinPage;
