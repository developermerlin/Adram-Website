import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { lmsAPI } from '../../services/api';
import { formatDate } from '../../utils/format';
import PortalLayout from '../../components/layout/PortalLayout';
import { Alert } from '../../components/ui/Form';
import Kpi from '../../components/portal/Kpi';
import { ColumnChart } from '../../components/admin/charts';
import { ChartCard, PeriodSwitch } from '../../components/lms/ChartCard';
import StreakGoalCard from '../../components/lms/StreakGoalCard';
import '../../styles/progress.css';

const shortDay = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const STATUS_TONE = { approved: 'badge--green', submitted: 'badge--amber', rejected: 'badge--red' };

/** /student/progress: the student's learning analytics (training side). */
export const MyProgressPage = () => {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => lmsAPI.analytics(days).then(({ data: d }) => { setData(d); setError(''); }).catch(() => setError('Your progress could not be loaded.')), [days]);
  useEffect(() => {
    load();
  }, [load]);

  const t = data?.totals;
  const q = data?.quizzes;
  const a = data?.assignments;
  return (
    <PortalLayout title="My progress" subtitle="Your learning time, streak, results and what you’re on track to finish.">
      <Alert>{error}</Alert>
      <div className="ov-kpis">
        <Kpi icon="fa-clock" label="Learning time" value={t ? `${t.hours} h` : null} note={t ? `${t.active_days} active days` : ''} tone="cyan" />
        <Kpi icon="fa-circle-check" label="Lessons done" value={t ? t.lessons_completed : null} tone="green" />
        <Kpi icon="fa-flag-checkered" label="Courses finished" value={t ? t.courses_completed : null} to="/student/learning" />
        <Kpi icon="fa-certificate" label="Certificates" value={t ? t.certificates : null} to="/student/certificates" tone="violet" />
      </div>

      <div className="pg-grid viz-root">
        <StreakGoalCard data={data} onGoal={load} />
        <ChartCard title="Minutes learned per day" note={data ? `The last ${days} days. Your goal is ${data.goal.daily_minutes} minutes a day.` : ''}
          actions={<PeriodSwitch value={days} onChange={setDays} options={[7, 30, 90]} />}>
          {!data ? <div className="skeleton skeleton--chart" /> : (
            <ColumnChart rows={data.daily.map((d) => ({ key: d.date, label: shortDay.format(new Date(`${d.date}T00:00`)), value: d.minutes, sub: `${d.lessons} lesson${d.lessons === 1 ? '' : 's'} finished` }))}
              name="Minutes" format={(v) => `${v} min`} tickFormat={(v) => `${v}`} />
          )}
        </ChartCard>
      </div>

      <section className="card panel">
        <div className="panel__head"><h2 className="h3">On track to finish</h2><Link to="/student/learning" className="panel__link">My learning</Link></div>
        {data && data.forecast.length === 0 && <p className="muted">No courses in progress. <Link to="/courses">Find a course</Link> to start one.</p>}
        <ul className="pg-forecast">
          {data?.forecast.map((f) => (
            <li key={f.course.slug}>
              <div className="pg-forecast__head"><Link to={`/courses/${f.course.slug}`}><strong>{f.course.title}</strong></Link><span>{f.percent}%</span></div>
              <span className="lms-progress"><span style={{ width: `${f.percent}%` }} /></span>
              <small className="muted">
                {f.completed} of {f.total} lessons · {f.lessons_left} to go ·{' '}
                {f.finish_by ? <>at {f.per_week} a week, <strong>probably done by {formatDate(`${f.finish_by}T00:00`)}</strong></> : 'finish a lesson this week to see when you’ll be done'}
              </small>
            </li>
          ))}
        </ul>
      </section>

      <div className="pg-grid pg-grid--even">
        <section className="card panel">
          <div className="panel__head"><h2 className="h3">Quizzes</h2></div>
          {q && (
            <>
              <div className="pg-stats"><span><strong>{q.average}%</strong> average</span><span><strong>{q.passed}</strong> passed</span><span><strong>{q.attempts}</strong> attempts</span></div>
              {q.recent.length === 0 ? <p className="muted small">No quizzes taken yet.</p> : (
                <ul className="pg-list">
                  {q.recent.map((r, i) => (
                    <li key={`${r.lesson}-${i}`}>
                      <span><strong>{r.lesson}</strong><small className="muted">{r.course} · {formatDate(r.date)}</small></span>
                      <span className={`badge ${r.passed ? 'badge--green' : 'badge--red'}`}>{r.score}%</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
        <section className="card panel">
          <div className="panel__head"><h2 className="h3">Assignments</h2></div>
          {a && (
            <>
              <div className="pg-stats"><span><strong>{a.submitted}</strong> handed in</span><span><strong>{a.approved}</strong> approved</span><span><strong>{a.average_grade || '—'}</strong> average grade</span></div>
              {a.recent.length === 0 ? <p className="muted small">No assignments handed in yet.</p> : (
                <ul className="pg-list">
                  {a.recent.map((r, i) => (
                    <li key={`${r.lesson}-${i}`}>
                      <span><strong>{r.lesson}</strong><small className="muted">{r.course} · {formatDate(r.date)}</small></span>
                      <span className={`badge ${STATUS_TONE[r.status] || 'badge--gray'}`}>{r.grade != null ? `${r.grade}` : r.status_display}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </div>

      <section className="card panel">
        <div className="panel__head"><h2 className="h3">Skills you’ve earned</h2></div>
        {data && data.skills.length === 0 && <p className="muted">Finish a course to earn its skills. They appear here.</p>}
        <div className="pg-skills">
          {data?.skills.map((s) => <span key={s.name} className="pg-skill" title={`From ${s.course}`}><i className="fas fa-award" aria-hidden="true" /> {s.name}</span>)}
        </div>
      </section>
    </PortalLayout>
  );
};

export default MyProgressPage;
