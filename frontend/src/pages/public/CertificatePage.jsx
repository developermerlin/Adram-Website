import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { lmsAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import Brand from '../../components/ui/Brand';
import { Spinner } from '../../components/ui/Section';
import ShareButtons from '../../components/lms/ShareButtons';
import { assetUrl } from '../../utils/assets';
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

  const url = `${window.location.origin}/certificate/${c.code}`;
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

        <article className="cert" aria-label={`Certificate of completion for ${c.student_name}`}>
          <div className="cert__brand"><Brand /></div>
          <p className="cert__kicker">Certificate of completion</p>
          <h1>Congratulations</h1>
          <p className="cert__lead">This certifies that</p>
          <p className="cert__name">{c.student_name}</p>
          <p className="cert__lead">has successfully completed the course</p>
          <p className="cert__course">{c.course_title}</p>
          <p className="cert__lead cert__by">
            taught by <strong>{c.instructor_name}</strong>{c.hours > 0 && <> · {c.hours} {c.hours === 1 ? 'hour' : 'hours'} of content</>}
          </p>
          <div className="cert__foot">
            <div><strong>{formatDate(c.issued_at)}</strong>Date of completion</div>
            <span className="cert__seal" aria-hidden="true"><i className="fas fa-award" /></span>
            <div className="cert__sign">
              {c.signature ? <img src={assetUrl(c.signature)} alt="" /> : <span className="cert__sign-line" />}
              <strong>{c.signer_name || c.platform_name}</strong>
              {c.signer_title || 'Authorised signature'}
            </div>
          </div>
          <p className="cert__id">Certificate ID <strong>{c.code}</strong> · Issued by {c.platform_name}</p>
        </article>
        <div className="cert-verify">
          <p><i className="fas fa-shield-halved" /> This certificate is genuine. Anyone can confirm it at <Link to={`/verify?code=${c.code}`}>{window.location.host}/verify</Link> with the ID {c.code}.</p>
          <ShareButtons url={url} text={`I earned a certificate in ${c.course_title} from ${c.platform_name}!`} />
        </div>
      </div>
    </section>
  );
};

export default CertificatePage;
