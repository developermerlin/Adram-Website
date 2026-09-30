// Helpers for editable content. The website keeps its original wording in code ("defaults") and the admin's
// edits are stored on top of it, so anything the admin hasn't changed keeps showing the original.

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** defaults + edits. Objects merge key by key; lists and text in `saved` replace the default. */
export const mergeContent = (defaults, saved) => {
  if (saved === undefined || saved === null) return defaults;
  if (isObject(defaults) && isObject(saved)) {
    const out = { ...defaults };
    Object.keys(saved).forEach((key) => {
      out[key] = mergeContent(defaults[key], saved[key]);
    });
    return out;
  }
  return saved;
};

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** The parts of `form` that differ from `defaults`: what actually gets saved, so untouched text keeps following the defaults. */
export const diffFromDefaults = (form, defaults) => {
  if (isObject(form) && isObject(defaults)) {
    const out = {};
    Object.keys(form).forEach((key) => {
      const d = diffFromDefaults(form[key], defaults[key]);
      if (d !== undefined) out[key] = d;
    });
    return Object.keys(out).length ? out : undefined;
  }
  return same(form, defaults) ? undefined : form;
};

/** 'hero.title' -> value (or undefined) */
export const getPath = (obj, path) => path.split('.').reduce((o, k) => (o === undefined || o === null ? undefined : o[k]), obj);

/** Returns a copy of `obj` with 'a.b.c' set to `value` (objects along the way are copied, not mutated). */
export const setPath = (obj, path, value) => {
  const [head, ...rest] = path.split('.');
  const base = isObject(obj) ? obj : {};
  return { ...base, [head]: rest.length ? setPath(base[head], rest.join('.'), value) : value };
};

/** Replaces {location}, {name}… in editable text with the site-wide values. */
export const fill = (text, values = {}) =>
  typeof text === 'string' ? text.replace(/\{(\w+)\}/g, (whole, key) => (values[key] !== undefined ? values[key] : whole)) : text;

/** JSON with keys in a fixed order, so two copies of the same content compare equal. */
export const stable = (value) =>
  JSON.stringify(value, (key, v) => (isObject(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v));
