import { useEffect, useState } from 'react';
import { instructorAPI } from '../../services/api';
import PortalLayout from '../../components/layout/PortalLayout';
import { Alert } from '../../components/ui/Form';
import { StatTile } from '../../components/admin/StatTile';
import { AreaChart, HBars, MiniBars } from '../../components/admin/charts';
import { ChartCard, PeriodSwitch } from '../../components/lms/ChartCard';
import { money } from '../../components/lms/courseUtils';
import '../../styles/instructor.css';

const fmt = new Intl.NumberFormat();
const compactMoney = (v) => `NLe ${new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(v)}`;
const sum = (series) => (series || []).reduce((n, p) => n + Number(p.value || 0), 0);

/** Instructor analytics: students, views, completion, watch time, quizzes, ratings, revenue and popular lectures. */
export const InstructorAnalyticsPage = () => {
  const [days, setDays] = useState(30);
  const [course, setCourse] = useState('');
  const [state, setState] = useState({ key: null, data: null, error: false });
  const key = `${days}|${course}`;

  useEffect(() => {
    let live = true;
    instructorAPI.analytics({ days, ...(course ? { course } : {}) })
      .then(({ data }) => live && setState({ key, data, error: false }))
      .catch(() => live && setState({ key, data: null, error: true }));
    return () => {
      live = false;
    };
  }, [days, course, key]);

  const d = state.data;
  const fresh = d && state.key === key;
  const t = d?.totals;
  const n = (v) => (t ? fmt.format(v) : null);
  const chart = (series, name, isMoney = false) => (fresh
    ? <AreaChart series={series} valueKey="value" name={name} format={isMoney ? (v) => money(v) : undefined} tickFormat={isMoney ? compactMoney : undefined} />
    : <div className="skeleton skeleton--chart" />);

  return (
    <PortalLayout
      title="Analytics"
      subtitle="How your courses are doing."
      actions={(
        <div className="in-filters">
          <select className="input input--sm" aria-label="Course" value={course} onChange={(e) => setCourse(e.target.value)}>
            <option value="">All my courses</option>
            {(d?.courses || []).map((c) => <option key={c.slug} value={c.slug}>{c.title}</option>)}
          </select>
          <PeriodSwitch value={days} onChange={setDays} />
        </div>
      )}
    >
      <div className="in-page viz-root">
        {state.error && <Alert>Your analytics could not be loaded.</Alert>}
        <div className="in-kpis">
          <StatTile label="Students" value={n(t?.students)} icon="fa-user-graduate" tone="cyan" chart={fresh && <MiniBars series={d.enrollments} valueKey="value" label="New enrolments" />}>
            <span className="kpi__note">{t ? `${fmt.format(t.new_enrollments)} new in this period` : ''}</span>
          </StatTile>
          <StatTile label="Course views" value={n(t?.views)} icon="fa-eye" chart={fresh && <MiniBars series={d.views} valueKey="value" label="Views" />} />
          <StatTile label="Completion rate" value={t ? `${t.completion_rate}%` : null} icon="fa-flag-checkered" tone="green" />
          <StatTile label="Watch time" value={t ? `${t.watch_hours} h` : null} icon="fa-clock" tone="violet" />
          <StatTile label="Revenue" value={t ? money(t.revenue) : null} icon="fa-sack-dollar" tone="green">
            <span className="kpi__note">{t ? `You earned ${money(t.earnings)}` : ''}</span>
          </StatTile>
          <StatTile label="Rating" value={t ? (t.rating_average ? t.rating_average.toFixed(1) : '—') : null} icon="fa-star" tone="amber">
            <span className="kpi__note">{t ? `${fmt.format(t.review_count)} reviews` : ''}</span>
          </StatTile>
        </div>

        <div className="in-charts">
          <ChartCard title="Enrolment trend" note={fresh ? `${fmt.format(sum(d.enrollments))} new students` : null}>{chart(d?.enrollments, 'Enrolments')}</ChartCard>
          <ChartCard title="Course views" note={fresh ? `${fmt.format(sum(d.views))} page views` : null}>{chart(d?.views, 'Views')}</ChartCard>
          <ChartCard title="Revenue" note={fresh ? `${money(sum(d.revenue))} from sales` : null}>{chart(d?.revenue, 'Revenue', true)}</ChartCard>
          <ChartCard title="Ratings" note="How students rated your courses (all time).">
            {!d ? <div className="skeleton skeleton--block" /> : (
              <HBars rows={['5', '4', '3', '2', '1'].map((s) => ({ key: s, label: `${s} star${s === '1' ? '' : 's'}`, value: d.ratings[s] || 0 }))} />
            )}
          </ChartCard>
        </div>

        <div className="in-charts">
          <section className="card table-card">
            <div className="table-card__head"><div><h2 className="h3">Quiz performance</h2><p className="muted small">Attempts, average score and pass rate.</p></div></div>
            {d && d.quizzes.length === 0 ? <p className="muted in-pad">No quiz attempts yet.</p> : (
              <div className="table-scroll">
                <table className="table">
                  <thead><tr><th>Quiz</th><th>Attempts</th><th>Average</th><th>Pass rate</th></tr></thead>
                  <tbody>
                    {d?.quizzes.map((q) => (
                      <tr key={q.lesson_id}><td><strong>{q.title}</strong><br /><small className="muted">{q.course}</small></td><td>{q.attempts}</td><td>{q.average}%</td><td>{q.pass_rate}%</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section className="card table-card">
            <div className="table-card__head"><div><h2 className="h3">Popular lectures</h2><p className="muted small">Lessons opened by the most students.</p></div></div>
            {d && d.popular_lectures.length === 0 ? <p className="muted in-pad">No activity yet.</p> : (
              <div className="table-scroll">
                <table className="table">
                  <thead><tr><th>Lecture</th><th>Learners</th><th>Completed</th><th>Watch time</th></tr></thead>
                  <tbody>
                    {d?.popular_lectures.map((l) => (
                      <tr key={l.id}><td><strong>{l.title}</strong></td><td>{l.learners}</td><td>{l.completions}</td><td>{l.watch_hours} h</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </PortalLayout>
  );
};

export default InstructorAnalyticsPage;
