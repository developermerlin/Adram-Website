import { useState } from 'react';
import toast from 'react-hot-toast';
import { lmsAPI, parseApiErrors } from '../../services/api';

const COMMON = [['en', 'English'], ['fr', 'Français'], ['kri', 'Krio'], ['ar', 'العربية']];

/** Subtitles for an uploaded video: a .vtt or .srt file per language (uploading a language again replaces it). */
export const CaptionsEditor = ({ lesson, onChange }) => {
  const [captions, setCaptions] = useState(lesson.captions || []);
  const [language, setLanguage] = useState('en');
  const [label, setLabel] = useState('English');
  const [busy, setBusy] = useState(false);

  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const { data } = await lmsAPI.addCaption(lesson.id, file, language, label);
      const next = [...captions.filter((c) => c.language !== data.language), data];
      setCaptions(next);
      onChange?.(next);
      toast.success(`${data.label} subtitles added.`);
    } catch (err) {
      const errs = parseApiErrors(err);
      toast.error(errs.file || errs.detail || 'The subtitles could not be added.');
    } finally {
      setBusy(false);
    }
  };
  const remove = async (c) => {
    if (!window.confirm(`Remove the ${c.label} subtitles?`)) return;
    await lmsAPI.removeCaption(c.id);
    const next = captions.filter((x) => x.id !== c.id);
    setCaptions(next);
    onChange?.(next);
  };

  return (
    <div className="lb-captions">
      <strong><i className="fas fa-closed-captioning" aria-hidden="true" /> Subtitles</strong>
      {captions.length === 0 && <small className="muted">None yet. Subtitles help students who are deaf, learning in a second language, or watching without sound.</small>}
      <ul>
        {captions.map((c) => (
          <li key={c.id}><span>{c.label} <small className="muted">({c.language})</small></span>
            <button type="button" className="icon-btn" aria-label={`Remove ${c.label} subtitles`} onClick={() => remove(c)}><i className="fas fa-xmark" /></button></li>
        ))}
      </ul>
      <div className="lb-captions__add">
        <select className="input input--sm" aria-label="Subtitle language" value={language}
          onChange={(e) => { setLanguage(e.target.value); setLabel(COMMON.find(([v]) => v === e.target.value)?.[1] || ''); }}>
          {COMMON.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <label className="btn btn--outline btn--sm">
          {busy ? <span className="btn-spinner" /> : <i className="fas fa-upload" />} Add .vtt or .srt file
          <input type="file" accept=".vtt,.srt" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} disabled={busy} />
        </label>
      </div>
    </div>
  );
};

export default CaptionsEditor;
