// Replaces fixed wording anywhere in the interface (student portal, admin dashboard, sign-in forms…) with the
// admin's own text, without touching each screen's code. The admin lists "original text -> replacement text" pairs
// (Website → Site content → Interface wording), or clicks text on the page in "Edit text" mode.
//
// Only text that is always exactly the same can be replaced: a heading, a button, a hint, a placeholder. Text that
// includes a name or a number ("Hello, Amina", "3 applications") changes with each person, so it can't be matched.
//
// The page is not rebuilt: text nodes (and placeholder / title / aria-label / alt attributes) are edited in place, and a
// MutationObserver applies the same replacements to anything React draws later.

const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
const IGNORE = 'script, style, textarea, [data-no-override]';

const original = new WeakMap(); // Text node -> the wording the screen itself wrote
const applied = new WeakMap(); //  Text node -> what we last wrote into it
const attrOriginal = new WeakMap(); // Element -> { attribute: original }
const attrApplied = new WeakMap(); //  Element -> { attribute: what we last wrote }

/** Whitespace-insensitive form of a string, used to match it against the list. */
export const normalise = (text) => (text || '').replace(/\s+/g, ' ').trim();

// Keeps the spaces around a replaced string, so layout is unchanged
const swap = (raw, map) => {
  const [, lead, core, tail] = raw.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const replacement = map.get(normalise(core));
  return replacement === undefined ? raw : `${lead}${replacement}${tail}`;
};

const skip = (node) => {
  const el = node.nodeType === 1 ? node : node.parentElement;
  return !el || el.closest(IGNORE);
};

const applyText = (node, map) => {
  if (skip(node)) return;
  const current = node.nodeValue;
  let base = original.get(node);
  // First sight of the node, or the screen wrote new text into it since we last did: that's the new original
  if (base === undefined || (applied.has(node) && current !== applied.get(node))) {
    base = current;
    original.set(node, base);
  }
  const next = swap(base, map);
  if (current !== next) node.nodeValue = next;
  applied.set(node, next);
};

const applyAttrs = (el, map) => {
  if (skip(el)) return;
  const bases = attrOriginal.get(el) || {};
  const last = attrApplied.get(el) || {};
  ATTRS.forEach((name) => {
    if (!el.hasAttribute(name)) return;
    const current = el.getAttribute(name);
    if (!(name in bases) || (name in last && current !== last[name])) bases[name] = current;
    const next = swap(bases[name], map);
    if (current !== next) el.setAttribute(name, next);
    last[name] = next;
  });
  attrOriginal.set(el, bases);
  attrApplied.set(el, last);
};

const walk = (root, map) => {
  if (root.nodeType === 3) return applyText(root, map);
  if (root.nodeType !== 1) return undefined;
  applyAttrs(root, map);
  const texts = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = texts.nextNode(); n; n = texts.nextNode()) applyText(n, map);
  root.querySelectorAll('[placeholder],[title],[aria-label],[alt]').forEach((el) => applyAttrs(el, map));
  return undefined;
};

/** The wording the screen itself wrote for a text node (before any replacement). */
export const originalOf = (node) => original.get(node) ?? node.nodeValue;

/**
 * Starts applying `getMap()` (a Map of normalised original -> replacement) to everything inside `root`.
 * Returns { refresh, stop }: call refresh() after the list changes.
 */
export const startOverrides = (root, getMap) => {
  const observer = new MutationObserver((records) => {
    const map = getMap();
    if (!map.size) return;
    records.forEach((r) => {
      if (r.type === 'childList') r.addedNodes.forEach((n) => walk(n, map));
      else if (r.type === 'characterData') applyText(r.target, map);
      else if (r.type === 'attributes') applyAttrs(r.target, map);
    });
  });
  observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  return {
    // Re-applies everything: new replacements go in, removed ones are undone
    refresh: () => walk(root, getMap()),
    stop: () => observer.disconnect(),
  };
};
