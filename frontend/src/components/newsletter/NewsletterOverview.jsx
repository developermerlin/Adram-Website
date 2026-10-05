import { useEffect, useState } from 'react';
import { newsletterAPI } from '../../services/api';
import { formatDate } from '../../utils/format';

const Stat = ({ icon, label, value, hint, tone = '' }) => (
  <div className={`card nl-stat ${tone}`}>
    <span className="nl-stat__icon" aria-hidden="true"><i className={`fas ${icon}`} /></span>
    <div>
      <p className="nl-stat__value">{value}</p>
      <p className="nl-stat__label">{label}</p>
      {hint && <p className="nl-stat__hint">{hint}</p>}
    </div>
  </div>
);

/** Subscriber numbers, sign-ups over the last 30 days and the latest newsletters. */
export const NewsletterOverview = ({ onWrite, onOpenIssue }) => {
  const [data, setData] = useState(null);
  useEffect(() => {
    newsletterAPI.overview().then(({ data: d }) => setData(d)).catch(() => setData({ error: true }));
  }, []);
  if (!data) return <div className="card panel"><p className="muted">Loading…</p></div>;
  if (data.error) return <div className="card panel"><p className="muted">Could not load the numbers.</p></div>;

  const peak = Math.max(1, ...data.growth.map((d) => d.count));
  return (
    <div className="nl-overview">
      <div className="nl-stats">
        <Stat icon="fa-users" label="Subscribers" value={data.subscribed} hint="Confirmed, receive every newsletter" />
        <Stat icon="fa-arrow-trend-up" label="New in the last 30 days" value={data.new_30_days} tone="is-green" />
        <Stat icon="fa-hourglass-half" label="Waiting for confirmation" value={data.pending} hint="Haven’t clicked the email link yet" tone="is-amber" />
        <Stat icon="fa-user-minus" label="Unsubscribed in 30 days" value={data.left_30_days} tone="is-gray" />
      </div>

      <section className="card panel nl-growth">
        <div className="nl-section-head">
          <h2 className="h3">New subscribers, last 30 days</h2>
        </div>
        <div className="nl-bars" role="img" aria-label={`${data.new_30_days} new subscribers in the last 30 days`}>
          {data.growth.map((d) => (
            <span key={d.date} className="nl-bars__bar" style={{ height: `${Math.max(3, (d.count / peak) * 100)}%` }}
              title={`${formatDate(d.date)}: ${d.count}`} data-empty={d.count === 0 || undefined} />
          ))}
        </div>
        <div className="nl-bars__axis"><span>{formatDate(data.growth[0].date)}</span><span>Today</span></div>
      </section>

      <section className="card panel">
        <div className="nl-section-head">
          <h2 className="h3">Latest newsletters</h2>
          <button type="button" className="btn btn--primary btn--sm" onClick={onWrite}><i className="fas fa-pen" /> Write a newsletter</button>
        </div>
        {data.recent.length === 0 ? (
          <p className="muted">Nothing sent yet. Write your first newsletter and send it to your {data.subscribed} subscribers.</p>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Subject</th><th>Sent</th><th className="num">Delivered</th><th className="num">Clicks</th><th className="num">Unsubscribed</th></tr></thead>
              <tbody>
                {data.recent.map((i) => (
                  <tr key={i.id}>
                    <td><button type="button" className="link-button" onClick={() => onOpenIssue(i.id)}>{i.subject}</button></td>
                    <td>{formatDate(i.sent_at)}</td>
                    <td className="num">{i.sent}</td>
                    <td className="num">{i.clicks}{i.click_rate != null && <span className="muted"> ({i.click_rate}%)</span>}</td>
                    <td className="num">{i.unsubscribed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default NewsletterOverview;
