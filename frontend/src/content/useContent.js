import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { contentAPI } from '../services/api';
import { site as siteConfig } from '../config/site';
import { mergeContent } from './merge';
import { defaults } from './defaults';

// The admin's edits for each page, fetched once per page load and shared by every component that uses them.
// The last copy is kept in localStorage so a returning visitor sees the edited text straight away instead of
// the original wording for a moment.
const STORAGE = 'adram.content.';
const entries = {};

const readCache = (slug) => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE + slug)) || {};
  } catch {
    return {};
  }
};

const entry = (slug) => {
  if (!entries[slug]) entries[slug] = { saved: readCache(slug), requested: false, listeners: new Set() };
  return entries[slug];
};

const setSaved = (slug, saved) => {
  const e = entry(slug);
  e.saved = saved || {};
  try {
    localStorage.setItem(STORAGE + slug, JSON.stringify(e.saved));
  } catch {
    /* private mode or storage full: the page still works, just without the cache */
  }
  e.listeners.forEach((l) => l());
};

const load = (slug) => {
  const e = entry(slug);
  if (e.requested) return;
  e.requested = true;
  contentAPI
    .page(slug)
    .then(({ data }) => setSaved(slug, data.data))
    .catch(() => {
      e.requested = false; // the original wording keeps showing; try again on the next visit
    });
};

/** Call after the admin saves or resets a page so the public pages show it without a reload. */
export const publishContent = (slug, saved) => setSaved(slug, saved);

const subscribe = (slug) => (listener) => {
  const { listeners } = entry(slug);
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** A page's content: the original wording with the admin's edits applied. */
export const usePageContent = (slug) => {
  const saved = useSyncExternalStore(subscribe(slug), () => entry(slug).saved);
  useEffect(() => load(slug), [slug]);
  return useMemo(() => mergeContent(defaults[slug], saved), [slug, saved]);
};

// ---------- Site-wide details (contact, opening hours, social links) ----------

// Icons and names for the social networks an admin can add.
export const NETWORKS = {
  facebook: { label: 'Facebook', icon: 'fab fa-facebook-f' },
  whatsapp: { label: 'WhatsApp', icon: 'fab fa-whatsapp' },
  instagram: { label: 'Instagram', icon: 'fab fa-instagram' },
  x: { label: 'X (Twitter)', icon: 'fab fa-x-twitter' },
  linkedin: { label: 'LinkedIn', icon: 'fab fa-linkedin-in' },
  youtube: { label: 'YouTube', icon: 'fab fa-youtube' },
  tiktok: { label: 'TikTok', icon: 'fab fa-tiktok' },
  telegram: { label: 'Telegram', icon: 'fab fa-telegram' },
  github: { label: 'GitHub', icon: 'fab fa-github' },
};

/** Turns the saved site details into the object components use (`site.phones`, `site.socials`…). */
// Details the pages can't do without: if the admin empties one, the original value is used instead.
const need = (value, fallback) => (value && (!Array.isArray(value) || value.length) ? value : fallback);

export const buildSite = (data) => {
  const socials = (data.socials || [])
    .filter((s) => NETWORKS[s.id] && s.href)
    .map((s) => ({ id: s.id, label: NETWORKS[s.id].label, icon: NETWORKS[s.id].icon, href: s.href }));
  const hours = need(
    (data.hours || []).map((h) => ({ ...h, weekdays: (h.weekdays || []).map(Number), open: h.open === '' ? undefined : h.open, close: h.close === '' ? undefined : h.close })),
    siteConfig.hours,
  );
  const location = need(data.location, siteConfig.location);
  return {
    name: need(data.name, siteConfig.name),
    shortName: need(data.shortName, siteConfig.shortName),
    tagline: need(data.tagline, siteConfig.tagline),
    url: siteConfig.url,
    email: need(data.email, siteConfig.email),
    phones: need((data.phones || []).filter(Boolean), siteConfig.phones),
    location,
    hours,
    socials,
    whatsappHref: socials.find((s) => s.id === 'whatsapp')?.href,
    mapsHref: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${need(data.name, siteConfig.name)}, ${location}`)}`,
  };
};

/** Company details with the admin's edits: use instead of importing `site` in components. */
export const useSite = () => {
  const data = usePageContent('site');
  return useMemo(() => buildSite(data), [data]);
};

/** The page content plus site-wide values, with {location}, {name}… in text already filled in. */
export const useSiteTokens = () => {
  const site = useSite();
  return useMemo(() => ({ name: site.name, shortName: site.shortName, tagline: site.tagline, location: site.location, email: site.email }), [site]);
};
