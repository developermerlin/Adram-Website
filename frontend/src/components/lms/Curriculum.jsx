import { Link } from 'react-router-dom';
import { formatDuration } from '../../utils/lms';
import { kindOf } from '../../utils/learn';
import '../../styles/learn.css';

const canOpenByDefault = (lesson) => !lesson.locked;

/** The round mark at the start of a lesson row: done, playing now, locked, or the kind of lesson. */
const Mark = ({ done, current, allowed, kind }) => {
  if (done) return <span className="lms-lesson__mark is-done"><i className="fas fa-check" aria-hidden="true" /><span className="sr-only">Completed</span></span>;
  if (!allowed) return <span className="lms-lesson__mark is-locked"><i className="fas fa-lock" aria-hidden="true" /><span className="sr-only">Locked</span></span>;
  if (current) return <span className="lms-lesson__mark is-current"><i className="fas fa-play" aria-hidden="true" /><span className="sr-only">Playing now</span></span>;
  return <span className="lms-lesson__mark"><i className={`fas ${kindOf(kind).icon}`} aria-hidden="true" /></span>;
};

/**
 * The sections and lessons of a course. `open(lesson)` says whether the student may open it (defaults to the
 * outline's own `locked` flag); locked lessons show a padlock. `doneIds` are ticked, `currentId` is highlighted.
 * `sectionProgress` (the outline's `progress.sections`) adds "2/5" and a small bar to each section.
 * `onPick` runs when a lesson is chosen (the player closes its mobile panel).
 */
export const Curriculum = ({ slug, sections, doneIds = [], currentId, open = canOpenByDefault, expandAll = false, sectionProgress, onPick }) => {
  const done = new Set(doneIds || []);
  const bySection = new Map((sectionProgress || []).map((s) => [s.id, s]));
  return (
    <ol className="lms-curriculum">
      {sections.map((section, i) => {
        const seconds = section.lessons.reduce((n, l) => n + (l.duration_seconds || 0), 0);
        const progress = bySection.get(section.id);
        return (
          <li key={section.id}>
            <details open={expandAll || (!currentId && i === 0) || section.lessons.some((l) => l.id === currentId)}>
              <summary>
                <span className="lms-curriculum__head">
                  <strong>{section.title}</strong>
                  <small>
                    {progress ? `${progress.completed}/${progress.total} done` : `${section.lessons.length} ${section.lessons.length === 1 ? 'lesson' : 'lessons'}`}
                    {formatDuration(seconds) && ` · ${formatDuration(seconds)}`}
                  </small>
                  {progress && (
                    <span className="lc-mini" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} aria-label={`${section.title}: ${progress.percent}% complete`}>
                      <span style={{ width: `${progress.percent}%` }} />
                    </span>
                  )}
                </span>
                <i className="fas fa-chevron-down" aria-hidden="true" />
              </summary>
              <ul>
                {section.lessons.map((lesson) => {
                  const isDone = done.has(lesson.id);
                  const allowed = open(lesson);
                  const current = lesson.id === currentId;
                  const kind = kindOf(lesson.kind);
                  const row = (
                    <>
                      <Mark done={isDone} current={current} allowed={allowed} kind={lesson.kind} />
                      <span className="lms-lesson__text">
                        <span>{lesson.title}</span>
                        <small className="lc-meta">
                          <span><i className={`fas ${kind.icon}`} aria-hidden="true" /> {kind.label}</span>
                          {formatDuration(lesson.duration_seconds) && <span>{formatDuration(lesson.duration_seconds)}</span>}
                          {lesson.is_preview && <em className="lc-badge lc-badge--preview">Preview</em>}
                          {lesson.is_required === false && <em className="lc-badge">Optional</em>}
                        </small>
                      </span>
                    </>
                  );
                  return (
                    <li key={lesson.id}>
                      {allowed ? (
                        <Link
                          to={`/learn/${slug}/lesson/${lesson.id}`}
                          className={`lms-lesson${current ? ' is-current' : ''}${isDone ? ' is-done' : ''}`}
                          aria-current={current ? 'true' : undefined}
                          onClick={onPick}
                        >
                          {row}
                        </Link>
                      ) : (
                        <div className="lms-lesson is-locked" title="Enrol to unlock this lesson">{row}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </details>
          </li>
        );
      })}
    </ol>
  );
};

export default Curriculum;
