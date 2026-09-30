import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { lmsAPI } from '../../services/api';
import { useCourseImage } from './courseUtils';
import { assetUrl } from '../../utils/assets';
import { hoursLabel } from '../../utils/learn';
import '../../styles/learn.css';

/** The student's learning at a glance on the portal Overview: stats, the course to continue, and a way in. */
export const LearningSnapshot = () => {
  const [data, setData] = useState(null);
  const imageOf = useCourseImage();
  useEffect(() => {
    let live = true;
    lmsAPI.dashboard().then(({ data: d }) => live && setData(d)).catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  if (!data) return null;
  const s = data.stats;
  const next = data.continue;
  const image = next ? imageOf({ slug: next.course.slug, thumbnail: next.course.thumbnail }) : '';

  return (
    <section className="card panel ls">
      <div className="panel__head">
        <h2 className="h3">My learning</h2>
        <Link to="/student/learning" className="link-arrow">Learning dashboard <i className="fas fa-arrow-right" /></Link>
      </div>
      <div className="ls-stats">
        <span><strong>{s.enrolled}</strong> courses</span>
        <span><strong>{s.completed}</strong> completed</span>
        <span><strong>{hoursLabel(s.hours)}</strong> learning</span>
        <span><strong>{s.certificates}</strong> certificates</span>
      </div>
      {next ? (
        <Link to={next.has_content ? `/learn/${next.course.slug}/lesson/${next.progress.resume_id}` : `/courses/${next.course.slug}`} className="ls-next">
          <span className="ls-next__thumb">{image ? <img src={assetUrl(image)} alt="" /> : <i className="fas fa-circle-play" aria-hidden="true" />}</span>
          <span className="ls-next__text">
            <small>Continue learning</small>
            <strong>{next.course.title}</strong>
            <span className="lms-progress"><span style={{ width: `${next.progress.percent}%` }} /></span>
            <small>{next.progress.percent}% complete{next.resume_title ? ` · Next: ${next.resume_title}` : ''}</small>
          </span>
          <i className="fas fa-play" aria-hidden="true" />
        </Link>
      ) : (
        <p className="muted">You’re not taking a course yet. <Link to="/courses">Browse courses</Link> to start learning.</p>
      )}
    </section>
  );
};

export default LearningSnapshot;
