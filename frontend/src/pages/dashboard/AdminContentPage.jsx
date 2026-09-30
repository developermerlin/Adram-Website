import { Link } from 'react-router-dom';
import { contentPages } from '../../content/schema';
import PortalLayout from '../../components/layout/PortalLayout';

// The pages whose wording, photos and details the admin can change.
export const AdminContentPage = () => (
  <PortalLayout
    title="Site content"
    subtitle="Change the text, photos and details shown on the public website. Saved changes go live immediately."
  >
    <div className="cf-pages">
      {contentPages.map((p) => (
        <article key={p.slug} className="card cf-page">
          <span className="cf-page__icon" aria-hidden="true"><i className={`fas ${p.icon}`} /></span>
          <div className="cf-page__body">
            <h2 className="h3">{p.label}</h2>
            <p className="muted small">{p.description}</p>
            <p className="cf-page__sections">{p.sections.map((s) => s.title).join(' · ')}</p>
          </div>
          <div className="cf-page__actions">
            <Link to={`/admin/content/${p.slug}`} className="btn btn--primary btn--sm"><i className="fas fa-pen" /> Edit content</Link>
            <Link to={p.publicPath} target="_blank" className="btn btn--outline btn--sm"><i className="fas fa-arrow-up-right-from-square" /> View</Link>
          </div>
        </article>
      ))}
    </div>

    <p className="muted small cf-note">
      <i className="fas fa-circle-info" aria-hidden="true" /> The scholarships and training programmes themselves are edited under
      Scholarships and Training. The sign-in, registration and portal screens keep their own wording.
    </p>
  </PortalLayout>
);

export default AdminContentPage;
