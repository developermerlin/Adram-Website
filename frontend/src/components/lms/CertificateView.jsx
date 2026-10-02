import Brand from '../ui/Brand';
import { assetUrl } from '../../utils/assets';
import { formatDate } from '../../utils/format';
import '../../styles/lms.css';
import '../../styles/certificates.css';

/**
 * The certificate itself, drawn with its template (layout, accent colour, wording, what to show).
 * `c` is the API's certificate data; without a template it uses the built-in classic design.
 * `preview` shows a placeholder where the QR code goes (the admin's template preview).
 */
export const CertificateView = ({ c, preview = false }) => {
  const t = c.template || {};
  const layout = t.layout || 'classic';
  const showHours = t.show_hours !== false && c.hours > 0;
  const showInstructor = t.show_instructor !== false && c.instructor_name;
  const showQr = t.show_qr !== false && (c.qr_svg || preview);
  return (
    <article className={`cert cert--${layout}`} style={t.accent_color ? { '--cert-accent': t.accent_color } : undefined}
      aria-label={`${t.title || 'Certificate of completion'} for ${c.student_name}`}>
      {layout === 'modern' && <span className="cert__band" aria-hidden="true" />}
      <div className="cert__brand"><Brand /></div>
      <p className="cert__kicker">{t.title || 'Certificate of completion'}</p>
      {(t.heading ?? 'Congratulations') && <h1>{t.heading ?? 'Congratulations'}</h1>}
      <p className="cert__lead">This certifies that</p>
      <p className="cert__name">{c.student_name}</p>
      <p className="cert__lead">{t.lead || 'has successfully completed the course'}</p>
      <p className="cert__course">{c.course_title}</p>
      {(showInstructor || showHours) && (
        <p className="cert__lead cert__by">
          {showInstructor && <>taught by <strong>{c.instructor_name}</strong></>}
          {showInstructor && showHours && ' · '}
          {showHours && <>{c.hours} {c.hours === 1 ? 'hour' : 'hours'} of content</>}
        </p>
      )}
      <div className="cert__foot">
        <div><strong>{formatDate(c.issued_at)}</strong>Date of completion</div>
        {showQr ? (
          c.qr_svg
            // the QR code is an SVG made by our own server from the verification link
            ? <span className="cert__qr" title="Scan to verify" dangerouslySetInnerHTML={{ __html: c.qr_svg }} />
            : <span className="cert__qr cert__qr--placeholder" aria-hidden="true"><i className="fas fa-qrcode" /></span>
        ) : <span className="cert__seal" aria-hidden="true"><i className="fas fa-award" /></span>}
        <div className="cert__sign">
          {c.signature ? <img src={assetUrl(c.signature)} alt="" /> : <span className="cert__sign-line" />}
          <strong>{c.signer_name || c.platform_name}</strong>
          {c.signer_title || 'Authorised signature'}
        </div>
      </div>
      {t.footer_note && <p className="cert__note">{t.footer_note}</p>}
      <p className="cert__id">Certificate ID <strong>{c.code}</strong> · Issued by {c.platform_name}{showQr ? ' · Scan the code to verify' : ''}</p>
    </article>
  );
};

export default CertificateView;
