import { Link } from 'react-router-dom';
import '../../styles/pages.css';

const StatusPage = ({ code, title, text }) => (
  <section className="status-page">
    <div className="container">
      <p className="status-page__code text-gradient">{code}</p>
      <h1>{title}</h1>
      <p className="muted">{text}</p>
      <div className="center-actions">
        <Link to="/" className="btn btn--primary">Back to home</Link>
        <Link to="/contact" className="btn btn--outline">Contact us</Link>
      </div>
    </div>
  </section>
);

export const NotFoundPage = () => (
  <StatusPage code="404" title="Page not found" text="The page you’re looking for doesn’t exist or has moved." />
);

export const UnauthorizedPage = () => (
  <StatusPage code="403" title="Access denied" text="Your account doesn’t have permission to view this page." />
);
