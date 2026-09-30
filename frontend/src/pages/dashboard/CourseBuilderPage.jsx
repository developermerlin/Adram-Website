import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { lmsAPI } from '../../services/api';
import { formatDateTime } from '../../utils/format';
import { KINDS, formatDuration } from '../../utils/lms';
import PortalLayout from '../../components/layout/PortalLayout';
import { Alert } from '../../components/ui/Form';
import { Spinner } from '../../components/ui/Section';
import ConfirmDialog from '../../components/admin/ConfirmDialog';
import LessonEditor from '../../components/lms/LessonEditor';
import QaPanel from '../../components/lms/QaPanel';
import AnnouncementsManager from '../../components/lms/AnnouncementsManager';
import SubmissionsPanel from '../../components/lms/SubmissionsPanel';
import { StatusPill } from '../../components/lms/Price';
import '../../styles/instructor.css';

// The order the server needs: every section, and every lesson under its section
const orderOf = (sections) => ({
  sections: sections.map((s) => s.id),
  lessons: Object.fromEntries(sections.map((s) => [s.id, s.lessons.map((l) => l.id)])),
});

const swap = (list, i, step) => {
  const next = [...list];
  [next[i], next[i + step]] = [next[i + step], next[i]];
  return next;
};

// Drag and drop: move a lesson in front of another lesson (or to the end of a section)
const moveLessonBefore = (sections, lessonId, sectionId, beforeId) => {
  const lesson = sections.flatMap((s) => s.lessons).find((l) => l.id === lessonId);
  if (!lesson || lessonId === beforeId) return null;
  return sections.map((s) => ({ ...s, lessons: s.lessons.filter((l) => l.id !== lessonId) })).map((s) => {
    if (s.id !== sectionId) return s;
    const at = beforeId ? s.lessons.findIndex((l) => l.id === beforeId) : -1;
    const lessons = [...s.lessons];
    lessons.splice(at < 0 ? lessons.length : at, 0, lesson);
    return { ...s, lessons };
  });
};

const moveSectionTo = (sections, from, to) => {
  if (from === to) return null;
  const next = [...sections];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};

const TABS = [
  ['curriculum', 'Curriculum'],
  ['students', 'Students & progress'],
  ['qa', 'Q&A'],
  ['announcements', 'Announcements'],
  ['submissions', 'Assignments'],
];

const replaceLesson = (data, lesson) => ({
  ...data,
  sections: data.sections.map((s) => ({ ...s, lessons: s.lessons.map((l) => (l.id === lesson.id ? { ...lesson, section_id: l.section_id } : l)) })),
});

// ---------------------------------------------------------------- students tab

