import { usePageContent } from '../../content/useContent';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { lmsAPI } from '../../services/api';
import { formatDate } from '../../utils/format';
import '../../styles/shop.css';

/** Anyone can check that a certificate ID is real. */
export const VerifyCertificatePage = () => {
  const copy = usePageContent('store').verify;
  const [params, setParams] = useSearchParams();
  const code = (params.get('code') || '').trim().toUpperCase();
  const [draft, setDraft] = useState(code);
  const [result, setResult] = useState({ code: '', data: null, found: null });

  useEffect(() => {
    if (!code) return undefined;
    let live = true;
    lmsAPI.verifyCertificate(code)
      .then(({ data }) => live && setResult({ code, data, found: true }))
      .catch(() => live && setResult({ code, data: null, found: false }));
    return () => {
      live = false;
    };
  }, [code]);

  const submit = (e) => {
    e.preventDefault();
    const next = draft.trim().toUpperCase();
    if (next) setParams({ code: next });
  };
  const checking = code && result.code !== code;
  const c = result.code === code ? result.data : null;

  return (
    <section className="container verify">
      <p className="ip-head__eyebrow">{copy.eyebrow}</p>
      <h1>{copy.title}</h1>
      <p className="muted">{copy.lead}</p>
      <form className="verify__form" onSubmit={submit} role="search">
        <label htmlFor="cert-code" className="sr-only">Certificate ID</label>
        <input id="cert-code" className="input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="ADR-XXXX-XXXX-XXXX" autoComplete="off" />
        <button type="submit" className="btn btn--primary" disabled={!draft.trim()}><i className="fas fa-magnifying-glass" /> Verify</button>
      </form>

      {checking && <p className="muted" aria-live="polite">Checking…</p>}
      {!checking && result.found === false && result.code === code && (
        <div className="verify__result verify__result--bad" role="alert">
          <i className="fas fa-circle-xmark" aria-hidden="true" />
          <div><strong>No certificate has the ID {code}</strong><p>Check the ID for typing mistakes and try again.</p></div>
        </div>
      )}
      {!checking && c && (
        <div className={`verify__result ${c.revoked ? 'verify__result--bad' : 'verify__result--ok'}`} role="status">
          <i className={`fas ${c.revoked ? 'fa-ban' : 'fa-circle-check'}`} aria-hidden="true" />
          <div>
            <strong>{c.revoked ? 'This certificate was revoked and is no longer valid' : 'This certificate is genuine'}</strong>
            <dl>
              <dt>Awarded to</dt><dd>{c.student_name}</dd>
              <dt>Course</dt><dd>{c.course_title}</dd>
              <dt>Instructor</dt><dd>{c.instructor_name}</dd>
              <dt>Completed</dt><dd>{formatDate(c.issued_at)}</dd>
              <dt>Issued by</dt><dd>{c.platform_name}</dd>
              <dt>ID</dt><dd>{c.code}</dd>
            </dl>
            {!c.revoked && <Link to={`/certificate/${c.code}`} className="link-arrow">View the certificate <i className="fas fa-arrow-right" /></Link>}
          </div>
        </div>
      )}
    </section>
  );
};

export default VerifyCertificatePage;
