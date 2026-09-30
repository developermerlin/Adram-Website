import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { lmsAdminAPI } from '../../services/api';
import PortalLayout from '../../components/layout/PortalLayout';
import { Alert } from '../../components/ui/Form';
import { StatTile } from '../../components/admin/StatTile';
import { AreaChart, HBars, MiniBars } from '../../components/admin/charts';
import { money } from '../../components/lms/courseUtils';
import BroadcastForm from '../../components/lms/BroadcastForm';
import '../../styles/lms-admin.css';

const RANGES = [7, 30, 90, 365];
const fmt = new Intl.NumberFormat();
const compactMoney = (v) => `NLe ${new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(v)}`;
const sum = (series) => (series || []).reduce((n, p) => n + Number(p.value || 0), 0);
const rangeLabel = (d) => (d === 365 ? '12 months' : `${d} days`);

const ChartCard = ({ title, note, children }) => (
  <section className="card panel chart-card">
    <div className="panel__head">
      <div>
        <h2 className="h3">{title}</h2>
        {note && <p className="muted small">{note}</p>}
      </div>
    </div>
    {children}
  </section>
);

export const LmsOverviewPage = () => {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    lmsAdminAPI
      .dashboard(days)
      .then(({ data: d }) => {
        if (!live) return;
        setData(d);
        setError('');
      })
      .catch(() => live && setError('The LMS figures could not be loaded. Refresh the page to try again.'));
    return () => {
      live = false;
    };
  }, [days]);

  // Keep the old figures on screen while a new period loads, but show the charts as loading.
  const d = data;
  const t = d?.totals;
  const fresh = d && d.days === days;
  const n = (v) => (t ? fmt.format(v) : null);

  const periodSwitch = (
    <div className="period-switch" role="group" aria-label="Reporting period">
      <i className="far fa-calendar" aria-hidden="true" />
      {RANGES.map((r) => (
        <button key={r} type="button" className={days === r ? 'is-active' : ''} aria-pressed={days === r} onClick={() => setDays(r)}>
          {r === 365 ? '1 year' : `${r} days`}
        </button>
      ))}
    </div>
  );

  const chart = (series, name, isMoney = false) =>
    fresh ? (
      <AreaChart series={series} valueKey="value" name={name} format={isMoney ? (v) => money(v) : undefined} tickFormat={isMoney ? compactMoney : undefined} />
    ) : (
      <div className="skeleton skeleton--chart" />
    );

  return (
    <PortalLayout title="LMS overview" subtitle="Courses, students, sales and moderation across the marketplace." actions={periodSwitch}>
      <div className="la-page viz-root">
        <Alert>{error}</Alert>

        <div className="la-kpis">
          <StatTile label="Users" value={n(t?.users)} icon="fa-users" chart={fresh && <MiniBars series={d.user_growth} valueKey="value" label={`New users, last ${rangeLabel(days)}`} />}>
            <span className="kpi__note">{t ? `${fmt.format(t.new_users)} new in ${rangeLabel(days)}` : ''}</span>
          </StatTile>
          <StatTile label="Students" value={n(t?.students)} icon="fa-user-graduate" tone="cyan" to="/admin/users" action="Open users" />
          <StatTile label="Instructors" value={n(t?.instructors)} icon="fa-chalkboard-user" tone="violet" to="/admin/users" action="Open users" />
          <StatTile label="Courses" value={n(t?.courses)} icon="fa-laptop-code" to="/admin/courses" action="Open courses">
            <span className="kpi__note">{t ? `${fmt.format(t.published)} published` : ''}</span>
          </StatTile>
          <StatTile label="Published" value={n(t?.published)} icon="fa-globe" tone="green" />
          <StatTile label="Waiting for review" value={n(t?.pending)} icon="fa-clipboard-check" tone="amber" to="/admin/course-reviews" action="Open the review queue">
            <span className="kpi__note">{t ? (t.pending ? 'Courses submitted by instructors' : 'Nothing waiting for you') : ''}</span>
          </StatTile>
          <StatTile label="Enrolments" value={n(t?.enrollments)} icon="fa-user-plus" tone="violet" chart={fresh && <MiniBars series={d.enrollment_growth} valueKey="value" label={`New enrolments, last ${rangeLabel(days)}`} />}>
            <span className="kpi__note">{t ? `${fmt.format(t.new_enrollments)} new in ${rangeLabel(days)}` : ''}</span>
          </StatTile>
          <StatTile label="Revenue" value={t ? money(t.revenue) : null} icon="fa-sack-dollar" tone="green">
            <span className="kpi__note">{t ? `${money(t.period_revenue)} in ${rangeLabel(days)}` : ''}</span>
          </StatTile>
          <StatTile label="Orders" value={n(t?.orders)} icon="fa-receipt" tone={t?.orders_to_check ? 'amber' : 'blue'} to="/admin/course-sales" action="Open orders">
            <span className="kpi__note">{t ? (t.orders_to_check ? `${fmt.format(t.orders_to_check)} payment${t.orders_to_check === 1 ? '' : 's'} to check` : 'No payments to check') : ''}</span>
          </StatTile>
          <StatTile label="Refunds" value={n(t?.refunds)} icon="fa-rotate-left" tone="red">
            <span className="kpi__note">{t ? `${money(t.refunded)} refunded` : ''}</span>
          </StatTile>
          <StatTile label="Certificates" value={n(t?.certificates)} icon="fa-certificate" tone="cyan" to="/admin/certificates" action="Open certificates" />
          <StatTile label="Reviews" value={n(t?.reviews)} icon="fa-star" tone="amber" to="/admin/moderation?tab=reviews" action="Moderate reviews" />
          <StatTile label="Open reports" value={n(t?.open_reports)} icon="fa-flag" tone={t?.open_reports ? 'red' : 'blue'} to="/admin/moderation" action="Open moderation">
            <span className="kpi__note">{t ? (t.open_reports ? 'Reported content needs a decision' : 'Nothing reported') : ''}</span>
          </StatTile>
        </div>

        <div className="la-charts">
          <ChartCard title="User growth" note={fresh ? `${fmt.format(sum(d.user_growth))} new accounts in ${rangeLabel(days)}` : null}>{chart(d?.user_growth, 'New users')}</ChartCard>
          <ChartCard title="Enrolment growth" note={fresh ? `${fmt.format(sum(d.enrollment_growth))} enrolments in ${rangeLabel(days)}` : null}>{chart(d?.enrollment_growth, 'Enrolments')}</ChartCard>
          <ChartCard title="Revenue" note={fresh ? `${money(sum(d.revenue))} from paid orders in ${rangeLabel(days)}` : null}>{chart(d?.revenue, 'Revenue', true)}</ChartCard>
          <ChartCard title="Course growth" note={fresh ? `${fmt.format(sum(d.course_growth))} courses created in ${rangeLabel(days)}` : null}>{chart(d?.course_growth, 'New courses')}</ChartCard>
        </div>

        <div className="la-charts">
          <section className="card table-card">
            <div className="table-card__head">
              <div>
                <h2 className="h3">Popular courses</h2>
                <p className="muted small">Published courses with the most students.</p>
              </div>
            </div>
            {!d ? (
              <div className="skeleton skeleton--block" />
            ) : d.popular_courses.length === 0 ? (
              <div className="la-empty"><i className="fas fa-laptop-code" /><strong>No published courses yet</strong><p>Approve and publish a course from the <Link to="/admin/course-reviews">review queue</Link>.</p></div>
            ) : (
              <div className="table-scroll">
                <table className="table">
                  <thead><tr><th>Course</th><th>Students</th><th>Rating</th></tr></thead>
                  <tbody>
                    {d.popular_courses.map((c) => (
                      <tr key={c.slug}>
                        <td><a href={`/courses/${c.slug}`} target="_blank" rel="noreferrer">{c.title}</a></td>
                        <td>{fmt.format(c.students)}</td>
                        <td>{c.reviews ? <><i className="fas fa-star" style={{ color: '#f59e0b' }} aria-hidden="true" /> {Number(c.rating).toFixed(1)} <span className="muted small">({fmt.format(c.reviews)})</span></> : <span className="muted">No reviews</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <ChartCard title="Popular categories" note="Students learning in each top-level category.">
            {!d ? (
              <div className="skeleton skeleton--block" />
            ) : d.popular_categories.length === 0 ? (
              <div className="la-empty"><i className="fas fa-folder-tree" /><strong>No categories yet</strong><p><Link to="/admin/categories">Create categories</Link> so students can browse courses by subject.</p></div>
            ) : (
              <HBars rows={d.popular_categories.map((c) => ({ key: c.id, label: `${c.name} (${c.courses} course${c.courses === 1 ? '' : 's'})`, value: c.students }))} />
            )}
          </ChartCard>
        </div>

        <div className="la-charts">
          <BroadcastForm />
        </div>
      </div>
    </PortalLayout>
  );
};

export default LmsOverviewPage;
