import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { lmsAPI } from '../../services/api';
import Brand from '../../components/ui/Brand';
import Curriculum from '../../components/lms/Curriculum';
import QaPanel from '../../components/lms/QaPanel';
import QuizRunner from '../../components/lms/QuizRunner';
import AssignmentPane from '../../components/lms/AssignmentPane';
import NotesPanel from '../../components/lms/NotesPanel';
import MaterialsDialog from '../../components/lms/MaterialsDialog';
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
const DOWNLOAD_ICONS = { notes: 'fa-file-lines', document: 'fa-file-pdf', video: 'fa-file-video', resource: 'fa-file-arrow-down' };
const DOWNLOAD_LABELS = { notes: 'Lesson notes', document: 'Document', video: 'Video' };

// ------------------------------------------------------------------ lessons

// YouTube and Vimeo players start where the student stopped and tell the page where they are (their postMessage APIs)
const resumable = (url, seconds) => {
  try {
    const u = new URL(url);
    const at = seconds > 5 ? Math.floor(seconds) : 0;
    if (u.hostname.includes('youtube')) {
      u.searchParams.set('enablejsapi', '1');
      u.searchParams.set('origin', window.location.origin);
      if (at) u.searchParams.set('start', String(at));
      return u.toString();
    }
    if (u.hostname.includes('vimeo')) {
      u.searchParams.set('api', '1');
      return at ? `${u.toString()}#t=${at}s` : u.toString();
    }
  } catch {
    /* not a web address we know: use it as it is */
  }
  return url;
};