const Students = ({ slug, admin }) => {
  const [state, setState] = useState({ data: null, error: false });
  useEffect(() => {
    let live = true;
    lmsAPI.students(slug).then(({ data }) => live && setState({ data, error: false })).catch(() => live && setState({ data: null, error: true }));
    return () => {
      live = false;
    };
  }, [slug]);
  if (state.error) return <Alert>The students couldn’t be loaded.</Alert>;
  if (!state.data) return <Spinner label="Loading students…" />;
  const { students, total_lessons: total } = state.data;
  if (!students.length) {
    return (
      <section className="card panel empty-state">
        <span className="empty-state__icon"><i className="fas fa-user-graduate" /></span>
        <h3>No students yet</h3>
        <p className="muted">Students appear here as soon as they enrol on the course.</p>
      </section>
    );
  }
  return (
    <section className="card table-card">
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr><th>Student</th><th>Progress</th><th>Time spent</th><th>Quiz average</th><th>Last activity</th><th>Certificate</th></tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.enrollment_id}>
                <td>{admin ? <Link to={`/admin/students/${s.student_id}`}><strong>{s.name}</strong></Link> : <strong>{s.name}</strong>}<br /><small className="muted">{s.email} · enrolled {formatDateTime(s.enrolled_at)}</small></td>
                <td>
                  <div className="lb-student-progress">
                    <div className="lms-progress"><span style={{ width: `${s.percent}%` }} /></div>
                    <small>{s.percent}% · {s.completed}/{total} lessons</small>
                  </div>
                </td>
                <td>{s.time_spent_seconds ? formatDuration(s.time_spent_seconds) : <span className="muted">—</span>}</td>
                <td>{s.quiz_average != null ? `${s.quiz_average}% (${s.quiz_attempts} ${s.quiz_attempts === 1 ? 'attempt' : 'attempts'})` : <span className="muted">—</span>}</td>
                <td>{s.last_activity ? formatDateTime(s.last_activity) : <span className="muted">Not started</span>}</td>
                <td>{s.certificate_code ? <Link to={`/certificate/${s.certificate_code}`} target="_blank"><i className="fas fa-certificate" /> {s.certificate_code}</Link> : <span className="muted">Not yet</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

// ---------------------------------------------------------------- one section

const SectionCard = ({ section, index, count, sections, limits, openId, setOpenId, api, drag, setDrag }) => {
  const [title, setTitle] = useState(section.title);
  const [adding, setAdding] = useState({ title: '', kind: 'video' });
  const [busy, setBusy] = useState(false);

  const rename = async () => {
    const next = title.trim();
    if (!next || next === section.title) return setTitle(section.title);
    await api.renameSection(section.id, next);
    return undefined;
  };
  const addLesson = async (e) => {
    e.preventDefault();
    if (!adding.title.trim()) return;
    setBusy(true);
    await api.addLesson(section.id, { title: adding.title.trim(), kind: adding.kind });
    setAdding({ title: '', kind: adding.kind });
    setBusy(false);
  };

  return (
    <section
      className={`card lb-section${drag?.over === `s${section.id}` ? ' is-drop' : ''}`}
      onDragOver={(e) => {
        if (!drag) return;
        e.preventDefault();
        if (drag.over !== `s${section.id}`) setDrag({ ...drag, over: `s${section.id}` });
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (drag?.type === 'section') api.dropSection(drag.index, index);
        else if (drag?.type === 'lesson') api.dropLesson(drag.id, section.id, null);
        setDrag(null);
      }}
    >
      <header className="lb-section__head">
        <span className="lb-drag" draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDrag({ type: 'section', index }); }} onDragEnd={() => setDrag(null)} title="Drag to reorder" aria-hidden="true"><i className="fas fa-grip-vertical" /></span>
        <span className="lb-section__num">{index + 1}</span>
        <input className="lb-section__title" value={title} maxLength={200} aria-label={`Section ${index + 1} title`} onChange={(e) => setTitle(e.target.value)} onBlur={rename} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
        <span className="lb-tools">
          <button type="button" className="icon-btn" aria-label="Move section up" disabled={index === 0} onClick={() => api.moveSection(index, -1)}><i className="fas fa-arrow-up" /></button>
          <button type="button" className="icon-btn" aria-label="Move section down" disabled={index === count - 1} onClick={() => api.moveSection(index, 1)}><i className="fas fa-arrow-down" /></button>
          <button type="button" className="icon-btn icon-btn--danger" aria-label="Delete section" onClick={() => api.askDeleteSection(section)}><i className="fas fa-trash-can" /></button>
        </span>
      </header>

      <ol className="lb-lessons">
        {section.lessons.map((lesson, i) => {
          const open = openId === lesson.id;
          return (
            <li
              key={lesson.id}
              className={`${open ? 'is-open' : ''}${drag?.over === `l${lesson.id}` ? ' is-drop' : ''}${drag?.id === lesson.id ? ' is-dragging' : ''}`}
              onDragOver={(e) => {
                if (drag?.type !== 'lesson') return;
                e.preventDefault();
                e.stopPropagation();
                if (drag.over !== `l${lesson.id}`) setDrag({ ...drag, over: `l${lesson.id}` });
              }}
              onDrop={(e) => {
                if (drag?.type !== 'lesson') return;
                e.preventDefault();
                e.stopPropagation();
                api.dropLesson(drag.id, section.id, lesson.id);
                setDrag(null);
              }}
            >
              <div className="lb-lesson">
                <span className="lb-drag" draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDrag({ type: 'lesson', id: lesson.id }); }} onDragEnd={() => setDrag(null)} title="Drag to move this lesson" aria-hidden="true"><i className="fas fa-grip-vertical" /></span>
                <button type="button" className="lb-lesson__main" aria-expanded={open} onClick={() => setOpenId(open ? null : lesson.id)}>
                  <span className="lb-lesson__icon" title={(KINDS[lesson.kind] || KINDS.text).label}><i className={`fas ${(KINDS[lesson.kind] || KINDS.text).icon}`} aria-hidden="true" /></span>
                  <span className="lb-lesson__title">{lesson.title}</span>
                  <span className="lb-lesson__meta">
                    {formatDuration(lesson.duration_seconds) && <small>{formatDuration(lesson.duration_seconds)}</small>}
                    {lesson.is_preview && <span className="badge badge--blue">Free preview</span>}
                    {!lesson.is_required && <span className="badge badge--gray">Optional</span>}
                    <span className={`badge ${lesson.is_published ? 'badge--green' : 'badge--gray'}`}>{lesson.is_published ? 'Published' : 'Draft'}</span>
                  </span>
                </button>
                <span className="lb-tools">
                  <Link to={`/learn/${api.slug}/lesson/${lesson.id}`} target="_blank" className="icon-btn" aria-label={`Preview ${lesson.title}`} title="Preview as a student"><i className="fas fa-eye" /></Link>
                  <button type="button" className="icon-btn" aria-label="Move lesson up" disabled={i === 0} onClick={() => api.moveLesson(section.id, i, -1)}><i className="fas fa-arrow-up" /></button>
                  <button type="button" className="icon-btn" aria-label="Move lesson down" disabled={i === section.lessons.length - 1} onClick={() => api.moveLesson(section.id, i, 1)}><i className="fas fa-arrow-down" /></button>
                  <button type="button" className="icon-btn icon-btn--danger" aria-label={`Delete ${lesson.title}`} onClick={() => api.askDeleteLesson(lesson)}><i className="fas fa-trash-can" /></button>
                </span>
              </div>
              {open && (
                <LessonEditor
                  key={lesson.id}
                  lesson={lesson}
                  sections={sections}
                  limits={limits}
                  onSaved={api.lessonSaved}
                  onReload={api.reload}
                  onMove={api.moveLessonTo}
                />
              )}
            </li>
          );
        })}
      </ol>
      {section.lessons.length === 0 && <p className="muted small lb-empty">No lessons in this section yet.</p>}

      <form className="lb-add" onSubmit={addLesson}>
        <input className="input" placeholder="New lesson title" aria-label={`New lesson in ${section.title}`} value={adding.title} maxLength={200} onChange={(e) => setAdding({ ...adding, title: e.target.value })} />
        <select className="input" aria-label="Lesson type" value={adding.kind} onChange={(e) => setAdding({ ...adding, kind: e.target.value })}>
          {Object.entries(KINDS).map(([value, k]) => <option key={value} value={value}>{k.label}</option>)}
        </select>
        <button type="submit" className="btn btn--outline btn--sm" disabled={busy || !adding.title.trim()}><i className="fas fa-plus" /> Add lesson</button>
      </form>
    </section>
  );
};

