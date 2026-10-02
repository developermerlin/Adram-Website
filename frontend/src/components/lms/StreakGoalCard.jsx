import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { lmsAPI } from '../../services/api';
import '../../styles/progress.css';

const GOALS = [5, 10, 15, 20, 30, 45, 60, 90, 120];
const dayLetter = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' });

/**
 * The learning streak and today's goal: flame with the run of days, a ring for today's minutes against the goal,
 * the last 7 days as dots, and a way to change the goal. `data` is /lms/me/analytics/; `onGoal` reloads it.
 */
const StreakGoalCard = ({ data, onGoal, compact = false }) => {
  const [editing, setEditing] = useState(false);
  if (!data) return <section className="card panel sg-card"><div className="skeleton skeleton--block" /></section>;
  const { streak, goal } = data;
  const pct = Math.min(100, Math.round((100 * goal.today_minutes) / goal.daily_minutes));
  const save = async (minutes) => {
    try {
      await lmsAPI.saveGoal(minutes);
      toast.success(`Daily goal: ${minutes} minutes`);
      setEditing(false);
      onGoal?.();
    } catch {
      toast.error('Your goal could not be saved.');
    }
  };

  return (
    <section className={`card panel sg-card${compact ? ' sg-card--compact' : ''}`}>
      <div className="sg-row">
        <div className={`sg-streak${streak.current ? ' is-on' : ''}`}>
          <i className="fas fa-fire" aria-hidden="true" />
          <div>
            <strong>{streak.current} day{streak.current === 1 ? '' : 's'}</strong>
            <small>{streak.current ? (streak.today ? 'streak, today done' : 'streak, learn today to keep it') : 'Start a streak today'}</small>
            <small className="muted">Longest: {streak.longest} day{streak.longest === 1 ? '' : 's'}</small>
          </div>
        </div>
        <div className="sg-goal">
          <span className="sg-ring" style={{ '--pct': `${pct}%` }} role="img" aria-label={`${goal.today_minutes} of ${goal.daily_minutes} minutes today`}>
            <span><strong>{goal.today_minutes}</strong><small>/ {goal.daily_minutes} min</small></span>
          </span>
          <div>
            <strong>{goal.met_today ? 'Goal reached today' : 'Today’s goal'}</strong>
            <small className="muted">{goal.days_met_this_week} of 7 days this week</small>
            <button type="button" className="link-button sg-change" onClick={() => setEditing((v) => !v)}>Change goal</button>
          </div>
        </div>
      </div>
      <ol className="sg-week" aria-label="The last 7 days">
        {goal.week.map((d) => (
          <li key={d.date} className={d.met ? 'is-met' : d.minutes ? 'is-some' : ''} title={`${d.date}: ${d.minutes} min`}>
            <span>{dayLetter.format(new Date(`${d.date}T00:00`))}</span>
            <i className={`fas ${d.met ? 'fa-check' : 'fa-minus'}`} aria-hidden="true" />
          </li>
        ))}
      </ol>
      {editing && (
        <div className="sg-goals" role="group" aria-label="Daily goal">
          {GOALS.map((m) => (
            <button key={m} type="button" className={`sg-goal-pill${m === goal.daily_minutes ? ' is-on' : ''}`} onClick={() => save(m)}>{m} min</button>
          ))}
        </div>
      )}
      {compact && <Link to="/student/progress" className="panel__link sg-more">See my progress <i className="fas fa-arrow-right" /></Link>}
    </section>
  );
};

export default StreakGoalCard;
