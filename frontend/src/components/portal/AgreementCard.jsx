import { Link } from 'react-router-dom';
import { formatDateTime } from '../../utils/format';
import { fillText } from '../../utils/agreement';
import '../../styles/agreement.css';

/**
 * The invitation to sign, made to stand out: "no win, no fee", the fee and its schedule, how long it takes.
 * Shown on the progress page next to the application form, and on the form page. The wording is set by the admin
 * (Admin → Service agreements → Agreement template → Wording).
 */
export const AgreementInvite = ({ applicationId, agreement: ag, scholarship = '', compact = false }) => {
  const w = ag.card || {};
  const m = ag.money || {};
  const values = {
    fee: m.total || 'Agreed fee', first_percent: String(m.first_percent ?? 60), second_percent: String(m.second_percent ?? 40),
    first_amount: m.first_amount, second_amount: m.second_amount, reference: ag.reference, scholarship,
  };
  const t = (key) => fillText(w[key], values);
  const facts = [['fact1', 'fa-hand-holding-dollar'], ['fact2', 'fa-calendar-check'], ['fact3', 'fa-stopwatch']].filter(([k]) => w[`${k}_title`]);
  return (
    <section className={`agi${compact ? ' agi--compact' : ''}`} aria-label="Your service agreement">
      <div className="agi__glow" aria-hidden="true" />
      <div className="agi__main">
        {w.card_badge && <span className="agi__badge"><i className="fas fa-shield-heart" aria-hidden="true" /> {t('card_badge')}</span>}
        <h2 className="agi__title">{t(ag.awarded ? 'card_title_awarded' : compact ? 'card_title_form' : 'card_title')}</h2>
        <p className="agi__lead">{t(ag.awarded ? 'card_lead_awarded' : 'card_lead')}</p>
        {!compact && facts.length > 0 && (
          <ul className="agi__facts">
            {facts.map(([k, icon]) => (
              <li key={k}><i className={`fas ${icon}`} aria-hidden="true" /><span><strong>{t(`${k}_title`)}</strong>{t(`${k}_text`)}</span></li>
            ))}
          </ul>
        )}
      </div>
      <div className="agi__cta">
        <Link to={`/student/applications/${applicationId}/agreement`} className="btn agi__btn">
          <i className="fas fa-file-signature" aria-hidden="true" /> {t('card_button') || 'Read and sign'}
        </Link>
        <small>{ag.reference} · legally binding e-signature</small>
      </div>
    </section>
  );
};

/**
 * The service agreement on an application: for the student, "please sign" (or the signed copy);
 * for the admin (`staff`), its status and a link to it. `vivid` shows the full invitation instead of a strip.
 */
export const AgreementCard = ({ application: a, staff = false, vivid = false }) => {
  const ag = a.agreement;
  if (!ag || (!staff && ag.status === 'void')) return null;
  if (staff) {
    return (
      <div className={`agc agc--${ag.status}`}>
        <i className="fas fa-file-contract" aria-hidden="true" />
        <span>Service agreement {ag.reference}: <strong>{ag.status_display}</strong>{ag.fee && ` · fee ${ag.fee}`}{ag.signed_at && ` · signed ${formatDateTime(ag.signed_at)}`}</span>
        <Link to={`/admin/agreements/${a.id}`} target="_blank" className="btn btn--outline btn--sm">Open</Link>
      </div>
    );
  }
  const pending = ag.status === 'pending';
  if (ag.status === 'uploaded') {
    return (
      <div className="agc agc--uploaded">
        <i className="fas fa-hourglass-half" aria-hidden="true" />
        <span><strong>Signed copy received.</strong> ADRAM is checking your signed agreement ({ag.reference}) and will let you know once it is accepted.</span>
        <Link to={`/student/applications/${a.id}/agreement`} className="btn btn--outline btn--sm">View</Link>
      </div>
    );
  }
  if (pending && vivid) return <AgreementInvite applicationId={a.id} agreement={ag} scholarship={a.scholarship_name} />;
  return (
    <div className={`agc agc--${ag.status}`}>
      <i className={`fas ${pending ? (ag.awarded ? 'fa-award' : 'fa-file-signature') : 'fa-file-circle-check'}`} aria-hidden="true" />
      <span>
        {pending
          ? (ag.return_note
            ? <><strong>Please upload your signed agreement again.</strong> {ag.return_note}</>
            : <><strong>{ag.awarded ? 'Congratulations! Please sign your service agreement.' : 'Your service agreement is ready to sign.'}</strong> No win, no fee: read it, then sign online or on paper.</>)
          : <>
            <strong>Service agreement signed</strong> on {formatDateTime(ag.signed_at)} ({ag.reference}).
            {ag.money?.total && (ag.money.fully_paid
              ? <> Service fee {ag.money.total}: <strong>paid in full</strong>.</>
              : <> Service fee {ag.money.total} · paid {ag.money.paid} ({ag.money.paid_percent}%) · balance <strong>{ag.money.balance}</strong>.</>)}
          </>}
      </span>
      <Link to={`/student/applications/${a.id}/agreement`} className={`btn btn--sm ${pending ? 'btn--primary' : 'btn--outline'}`}>
        {pending ? <><i className="fas fa-file-signature" /> {ag.ready ? 'Read and sign' : 'Read it'}</> : <><i className="fas fa-receipt" /> Agreement &amp; payments</>}
      </Link>
    </div>
  );
};

export default AgreementCard;
