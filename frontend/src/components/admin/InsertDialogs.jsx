import { useState } from 'react';
import { ImageLibrary } from './contentFields';
import { assetUrl } from '../../utils/assets';

// The languages offered for code blocks; the key is what goes after ``` (see utils/markdown.js and components/blog/Markdown.jsx)
const LANGUAGES = [
  ['cmd', 'Command Prompt (Windows)'],
  ['powershell', 'PowerShell'],
  ['bash', 'Terminal (Linux / macOS)'],
  ['cisco', 'Cisco IOS'],
  ['python', 'Python'],
  ['javascript', 'JavaScript'],
  ['html', 'HTML'],
  ['css', 'CSS'],
  ['sql', 'SQL'],
  ['json', 'JSON'],
  ['yaml', 'YAML'],
  ['config', 'Configuration file'],
  ['text', 'Plain text / output'],
];

const Modal = ({ title, id, onClose, children, footer }) => (
  <div className="modal" role="dialog" aria-modal="true" aria-labelledby={id} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
    <button type="button" className="modal__backdrop" aria-label="Close" tabIndex={-1} onClick={onClose} />
    <div className="modal__card modal__card--wide ins-dialog">
      <div className="ins-dialog__head">
        <h2 id={id} className="h3">{title}</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><i className="fas fa-xmark" /></button>
      </div>
      <div className="ins-dialog__body">{children}</div>
      <div className="modal__actions">{footer}</div>
    </div>
  </div>
);

/** Insert a code block or commands: choose the language, add a title if useful, paste the code. */
export const InsertCodeDialog = ({ onInsert, onClose }) => {
  const [lang, setLang] = useState('cmd');
  const [title, setTitle] = useState('');
  const [code, setCode] = useState('');
  const insert = () => {
    const info = [lang, title.replace(/\s+/g, ' ').trim()].filter(Boolean).join(' ');
    onInsert(`\n\`\`\`${info}\n${code.replace(/\s+$/, '')}\n\`\`\`\n`);
  };
  return (
    <Modal title="Insert code or commands" id="ins-code-title" onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn btn--text" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn--primary" disabled={!code.trim()} onClick={insert}><i className="fas fa-code" /> Insert code</button>
        </>
      )}>
      <div className="ins-dialog__row">
        <label className="field"><span className="field__label">Language</span>
          <select className="input" value={lang} onChange={(e) => setLang(e.target.value)} autoFocus>
            {LANGUAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="field"><span className="field__label">Title (optional)</span>
          <input className="input" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Configure the switch hostname" />
        </label>
      </div>
      <label className="field"><span className="field__label">Code, commands or output</span>
        <textarea className="input ins-dialog__code" rows={10} value={code} spellCheck={false} onChange={(e) => setCode(e.target.value)}
          placeholder={'Paste or type it exactly as learners should type it, e.g.\n\nSwitch> enable\nSwitch# configure terminal\nSwitch(config)# hostname SW1'}
          onKeyDown={(e) => {
            if (e.key === 'Tab') { // a tab inserts spaces instead of leaving the box, so code keeps its indentation
              e.preventDefault();
              const { selectionStart: s, selectionEnd: en, value } = e.target;
              setCode(`${value.slice(0, s)}  ${value.slice(en)}`);
              requestAnimationFrame(() => e.target.setSelectionRange(s + 2, s + 2));
            }
          }} />
        <small className="hint">Learners see a <strong>Copy</strong> button on every code block, so keep each block to commands they can paste as they are.</small>
      </label>
    </Modal>
  );
};

const SIZES = [['full', 'Full width', 'Screenshots and wide diagrams'], ['medium', 'Medium', 'Most diagrams and photos'], ['small', 'Small', 'Icons, logos, small details']];

/** Insert a picture (or, with diagram, a diagram): choose or upload it, write a caption, pick how wide it shows. */
export const InsertImageDialog = ({ onInsert, onClose, diagram = false }) => {
  const [src, setSrc] = useState('');
  const [caption, setCaption] = useState('');
  const [size, setSize] = useState(diagram ? 'medium' : 'full');
  const [picking, setPicking] = useState(true);
  const insert = () => {
    const alt = caption.replace(/[[\]]/g, '').trim() || 'Picture';
    onInsert(`\n![${alt}](${src}${size === 'full' ? '' : ` "${size}"`})\n`);
  };
  if (picking) {
    return <ImageLibrary current={src} onPick={(url) => { setSrc(url); setPicking(false); }} onClose={() => (src ? setPicking(false) : onClose())} />;
  }
  return (
    <Modal title={diagram ? 'Insert a diagram' : 'Insert a picture'} id="ins-img-title" onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn btn--text" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn--primary" disabled={!src} onClick={insert}><i className={`fas ${diagram ? 'fa-diagram-project' : 'fa-image'}`} /> {diagram ? 'Insert diagram' : 'Insert picture'}</button>
        </>
      )}>
      {/* side by side on wider screens: the picture on the left, its caption and width on the right */}
      <div className="ins-dialog__grid">
        <div className="ins-dialog__pic">
          <div className="ins-dialog__preview"><img src={assetUrl(src)} alt="" /></div>
          <button type="button" className="btn btn--outline btn--sm" onClick={() => setPicking(true)}><i className="fas fa-arrows-rotate" /> Change</button>
        </div>
        <div className="ins-dialog__fields">
          <label className="field"><span className="field__label">Caption</span>
            <input className="input" value={caption} maxLength={160} onChange={(e) => setCaption(e.target.value)} autoFocus
              placeholder={diagram ? 'e.g. Figure 1: a star topology' : 'e.g. The Packet Tracer workspace'} />
            <small className="hint">Shown under the picture and read out by screen readers.</small>
          </label>
          <fieldset className="field ins-dialog__sizes">
            <legend className="field__label">Width</legend>
            {SIZES.map(([v, label, hint]) => (
              <label key={v} className={`ins-size${size === v ? ' is-on' : ''}`}>
                <input type="radio" name="ins-size" value={v} checked={size === v} onChange={() => setSize(v)} />
                <span className="ins-size__dot" aria-hidden="true" />
                <span className="ins-size__text"><strong>{label}</strong><small>{hint}</small></span>
              </label>
            ))}
          </fieldset>
        </div>
      </div>
    </Modal>
  );
};
