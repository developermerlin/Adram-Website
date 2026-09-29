import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { catalogAPI, parseApiErrors } from '../../services/api';
import { invalidateCatalog } from '../../data/useCatalog';

// State and API calls for the Scholarships and Training admin pages. kind: 'scholarships' | 'courses'

export const DELETE_CONFIRM = (noun) => ({
  title: `Delete this ${noun}?`,
  text: `It disappears from the website straight away and can’t be restored. To hide it for now, unpublish it instead.`,
  confirm: 'Delete permanently',
});

/** The full list (not paginated) with optimistic publish toggling and reordering. */
export const useCatalogList = (kind) => {
  const api = catalogAPI.manage(kind);
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  const reload = useCallback(
    () =>
      catalogAPI
        .manage(kind)
        .list()
        .then(({ data }) => {
          setItems(data);
          setError('');
        })
        .catch(() => setError('Could not load the list. Refresh the page to try again.')),
    [kind],
  );

  useEffect(() => {
    reload();
  }, [reload]);

  const patchLocal = (id, changes) => setItems((cur) => cur.map((x) => (x.id === id ? { ...x, ...changes } : x)));

  const togglePublish = async (item) => {
    patchLocal(item.id, { is_published: !item.is_published });
    try {
      const { data } = await api.update(item.id, { is_published: !item.is_published });
      patchLocal(item.id, data);
      invalidateCatalog();
      toast.success(`${data.name || data.title} is ${data.is_published ? 'now on the website' : 'hidden from the website'}.`);
    } catch (err) {
      patchLocal(item.id, { is_published: item.is_published });
      toast.error(parseApiErrors(err).form);
    }
  };

  // Moves one item up (-1) or down (+1) and saves the whole order.
  const move = async (item, step) => {
    const before = items;
    const from = items.findIndex((x) => x.id === item.id);
    const to = from + step;
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    [next[from], next[to]] = [next[to], next[from]];
    setItems(next);
    try {
      await api.reorder(next.map((x) => x.id));
      invalidateCatalog();
    } catch {
      setItems(before);
      toast.error('Could not save the new order.');
    }
  };

  const remove = async (item) => {
    try {
      await api.remove(item.id);
      setItems((cur) => cur.filter((x) => x.id !== item.id));
      invalidateCatalog();
      toast.success('Deleted.');
    } catch (err) {
      toast.error(parseApiErrors(err).form);
    }
  };

  return { items, error, reload, togglePublish, move, remove };
};

/**
 * Form state for one item. `id` is undefined for a new item.
 * Returns { form, set, loaded, notFound, errors, saving, dirty, save }.
 */
export const useCatalogEditor = (kind, id, blank) => {
  const [form, setForm] = useState(blank);
  const [saved, setSaved] = useState(id ? null : blank);
  const [notFound, setNotFound] = useState(false);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    catalogAPI
      .manage(kind)
      .get(id)
      .then(({ data }) => {
        setForm(data);
        setSaved(data);
      })
      .catch(() => setNotFound(true));
  }, [kind, id]);

  const dirty = saved !== null && JSON.stringify(form) !== JSON.stringify(saved);

  // Warn before closing the tab with unsaved edits.
  useEffect(() => {
    if (!dirty) return undefined;
    const onUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty]);

  const set = (field) => (value) => {
    setForm((cur) => ({ ...cur, [field]: value }));
    setErrors((cur) => ({ ...cur, [field]: undefined }));
  };

  // Blank dates go to the API as null; returns the saved item, or null if validation failed.
  const save = async () => {
    const payload = { ...form };
    Object.keys(payload).forEach((key) => {
      if (payload[key] === '' && /deadline|intake|cutoff/.test(key)) payload[key] = null;
    });
    setSaving(true);
    try {
      const api = catalogAPI.manage(kind);
      const { data } = id ? await api.update(id, payload) : await api.create(payload);
      setForm(data);
      setSaved(data);
      setErrors({});
      invalidateCatalog();
      return data;
    } catch (err) {
      // A 5xx is a server fault, not a problem with what was typed.
      const parsed =
        err?.response?.status >= 500
          ? { form: 'The server hit an error while saving. Nothing was saved; please try again, and tell your developer if it keeps happening.' }
          : parseApiErrors(err, 'Could not save. Check the highlighted fields.');
      setErrors(parsed);
      toast.error(parsed.form || 'Some fields need your attention.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  return { form, set, loaded: saved !== null, notFound, errors, saving, dirty, save };
};

// Mirrors Django's slugify closely enough for a placeholder preview.
export const slugify = (text) =>
  text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-')
    .slice(0, 70);
