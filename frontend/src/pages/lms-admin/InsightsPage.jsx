import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { lmsAdminAPI } from '../../services/api';
import PortalLayout from '../../components/layout/PortalLayout';
import { Alert } from '../../components/ui/Form';
import Kpi from '../../components/portal/Kpi';
import { AreaChart } from '../../components/admin/charts';
import { ChartCard, PeriodSwitch } from '../../components/lms/ChartCard';
import { money } from '../../components/lms/courseUtils';
import '../../styles/insights.css';

const scoreTone = (s) => (s >= 75 ? 'is-good' : s >= 55 ? 'is-ok' : 'is-bad');
const heat = (v) => (v == null ? undefined : { background: `rgba(37, 99, 235, ${0.08 + (v / 100) * 0.7})`, color: v > 55 ? '#fff' : undefined });

/** Weekly revenue: the last 12 weeks, then 4 forecast weeks (hatched). */
const RevenueWeeks = ({ weeks }) => {
  const max = Math.max(1, ...weeks.map((w) => w.value));
  return (
    <div className="ins-weeks" role="img" aria-label="Weekly revenue, then a four-week forecast">
      {weeks.map((w, i) => (
        <div key={`${w.label}-${w.forecast}`} className={`ins-weeks__col${w.forecast ? ' is-forecast' : ''}`} title={`${w.forecast ? 'Forecast, week' : 'Week'} to ${w.label}: ${money(w.value)}`}>
          <span className="ins-weeks__bar" style={{ height: `${Math.max(2, (100 * w.value) / max)}%` }} />
          <small>{i % 2 === 0 ? w.label : ''}</small>
        </div>
      ))}
    </div>
  );
};

/** /admin/insights: active users, cohorts, revenue forecast, course quality and fraud flags. */
export const InsightsPage = () => {
  const [days, setDays] = useState(30);
  const [state, setState] = useState({ days: null, data: null, error: '' });
  useEffect(() => {
    let live = true;
    lmsAdminAPI.insights(days).then(({ data }) => live && setState({ days, data, error: '' }))
      .catch(() => live && setState({ days, data: null, error: 'The insights could not be loaded.' }));
    return () => {
      live = false;
    };
  }, [days]);
  const d = state.days === days ? state.data : null;
  const a = d?.activity;
  const f = d?.forecast;

  return (
    <PortalLayout title="Insights" subtitle="Who is active, who stays, what will come in, which courses need help, and what looks suspicious."
      actions={<PeriodSwitch value={days} onChange={setDays} options={[7, 30, 90]} />}>
      <Alert>{state.error}</Alert>
      <div className="viz-root ins-page">
        <div className="ov-kpis">
          <Kpi icon="fa-bolt" label="Active today" value={a ? a.dau : null} note="daily active users" tone="cyan" />
          <Kpi icon="fa-calendar-week" label="This week" value={a ? a.wau : null} note="weekly active users" />
          <Kpi icon="fa-calendar" label="This month" value={a ? a.mau : null} note={a ? `${a.stickiness}% of them come daily` : ''} tone="violet" />
          <Kpi icon="fa-chart-line" label="Projected this month" value={f ? money(f.month_projection) : null}
            note={f ? `${money(f.month_to_date)} so far` : ''} tone="green" />
        </div>

        <div className="ins-charts">
          <ChartCard title="Active users per day" note={a ? `Anyone who signed in, learned or used the site. The last ${days} days.` : ''}>
            {!a ? <div className="skeleton skeleton--chart" /> : <AreaChart series={a.series} valueKey="value" name="Active users" />}
          </ChartCard>
          <ChartCard title="Revenue forecast" note={f ? `Next 30 days: about ${money(f.next_30)} (likely ${money(f.next_30_range[0])}–${money(f.next_30_range[1])}). Trend ${f.weekly_trend > 0 ? '+' : ''}${f.weekly_trend}% a week.` : ''}>
            {!f ? <div className="skeleton skeleton--chart" /> : (
              <>
                <RevenueWeeks weeks={f.weeks} />
                <p className="muted small ins-note">
                  This month: likely {money(f.month_range[0])}–{money(f.month_range[1])}.
                  {f.renewals.due > 0 && ` ${f.renewals.due} Premium plan${f.renewals.due === 1 ? '' : 's'} end in the next 30 days: about ${money(f.renewals.expected)} if ${f.renewals.rate}% renew, as before.`}
                  {' '}Based on the last 4 weeks of confirmed payments.
                </p>
              </>
            )}
          </ChartCard>
        </div>

        <section className="card panel">
          <div className="panel__head"><h2 className="h3">Retention by sign-up month</h2></div>
          <p className="muted small">The share of each month’s new students who were active in that month (M0) and the months after.</p>
          {!d ? <div className="skeleton skeleton--block" /> : (
            <div className="table-scroll">
              <table className="table ins-cohorts">
                <thead><tr><th>Joined</th><th className="num">Students</th>{d.cohorts.map((_, i) => <th key={i} className="num">M{i}</th>)}</tr></thead>
                <tbody>
                  {d.cohorts.map((c) => (
                    <tr key={c.month}>
                      <td>{c.month}</td>
                      <td className="num">{c.size}</td>
                      {d.cohorts.map((_, i) => (
                        <td key={i} className="num ins-cohorts__cell" style={heat(c.retention[i])}>{c.retention[i] == null ? '' : `${c.retention[i]}%`}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="ins-charts">
          <section className="card panel">
            <div className="panel__head"><h2 className="h3">Course quality</h2></div>
            <p className="muted small">A score from rating, completion, refunds, students who start, and answered questions. Weakest first.</p>
            {d && d.quality.length === 0 && <p className="muted">No courses with students yet.</p>}
            <ul className="ins-quality">
              {d?.quality.map((q) => (
                <li key={q.slug}>
                  <span className={`ins-score ${scoreTone(q.score)}`}>{q.score}</span>
                  <span>
                    <Link to={`/courses/${q.slug}`}><strong>{q.title}</strong></Link>
                    <small className="muted">{q.students} {q.students === 1 ? 'student' : 'students'} · {q.rating ? `${q.rating}★ (${q.ratings})` : 'no ratings yet'} · {q.completion}% finish{q.refund_rate ? ` · ${q.refund_rate}% refunded` : ''}</small>
                    {q.issues.length > 0 && <span className="ins-issues">{q.issues.map((i) => <em key={i}>{i}</em>)}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section className="card panel">
            <div className="panel__head"><h2 className="h3">Things to check</h2></div>
            <p className="muted small">Patterns that can mean fraud or abuse. They’re hints, not proof: look before acting.</p>
            {d && d.fraud.length === 0 && <p className="ins-clear"><i className="fas fa-shield-halved" aria-hidden="true" /> Nothing suspicious right now.</p>}
            <ul className="ins-flags">
              {d?.fraud.map((flag, i) => (
                <li key={i} className={`is-${flag.severity}`}>
                  <i className={`fas ${flag.severity === 'high' ? 'fa-triangle-exclamation' : 'fa-circle-exclamation'}`} aria-hidden="true" />
                  <span>
                    <strong>{flag.title}</strong>
                    <small>{flag.detail}</small>
                    <Link to={flag.link} className="small">Open</Link>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </PortalLayout>
  );
};

export default InsightsPage;
