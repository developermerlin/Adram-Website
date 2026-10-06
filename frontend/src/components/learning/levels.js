// The five stages every Learning field runs through. The names and descriptions come from Site content → Learning hub;
// these are used when a name was cleared there, so a level is never shown without one.
const FALLBACK = ['Zero', 'Foundations', 'Intermediate', 'Advanced', 'Hero'];

/** [{ level: 1..5, name, text }] from the page content. */
export const levelList = (content) => FALLBACK.map((name, i) => ({
  level: i + 1,
  name: content.levels?.[i]?.name || name,
  text: content.levels?.[i]?.text || '',
}));

// Icon for each type of note (the names of the types come from Site content)
export const KIND_ICONS = { note: 'fa-file-lines', research: 'fa-flask', lab: 'fa-laptop-code', cheatsheet: 'fa-table-list' };

export const RESOURCE_ICONS = { link: 'fa-link', video: 'fa-circle-play', file: 'fa-file-arrow-down' };

export const hoursText = (minutes) => (minutes >= 60 ? `${Math.round(minutes / 6) / 10} h` : `${minutes} min`);
