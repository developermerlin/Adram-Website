import { useRef, useState } from 'react';
import { AssignmentSettings } from './AssignmentSettings';
import { CaptionsEditor } from './CaptionsEditor';
import toast from 'react-hot-toast';
import { lmsAPI, parseApiErrors } from '../../services/api';
import { assetUrl } from '../../utils/assets';
import { formatSize, KINDS, toLocalInput } from '../../utils/lms';
import { Alert } from '../ui/Form';
import QuizBuilder from './QuizBuilder';

// The length of a video file, read in the browser, so the administrator doesn't have to type it
const readDuration = (file) =>
  new Promise((resolve) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Math.round(video.duration) || 0);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    video.src = url;
  });

const initial = (lesson) => ({
  title: lesson.title,
  kind: lesson.kind,
  summary: lesson.summary,
  body: lesson.body,
  video_source: lesson.video_source || 'embed',
  video_url: lesson.video_url,
  minutes: Math.floor(lesson.duration_seconds / 60),
  seconds: lesson.duration_seconds % 60,
  is_preview: lesson.is_preview,
  is_published: lesson.is_published,
  is_required: lesson.is_required !== false,
  max_points: lesson.max_points ?? 100,
  allow_resubmit: lesson.allow_resubmit !== false,
  due_mode: lesson.due_at ? 'date' : lesson.due_days ? 'days' : 'none',
  due_at: toLocalInput(lesson.due_at),
  due_days: lesson.due_days || 7,
  late_policy: lesson.late_policy || 'accept',
  late_penalty_percent: lesson.late_penalty_percent ?? 10,
  max_files: lesson.max_files || 1,
  rubric: (lesson.rubric || []).map((c) => ({ ...c })),
  peer_reviews: lesson.peer_reviews || 0,
  section_id: lesson.section_id,
});

const DOCUMENT_TYPES = '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.odt,.odp,.txt,.rtf,.epub';

