import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import usePortal from '../../data/usePortal';
import PortalLayout from '../../components/layout/PortalLayout';
import { Alert } from '../../components/ui/Form';
import { ScholarshipRow, StudyGoalsForm } from '../../components/portal/PortalPieces';
import SavedInsights from '../../components/portal/SavedInsights';

export const StudentSavedPage = () => {
  const portal = usePortal();
  const { data } = portal;
  const hasGoals = Boolean(data && (data.goals.levels.length || data.goals.destinations.length));

  // Links from the overview jump straight to the study goals.
  useEffect(() => {
    if (data && window.location.hash) document.querySelector(window.location.hash)?.scrollIntoView({ behavior: 'smooth' });
  }, [data]);

  return (
    <PortalLayout
      title="Saved scholarships"
      subtitle="Your shortlist, and scholarships that match your study goals."
      actions={<Link to="/scholarships" className="btn btn--outline btn--sm"><i className="fas fa-magnifying-glass" /> Browse all</Link>}
    >
      {portal.error && <Alert>Your saved scholarships couldn’t be loaded. Refresh the page to try again.</Alert>}
      {data && (
        <SavedInsights
          saved={data.saved}
          goals={data.goals}
          isTracking={(slug) => Boolean(portal.applicationFor(slug))}
          onTrack={portal.startApplication}
        />
      )}
      <div className="dash-grid">
        <div className="stack-lg">
          <section className="card panel">
            <div className="panel__head">
              <h2 className="h3">Saved</h2>
              <span className="panel__meta">{data?.saved.length ?? ''}</span>
            </div>
            {!data && <div className="skeleton skeleton--block" />}
            {data?.saved.length === 0 && <p className="muted">Nothing saved yet. Use <strong>Save</strong> on any scholarship to keep it here.</p>}
            <ul className="sch-rows">
              {data?.saved.map((s) => (
                <ScholarshipRow key={s.slug} scholarship={s}>
                  {portal.applicationFor(s.slug) ? (
                    <Link to="/student/applications" className="btn btn--outline btn--sm">Tracking</Link>
                  ) : (
                    <button type="button" className="btn btn--primary btn--sm" onClick={() => portal.startApplication(s)}>Track</button>
                  )}
                  <button type="button" className="icon-btn icon-btn--danger" aria-label={`Remove ${s.name} from saved`} title="Remove" onClick={() => portal.toggleSave(s)}>
                    <i className="fas fa-bookmark" />
                  </button>
                </ScholarshipRow>
              ))}
            </ul>
          </section>

          <section className="card panel">
            <div className="panel__head">
              <div>
                <h2 className="h3">Recommended for you</h2>
                <p className="muted small">{hasGoals ? 'Based on your study goals.' : 'Set your study goals for better matches.'}</p>
              </div>
            </div>
            <ul className="sch-rows">
              {data?.recommended.map((s) => (
                <ScholarshipRow key={s.slug} scholarship={s}>
                  <button type="button" className="btn btn--outline btn--sm" onClick={() => portal.toggleSave(s)}><i className="far fa-bookmark" /> Save</button>
                </ScholarshipRow>
              ))}
            </ul>
          </section>
        </div>

        <aside className="stack-lg">
          <section className="card panel" id="goals">
            <div className="panel__head"><h2 className="h3">Study goals</h2></div>
            {data ? <StudyGoalsForm goals={data.goals} onSave={portal.saveGoals} /> : <div className="skeleton skeleton--block" />}
          </section>
        </aside>
      </div>
    </PortalLayout>
  );
};

export default StudentSavedPage;
