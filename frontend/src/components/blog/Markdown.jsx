import { Fragment } from 'react';
import { assetUrl } from '../../utils/assets';
import { parseBlocks } from '../../utils/markdown';

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
      case 'code': return <pre key={i}><code>{b.text}</code></pre>;
      case 'hr': return <hr key={i} />;
      case 'img': return (
        <figure key={i}>
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
