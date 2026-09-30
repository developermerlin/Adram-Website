import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { lmsAPI } from '../../services/api';
import Brand from '../../components/ui/Brand';
import Curriculum from '../../components/lms/Curriculum';
import QaPanel from '../../components/lms/QaPanel';
import QuizRunner from '../../components/lms/QuizRunner';
import AssignmentPane from '../../components/lms/AssignmentPane';
import NotesPanel from '../../components/lms/NotesPanel';
import { Alert } from '../../components/ui/Form';
import { Spinner } from '../../components/ui/Section';
import { assetUrl } from '../../utils/assets';
import { formatDate } from '../../utils/format';
import { formatSize, paragraphs } from '../../utils/lms';
import { kindOf, readSpeed, saveSpeed, SPEEDS } from '../../utils/learn';
import { NotFoundPage } from './StatusPages';
import '../../styles/lms.css';
import '../../styles/learn.css';

const HEARTBEAT_MS = 30000;

// ------------------------------------------------------------------ lessons

/**
 * The video. Uploaded videos keep the browser's own controls (play, pause, volume, fullscreen), resume where the
 * student stopped, and get a speed menu that is remembered. YouTube and Vimeo keep their own players.
 */
const VideoPlayer = ({ lesson, videoRef, onEnded }) => {
  const [speed, setSpeed] = useState(readSpeed);
  const { video } = lesson;

  if (!video) {
    return (
      <div className="lms-video lms-video--empty">
        <i className="fas fa-video-slash" aria-hidden="true" />
        <p>The video for this lesson isn’t available yet.</p>
      </div>
    );
  }
  if (video.type === 'embed') {
    return (
      <div className="lms-video">
        <iframe src={video.url} title={lesson.title} allow="accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
      </div>
    );
  }
  const changeSpeed = (value) => {
    setSpeed(value);
    saveSpeed(value);
    if (videoRef.current) videoRef.current.playbackRate = value;
  };
  return (
    <div className="lv-wrap">
      <div className="lms-video">
        <video
          ref={videoRef}
          src={assetUrl(video.url)}
          controls
          playsInline
          preload="metadata"
          controlsList="nodownload"
          onLoadedMetadata={(e) => {
            e.currentTarget.playbackRate = speed;
            if (lesson.position_seconds > 5) e.currentTarget.currentTime = lesson.position_seconds;
          }}
          onEnded={onEnded}
        />
      </div>
      <div className="lv-controls">
        <label className="lv-speed">
          <i className="fas fa-gauge-high" aria-hidden="true" />
          <span>Speed</span>
          <select className="input input--sm" value={speed} onChange={(e) => changeSpeed(Number(e.target.value))} aria-label="Playback speed">
            {SPEEDS.map((s) => <option key={s} value={s}>{s === 1 ? 'Normal' : `${s}×`}</option>)}
          </select>
        </label>
        {lesson.position_seconds > 5 && <span className="muted small">Resumed where you stopped</span>}
        {lesson.watch_percent > 0 && <span className="muted small">{lesson.watch_percent}% watched</span>}
      </div>
    </div>
  );
};

const DocumentViewer = ({ doc }) => {
  if (!doc) return <div className="lms-video lms-video--empty"><i className="fas fa-file-circle-xmark" aria-hidden="true" /><p>The document for this lesson isn’t available yet.</p></div>;
  const url = assetUrl(doc.url);
  return (
    <div className="ld-doc">
      {doc.is_pdf ? (
        <iframe src={url} title={doc.name} className="ld-doc__frame" />
      ) : (
        <div className="ld-doc__card">
          <i className="fas fa-file-lines" aria-hidden="true" />
          <div><strong>{doc.name}</strong><p className="muted small">Download the document to read it.</p></div>
        </div>
      )}
      <div className="ld-doc__bar">
        <span className="muted small"><i className="fas fa-file" aria-hidden="true" /> {doc.name}</span>
        <a href={url} className="btn btn--outline btn--sm" download><i className="fas fa-download" /> Download</a>
        {doc.is_pdf && <a href={url} className="btn btn--text btn--sm" target="_blank" rel="noopener noreferrer"><i className="fas fa-up-right-from-square" /> Open full screen</a>}
      </div>
    </div>
  );
};

const Announcements = ({ slug }) => {
  const [items, setItems] = useState(null);
  useEffect(() => {
    let live = true;
    lmsAPI.announcements(slug).then(({ data }) => live && setItems(data)).catch(() => live && setItems([]));
    return () => {
      live = false;
    };
  }, [slug]);
  if (!items) return <p className="muted">Loading…</p>;
  if (!items.length) return <p className="muted">No announcements from your instructor yet.</p>;
  return (
    <ul className="ld-announce">
      {items.map((a) => (
        <li key={a.id}>
          <strong>{a.title}</strong>
          <small className="muted">{a.author} · {formatDate(a.created_at)}</small>
          {paragraphs(a.body).map((p) => <p key={p.slice(0, 40)}>{p}</p>)}
        </li>
      ))}
    </ul>
  );
};

