import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useScholarship } from '../../data/useCatalog';
import { fill } from '../../content/merge';
import { usePageContent } from '../../content/useContent';
import { IconTile, PageHero } from '../../components/ui/Section';
import Flag from '../../components/ui/Flag';
import '../../styles/pages.css';

// Only same-site paths, so the link can't be used to send people elsewhere.
const safeNext = (value) => (value && value.startsWith('/') && !value.startsWith('//') ? value : '/scholarships');

export const JoinPage = () => {
  const { join: c } = usePageContent('other');
  const [params] = useSearchParams();
  const { isAuthenticated } = useAuth();
  const next = safeNext(params.get('next'));
  const slug = next.match(/^\/scholarships\/([\w-]+)$/)?.[1];
  const { data: scholarship } = useScholarship(slug || null);

  const training = next.startsWith('/courses') || next.startsWith('/learn');
  if (isAuthenticated) return <Navigate to={next} replace />;

  return (
    <>
      <PageHero eyebrow={c.eyebrow} title={training ? c.titleTraining : c.titleScholarship}>
        {training ? c.leadTraining : c.leadScholarship}
      </PageHero>

      <section className="section">
        <div className="container join-layout">
          <div className="join-card">
            {slug && scholarship && (
              <div className="join-card__target">
                <Flag code={scholarship.country} size={36} />
                <div>
                  <small>{c.targetLabel}</small>
                  <strong>{scholarship.name}</strong>
                </div>
              </div>
            )}
            <h2>{c.cardTitle}</h2>
            <ol className="join-steps">
              {[c.stepOne, c.stepTwo, training ? c.stepTrainingLast : c.stepScholarshipLast].map((step, i) => (
                <li key={step}><span>{i + 1}</span> {step}</li>
              ))}
            </ol>
            <div className="join-card__actions">
              <Link to="/register" state={{ from: next }} className="btn btn--primary btn--block">
                <i className="fas fa-user-plus" /> {c.createLabel}
              </Link>
              <Link to="/login" state={{ from: next }} className="btn btn--outline btn--block">
                <i className="fas fa-right-to-bracket" /> {c.signInLabel}
              </Link>
            </div>
            <Link to={next} className="join-card__back"><i className="fas fa-arrow-left" /> {fill(c.backLabel, { name: scholarship ? scholarship.name : 'scholarships' })}</Link>
          </div>

          <div>
            <span className="eyebrow">{c.whyEyebrow}</span>
            <h2>{c.whyTitle}</h2>
            <div className="join-benefits">
              {c.benefits.map((b) => (
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
