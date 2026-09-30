import { Link } from 'react-router-dom';
import { usePageContent } from '../../content/useContent';
import '../../styles/pages.css';

const StatusPage = ({ code, title, text }) => {
  const { errors } = usePageContent('other');
  return (
    <section className="status-page">
      <div className="container">
        <p className="status-page__code text-gradient">{code}</p>
        <h1>{title}</h1>
        <p className="muted">{text}</p>
        <div className="center-actions">
          <Link to="/" className="btn btn--primary">{errors.homeLabel}</Link>
          <Link to="/contact" className="btn btn--outline">{errors.contactLabel}</Link>
        </div>
      </div>
    </section>
  );
};

export const NotFoundPage = () => {
  const { errors } = usePageContent('other');
  return <StatusPage code="404" title={errors.notFoundTitle} text={errors.notFoundText} />;
};

export const UnauthorizedPage = () => {
  const { errors } = usePageContent('other');
  return <StatusPage code="403" title={errors.deniedTitle} text={errors.deniedText} />;
};