/** One lesson. Keyed by lesson id in the parent, so it starts fresh whenever the student moves to another lesson. */
const LessonPane = ({ id, slug, onProgress, titleOf }) => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [state, setState] = useState({ lesson: null, error: null });
  const [completed, setCompleted] = useState(null); // null until the student changes it here
  const [tab, setTab] = useState(params.get('qa') ? 'qa' : 'overview');
  const videoRef = useRef(null);
  const lastBeat = useRef(0);

  const load = useCallback(() => lmsAPI
    .lesson(id)
    .then(({ data }) => setState({ lesson: data, error: null }))
    .catch((err) => setState({ lesson: null, error: { status: err.response?.status, code: err.response?.data?.code, detail: err.response?.data?.detail } })), [id]);
  useEffect(() => {
    load();
  }, [load]);

  const lesson = state.lesson;
  const canTrack = Boolean(lesson?.can_track);

  // Heartbeat: every 30 seconds while the page is visible, tell the server how long the student has been learning and
  // where the video is. The server works out watch time and completes a video watched (nearly) to the end.
  const beat = useCallback((final = false) => {
    if (!lesson) return;
    const now = Date.now();
    const spent = Math.min(120, Math.round((now - lastBeat.current) / 1000));
    lastBeat.current = now;
    const video = videoRef.current;
    const data = { spent, ...(video ? { position: Math.floor(video.currentTime) } : {}) };
    if (!spent && !video) return;
    const request = lmsAPI.saveProgress(lesson.id, data);
    if (final) return;
    request.then(({ data: result }) => {
      onProgress(result);
      if (result.completed) setCompleted(true);
    }).catch(() => {});
  }, [lesson, onProgress]);
  useEffect(() => {
    if (!canTrack) return undefined;
    lastBeat.current = Date.now();
    const timer = setInterval(() => document.visibilityState === 'visible' && beat(), HEARTBEAT_MS);
    const onHide = () => document.visibilityState === 'hidden' && beat(true);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onHide);
      beat(true);
    };
  }, [canTrack, beat]);

  const { error } = state;
  if (error) {
    return (
      <div className="lms-locked">
        <i className="fas fa-lock" aria-hidden="true" />
        <h2>{error.code === 'sign_in' ? 'Sign in to open this lesson' : error.code === 'enrollment_required' ? 'Enrol to open this lesson' : 'This lesson isn’t available'}</h2>
        <p className="muted">{error.detail || 'Please go back to the course and try again.'}</p>
        <div className="lms-locked__actions">
          {error.code === 'sign_in' && <Link to="/login" state={{ from: `/learn/${slug}/lesson/${id}` }} className="btn btn--primary">Sign in</Link>}
          <Link to={`/courses/${slug}`} className="btn btn--outline">Back to the course</Link>
        </div>
      </div>
    );
  }
  if (!lesson) return <Spinner label="Loading lesson…" />;

  const isDone = completed ?? lesson.completed;
  const manual = ['video', 'text', 'document'].includes(lesson.kind);
  const save = (data) => lmsAPI.saveProgress(lesson.id, data).then(({ data: result }) => {
    onProgress(result);
    return result;
  });
  const toggleDone = async () => {
    try {
      const result = await save({ completed: !isDone });
      setCompleted(result.completed);
      if (result.completed && result.certificate_code) toast.success('Course complete! Your certificate is ready.');
    } catch {
      toast.error('Your progress could not be saved.');
    }
  };
  const finishVideo = async () => {
    if (!canTrack || isDone) return;
    try {
      const result = await save({ completed: true, position: Math.floor(videoRef.current?.currentTime || 0) });
      setCompleted(result.completed);
      if (result.certificate_code) toast.success('Course complete! Your certificate is ready.');
    } catch {
      /* the button is still there to try again */
    }
  };
  const seek = (seconds) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = seconds;
    videoRef.current.play().catch(() => {});
    videoRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const hasUploadedVideo = lesson.kind === 'video' && lesson.video?.type === 'upload';
  const tabs = [
    ['overview', lesson.kind === 'text' ? 'Lesson' : 'Overview'],
    ['resources', 'Resources', lesson.resources.length],
    ['notes', 'Notes'],
    ['qa', 'Q&A'],
    ['announcements', 'Announcements'],
  ].filter(([key]) => (key === 'overview' ? !['quiz', 'assignment'].includes(lesson.kind) : key === 'resources' ? lesson.kind !== 'assignment' : key === 'qa' || key === 'announcements' ? canTrack || lesson.can_manage : true));
  const current = tabs.some(([key]) => key === tab) ? tab : tabs[0]?.[0];
  const kind = kindOf(lesson.kind);

  return (
    <article className="lms-lesson-pane">
      {lesson.kind === 'video' && <VideoPlayer lesson={lesson} videoRef={videoRef} onEnded={finishVideo} />}
      {lesson.kind === 'document' && <DocumentViewer doc={lesson.document} />}
      <header className="lms-lesson-head">
        <div>
          <span className="lms-lesson-head__section">{lesson.section_title} · <i className={`fas ${kind.icon}`} aria-hidden="true" /> {kind.label}{!lesson.is_required && ' · Optional'}</span>
          <h1>{lesson.title}</h1>
          {lesson.summary && <p className="muted">{lesson.summary}</p>}
        </div>
        {manual && canTrack && (
          <button type="button" className={`btn btn--sm ${isDone ? 'btn--outline' : 'btn--primary'}`} onClick={toggleDone} aria-pressed={isDone}>
            <i className={`fas ${isDone ? 'fa-circle-check' : 'fa-check'}`} /> {isDone ? 'Completed' : 'Mark as complete'}
          </button>
        )}
        {!manual && isDone && <span className="badge badge--green"><i className="fas fa-check" /> {lesson.kind === 'quiz' ? 'Passed' : 'Approved'}</span>}
      </header>

      {!canTrack && !lesson.can_manage && (
        <Alert type="info">This is a free preview. <Link to={`/courses/${slug}`}>Enrol on the course</Link> to unlock every lesson and save your progress.</Alert>
      )}
      {lesson.can_manage && !canTrack && <Alert type="info">You’re previewing this lesson as the course’s instructor or an administrator. Progress isn’t saved.</Alert>}

      {lesson.kind === 'quiz' && (
        <QuizRunner lesson={lesson} canTrack={canTrack} onProgress={(r) => { onProgress(r); if (r.passed) setCompleted(true); }} />
      )}
      {lesson.kind === 'assignment' && <AssignmentPane lesson={lesson} canTrack={canTrack} onChanged={load} />}

      {tabs.length > 0 && (
        <>
          <div className="lms-tabs ld-tabs" role="tablist">
            {tabs.map(([key, label, count]) => (
              <button key={key} type="button" role="tab" aria-selected={current === key} className={current === key ? 'is-active' : ''} onClick={() => setTab(key)}>
                {label}{count > 0 && <span className="lms-tabs__count">{count}</span>}
              </button>
            ))}
          </div>
          <div className="ld-tab" role="tabpanel">
            {current === 'overview' && (
              <div className="lms-body">
                {paragraphs(lesson.body).length ? paragraphs(lesson.body).map((p) => <p key={p.slice(0, 40)}>{p}</p>) : <p className="muted">There are no notes for this lesson.</p>}
              </div>
            )}
            {current === 'resources' && (lesson.resources.length ? (
              <ul className="lms-resources">
                {lesson.resources.map((r) => (
                  <li key={r.id}>
                    <i className="fas fa-file-arrow-down" aria-hidden="true" />
                    <span><strong>{r.title}</strong><small>{r.filename} · {formatSize(r.size)}</small></span>
                    <a href={assetUrl(r.url)} className="btn btn--outline btn--sm" download>Download</a>
                  </li>
                ))}
              </ul>
            ) : <p className="muted">This lesson has no downloads.</p>)}
            {current === 'notes' && (
              <NotesPanel slug={slug} lessonId={lesson.id} canTrack={canTrack}
                getTime={hasUploadedVideo ? () => Math.floor(videoRef.current?.currentTime || 0) : undefined}
                onSeek={hasUploadedVideo ? seek : undefined} />
            )}
            {current === 'qa' && <QaPanel slug={slug} lessonId={lesson.id} admin={lesson.can_manage && !canTrack} />}
            {current === 'announcements' && <Announcements slug={slug} />}
          </div>
        </>
      )}

      <nav className="lms-lesson-nav" aria-label="Lesson navigation">
        <button type="button" className="btn btn--outline btn--sm" disabled={!lesson.previous_id} onClick={() => navigate(`/learn/${slug}/lesson/${lesson.previous_id}`)}>
          <i className="fas fa-arrow-left" /> Previous
        </button>
        <button type="button" className="btn btn--primary btn--sm ld-next" disabled={!lesson.next_id} onClick={() => navigate(`/learn/${slug}/lesson/${lesson.next_id}`)}>
          <span>{lesson.next_id ? <>Next: <strong>{titleOf(lesson.next_id)}</strong></> : 'Last lesson'}</span> <i className="fas fa-arrow-right" />
        </button>
      </nav>
    </article>
  );
};

