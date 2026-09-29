import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminAPI, contactAPI, staffPortalAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { ACTIVITY_ICONS } from '../../config/roles';
import { formatDateTime, formatMoney, greeting, timeAgo } from '../../utils/format';
import PortalLayout from '../../components/layout/PortalLayout';
import Avatar from '../../components/ui/Avatar';
import Flag from '../../components/ui/Flag';
import { UserActions, UserDrawer } from '../../components/admin/UserAdmin';
import useUserAction from '../../components/admin/useUserAction';
import { ColumnChart, Donut, Funnel, HBars, Heatmap, Meter, MiniBars, SeriesTable, StatusStack } from '../../components/admin/charts';
import DashboardArt from '../../components/brand/DashboardArt';
import { Delta, StatTile } from '../../components/admin/StatTile';
import CommsSecurityOverview from '../../components/admin/CommsSecurityOverview';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000';
const RANGES = [7, 30, 90];
const fmt = new Intl.NumberFormat();
const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
const dayFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const longDayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const todayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const plural = (n, word) => `${fmt.format(n)} ${word}${n === 1 ? '' : 's'}`;
const rate = (part, whole) => (whole ? Math.round((part / whole) * 100) : null);
const parseDay = (iso) => new Date(`${iso}T00:00:00`);

// Fixed status colours (never reused for data series); each always appears with an icon and a label.
const STATUS_SEGMENTS = [
  { key: 'approved', label: 'Approved', icon: 'fa-circle-check', color: 'var(--status-good)' },
  { key: 'pending', label: 'Pending approval', icon: 'fa-hourglass-half', color: 'var(--status-warning)' },
  { key: 'rejected', label: 'Rejected', icon: 'fa-circle-xmark', color: 'var(--status-critical)' },
  { key: 'suspended', label: 'Disabled', icon: 'fa-ban', color: 'var(--status-serious)' },
];

// Scholarship results are states, so they use the status colours (plus brand blue / grey for the neutral parts).
const OUTCOME_SEGMENTS = [
  { key: 'awarded', label: 'Awarded', icon: 'fa-trophy', color: 'var(--status-good)' },
  { key: 'unsuccessful', label: 'Unsuccessful', icon: 'fa-circle-xmark', color: 'var(--status-critical)' },
  { key: 'in_progress', label: 'Still in progress', icon: 'fa-spinner', color: 'var(--viz-accent)' },
  { key: 'withdrawn', label: 'Withdrawn', icon: 'fa-arrow-rotate-left', color: 'var(--viz-muted-line)' },
];

// The metrics the trend chart can show, one at a time (one axis, one series).
const TREND_METRICS = [
  { key: 'registrations', label: 'Registrations', note: 'Accounts created per day' },
  { key: 'logins', label: 'Sign-ins', note: 'Successful sign-ins per day' },
  { key: 'applications', label: 'Applications', note: 'Scholarship applications started per day' },
  { key: 'service_requests', label: 'Service requests', note: '“ADRAM applies for you” requests per day' },
  { key: 'revenue', label: 'Revenue', note: 'Payments confirmed per day (NLe)', format: formatMoney, tickFormat: (v) => compact.format(v) },
];

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_PARTS = ['12am', '3am', '6am', '9am', '12pm', '3pm', '6pm', '9pm'];

// Daily points grouped into periods of `size` days counted back from today (1 = daily).
const groupDays = (points, key, size) => {
  const groups = [];
  for (let end = points.length; end > 0; end -= size) groups.unshift(points.slice(Math.max(0, end - size), end));
  return groups.map((g) => ({
    key: g[0].date,
    label: dayFmt.format(parseDay(g[0].date)),
    value: g.reduce((n, p) => n + p[key], 0),
    sub: g.length > 1 ? `${dayFmt.format(parseDay(g[0].date))} – ${dayFmt.format(parseDay(g[g.length - 1].date))}` : longDayFmt.format(parseDay(g[0].date)),
  }));
};