// Everything about one lesson: its text, video (a YouTube/Vimeo link or an uploaded file), downloads, quiz and visibility.
export const LessonEditor = ({ lesson, sections, limits, onSaved, onReload, onMove }) => {
  const [form, setForm] = useState(() => initial(lesson));
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [uploadingResource, setUploadingResource] = useState(false);
  const [document, setDocument] = useState(null);
  const picker = useRef(null);
  const docPicker = useRef(null);
  const resourcePicker = useRef(null);
  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }));
  const isVideo = form.kind === 'video';
  const isDocument = form.kind === 'document';
  const isAssignment = form.kind === 'assignment';

  const chooseFile = async (chosen) => {
    setFile(chosen || null);
    if (chosen) {
      const seconds = await readDuration(chosen);
      if (seconds) setForm((f) => ({ ...f, minutes: Math.floor(seconds / 60), seconds: seconds % 60, video_source: 'upload' }));
      else setForm((f) => ({ ...f, video_source: 'upload' }));
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    const fields = {
      title: form.title,
      kind: form.kind,
      summary: form.summary,
      body: form.body,
      duration_seconds: (Number(form.minutes) || 0) * 60 + (Number(form.seconds) || 0),
      is_preview: form.is_preview,
      is_published: form.is_published,
      is_required: form.is_required,
    };
    if (isAssignment) {
      fields.max_points = Number(form.max_points) || 100;
      fields.allow_resubmit = form.allow_resubmit;
      fields.due_at = form.due_mode === 'date' && form.due_at ? new Date(form.due_at).toISOString() : null;
      fields.due_days = form.due_mode === 'days' ? Number(form.due_days) || 1 : 0;
      fields.late_policy = form.late_policy;
      fields.late_penalty_percent = Number(form.late_penalty_percent) || 0;
      fields.max_files = Number(form.max_files) || 1;
      fields.rubric = form.rubric.map((c) => ({ ...c, points: Number(c.points) || 0 }));
      fields.peer_reviews = Number(form.peer_reviews) || 0;
    }
    if (isVideo) {
      fields.video_source = form.video_source;
      fields.video_url = form.video_source === 'embed' ? form.video_url : '';
    }
    let payload = fields;
    if ((file && isVideo) || (document && isDocument)) {
      payload = new FormData();
      Object.entries(fields).forEach(([k, v]) => payload.append(k, v));
      if (file && isVideo) payload.append('video_file', file);
      if (document && isDocument) payload.append('document_file', document);
    }
    try {
      const { data } = await lmsAPI.saveLesson(lesson.id, payload, setProgress);
      setFile(null);
      setDocument(null);
      if (picker.current) picker.current.value = '';
      if (docPicker.current) docPicker.current.value = '';
      if (form.section_id !== lesson.section_id) await onMove(lesson.id, Number(form.section_id));
      onSaved(data);
      setForm(initial(data));
      toast.success('Lesson saved.');
    } catch (err) {
      const result = parseApiErrors(err);
      setErrors(result);
      if (err.response?.data?.saved_as_draft) {
        toast.error('Saved, but kept as a draft: ' + err.response.data.is_published);
        onReload();
      }
    } finally {
      setSaving(false);
      setProgress(null);
    }
  };

  const removeVideo = async () => {
    try {
      const { data } = await lmsAPI.saveLesson(lesson.id, { clear_video: true });
      onSaved(data);
      setForm(initial(data));
      toast.success('Video removed.');
    } catch {
      toast.error('Could not remove the video.');
    }
  };

  const removeDocument = async () => {
    try {
      const { data } = await lmsAPI.saveLesson(lesson.id, { clear_document: true, is_published: false });
      onSaved(data);
      setForm(initial(data));
      toast.success('Document removed. The lesson is now a draft.');
    } catch {
      toast.error('Could not remove the document.');
    }
  };

  const addResource = async (chosen) => {
    if (!chosen) return;
    setUploadingResource(true);
    try {
      const { data } = await lmsAPI.addResource(lesson.id, chosen);
      onSaved({ ...lesson, resources: [...lesson.resources, data] }, { keepForm: true });
      toast.success('File attached.');
    } catch (err) {
      toast.error(parseApiErrors(err).file || 'The file could not be attached.');
    } finally {
      setUploadingResource(false);
      if (resourcePicker.current) resourcePicker.current.value = '';
    }
  };
  const moveResource = async (index, step) => {
    const ids = lesson.resources.map((r) => r.id);
    [ids[index], ids[index + step]] = [ids[index + step], ids[index]];
    try {
      const { data } = await lmsAPI.reorderResources(lesson.id, ids);
      onSaved(data, { keepForm: true });
    } catch {
      toast.error('The new order could not be saved.');
    }
  };
  const removeResource = async (id) => {
    try {
      await lmsAPI.removeResource(id);
      onSaved({ ...lesson, resources: lesson.resources.filter((r) => r.id !== id) }, { keepForm: true });
    } catch {
      toast.error('Could not remove the file.');
    }
  };

  const field = (name) => errors[name] && <p className="field-error">{errors[name]}</p>;
  const problem = Object.values(errors).find((v) => typeof v === 'string' && !['title', 'video_url', 'video_file', 'is_published'].some((k) => errors[k] === v));

  return (
    <form className="lb-editor" onSubmit={save} noValidate>
      <Alert>{errors.form || errors.detail || errors.rubric || errors.due_at || errors.max_files || errors.late_penalty_percent || problem}</Alert>

      <div className="form-row">
        <div className="field">
          <label htmlFor={`lt-${lesson.id}`}>Lesson title</label>
          <input id={`lt-${lesson.id}`} className="input" value={form.title} maxLength={200} onChange={(e) => set('title')(e.target.value)} aria-invalid={Boolean(errors.title)} />
          {field('title')}
        </div>
        <div className="field">
          <label htmlFor={`lk-${lesson.id}`}>Type</label>
          <select id={`lk-${lesson.id}`} className="input" value={form.kind} onChange={(e) => set('kind')(e.target.value)}>
            {Object.entries(KINDS).map(([value, k]) => <option key={value} value={value}>{k.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`ls-${lesson.id}`}>Section</label>
          <select id={`ls-${lesson.id}`} className="input" value={form.section_id} onChange={(e) => set('section_id')(e.target.value)}>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label htmlFor={`lsum-${lesson.id}`}>Short description</label>
        <input id={`lsum-${lesson.id}`} className="input" value={form.summary} maxLength={300} placeholder="One line shown under the lesson title" onChange={(e) => set('summary')(e.target.value)} />
      </div>

      {isVideo && (
        <fieldset className="lb-video">
          <legend>Video</legend>
          <div className="lb-video__choice" role="radiogroup" aria-label="Where the video comes from">
            <label className={`lb-pill${form.video_source === 'embed' ? ' is-active' : ''}`}>
              <input type="radio" name={`src-${lesson.id}`} checked={form.video_source === 'embed'} onChange={() => set('video_source')('embed')} />
              <i className="fab fa-youtube" aria-hidden="true" /> YouTube or Vimeo link
            </label>
            <label className={`lb-pill${form.video_source === 'upload' ? ' is-active' : ''}`}>
              <input type="radio" name={`src-${lesson.id}`} checked={form.video_source === 'upload'} onChange={() => set('video_source')('upload')} />
              <i className="fas fa-cloud-arrow-up" aria-hidden="true" /> Upload a video file
            </label>
          </div>

          {form.video_source === 'embed' ? (
            <div className="field">
              <label htmlFor={`lu-${lesson.id}`}>Video link</label>
              <input id={`lu-${lesson.id}`} className="input" type="url" placeholder="https://www.youtube.com/watch?v=…" value={form.video_url} onChange={(e) => set('video_url')(e.target.value)} aria-invalid={Boolean(errors.video_url)} />
              {errors.video_url ? <p className="field-error">{errors.video_url}</p> : <p className="hint">Paste the link from YouTube or Vimeo. An “unlisted” video works well: only people with the link, which is shown just to your students, can find it.</p>}
              {lesson.embed_url && form.video_url === lesson.video_url && (
                <div className="lb-preview"><iframe src={lesson.embed_url} title="Video preview" allowFullScreen /></div>
              )}
            </div>
          ) : (
            <div className="field">
              {lesson.has_video_file && !file && (
                <div className="lb-current">
                  <video src={assetUrl(lesson.video_preview_url)} controls preload="metadata" />
                  <div>
                    <strong>{lesson.video_name || 'Uploaded video'}</strong>
                    <button type="button" className="btn btn--text btn--sm text-danger" onClick={removeVideo}><i className="fas fa-trash-can" /> Remove video</button>
                  </div>
                </div>
              )}
              <label className="cf-drop" htmlFor={`lf-${lesson.id}`}>
                <input ref={picker} id={`lf-${lesson.id}`} type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.m4v,.mov,.webm" onChange={(e) => chooseFile(e.target.files?.[0])} />
                <i className="fas fa-film" aria-hidden="true" />
                <span>{file ? `${file.name} (${formatSize(file.size)})` : lesson.has_video_file ? 'Choose a different video to replace it' : 'Choose a video file'}</span>
                <small>MP4, MOV or WebM, up to {limits.max_video_mb} MB. Bigger videos are best put on YouTube or Vimeo.</small>
              </label>
              {progress !== null && (
                <div className="lb-upload" role="status">
                  <div className="lms-progress"><span style={{ width: `${progress}%` }} /></div>
                  <small>{progress < 100 ? `Uploading… ${progress}%` : 'Processing…'}</small>
                </div>
              )}
              {field('video_file')}
              {lesson.has_video_file && !file && <CaptionsEditor lesson={lesson} />}
            </div>
          )}

          <div className="lb-duration">
            <span>Length</span>
            <input type="number" min="0" className="input" aria-label="Minutes" value={form.minutes} onChange={(e) => set('minutes')(e.target.value)} /> min
            <input type="number" min="0" max="59" className="input" aria-label="Seconds" value={form.seconds} onChange={(e) => set('seconds')(e.target.value)} /> sec
          </div>
        </fieldset>
      )}

      {isDocument && (
        <fieldset className="lb-video">
          <legend>Document</legend>
          {lesson.has_document && !document && (
            <div className="lb-current lb-current--doc">
              <i className="fas fa-file-lines" aria-hidden="true" />
              <div>
                <a href={assetUrl(lesson.document_url)} target="_blank" rel="noopener noreferrer"><strong>{lesson.document_name}</strong></a>
                <button type="button" className="btn btn--text btn--sm text-danger" onClick={removeDocument}><i className="fas fa-trash-can" /> Remove document</button>
              </div>
            </div>
          )}
          <label className="cf-drop" htmlFor={`ld-${lesson.id}`}>
            <input ref={docPicker} id={`ld-${lesson.id}`} type="file" accept={DOCUMENT_TYPES} onChange={(e) => setDocument(e.target.files?.[0] || null)} />
            <i className="fas fa-file-arrow-up" aria-hidden="true" />
            <span>{document ? `${document.name} (${formatSize(document.size)})` : lesson.has_document ? 'Choose a different document to replace it' : 'Choose a document'}</span>
            <small>PDF (shown in the page), Word, PowerPoint, Excel or text, up to {limits.max_resource_mb} MB.</small>
          </label>
          {progress !== null && (
            <div className="lb-upload" role="status">
              <div className="lms-progress"><span style={{ width: `${progress}%` }} /></div>
              <small>{progress < 100 ? `Uploading… ${progress}%` : 'Processing…'}</small>
            </div>
          )}
          {field('document_file')}
        </fieldset>
      )}

      {isAssignment && <AssignmentSettings id={lesson.id} form={form} set={set} />}

      {form.kind !== 'quiz' && (
        <div className="field">
          <label htmlFor={`lb-${lesson.id}`}>{isVideo ? 'Notes under the video' : isAssignment ? 'Assignment instructions' : isDocument ? 'Notes about the document (optional)' : 'Lesson text'}</label>
          <textarea id={`lb-${lesson.id}`} className="input" rows={isVideo || isDocument ? 4 : 10} value={form.body} maxLength={50000} onChange={(e) => set('body')(e.target.value)}
            placeholder={isAssignment ? 'What students must do, how it is graded, and what to hand in. Leave a blank line between paragraphs.' : 'Leave a blank line between paragraphs.'} />
        </div>
      )}

      <div className="lb-flags">
        <label className="checkbox">
          <input type="checkbox" checked={form.is_published} onChange={(e) => set('is_published')(e.target.checked)} />
          <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
          <span>Published<small>Students only see published lessons. A lesson needs its video, text or questions before it can be published.</small></span>
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={form.is_preview} onChange={(e) => set('is_preview')(e.target.checked)} />
          <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
          <span>Free preview<small>Anyone can watch this lesson without enrolling. Good for a taster.</small></span>
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={form.is_required} onChange={(e) => set('is_required')(e.target.checked)} />
          <span className="checkbox__box" aria-hidden="true"><i className="fas fa-check" /></span>
          <span>Required<small>Needed to complete the course and earn the certificate{isAssignment ? ' (the work must be approved)' : form.kind === 'quiz' ? ' (the quiz must be passed)' : ''}.</small></span>
        </label>
      </div>
      {field('is_published')}

      <div className="lb-editor__actions">
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? <span className="btn-spinner" /> : <i className="fas fa-floppy-disk" />} Save lesson
        </button>
      </div>

      {form.kind !== 'quiz' && (
        <div className="lb-resources">
          <h4>{isAssignment ? 'Files for the assignment' : 'Downloads'}</h4>
          {lesson.resources.length === 0 && <p className="muted small">{isAssignment ? 'Attach a brief, a template or starter files.' : 'Attach slides, PDFs, Word or PowerPoint files, ZIPs or images students can download.'}</p>}
          <ul>
            {lesson.resources.map((r, i) => (
              <li key={r.id}>
                <i className="fas fa-file-arrow-down" aria-hidden="true" />
                <span><strong>{r.title}</strong><small>{r.filename} · {formatSize(r.size)}</small></span>
                <button type="button" className="icon-btn" aria-label={`Move ${r.title} up`} disabled={i === 0} onClick={() => moveResource(i, -1)}><i className="fas fa-arrow-up" /></button>
                <button type="button" className="icon-btn" aria-label={`Move ${r.title} down`} disabled={i === lesson.resources.length - 1} onClick={() => moveResource(i, 1)}><i className="fas fa-arrow-down" /></button>
                <button type="button" className="icon-btn icon-btn--danger" aria-label={`Remove ${r.title}`} onClick={() => removeResource(r.id)}><i className="fas fa-trash-can" /></button>
              </li>
            ))}
          </ul>
          <label className="btn btn--outline btn--sm lb-attach">
            <input ref={resourcePicker} type="file" onChange={(e) => addResource(e.target.files?.[0])} disabled={uploadingResource} />
            {uploadingResource ? <span className="btn-spinner" /> : <i className="fas fa-paperclip" />} Attach a file
          </label>
        </div>
      )}

      {form.kind === 'quiz' && lesson.kind === 'quiz' && <QuizBuilder key={lesson.id} lesson={lesson} onSaved={(data) => onSaved(data, { keepForm: true })} />}
      {form.kind === 'quiz' && lesson.kind !== 'quiz' && <p className="hint">Save the lesson as a quiz first, then add its questions.</p>}
    </form>
  );
};

export default LessonEditor;
