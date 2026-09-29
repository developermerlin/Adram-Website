import { useState } from 'react';
import { Link } from 'react-router-dom';
import usePortal from '../../data/usePortal';
import { isClosed } from '../../utils/applicationStages';
import PortalLayout from '../../components/layout/PortalLayout';
import { Alert } from '../../components/ui/Form';
import ApplicationCard from '../../components/portal/ApplicationCard';
import ApplicationsInsights from '../../components/portal/ApplicationsInsights';

const FILTERS = [
  { id: 'active', label: 'In progress', test: (a) => !isClosed(a.stage) },
  { id: 'closed', label: 'Finished', test: (a) => isClosed(a.stage) },
  { id: 'all', label: 'All', test: () => true },
];

export const StudentApplicationsPage = () => {
  const portal = usePortal();
  const { data } = portal;
  const [filter, setFilter] = useState('active');
  const applications = data?.applications || [];
  const shown = applications.filter(FILTERS.find((f) => f.id === filter).test);

  const actions = {
    update: portal.updateApplication,
    requestService: portal.requestService,
    acceptTerms: portal.acceptTerms,
    addDocument: portal.addDocument,
    updateDocument: portal.updateDocument,
    removeDocument: portal.removeDocument,
  };

  return (
    <PortalLayout
      title="My applications"
      subtitle="Every scholarship you’re applying for, with its stage, documents and ADRAM’s updates."
      actions={<Link to="/scholarships" className="btn btn--primary btn--sm"><i className="fas fa-plus" /> Track another scholarship</Link>}
    >
      {portal.error && <Alert>Your applications couldn’t be loaded. Refresh the page to try again.</Alert>}

      {data && <ApplicationsInsights applications={applications} />}

      <div className="tabs" role="tablist" aria-label="Filter applications">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} className={`tabs__tab${filter === f.id ? ' is-active' : ''}`} onClick={() => setFilter(f.id)}>
            {f.label}
            {data && <span className="tabs__count">{applications.filter(f.test).length}</span>}
          </button>
        ))}
      </div>

      {!data && <div className="skeleton skeleton--block" />}
      {data && shown.length === 0 && (
        <section className="card panel empty-state">
          <span className="empty-state__icon"><i className="fas fa-list-check" /></span>
          <h3>{applications.length ? 'Nothing here' : 'No applications yet'}</h3>
          <p className="muted">Open any scholarship and choose <strong>Track my application</strong>, or ask ADRAM to apply for you.</p>
          <Link to="/scholarships" className="btn btn--primary btn--sm">Browse scholarships</Link>
        </section>
      )}
      <div className="app-list app-list--page">
        {shown.map((a) => <ApplicationCard key={a.id} application={a} actions={actions} />)}
      </div>
    </PortalLayout>
  );
};

export default StudentApplicationsPage;
