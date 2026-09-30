import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { contentAPI, parseApiErrors } from '../../services/api';
import { normalise, originalOf, startOverrides } from '../../content/textOverrides';
import { publishContent, usePageContent } from '../../content/useContent';

// The text of the text node under the pointer, or null (works in Chromium, Safari and Firefox)
const textAt = (x, y) => {
  let node = null;
  if (document.caretPositionFromPoint) node = document.caretPositionFromPoint(x, y)?.offsetNode;
  else if (document.caretRangeFromPoint) node = document.caretRangeFromPoint(x, y)?.startContainer;
  return node && node.nodeType === 3 && normalise(node.nodeValue) ? node : null;
};

// Shown for administrators only: an "Edit text" button that lets them click any fixed wording on any screen and
// type a replacement. The replacements themselves are also listed under Site content → Interface wording.
export const TextOverrides = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const { items } = usePageContent('interface');
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState(null); // { original, value }
  const [saving, setSaving] = useState(false);

  const map = useMemo(() => new Map((items || []).filter((i) => i.from && i.to !== undefined).map((i) => [normalise(i.from), i.to])), [items]);
  const mapRef = useRef(map);
  const engine = useRef(null);

  // Keep the observer's copy current and re-apply whenever the list changes
  useEffect(() => {
    mapRef.current = map;
    engine.current?.refresh();
  }, [map]);

  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return undefined;
    engine.current = startOverrides(root, () => mapRef.current);
    engine.current.refresh();
    return () => engine.current.stop();
  }, []);

  // Edit mode: the next click on text opens the editor instead of doing what the click normally does
  useEffect(() => {
    document.body.classList.toggle('text-edit-mode', editing);
    if (!editing) return undefined;
    const onClick = (e) => {
      if (e.target.closest('[data-no-override]')) return;
      const node = textAt(e.clientX, e.clientY);
      if (!node) return;
      e.preventDefault();
      e.stopPropagation();
      const base = normalise(originalOf(node));
      setTarget({ original: base, value: map.get(base) ?? base });
    };
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.body.classList.remove('text-edit-mode');
    };
  }, [editing, map]);

  if (!isAdmin) return null;

  const save = async (nextItems) => {
    setSaving(true);
    try {
      const { data } = await contentAPI.save('interface', { items: nextItems });
      publishContent('interface', data.data || {});
      toast.success('Wording saved.');
      setTarget(null);
    } catch (err) {
      toast.error(parseApiErrors(err).data || 'Could not save the wording.');
    } finally {
      setSaving(false);
    }
  };

  const others = (items || []).filter((i) => normalise(i.from) !== target?.original);
  const submit = (e) => {
    e.preventDefault();
    const value = target.value.trim();
    // Same as the original (or empty) means "no replacement"
    save(value && value !== target.original ? [...others, { from: target.original, to: value }] : others);
  };

  return (
    <div data-no-override>
      <button type="button" className={`text-edit-toggle${editing ? ' is-on' : ''}`} onClick={() => setEditing((v) => !v)} aria-pressed={editing}>
        <i className={`fas ${editing ? 'fa-xmark' : 'fa-pen'}`} aria-hidden="true" /> {editing ? 'Stop editing text' : 'Edit text'}
      </button>
      {editing && !target && <p className="text-edit-hint" role="status">Click any wording to change it.</p>}

      {target && (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="text-edit-title">
          <button type="button" className="modal__backdrop" aria-label="Cancel" onClick={() => setTarget(null)} />
          <form className="modal__card" onSubmit={submit}>
            <h2 id="text-edit-title">Change this wording</h2>
            <p className="muted small">
              Original: <strong>{target.original}</strong>
            </p>
            <div className="field">
              <label htmlFor="text-edit-value">Show instead</label>
              <textarea id="text-edit-value" className="input" rows={3} value={target.value} onChange={(e) => setTarget({ ...target, value: e.target.value })} autoFocus />
              <p className="hint">Every place that has exactly this text will change. Leave it as the original to undo an earlier change.</p>
            </div>
            <div className="modal__actions">
              <button type="button" className="btn btn--outline" onClick={() => setTarget(null)} disabled={saving}>Cancel</button>
              <button type="submit" className="btn btn--primary" disabled={saving}>
                {saving ? <span className="btn-spinner" /> : null} Save
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default TextOverrides;