// ---------------------------------------------------------------- the builder

const Builder = ({ slug, routeTab }) => {
  const [state, setState] = useState({ data: null, error: false });
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  // Instructors reach this at /instructor/courses/<slug>/<tab>; administrators at /admin/courses/<slug>/content?tab=
  const teaching = pathname.startsWith('/instructor');
  const wanted = teaching ? routeTab : params.get('tab');
  const [tabState, setTabState] = useState(TABS.some(([id]) => id === wanted) ? wanted : 'curriculum');
  const tab = teaching && TABS.some(([id]) => id === routeTab) ? routeTab : tabState;
  const setTab = (next) => (teaching ? navigate(`/instructor/courses/${slug}/${next}`) : setTabState(next));
  const [drag, setDrag] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [newSection, setNewSection] = useState('');
  const [deleting, setDeleting] = useState(null); // { kind: 'section' | 'lesson', item }

  const load = useCallback(
    () => lmsAPI.curriculum(slug).then(({ data }) => setState({ data, error: false })).catch(() => setState({ data: null, error: true })),
    [slug],
  );
  useEffect(() => {
    load();
  }, [load]);

  const { data, error } = state;
  const set = (updater) => setState((s) => (s.data ? { ...s, data: updater(s.data) } : s));
  const fail = (err, fallback) => toast.error(err?.response?.data?.title || err?.response?.data?.detail || fallback);

  // Sends a new order to the server, and shows what it saved
  const reorder = async (sections) => {
    set((d) => ({ ...d, sections })); // instantly, then confirmed by the server
    try {
      const { data: saved } = await lmsAPI.reorder(slug, orderOf(sections));
      set(() => saved);
    } catch {
      toast.error('The new order could not be saved.');
      load();
    }
  };

  const api = {
    slug,
    reload: load,
    renameSection: async (id, title) => {
      try {
        await lmsAPI.renameSection(id, title);
        set((d) => ({ ...d, sections: d.sections.map((s) => (s.id === id ? { ...s, title } : s)) }));
      } catch (err) {
        fail(err, 'The section could not be renamed.');
        load();
      }
    },
    addLesson: async (sectionId, body) => {
      try {
        const { data: lesson } = await lmsAPI.addLesson(sectionId, body);
        set((d) => ({ ...d, sections: d.sections.map((s) => (s.id === sectionId ? { ...s, lessons: [...s.lessons, lesson] } : s)) }));
        setOpenId(lesson.id);
      } catch (err) {
        fail(err, 'The lesson could not be added.');
      }
    },
    moveSection: (index, step) => reorder(swap(data.sections, index, step)),
    dropSection: (from, to) => {
      const next = moveSectionTo(data.sections, from, to);
      if (next) reorder(next);
    },
    dropLesson: (lessonId, sectionId, beforeId) => {
      const next = moveLessonBefore(data.sections, lessonId, sectionId, beforeId);
      if (next) reorder(next);
    },
    moveLesson: (sectionId, index, step) => reorder(data.sections.map((s) => (s.id === sectionId ? { ...s, lessons: swap(s.lessons, index, step) } : s))),
    // Moves a lesson to the end of another section (used by the lesson editor's Section list)
    moveLessonTo: async (lessonId, sectionId) => {
      const lesson = data.sections.flatMap((s) => s.lessons).find((l) => l.id === lessonId);
      const sections = data.sections.map((s) => ({ ...s, lessons: s.lessons.filter((l) => l.id !== lessonId) }))
        .map((s) => (s.id === sectionId ? { ...s, lessons: [...s.lessons, lesson] } : s));
      const { data: saved } = await lmsAPI.reorder(slug, orderOf(sections));
      set(() => saved);
    },
    lessonSaved: (lesson) => set((d) => replaceLesson(d, lesson)),
    askDeleteSection: (section) => setDeleting({ kind: 'section', item: section }),
    askDeleteLesson: (lesson) => setDeleting({ kind: 'lesson', item: lesson }),
  };

  const addSection = async (e) => {
    e.preventDefault();
    if (!newSection.trim()) return;
    try {
      const { data: section } = await lmsAPI.addSection(slug, newSection.trim());
      set((d) => ({ ...d, sections: [...d.sections, section] }));
      setNewSection('');
    } catch (err) {
      fail(err, 'The section could not be added.');
    }
  };

  const confirmDelete = async () => {
    const { kind, item } = deleting;
    try {
      if (kind === 'section') await lmsAPI.removeSection(item.id);
      else await lmsAPI.removeLesson(item.id);
      await load();
      toast.success(kind === 'section' ? 'Section deleted.' : 'Lesson deleted.');
    } catch {
      toast.error('That could not be deleted.');
    } finally {
      setDeleting(null);
    }
  };

  const lessons = data ? data.sections.flatMap((s) => s.lessons) : [];
  const published = lessons.filter((l) => l.is_published).length;

  return (
    <PortalLayout
      title={data ? `Course content: ${data.course.title}` : 'Course content'}
      subtitle={teaching
        ? <Link to={`/instructor/courses/${slug}`} className="back-link"><i className="fas fa-arrow-left" /> Course details</Link>
        : <Link to="/admin/courses" className="back-link"><i className="fas fa-arrow-left" /> All courses</Link>}
      actions={
        data && (
          <>
            {data.course.status && <StatusPill status={data.course.status} />}
            <Link to={teaching ? `/instructor/courses/${slug}` : `/admin/courses/${data.course.id}`} className="btn btn--outline btn--sm"><i className="fas fa-pen" /> Course details</Link>
            <Link to={`/courses/${slug}`} target="_blank" className="btn btn--outline btn--sm"><i className="fas fa-arrow-up-right-from-square" /> Preview</Link>
          </>
        )
      }
    >
      {error && <Alert>The course content couldn’t be loaded. If this keeps happening, the website’s database may need updating: run “python manage.py migrate” in the backend folder.</Alert>}
      {!data && !error && <Spinner label="Loading course content…" />}
      {data && (
        <>
          {!data.course.is_published && (
            <Alert type="info">This course isn’t published yet, so only you and the ADRAM team can see it. {teaching ? 'Submit it for review from Course details when it’s ready.' : 'Publish it under Course details when you’re ready.'}</Alert>
          )}
          <div className="lb-summary">
            <div><strong>{data.sections.length}</strong><span>{data.sections.length === 1 ? 'section' : 'sections'}</span></div>
            <div><strong>{lessons.length}</strong><span>{lessons.length === 1 ? 'lesson' : 'lessons'}</span></div>
            <div><strong>{published}</strong><span>published</span></div>
            <div><strong>{formatDuration(lessons.reduce((n, l) => n + l.duration_seconds, 0)) || '0 min'}</strong><span>of video</span></div>
          </div>

          <div className="lms-tabs lb-tabs" role="tablist">
            {TABS.map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}>{label}</button>
            ))}
          </div>

          {tab === 'students' ? (
            <Students slug={slug} admin={!teaching} />
          ) : tab === 'qa' ? (
            <QaPanel slug={slug} admin />
          ) : tab === 'announcements' ? (
            <AnnouncementsManager slug={slug} />
          ) : tab === 'submissions' ? (
            <SubmissionsPanel slug={slug} />
          ) : (
            <div className="lb-tree">
              {data.sections.length === 0 && (
                <section className="card panel empty-state">
                  <span className="empty-state__icon"><i className="fas fa-layer-group" /></span>
                  <h3>Start building this course</h3>
                  <p className="muted">Create a section (like “Week 1” or “Getting started”), then add video, reading, document, quiz and assignment lessons to it. Drag lessons to reorder them.</p>
                </section>
              )}
              {data.sections.map((section, i) => (
                <SectionCard key={section.id} section={section} index={i} count={data.sections.length} sections={data.sections} limits={data.limits} openId={openId} setOpenId={setOpenId} api={api} drag={drag} setDrag={setDrag} />
              ))}
              <form className="card lb-newsection" onSubmit={addSection}>
                <input className="input" placeholder="New section title, e.g. Getting started" aria-label="New section title" value={newSection} maxLength={200} onChange={(e) => setNewSection(e.target.value)} />
                <button type="submit" className="btn btn--primary btn--sm" disabled={!newSection.trim()}><i className="fas fa-plus" /> Add section</button>
              </form>
            </div>
          )}
        </>
      )}

      {deleting && (
        <ConfirmDialog
          config={{
            title: deleting.kind === 'section' ? 'Delete this section?' : 'Delete this lesson?',
            text: deleting.kind === 'section'
              ? `“${deleting.item.title}” and every lesson in it will be deleted, with their videos and files. Students’ progress on them is lost. This can’t be undone.`
              : `“${deleting.item.title}” will be deleted, with its video and files. Students’ progress on it is lost. This can’t be undone.`,
            confirm: 'Delete',
          }}
          onClose={() => setDeleting(null)}
          onConfirm={confirmDelete}
        />
      )}
    </PortalLayout>
  );
};

export const CourseBuilderPage = () => {
  const { slug, tab } = useParams();
  return <Builder key={slug} slug={slug} routeTab={tab} />;
};

export default CourseBuilderPage;