// ------------------------------------------------------------------ the page

const LearnInner = ({ slug, lessonId }) => {
  const [state, setState] = useState({ outline: null, error: false });
  const [sideOpen, setSideOpen] = useState(false);

  const load = useCallback(
    () => lmsAPI.outline(slug).then(({ data }) => setState({ outline: data, error: false })).catch(() => setState({ outline: null, error: true })),
    [slug],
  );
  useEffect(() => {
    load();
  }, [load]);

  // A lesson reports back after progress changes, so the sidebar and bar update without reloading
  const onProgress = useCallback((result) => {
    if (!result?.progress) return;
    setState((s) => (s.outline ? { ...s, outline: { ...s.outline, progress: result.progress, certificate_code: result.certificate_code ?? s.outline.certificate_code } } : s));
  }, []);

  // Close the mobile course panel when the lesson changes
  const [lastLesson, setLastLesson] = useState(lessonId);
  if (lastLesson !== lessonId) {
    setLastLesson(lessonId);
    setSideOpen(false);
  }

  const { outline, error } = state;
  if (error) return <NotFoundPage />;
  if (!outline) return <Spinner label="Loading course…" />;

  const manager = outline.can_manage;
  const open = (l) => outline.enrolled || manager || l.is_preview;
  const progress = outline.progress;
  const percent = progress?.percent ?? 0;
  const titles = Object.fromEntries(outline.sections.flatMap((s) => s.lessons.map((l) => [l.id, l.title])));
  const exitTo = manager ? (outline.course.instructor?.id ? `/instructor/courses/${slug}/curriculum` : `/admin/courses/${slug}/content`) : outline.enrolled ? '/student/learning' : `/courses/${slug}`;

  return (
    <div className={`lms${sideOpen ? ' side-open' : ''}`}>
      <header className="lms-top">
        <Brand light />
        <Link to={`/courses/${slug}`} className="lms-top__title">{outline.course.title}</Link>
        {outline.enrolled && (
          <span className="lms-top__progress" title={`${progress.completed} of ${progress.total} lessons complete`}>
            <span className="lms-progress lms-progress--small" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Course progress"><span style={{ width: `${percent}%` }} /></span>
            <span>{percent}%<span className="lt-hide-sm"> complete</span></span>
          </span>
        )}
        {outline.certificate_code && (
          <Link to={`/certificate/${outline.certificate_code}`} className="btn btn--sm lms-top__cert"><i className="fas fa-certificate" /><span className="lt-hide-sm"> Certificate</span></Link>
        )}
        <button type="button" className="lms-top__toggle" onClick={() => setSideOpen((v) => !v)} aria-expanded={sideOpen} aria-controls="course-content" aria-label="Course content">
          <i className="fas fa-list-ul" aria-hidden="true" /><span className="lt-hide-sm"> Course content</span>
        </button>
        <Link to={exitTo} className="lms-top__exit" aria-label={manager ? 'Back to builder' : 'Exit the course player'}>
          <i className="fas fa-xmark" aria-hidden="true" /><span className="lt-hide-sm"> {manager ? 'Back to builder' : 'Exit'}</span>
        </Link>
      </header>

      <div className="lms-body-grid">
        <main className="lms-main">
          <LessonPane key={lessonId} id={lessonId} slug={slug} onProgress={onProgress} titleOf={(id) => titles[id] || 'Next lesson'} />
        </main>
        <aside className="lms-side" id="course-content" aria-label="Course content">
          <div className="lms-side__head">
            <h2>Course content</h2>
            <button type="button" className="lms-side__close" onClick={() => setSideOpen(false)} aria-label="Close course content"><i className="fas fa-xmark" /></button>
          </div>
          {progress && (
            <div className="lms-side__progress">
              <p><strong>{progress.completed} of {progress.total}</strong> lessons complete{progress.required < progress.total && <small className="muted"> · {progress.required_done} of {progress.required} required</small>}</p>
              <div className="lms-progress"><span style={{ width: `${percent}%` }} /></div>
            </div>
          )}
          <Curriculum slug={slug} sections={outline.sections} doneIds={progress?.done_ids} currentId={Number(lessonId)} open={open}
            sectionProgress={progress?.sections} onPick={() => setSideOpen(false)} />
        </aside>
        <button type="button" className="lms-side-backdrop" tabIndex={-1} aria-hidden="true" onClick={() => setSideOpen(false)} />
      </div>
    </div>
  );
};

// /learn/<course>/lesson/<id> is the player. The course's own page (/courses/<course>) is where students read about it and enrol.
export const LearnPage = () => {
  const { slug, lessonId } = useParams();
  if (!lessonId) return <Navigate to={`/courses/${slug}`} replace />;
  return <LearnInner key={slug} slug={slug} lessonId={lessonId} />;
};

export default LearnPage;