// One "needs your attention" tile; calm when there's nothing to do.
const AttentionTile = ({ count, label, icon, to, tone }) => {
  const busy = count > 0;
  return (
    <Link to={to} className={`attn-tile${busy ? ` attn-tile--${tone}` : ' attn-tile--clear'}`}>
      <span className="attn-tile__icon" aria-hidden="true"><i className={`fas ${busy ? icon : 'fa-circle-check'}`} /></span>
      <span className="attn-tile__count">{count ?? '—'}</span>
      <span className="attn-tile__label">{label}</span>
      <span className="attn-tile__cta">{busy ? 'Review' : 'All clear'} {busy && <i className="fas fa-arrow-right" />}</span>
    </Link>
  );
};

const SectionLabel = ({ children, icon, note }) => (
  <div className="admin-ov__label">
    <h2><i className={`fas ${icon}`} aria-hidden="true" /> {children}</h2>
    {note && <span>{note}</span>}
  </div>
);

// A titled card with an optional subtitle and link, and a skeleton until it has data.
const Panel = ({ title, note, link, linkLabel, ready = true, className = '', children }) => (
  <section className={`card panel ${className}`}>
    <div className="panel__head">
      <div>
        <h2 className="h3">{title}</h2>
        {note && <p className="muted small">{note}</p>}
      </div>
      {link && <Link to={link} className="panel__link">{linkLabel}</Link>}
    </div>
    {ready ? children : <div className="skeleton skeleton--block" />}
  </section>
);

