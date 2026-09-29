import { formatDate, formatDateTime } from '../../utils/format';
import { daysUntil } from '../../utils/applicationStages';

/**
 * The admin's "ADRAM applies for you" settings for one scholarship.
 * `requestedAt` set: shows the confirmation instead of the offer. `action` is the button (or link) to request it.
 */
export const ServiceOffer = ({ info, requestedAt, action, staff = false }) => {
  if (!info?.service_enabled) return null;
  const cutoffDays = daysUntil(info.service_cutoff);

  if (requestedAt) {
    return (
      <div className="service-offer service-offer--requested">
        <p className="service-offer__title">
          <i className="fas fa-circle-check" aria-hidden="true" />
          {staff ? 'The student asked ADRAM to apply for them' : 'You asked ADRAM to apply for you'} on {formatDateTime(requestedAt)}.
        </p>
        {!staff && (
          <p>
            Tick off the documents below as you send them to us
            {info.service_cutoff && <> and have everything in by <strong>{formatDate(`${info.service_cutoff}T00:00`)}</strong></>}. Your counsellor
            will keep your next step up to date here.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="service-offer">
      <div className="service-offer__head">
        <p className="service-offer__title"><i className="fas fa-handshake-angle" aria-hidden="true" /> ADRAM can apply for you</p>
        {info.service_fee && <span className="service-offer__fee">{info.service_fee}</span>}
      </div>
      {info.service_note && <p className="service-offer__note">{info.service_note}</p>}
      <div className="service-offer__cols">
        {info.service_includes?.length > 0 && (
          <div>
            <h5>What we do</h5>
            <ul className="service-offer__list">
              {info.service_includes.map((x) => <li key={x}><i className="fas fa-check" aria-hidden="true" /> {x}</li>)}
            </ul>
          </div>
        )}
        {info.service_requirements?.length > 0 && (
          <div>
            <h5>What we need from you</h5>
            <ul className="service-offer__list service-offer__list--need">
              {info.service_requirements.map((x) => <li key={x}><i className="far fa-file-lines" aria-hidden="true" /> {x}</li>)}
            </ul>
          </div>
        )}
      </div>
      {info.service_cutoff && (
        <p className={`service-offer__cutoff${cutoffDays !== null && cutoffDays <= 14 ? ' is-urgent' : ''}`}>
          <i className="fas fa-hourglass-half" aria-hidden="true" /> Send us your documents by <strong>{formatDate(`${info.service_cutoff}T00:00`)}</strong>
          {cutoffDays !== null && (cutoffDays < 0 ? ' (this date has passed; contact us)' : ` (${cutoffDays} day${cutoffDays === 1 ? '' : 's'} left)`)}
        </p>
      )}
      {action}
    </div>
  );
};

export default ServiceOffer;