const EmbedPlayer = ({ lesson, positionRef, seekRef, onEnded }) => {
  const frame = useRef(null);
  const ended = useRef(onEnded);
  useEffect(() => {
    ended.current = onEnded;
  });
  const src = useMemo(() => resumable(lesson.video.url, lesson.position_seconds), [lesson.video.url, lesson.position_seconds]);
  const tell = (message) => frame.current?.contentWindow?.postMessage(JSON.stringify(message), '*');
  // Jumping to a moment (a note or a question's timestamp): each player ignores the other's commands
  useEffect(() => {
    const post = (message) => frame.current?.contentWindow?.postMessage(JSON.stringify(message), '*');
    seekRef.current = (seconds) => {
      post({ event: 'command', func: 'seekTo', args: [seconds, true], id: lesson.id, channel: 'widget' });
      post({ event: 'command', func: 'playVideo', args: [], id: lesson.id, channel: 'widget' });
      post({ method: 'setCurrentTime', value: seconds });
      post({ method: 'play' });
      positionRef.current = seconds;
      frame.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    return () => { seekRef.current = null; };
  }, [seekRef, positionRef, lesson.id]);

  useEffect(() => {
    const onMessage = (e) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      let msg = e.data;
      if (typeof msg === 'string') {
        try {
          msg = JSON.parse(msg);
        } catch {
          return;
        }
      }
      if (!msg || typeof msg !== 'object') return;
      // YouTube
      if ((msg.event === 'infoDelivery' || msg.event === 'initialDelivery') && msg.info) {
        if (typeof msg.info.currentTime === 'number') positionRef.current = msg.info.currentTime;
        if (msg.info.playerState === 0) ended.current();
      }
      if (msg.event === 'onStateChange' && msg.info === 0) ended.current();
      // Vimeo
      if (msg.event === 'ready') ['timeupdate', 'ended'].forEach((value) => tell({ method: 'addEventListener', value }));
      if (msg.event === 'timeupdate' && msg.data) positionRef.current = msg.data.seconds;
      if (msg.event === 'ended') ended.current();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [positionRef]);

  // YouTube only starts reporting once asked
  const onLoad = () => {
    tell({ event: 'listening', id: lesson.id, channel: 'widget' });
    tell({ event: 'command', func: 'addEventListener', args: ['onStateChange'], id: lesson.id, channel: 'widget' });
  };
  return (
    <div className="lv-wrap">
      <div className="lms-video">
        <iframe ref={frame} src={src} onLoad={onLoad} title={lesson.title} allow="accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
      </div>
      {(lesson.position_seconds > 5 || lesson.watch_percent > 0) && (
        <div className="lv-controls">
          {lesson.position_seconds > 5 && <span className="muted small">Resumed where you stopped</span>}
          {lesson.watch_percent > 0 && <span className="muted small">{lesson.watch_percent}% watched</span>}
        </div>
      )}
    </div>
  );
};

/**
 * The video. Uploaded videos keep the browser's own controls (play, pause, volume, fullscreen), resume where the
 * student stopped, and get a speed menu that is remembered. YouTube and Vimeo keep their own players.
 */
const VideoPlayer = ({ lesson, videoRef, positionRef, seekRef, onEnded }) => {
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
  if (video.type === 'embed') return <EmbedPlayer lesson={lesson} positionRef={positionRef} seekRef={seekRef} onEnded={onEnded} />;
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
  const positionRef = useRef(null); // YouTube/Vimeo report their time here
  const seekRef = useRef(null); // and jump to a moment through this
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
    const position = videoRef.current ? videoRef.current.currentTime : positionRef.current;
    const data = { spent, ...(position != null ? { position: Math.floor(position) } : {}) };
    if (!spent && position == null) return;
    // Leaving (tab hidden, lesson changed, browser closed): a save that finishes even as the page goes away
    if (final) {
      lmsAPI.saveProgressOnLeave(lesson.id, data);
      return;
    }
    lmsAPI.saveProgress(lesson.id, data).then(({ data: result }) => {
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
      const result = await save({ completed: true, position: Math.floor(videoRef.current?.currentTime ?? positionRef.current ?? 0) });
      setCompleted(result.completed);
      if (result.certificate_code) toast.success('Course complete! Your certificate is ready.');
    } catch {
      /* the button is still there to try again */
    }
  };
  const seek = (seconds) => {
    if (seekRef.current) {
      seekRef.current(seconds);
      return;
    }
    if (!videoRef.current) return;
    videoRef.current.currentTime = seconds;
    videoRef.current.play().catch(() => {});
    videoRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const hasVideo = lesson.kind === 'video' && Boolean(lesson.video);
  const videoTime = () => Math.floor((videoRef.current ? videoRef.current.currentTime : positionRef.current) || 0);
  const tabs = [
    ['overview', lesson.kind === 'text' ? 'Lesson' : 'Overview'],
    ['downloads', 'Downloads', lesson.downloads?.length || 0],
    ['notes', 'Notes'],
    ['qa', 'Q&A'],
    ['announcements', 'Announcements'],
  ].filter(([key]) => (key === 'overview' ? !['quiz', 'assignment'].includes(lesson.kind) : key === 'downloads' ? (lesson.downloads?.length || 0) > 0 : key === 'qa' || key === 'announcements' ? canTrack || lesson.can_manage : true));
  const current = tabs.some(([key]) => key === tab) ? tab : tabs[0]?.[0];
  const mainFile = (lesson.downloads || []).find((f) => f.kind !== 'resource');
  const kind = kindOf(lesson.kind);

  return (
    <article className="lms-lesson-pane">
      {lesson.kind === 'video' && <VideoPlayer lesson={lesson} videoRef={videoRef} positionRef={positionRef} seekRef={seekRef} onEnded={finishVideo} />}
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
        {mainFile && (
          <a href={assetUrl(mainFile.url)} className="btn btn--outline btn--sm ld-dl" download title={`Download ${mainFile.name}`}>
            <i className="fas fa-download" /> <span>{DOWNLOAD_LABELS[mainFile.kind]}</span>
          </a>
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
            {current === 'downloads' && (
              <ul className="lms-resources">
                {lesson.downloads.map((f) => (
                  <li key={f.url}>
                    <i className={`fas ${DOWNLOAD_ICONS[f.kind] || 'fa-file-arrow-down'}`} aria-hidden="true" />
                    <span><strong>{f.title || DOWNLOAD_LABELS[f.kind] || f.name}</strong><small>{f.name} · {formatSize(f.size)}</small></span>
                    <a href={assetUrl(f.url)} className="btn btn--outline btn--sm" download>Download</a>
                  </li>
                ))}
              </ul>
            )}
            {current === 'notes' && (
              <NotesPanel slug={slug} lessonId={lesson.id} canTrack={canTrack}
                getTime={hasVideo ? videoTime : undefined}
                onSeek={hasVideo ? seek : undefined} />
            )}
            {current === 'qa' && <QaPanel slug={slug} lessonId={lesson.id} admin={lesson.can_manage && !canTrack} getTime={hasVideo ? videoTime : undefined} onSeek={hasVideo ? seek : undefined} />}
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
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const closeMaterials = useCallback(() => setMaterialsOpen(false), []);

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
        {outline.can_download && (
          <button type="button" className="lms-top__toggle lms-top__dl" onClick={() => setMaterialsOpen(true)} aria-haspopup="dialog">
            <i className="fas fa-download" aria-hidden="true" /><span className="lt-hide-sm"> Downloads</span>
          </button>
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
      {materialsOpen && <MaterialsDialog slug={slug} onClose={closeMaterials} />}
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
