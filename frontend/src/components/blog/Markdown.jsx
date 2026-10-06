import { Fragment, useState } from 'react';
import { assetUrl } from '../../utils/assets';
import { parseBlocks } from '../../utils/markdown';

const CALLOUTS = {
  note: ['fa-circle-info', 'Note'],
  tip: ['fa-lightbulb', 'Tip'],
  warning: ['fa-triangle-exclamation', 'Warning'],
  important: ['fa-circle-exclamation', 'Important'],
};

// How a code block's language is named in its header (```cmd shows "Command Prompt")
const LANGS = {
  cmd: 'Command Prompt', powershell: 'PowerShell', ps: 'PowerShell', bash: 'Terminal', sh: 'Terminal', shell: 'Terminal', zsh: 'Terminal',
  cisco: 'Cisco IOS', ios: 'Cisco IOS', python: 'Python', py: 'Python', js: 'JavaScript', javascript: 'JavaScript', html: 'HTML', css: 'CSS',
  sql: 'SQL', json: 'JSON', yaml: 'YAML', yml: 'YAML', text: 'Text', txt: 'Text', config: 'Configuration', conf: 'Configuration', php: 'PHP', java: 'Java',
};

/** A code block with its language, an optional title and a Copy button, so commands can be pasted straight into a terminal. */
const CodeBlock = ({ lang, title, text }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false); // clipboard blocked (e.g. not https): the reader can still select the text
    }
  };
  return (
    <div className="prose-code">
      <div className="prose-code__head">
        <span className="prose-code__lang">{lang ? LANGS[lang.toLowerCase()] || lang : 'Code'}</span>
        {title && <span className="prose-code__title">{title}</span>}
        <button type="button" className="prose-code__copy" onClick={copy} aria-label={copied ? 'Copied' : 'Copy the code'}>
          <i className={`fas ${copied ? 'fa-check' : 'fa-copy'}`} aria-hidden="true" /> {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre><code>{text}</code></pre>
    </div>
  );
};

const Inline = ({ nodes }) => nodes.map((n, i) => {
  switch (n.type) {
    case 'strong': return <strong key={i}><Inline nodes={n.children} /></strong>;
    case 'em': return <em key={i}><Inline nodes={n.children} /></em>;
    case 'code': return <code key={i}>{n.text}</code>;
    case 'link': {
      const external = /^https?:/i.test(n.href);
      return <a key={i} href={n.href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}><Inline nodes={n.children} /></a>;
    }
    default: return <Fragment key={i}>{n.text}</Fragment>;
  }
});

/** A blog post's text as an article (see utils/markdown.js for what the text can contain). */
export const Markdown = ({ source, blocks: given }) => {
  const blocks = given || parseBlocks(source);
  return blocks.map((b, i) => {
    switch (b.type) {
      case 'h2': return <h2 key={i} id={b.id}><Inline nodes={b.children} /></h2>;
      case 'h3': return <h3 key={i} id={b.id}><Inline nodes={b.children} /></h3>;
      case 'ul': return <ul key={i}>{b.items.map((item, k) => <li key={k}><Inline nodes={item} /></li>)}</ul>;
      case 'ol': return <ol key={i}>{b.items.map((item, k) => <li key={k}><Inline nodes={item} /></li>)}</ol>;
      case 'quote': return <blockquote key={i}><p><Inline nodes={b.children} /></p></blockquote>;
      case 'callout': return (
        <aside key={i} className={`prose-callout prose-callout--${b.tone}`} role="note">
          <strong className="prose-callout__label"><i className={`fas ${CALLOUTS[b.tone][0]}`} aria-hidden="true" /> {CALLOUTS[b.tone][1]}</strong>
          <p><Inline nodes={b.children} /></p>
        </aside>
      );
      case 'table': return (
        <div key={i} className="prose-table" role="region" aria-label="Table" tabIndex={0}>
          <table>
            <thead><tr>{b.head.map((c, k) => <th key={k} scope="col"><Inline nodes={c} /></th>)}</tr></thead>
            <tbody>{b.rows.map((row, r) => <tr key={r}>{row.map((c, k) => <td key={k}><Inline nodes={c} /></td>)}</tr>)}</tbody>
          </table>
        </div>
      );
      case 'code': return <CodeBlock key={i} lang={b.lang} title={b.title} text={b.text} />;
      case 'hr': return <hr key={i} />;
      case 'img': return (
        <figure key={i} className={b.size && b.size !== 'full' ? `prose-figure--${b.size}` : undefined}>
          <img src={assetUrl(b.src)} alt={b.alt} loading="lazy" />
          {b.alt && <figcaption>{b.alt}</figcaption>}
        </figure>
      );
      case 'youtube': return (
        <div key={i} className="prose__video">
          <iframe src={`https://www.youtube-nocookie.com/embed/${b.id}`} title="YouTube video" loading="lazy"
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
        </div>
      );
      default: return <p key={i}>{b.lines.map((line, k) => <Fragment key={k}>{k > 0 && <br />}<Inline nodes={line} /></Fragment>)}</p>;
    }
  });
};

export default Markdown;
