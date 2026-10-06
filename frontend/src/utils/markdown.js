// A small Markdown reader for blog posts. It turns text into plain data (blocks and inline pieces) that
// components/blog/Markdown.jsx renders as React elements, so nothing in a post is ever inserted as raw HTML.
//
// Blocks:  ## Heading, ### Smaller heading, paragraphs (blank line between), - bullet or 1. numbered lists,
//          > quote, ``` code ``` (```bash names the language; ```bash Some title adds a title), --- divider,
//          ![caption](image) on its own line (![caption](image "small") or "medium" sets its width),
//          a YouTube link on its own line, | tables | with | a header row |, and callouts: > [!TIP] (also NOTE, WARNING, IMPORTANT).
// Inline:  **bold**, *italic*, `code`, [text](link)

export const safeUrl = (url = '') => {
  const u = url.trim();
  if (/^(https?:|mailto:|tel:)/i.test(u) || u.startsWith('/') || u.startsWith('#')) return u;
  return '';
};

export const headingId = (text) => text.toLowerCase().replace(/[`*_[\]()]/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 80) || 'section';

const YOUTUBE = /^https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{11})\S*$/i;

/** Inline text -> [{type:'text'|'strong'|'em'|'code'|'link', ...}] */
export const parseInline = (text) => {
  const out = [];
  const re = /(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)\s]+)\))|(\*([^*\s][^*]*)\*)|(_([^_\s][^_]*)_)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ type: 'text', text: text.slice(last, m.index) });
    if (m[1]) out.push({ type: 'strong', children: parseInline(m[2]) });
    else if (m[3]) out.push({ type: 'code', text: m[4] });
    else if (m[5]) {
      const href = safeUrl(m[7]);
      out.push(href ? { type: 'link', href, children: parseInline(m[6]) } : { type: 'text', text: m[6] });
    } else if (m[8]) out.push({ type: 'em', children: parseInline(m[9]) });
    else if (m[10]) out.push({ type: 'em', children: parseInline(m[11]) });
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
  return out;
};

/** Post text -> [{type:'h2'|'h3'|'p'|'ul'|'ol'|'quote'|'callout'|'table'|'code'|'hr'|'img'|'youtube', ...}] */
export const parseBlocks = (source = '') => {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  const ids = {};
  const uniqueId = (text) => {
    const base = headingId(text);
    ids[base] = (ids[base] || 0) + 1;
    return ids[base] > 1 ? `${base}-${ids[base]}` : base;
  };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) { i += 1; continue; }

    if (trimmed.startsWith('```')) {
      const code = [];
      const [langWord = '', ...titleWords] = trimmed.slice(3).trim().split(/\s+/);
      const lang = langWord.replace(/[^\w+#.-]/g, '').slice(0, 20);
      const title = titleWords.join(' ').slice(0, 80);
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) { code.push(lines[i]); i += 1; }
      blocks.push({ type: 'code', text: code.join('\n'), lang, title });
      i += 1;
      continue;
    }
    const heading = /^(#{2,4})\s+(.+)$/.exec(trimmed);
    if (heading) {
      const text = heading[2].replace(/#+$/, '').trim();
      blocks.push({ type: heading[1].length === 2 ? 'h2' : 'h3', text, id: uniqueId(text), children: parseInline(text) });
      i += 1;
      continue;
    }
    if (/^#\s+/.test(trimmed)) { // a single # is the post title already: treat it as a section heading
      const text = trimmed.slice(1).trim();
      blocks.push({ type: 'h2', text, id: uniqueId(text), children: parseInline(text) });
      i += 1;
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(trimmed)) { blocks.push({ type: 'hr' }); i += 1; continue; }
    const image = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"(small|medium|full)")?\)$/.exec(trimmed);
    if (image) {
      const src = safeUrl(image[2]);
      if (src) blocks.push({ type: 'img', src, alt: image[1], size: image[3] || 'full' });
      i += 1;
      continue;
    }
    const video = YOUTUBE.exec(trimmed);
    if (video) { blocks.push({ type: 'youtube', id: video[1] }); i += 1; continue; }
    if (trimmed.startsWith('>')) {
      const quote = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) { quote.push(lines[i].trim().replace(/^>\s?/, '')); i += 1; }
      const callout = /^\[!(NOTE|TIP|WARNING|IMPORTANT)\]\s*(.*)$/i.exec(quote[0] || '');
      if (callout) {
        const text = [callout[2], ...quote.slice(1)].join(' ').trim();
        blocks.push({ type: 'callout', tone: callout[1].toLowerCase(), children: parseInline(text) });
      } else {
        blocks.push({ type: 'quote', children: parseInline(quote.join(' ')) });
      }
      continue;
    }
    // | a | table | : a header row, a |---|---| line, then the rows
    if (trimmed.startsWith('|') && i + 1 < lines.length && /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(lines[i + 1].trim())) {
      const cells = (row) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => parseInline(c.trim()));
      const head = cells(trimmed);
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(cells(lines[i])); i += 1; }
      blocks.push({ type: 'table', head, rows });
      continue;
    }
    if (/^[-*]\s+/.test(trimmed) || /^\d+[.)]\s+/.test(trimmed)) {
      const ordered = /^\d/.test(trimmed);
      const items = [];
      const marker = ordered ? /^\d+[.)]\s+/ : /^[-*]\s+/;
      while (i < lines.length && marker.test(lines[i].trim())) { items.push(parseInline(lines[i].trim().replace(marker, ''))); i += 1; }
      blocks.push({ type: ordered ? 'ol' : 'ul', items });
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|>|[-*]\s|\d+[.)]\s|!\[|-{3,}$|\|)/.test(lines[i].trim()) && !YOUTUBE.test(lines[i].trim())) {
      para.push(lines[i].trim());
      i += 1;
    }
    if (para.length) blocks.push({ type: 'p', lines: para.map(parseInline) });
    else i += 1;
  }
  return blocks;
};

/** The ## headings, for the "On this page" list next to a post. */
export const outline = (blocks) => blocks.filter((b) => b.type === 'h2').map((b) => ({ id: b.id, text: b.text.replace(/[*_`]/g, '') }));

export const readingMinutes = (text = '') => Math.max(1, Math.ceil((text.match(/\w+/g) || []).length / 220));

/**
 * Where something can be inserted after each block, as positions in the text: result[k] is the position just after
 * block k (always at a blank line, never inside a ``` code block), so the editor can add a picture or code there.
 */
export const blockEnds = (source = '') => {
  const text = source.replace(/\r\n?/g, '\n');
  const total = parseBlocks(text).length;
  const ends = [];
  let pos = 0;
  let inCode = false;
  for (const line of text.split('\n')) {
    if (line.trim().startsWith('```')) inCode = !inCode;
    if (!inCode && !line.trim() && pos > 0) {
      const done = parseBlocks(text.slice(0, pos)).length; // blocks finished before this blank line
      while (ends.length < done) ends.push(pos);
    }
    pos += line.length + 1;
  }
  while (ends.length < total) ends.push(text.length);
  return ends;
};

/** Puts a Markdown block (a picture or code) into the text at a position, keeping a blank line on both sides. */
export const insertBlockAt = (text, position, block) => {
  const before = text.slice(0, position).replace(/\s+$/, '');
  const after = text.slice(position).replace(/^\s+/, '');
  return [before, block.trim(), after].filter(Boolean).join('\n\n');
};
