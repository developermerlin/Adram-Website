import { useState } from 'react';
import Markdown from '../blog/Markdown';
import { blockEnds, parseBlocks } from '../../utils/markdown';

const CHOICES = [['image', 'fa-image', 'Picture'], ['diagram', 'fa-diagram-project', 'Diagram'], ['code', 'fa-code', 'Code']];

/** The + between two blocks: opens a small menu to add a picture, a diagram or code at exactly that place. */
const InsertPoint = ({ label, onPick }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className={`bi-insert${open ? ' is-open' : ''}`}>
      <span className="bi-insert__line" aria-hidden="true" />
      {open ? (
        <span className="bi-insert__menu" role="group" aria-label={label}>
          {CHOICES.map(([kind, icon, text]) => (
            <button key={kind} type="button" onClick={() => { setOpen(false); onPick(kind); }}>
              <i className={`fas ${icon}`} aria-hidden="true" /> {text}
            </button>
          ))}
          <button type="button" className="bi-insert__close" onClick={() => setOpen(false)} aria-label="Close"><i className="fas fa-xmark" /></button>
        </span>
      ) : (
        <button type="button" className="bi-insert__add" onClick={() => setOpen(true)} aria-label={label} title={label}>
          <i className="fas fa-plus" aria-hidden="true" />
        </button>
      )}
    </div>
  );
};

/**
 * The note as readers will see it, with a + between every paragraph, heading, list or table.
 * onPick(position, kind): position is where in the text the new picture, diagram or code goes.
 */
export const PreviewWithInserts = ({ source, onPick }) => {
  const blocks = parseBlocks(source);
  const ends = blockEnds(source);
  if (!blocks.length) return <p className="muted">Nothing to preview yet. Write the note first, then add pictures and code between its paragraphs here.</p>;
  return (
    <div className="bi-wrap">
      <InsertPoint label="Add a picture, diagram or code at the start" onPick={(kind) => onPick(0, kind)} />
      {blocks.map((b, k) => (
        <div key={k} className="bi-block">
          <Markdown blocks={[b]} />
          <InsertPoint label={`Add a picture, diagram or code after this ${b.type === 'p' ? 'paragraph' : 'part'}`} onPick={(kind) => onPick(ends[k], kind)} />
        </div>
      ))}
    </div>
  );
};

export default PreviewWithInserts;