export const AdminDashboard = () => {
  const { user } = useAuth();
  const [days, setDays] = useState(30);
  const [insights, setInsights] = useState(null);
  const [business, setBusiness] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [queue, setQueue] = useState(null);
  const [unread, setUnread] = useState(null);
  const [messages, setMessages] = useState(null);
  const [showTable, setShowTable] = useState(false);
  const [metric, setMetric] = useState('registrations');
  const [openId, setOpenId] = useState(null);
  const [service, setService] = useState(null); // requests, payments, documents and training waiting for ADRAM

  // Refetch keeps the previous figures on screen (dimmed) instead of flashing skeletons.
  const loadInsights = useCallback(
    () =>
      Promise.all([
        adminAPI.getInsights(days).then(({ data }) => setInsights(data)).catch(() => {}),
        staffPortalAPI.insights(days).then(({ data }) => setBusiness(data)).catch(() => {}),
      ]).finally(() => setRefreshing(false)),
    [days],
  );

  const loadQueue = useCallback(
    () =>
      adminAPI
        .getUsers({ status: 'pending', ordering: 'created_at' })
        .then(({ data }) => setQueue(data))
        .catch(() => setQueue({ results: [], count: 0 })),
    [],
  );

  useEffect(() => {
    loadInsights();
  }, [loadInsights]);

  useEffect(() => {
    loadQueue();
    staffPortalAPI.summary().then(({ data }) => setService(data)).catch(() => {});
    contactAPI.listMessages({ isRead: false }).then(({ data }) => setUnread(data.count)).catch(() => setUnread(0));
    contactAPI.listMessages().then(({ data }) => setMessages(data.results.slice(0, 5))).catch(() => setMessages([]));
  }, [loadQueue]);

  const refreshAll = () => {
    loadInsights();
    loadQueue();
  };
  const [run, dialog] = useUserAction(refreshAll);

  const t = insights?.totals;
  const series = insights?.series || [];
  const pending = insights?.status.pending ?? queue?.count;
  const b = business;

  // Platform and business series share the same days (today last); join them for the charts.
  const businessByDate = new Map((b?.series || []).map((p) => [p.date, p]));
  const trend = b && series.length > 0
    ? series.map((p) => ({ applications: 0, service_requests: 0, revenue: 0, ...businessByDate.get(p.date), ...p }))
    : [];
  const activeMetric = TREND_METRICS.find((m) => m.key === metric);
  const periodTotal = (key) => trend.reduce((n, p) => n + p[key], 0);
  const revenueWeeks = trend.length ? groupDays(trend, 'revenue', days <= 7 ? 1 : 7) : [];
  const trendStep = days > 30 ? 7 : 1; // 90 days reads better weekly
  const trendRows = trend.length ? groupDays(trend, metric, trendStep) : [];

  // Conversion ratios (all time).
  const approvalRate = insights && rate(insights.status.approved, insights.status.approved + insights.status.rejected);
  const applyingRate = b && rate(b.students.applying, b.students.total);
  const serviceRate = b && rate(b.service.paid, b.service.requests);
  const avgFee = b && b.service.paid ? b.service.revenue_total / b.service.paid : null;
  const methodTotal = b ? b.payment_methods.reduce((n, m) => n + m.amount, 0) : 0;

  const attention = [
    { key: 'accounts', count: pending, label: 'Accounts to approve', icon: 'fa-user-clock', to: '/admin/users?status=pending', tone: 'amber' },
    { key: 'requests', count: service?.service_requests, label: 'Apply-for-me requests', icon: 'fa-handshake-angle', to: '/admin/applications?stage=review', tone: 'blue' },
    { key: 'payments', count: service?.payments_to_check, label: 'Payments to check', icon: 'fa-receipt', to: '/admin/applications?stage=review', tone: 'green' },
    { key: 'documents', count: service?.documents_to_check, label: 'Documents to review', icon: 'fa-file-circle-check', to: '/admin/applications?stage=review', tone: 'violet' },
    { key: 'training', count: service?.training_requests, label: 'Training requests', icon: 'fa-laptop-code', to: '/admin/courses#enrollments', tone: 'cyan' },
    { key: 'enquiries', count: unread, label: 'Unread enquiries', icon: 'fa-envelope', to: '/admin/messages', tone: 'red' },
  ];
  const waiting = attention.reduce((n, a) => n + (a.count || 0), 0);
  const loaded = service && unread !== null && pending !== undefined;

  const changePeriod = (d) => {
    if (d === days) return;
    setRefreshing(true);
    setDays(d);
  };

  const periodSwitch = (
    <div className="period-switch" role="group" aria-label="Reporting period">
      <i className="far fa-calendar" aria-hidden="true" />
      {RANGES.map((d) => (
        <button key={d} type="button" className={days === d ? 'is-active' : ''} aria-pressed={days === d} onClick={() => changePeriod(d)}>
          {d === 7 ? '7 days' : d === 30 ? '30 days' : '90 days'}
        </button>
      ))}
    </div>
  );

  return (
    <PortalLayout title="Overview" subtitle={todayFmt.format(new Date())} actions={periodSwitch}>
      <div className="viz-root admin-ov">
        {/* Banner */}
        <section className="ov-hero ov-hero--admin">
          <div className="ov-hero__copy">
            <p className="ov-hero__eyebrow">{greeting()}, {user?.first_name || 'Admin'}</p>
            <h2>{!loaded ? 'Loading your overview…' : waiting ? `${plural(waiting, 'item')} need${waiting === 1 ? 's' : ''} your attention` : 'You’re all caught up'}</h2>
            <p>
              {b
                ? `${formatMoney(b.service.revenue)} confirmed and ${plural(b.applications.new, 'new application')} in the last ${days} days.`
                : 'Everything happening across users, applications, training and the inbox.'}
            </p>
            <div className="ov-hero__actions">
              <Link to="/admin/applications?stage=review" className="btn btn--light btn--sm"><i className="fas fa-list-check" /> Review applications</Link>
              <Link to="/admin/users" className="btn btn--ghost-light btn--sm"><i className="fas fa-users-gear" /> Manage users</Link>
              <a href={`${BACKEND_URL}/admin/`} className="btn btn--ghost-light btn--sm" target="_blank" rel="noopener noreferrer">
                <i className="fas fa-screwdriver-wrench" /> Django admin
              </a>
            </div>
          </div>
          <DashboardArt className="ov-hero__art" />
        </section>

        <SectionLabel icon="fa-bell" note={loaded ? (waiting ? `${plural(waiting, 'item')} waiting` : 'All clear') : null}>Needs your attention</SectionLabel>
        <div className="attn-grid">
          {attention.map(({ key, ...a }) => <AttentionTile key={key} {...a} />)}
        </div>

        <div className={`dash-refresh${refreshing && insights ? ' is-refreshing' : ''}`}>
          <SectionLabel icon="fa-chart-simple" note={`Last ${days} days, compared with the ${days} days before`}>Performance</SectionLabel>
          <div className="kpi-grid">
            <StatTile
              label="New registrations"
              value={t && fmt.format(t.registrations)}
              icon="fa-user-plus"
              to="/admin/users"
              action="All users"
              chart={series.length > 0 && <MiniBars series={series} valueKey="registrations" label={`Registrations, last ${days} days`} />}
              delta={t && <Delta now={t.registrations} prev={t.registrations_prev} vs={`vs previous ${days} days`} />}
            >
              <span className="kpi__note">{insights ? `${fmt.format(insights.status.total)} users in total` : ''}</span>
            </StatTile>
            <StatTile
              label="Sign-ins"
              value={t && fmt.format(t.logins)}
              icon="fa-right-to-bracket"
              tone="cyan"
              chart={series.length > 0 && <MiniBars series={series} valueKey="logins" label={`Sign-ins, last ${days} days`} />}
              delta={t && <Delta now={t.logins} prev={t.logins_prev} vs={`vs previous ${days} days`} />}
            >
              <span className="kpi__note">{t ? `${plural(t.approvals, 'account')} approved` : ''}</span>
            </StatTile>
            <StatTile
              label="New applications"
              value={b && fmt.format(b.applications.new)}
              icon="fa-list-check"
              tone="violet"
              to="/admin/applications"
              action="Open tracker"
              chart={trend.length > 0 && <MiniBars series={trend} valueKey="applications" label={`New applications, last ${days} days`} />}
              delta={b && <Delta now={b.applications.new} prev={b.applications.new_prev} vs={`vs previous ${days} days`} />}
            >
              <span className="kpi__note">{b ? `${fmt.format(b.applications.active)} in progress · ${fmt.format(b.applications.total)} in total` : ''}</span>
            </StatTile>
            <StatTile
              label="Service revenue"
              value={b && formatMoney(b.service.revenue)}
              icon="fa-sack-dollar"
              tone="green"
              chart={trend.length > 0 && <MiniBars series={trend} valueKey="revenue" format={formatMoney} label={`Confirmed revenue, last ${days} days`} />}
              delta={b && <Delta now={b.service.revenue} prev={b.service.revenue_prev} vs={`vs previous ${days} days`} />}
            >
              <span className="kpi__note">{b ? `${formatMoney(b.service.revenue_total)} confirmed all time` : ''}</span>
            </StatTile>
          </div>

          {/* Trends + results */}
          <div className="dash-grid dash-grid--charts">
            <section className="card panel chart-card">
              <div className="panel__head">
                <div>
                  <h2 className="h3">Trends</h2>
                  <p className="muted small">{trendStep === 7 ? activeMetric.note.replace('per day', 'per week') : activeMetric.note} · last {days} days</p>
                </div>
                <button type="button" className="btn btn--text btn--sm" onClick={() => setShowTable((v) => !v)} aria-pressed={showTable}>
                  <i className={`fas ${showTable ? 'fa-chart-area' : 'fa-table'}`} /> {showTable ? 'Show chart' : 'View as table'}
                </button>
              </div>
              <div className="metric-tabs" role="tablist" aria-label="Trend metric">
                {TREND_METRICS.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    role="tab"
                    aria-selected={metric === m.key}
                    className={`metric-tab${metric === m.key ? ' is-active' : ''}`}
                    onClick={() => setMetric(m.key)}
                  >
                    <span>{m.label}</span>
                    <strong>{trend.length ? (m.format || fmt.format)(periodTotal(m.key)) : '—'}</strong>
                  </button>
                ))}
              </div>
              {trend.length === 0 && <div className="skeleton skeleton--chart" />}
              {trend.length > 0 && !showTable && (
                <ColumnChart
                  key={`${metric}-${days}`}
                  rows={trendRows}
                  name={activeMetric.label}
                  format={activeMetric.format}
                  tickFormat={activeMetric.tickFormat}
                  average={trendStep === 7 ? 'avg/week' : 'avg/day'}
                  W={720}
                  H={260}
                />
              )}
              {trend.length > 0 && showTable && <SeriesTable series={trend} columns={TREND_METRICS} />}
            </section>

            <Panel title="Scholarship results" note="Every tracked application, by outcome" link="/admin/applications" linkLabel="Tracker" ready={Boolean(b)}>
              {b && (
                <Donut
                  label="Scholarship results"
                  segments={OUTCOME_SEGMENTS.map((s) => ({ ...s, value: b.outcomes[s.key] }))}
                  centre={b.outcomes.success_rate === null ? '—' : `${b.outcomes.success_rate}%`}
                  centreLabel={b.outcomes.success_rate === null ? 'No results yet' : 'success rate'}
                />
              )}
            </Panel>
          </div>

          <SectionLabel icon="fa-filter" note="All time">Conversion</SectionLabel>
          <div className="kpi-grid">
            <StatTile label="Account approval rate" value={approvalRate == null ? (insights ? '—' : null) : `${approvalRate}%`} icon="fa-user-check" tone="green"
              chart={<Meter value={approvalRate} label="Account approval rate" />}>
              <span className="kpi__note">{insights ? `${fmt.format(insights.status.approved)} approved · ${fmt.format(insights.status.rejected)} rejected` : ''}</span>
            </StatTile>
            <StatTile label="Students applying" value={applyingRate == null ? (b ? '—' : null) : `${applyingRate}%`} icon="fa-person-walking-arrow-right"
              chart={<Meter value={applyingRate} label="Share of students with at least one application" />}>
              <span className="kpi__note">{b ? `${fmt.format(b.students.applying)} of ${plural(b.students.total, 'student')} track an application` : ''}</span>
            </StatTile>
            <StatTile label="Service requests paid" value={serviceRate == null ? (b ? '—' : null) : `${serviceRate}%`} icon="fa-handshake-angle" tone="cyan"
              chart={<Meter value={serviceRate} label="Service requests that reached a confirmed payment" />}>
              <span className="kpi__note">{b ? `${fmt.format(b.service.paid)} of ${plural(b.service.requests, 'request')} paid` : ''}</span>
            </StatTile>
            <StatTile label="Success rate" value={b ? (b.outcomes.success_rate === null ? '—' : `${b.outcomes.success_rate}%`) : null} icon="fa-trophy" tone="amber"
              chart={<Meter value={b?.outcomes.success_rate} label="Awarded out of decided applications" />}>
              <span className="kpi__note">{b ? `${fmt.format(b.outcomes.awarded)} awarded · ${fmt.format(b.outcomes.unsuccessful)} unsuccessful` : ''}</span>
            </StatTile>
          </div>

          {/* Revenue analysis */}
          <SectionLabel icon="fa-sack-dollar" note="“ADRAM applies for you”">Revenue &amp; service</SectionLabel>
          <div className="dash-grid dash-grid--charts">
            <Panel
              title={days <= 7 ? 'Revenue by day' : 'Revenue by week'}
              note={b ? `${formatMoney(b.service.revenue)} confirmed in the last ${days} days${avgFee ? ` · average fee ${formatMoney(Math.round(avgFee))}` : ''}` : null}
              ready={revenueWeeks.length > 0}
              className="chart-card"
            >
              <ColumnChart rows={revenueWeeks} name="Confirmed revenue" format={formatMoney} tickFormat={(v) => compact.format(v)} />
            </Panel>

            <Panel title="Service conversion" note="Everyone who reached each step" link="/admin/applications?stage=service" linkLabel="View all" ready={Boolean(b)}>
              {b && <Funnel steps={b.service_funnel} footer={b.service.requests ? `${serviceRate}% of requests end in a confirmed payment` : 'No requests yet'} />}
            </Panel>
          </div>

          <div className="dash-grid dash-grid--three">
            <Panel title="Payment methods" note="Confirmed revenue, all time" ready={Boolean(b)}>
              {b?.payment_methods.length === 0 && <p className="muted small">No confirmed payments yet.</p>}
              {b && b.payment_methods.length > 0 && (
                <ul className="split-list">
                  {b.payment_methods.map((m) => (
                    <li key={m.key}>
                      <span className="split-list__top">
                        <strong>{m.label}</strong>
                        <span>{formatMoney(m.amount)}</span>
                      </span>
                      <Meter value={rate(m.amount, methodTotal)} label={`${m.label} share of revenue`} />
                      <small>{plural(m.count, 'payment')} · {rate(m.amount, methodTotal)}% of revenue</small>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Application pipeline" note="Every tracked application, by stage" link="/admin/applications" linkLabel="Tracker" ready={Boolean(b)}>
              {b && <HBars rows={b.pipeline.map((p) => ({ key: p.stage, label: p.label, value: p.count }))} />}
            </Panel>

            <Panel title="Training enrollments" note="By programme" link="/admin/courses#enrollments" linkLabel="Manage" ready={Boolean(b)}>
              {b?.training.by_course.length === 0 && <p className="muted small">No enrollments yet.</p>}
              {b && b.training.by_course.length > 0 && <HBars rows={b.training.by_course.map((c) => ({ key: c.label, label: c.label, value: c.count }))} />}
              {b && <p className="panel__foot">{fmt.format(b.training.active)} active · {fmt.format(b.training.requested)} requested · {fmt.format(b.training.completed)} completed</p>}
            </Panel>
          </div>

          {/* Audience */}
          <SectionLabel icon="fa-users" note={insights ? plural(insights.status.total, 'account') : null}>Audience</SectionLabel>
          <div className="dash-grid dash-grid--charts">
            <Panel title="When people sign in" note={`Sign-ins by day and time, last ${days} days`} ready={Boolean(insights)} className="chart-card">
              {insights && <Heatmap grid={insights.login_heatmap} rowLabels={WEEKDAYS} colLabels={DAY_PARTS} />}
            </Panel>
            <Panel title="Accounts" note="Status and role of every account" link="/admin/users" linkLabel="All users" ready={Boolean(insights)}>
              {insights && (
                <>
                  <StatusStack total={insights.status.total} segments={STATUS_SEGMENTS.map((s) => ({ ...s, value: insights.status[s.key] }))} />
                  <h3 className="panel__subhead">By role</h3>
                  <HBars rows={insights.roles.filter((r) => r.count > 0).map((r) => ({ key: r.role, label: r.label, value: r.count }))} />
                </>
              )}
            </Panel>
          </div>

          <div className="dash-grid dash-grid--even">
            <Panel title="Where students are" note={b ? `By country of residence · ${plural(b.students.total, 'student')}` : null} ready={Boolean(b)}>
              {b?.countries.length === 0 && <p className="muted small">No students yet.</p>}
              {b && b.countries.length > 0 && <HBars rows={b.countries.map((c) => ({ key: c.label, label: c.label, value: c.count }))} />}
            </Panel>
            <Panel title="Top scholarships" note="By applications, then saves" link="/admin/scholarships" linkLabel="Manage" ready={Boolean(b)}>
              {b?.top_scholarships.length === 0 && <p className="muted small">No applications or saves yet.</p>}
              {b && b.top_scholarships.length > 0 && (
                <table className="rank-table">
                  <thead>
                    <tr>
                      <th scope="col">Scholarship</th>
                      <th scope="col" className="num">Applications</th>
                      <th scope="col" className="num">Saves</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.top_scholarships.map((s, i) => (
                      <tr key={s.slug}>
                        <td>
                          <span className="rank-table__name">
                            <span className="rank-table__n">{i + 1}</span>
                            <Flag code={s.country} size={22} />
                            <span>{s.name}</span>
                          </span>
                        </td>
                        <td className="num">{fmt.format(s.applications)}</td>
                        <td className="num">{fmt.format(s.saved)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          </div>
        </div>

        {/* Work to do + what's coming */}
        <CommsSecurityOverview days={days} />

        <SectionLabel icon="fa-list-check">Work queue</SectionLabel>
        <div className="dash-grid">
          <section className="card panel approval-queue">
            <div className="panel__head">
              <div>
                <h2 className="h3">Waiting for approval</h2>
                <p className="muted small">Oldest first. Approved users can sign in straight away and get an email.</p>
              </div>
              <Link to="/admin/users?status=pending" className="panel__link">View all{queue?.count ? ` (${queue.count})` : ''}</Link>
            </div>
            {queue === null && <div className="skeleton skeleton--block" />}
            {queue?.results.length === 0 && (
              <div className="empty-state">
                <span className="empty-state__icon"><i className="fas fa-circle-check" /></span>
                <h3>All caught up</h3>
                <p className="muted">No accounts are waiting for approval right now.</p>
              </div>
            )}
            <ul className="queue">
              {queue?.results.slice(0, 5).map((u) => (
                <li key={u.id} className="queue__item">
                  <button type="button" className="user-cell user-cell--button" onClick={() => setOpenId(u.id)}>
                    <Avatar person={u} size={40} />
                    <div>
                      <strong>{u.full_name}</strong>
                      <small>{u.email}</small>
                    </div>
                  </button>
                  <div className="queue__meta">
                    <span><i className="fas fa-location-dot" /> {u.country || '—'}</span>
                    <span><i className="far fa-clock" /> {timeAgo(u.created_at)}</span>
                    {!u.is_verified && <span className="badge badge--outline">Email unverified</span>}
                  </div>
                  <UserActions user={u} run={run} />
                </li>
              ))}
            </ul>
          </section>

          <Panel title="Coming up" note="Interviews and deadlines in the next 14 days" ready={Boolean(b)}>
            {b?.upcoming.length === 0 && <p className="muted small">Nothing in the next two weeks.</p>}
            <ol className="upcoming">
              {b?.upcoming.map((u) => (
                <li key={`${u.kind}-${u.student_id}-${u.when}`} className={`upcoming__item upcoming__item--${u.kind}`}>
                  <span className="upcoming__icon" aria-hidden="true"><i className={`fas ${u.kind === 'interview' ? 'fa-video' : 'fa-flag-checkered'}`} /></span>
                  <div className="upcoming__main">
                    <Link to={`/admin/students/${u.student_id}`}><strong>{u.student}</strong></Link>
                    <small>{u.kind === 'interview' ? 'Interview' : 'Deadline'} · {u.scholarship}</small>
                  </div>
                  <time dateTime={u.when}>{u.kind === 'interview' ? formatDateTime(u.when) : new Date(`${u.when}T00:00`).toLocaleDateString()}</time>
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <div className="dash-grid dash-grid--even">
          <Panel title="Latest enquiries" link="/admin/messages" linkLabel="Open inbox" ready={messages !== null}>
            {messages?.length === 0 && <p className="muted small">No messages from the contact form yet.</p>}
            <ul className="mini-inbox">
              {messages?.map((m) => (
                <li key={m.id}>
                  <Link to={`/admin/messages?open=${m.id}`} className={m.is_read ? '' : 'is-unread'}>
                    <span className="mini-inbox__top">
                      <strong>{m.name}</strong>
                      <time dateTime={m.created_at}>{timeAgo(m.created_at)}</time>
                    </span>
                    <span className="mini-inbox__subject">{m.subject}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Recent activity" link="/activity" linkLabel="Activity log" ready={Boolean(insights)}>
            {insights?.recent_activity.length === 0 && <p className="muted">No activity yet.</p>}
            <ol className="feed">
              {insights?.recent_activity.slice(0, 6).map((a) => (
                <li key={a.id}>
                  <span className={`feed__icon feed__icon--${a.action.toLowerCase()}`}><i className={`fas ${ACTIVITY_ICONS[a.action] || 'fa-circle-dot'}`} /></span>
                  <div>
                    <p>
                      <button type="button" className="link-button link-button--ink" onClick={() => setOpenId(a.user_id)}>{a.user_name}</button>
                      {' · '}{a.action_display}
                    </p>
                    <time dateTime={a.timestamp}>{timeAgo(a.timestamp)}</time>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>

      {openId && <UserDrawer userId={openId} onClose={() => setOpenId(null)} onChanged={refreshAll} />}
      {dialog}
    </PortalLayout>
  );
};

export default AdminDashboard;
