import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { instructorAPI } from '../../services/api';
import PortalLayout from '../../components/layout/PortalLayout';
import { Alert } from '../../components/ui/Form';
import { StatTile } from '../../components/admin/StatTile';
import { ColumnChart } from '../../components/admin/charts';
import { ChartCard } from '../../components/lms/ChartCard';
import { StatusPill } from '../../components/lms/Price';
import { money } from '../../components/lms/courseUtils';
import { formatDate } from '../../utils/format';
import WithdrawalsPanel from '../../components/instructor/WithdrawalsPanel';
import '../../styles/marketplace.css';
import '../../styles/instructor.css';

const monthName = new Intl.DateTimeFormat(undefined, { month: 'short', year: '2-digit' });
const compactMoney = (v) => `NLe ${new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(v)}`;

/** Earnings: gross sales, the platform's commission, refunds, what the instructor earned, was paid and is owed. */
export const InstructorEarningsPage = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    instructorAPI.earnings().then(({ data: d }) => live && setData(d)).catch(() => live && setError('Your earnings could not be loaded.'));
    return () => {
      live = false;
    };
  }, []);

  const s = data?.summary;
  const v = (x) => (s ? money(x) : null);

  return (
    <PortalLayout title="Earnings" subtitle={data ? `ADRAM keeps a ${Number(data.commission_percent)}% platform commission on each sale; you earn the rest.` : 'What your courses have earned.'}>
      <div className="in-page viz-root">
        <Alert>{error}</Alert>
        <div className="in-kpis">
          <StatTile label="Gross revenue" value={v(s?.gross)} icon="fa-sack-dollar" tone="blue"><span className="kpi__note">{s ? `${s.sales} sale${s.sales === 1 ? '' : 's'}` : ''}</span></StatTile>
          <StatTile label="Platform commission" value={v(s?.commission)} icon="fa-building-columns" tone="violet" />
          <StatTile label="Refunds" value={v(s?.refunds)} icon="fa-rotate-left" tone="red" />
          <StatTile label="Net earnings" value={v(s?.net)} icon="fa-wallet" tone="green" />
          <StatTile label="Paid to you" value={v(s?.paid)} icon="fa-circle-check" tone="cyan" />
          <StatTile label="Pending" value={v(s?.pending)} icon="fa-hourglass-half" tone="amber"><span className="kpi__note">Earned, not paid out yet</span></StatTile>
        </div>

        <WithdrawalsPanel />

        <ChartCard title="Net earnings by month" note="The last 12 months.">
          {!data ? <div className="skeleton skeleton--chart" /> : data.monthly.length === 0 ? <p className="muted">No sales yet. Share your course page to get your first students.</p> : (
            <ColumnChart rows={data.monthly.map((m) => ({ key: m.month, label: monthName.format(new Date(`${m.month}T00:00:00`)), value: Number(m.net), sub: `${m.sales} sales · gross ${money(m.gross)}` }))}
              name="Net earnings" format={(x) => money(x)} tickFormat={compactMoney} />
          )}
        </ChartCard>

        <div className="in-charts">
          <section className="card table-card">
            <div className="table-card__head"><div><h2 className="h3">By course</h2></div></div>
            {data && data.by_course.length === 0 ? <p className="muted in-pad">No sales yet.</p> : (
              <div className="table-scroll">
                <table className="table">
                  <thead><tr><th>Course</th><th>Sales</th><th>Gross</th><th>You earned</th></tr></thead>
                  <tbody>
                    {data?.by_course.map((c) => (
                      <tr key={c.slug || c.title}><td>{c.slug ? <Link to={`/instructor/courses/${c.slug}`}>{c.title}</Link> : c.title}</td><td>{c.sales}</td><td>{money(c.gross)}</td><td><strong>{money(c.net)}</strong></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section className="card table-card">
            <div className="table-card__head"><div><h2 className="h3">Payouts</h2><p className="muted small">Money ADRAM paid to you. Ask for a payout with “Request withdrawal” above.</p></div></div>
            {data && data.payouts.length === 0 ? <p className="muted in-pad">No payouts yet.</p> : (
              <div className="table-scroll">
                <table className="table">
                  <thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th></tr></thead>
                  <tbody>
                    {data?.payouts.map((p) => (
                      <tr key={p.id}><td>{formatDate(p.paid_at)}</td><td><strong>{money(p.amount)}</strong></td><td>{p.method || '—'}</td><td>{p.reference || p.note || '—'}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <section className="card table-card">
          <div className="table-card__head"><div><h2 className="h3">Recent sales</h2></div></div>
          {data && data.sales.length === 0 ? <p className="muted in-pad">No sales yet.</p> : (
            <div className="table-scroll">
              <table className="table">
                <thead><tr><th>Date</th><th>Order</th><th>Course</th><th>Student</th><th>Paid</th><th>Your share</th><th>Status</th></tr></thead>
                <tbody>
                  {data?.sales.map((x) => (
                    <tr key={`${x.order}-${x.course}`}>
                      <td>{formatDate(x.date)}</td><td>{x.order}</td><td>{x.course}</td><td>{x.student}</td><td>{money(x.amount)}</td>
                      <td><strong>{money(x.share)}</strong><br /><small className="muted">after {Number(x.commission_percent)}% commission</small></td>
                      <td><StatusPill status={x.status} label={x.status === 'refunded' ? 'Refunded' : 'Paid'} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </PortalLayout>
  );
};

export default InstructorEarningsPage;
