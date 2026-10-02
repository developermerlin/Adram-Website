import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { lmsAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Spinner } from '../../components/ui/Section';
import ShareButtons from '../../components/lms/ShareButtons';
import CertificateView from '../../components/lms/CertificateView';
import { formatDate } from '../../utils/format';
import { NotFoundPage } from './StatusPages';
import '../../styles/lms.css';
import '../../styles/shop.css';

// A completion certificate. Anyone with the code can open it, which is also how it's verified.
// `?print=1` opens the print dialog straight away (the "Download" button on My certificates).
export const CertificatePage = () => {
  const { code } = useParams();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const [state, setState] = useState({ certificate: null, error: false });

  useEffect(() => {
    let live = true;
    lmsAPI
      .verifyCertificate(code)
      .then(({ data }) => {
        if (!live) return;
        setState({ certificate: data, error: false });
        if (params.get('print') && !data.revoked) setTimeout(() => window.print(), 600);
      })
      .catch(() => live && setState({ certificate: null, error: true }));
    return () => {
      live = false;
    };
  }, [code, params]);

  const { certificate: c, error } = state;
  if (error) return <NotFoundPage />;
  if (!c) return <Spinner label="Loading certificate…" />;

  const url = c.verify_url || `${window.location.origin}/certificate/${c.code}`;
  const back = user?.role === 'STUDENT' ? '/student/certificates' : '/courses';

  if (c.revoked) {
    return (
      <section className="cert-page">
        <div className="container verify">
          <div className="verify__result verify__result--bad" role="alert">
            <i className="fas fa-ban" aria-hidden="true" />
            <div>
              <strong>This certificate has been revoked</strong>
              <p>Certificate {c.code} for {c.course_title} is no longer valid{c.revoked_at ? ` (revoked on ${formatDate(c.revoked_at)})` : ''}.</p>
              <p><Link to="/verify" className="link-arrow">Check another certificate <i className="fas fa-arrow-right" /></Link></p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="cert-page">
      <div className="container">
        <div className="cert-actions">
          <button type="button" className="btn btn--primary" onClick={() => window.print()}>
            <i className="fas fa-download" /> Download / print
          </button>
          <Link to={back} className="btn btn--outline"><i className="fas fa-arrow-left" /> Back</Link>
        </div>

        <CertificateView c={c} />
        <div className="cert-verify">
          <p><i className="fas fa-shield-halved" /> This certificate is genuine. Anyone can confirm it at <Link to={`/verify?code=${c.code}`}>{window.location.host}/verify</Link> with the ID {c.code}.</p>
          <div className="cert-linkedin">
            <a href={c.linkedin_url} className="btn btn--linkedin btn--sm" target="_blank" rel="noopener noreferrer"><i className="fab fa-linkedin" /> Add to LinkedIn profile</a>
            <small className="muted">Adds it under “Licences & certifications”, linked to this page.</small>
          </div>
          <ShareButtons url={url} text={`I earned a certificate in ${c.course_title} from ${c.platform_name}!`} />
        </div>
      </div>
    </section>
  );
};

export default CertificatePage;
