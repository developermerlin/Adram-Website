import { useEffect, useRef, useState } from 'react';

const W = 520;
const H = 170;
const INK = '#111827';

/**
 * Sign by drawing (mouse, finger or pen) or by typing a name in a handwriting style.
 * `onChange(dataUrl)` gets a transparent PNG, or '' when the pad is empty.
 */
export const SignaturePad = ({ onChange, defaultName = '' }) => {
  const canvas = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);
  const [mode, setMode] = useState('draw');
  const [typed, setTyped] = useState(defaultName);
  const [empty, setEmpty] = useState(true);

  const ctx = () => canvas.current?.getContext('2d');
  const clear = () => {
    const c = canvas.current;
    if (!c) return;
    ctx().clearRect(0, 0, c.width, c.height);
    setEmpty(true);
    onChange('');
  };

  // Sharp lines on high-density screens: draw at device pixels, show at CSS size
  useEffect(() => {
    const c = canvas.current;
    const ratio = window.devicePixelRatio || 1;
    c.width = W * ratio;
    c.height = H * ratio;
    const g = c.getContext('2d');
    g.scale(ratio, ratio);
    g.lineCap = 'round';
    g.lineJoin = 'round';
  }, []);

  // Typed signature: draw the name in a script font
  const renderTyped = (value) => {
    setTyped(value);
    const c = canvas.current;
    const g = ctx();
    g.clearRect(0, 0, c.width, c.height);
    const name = value.trim();
    if (!name) {
      setEmpty(true);
      onChange('');
      return;
    }
    let size = 64;
    g.fillStyle = INK;
    g.textBaseline = 'middle';
    do {
      g.font = `${size}px "Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive`;
      size -= 4;
    } while (g.measureText(name).width > W - 40 && size > 20);
    g.fillText(name, 20, H / 2 + 6);
    setEmpty(false);
    onChange(c.toDataURL('image/png'));
  };

  const point = (e) => {
    const r = canvas.current.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const down = (e) => {
    if (mode !== 'draw') return;
    e.preventDefault();
    canvas.current.setPointerCapture?.(e.pointerId);
    drawing.current = true;
    last.current = point(e);
  };
  const move = (e) => {
    if (!drawing.current) return;
    const p = point(e);
    const g = ctx();
    g.strokeStyle = INK;
    g.lineWidth = e.pressure && e.pointerType === 'pen' ? 1.5 + e.pressure * 2.5 : 2.6;
    g.beginPath();
    g.moveTo(last.current.x, last.current.y);
    g.lineTo(p.x, p.y);
    g.stroke();
    last.current = p;
    if (empty) setEmpty(false);
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(canvas.current.toDataURL('image/png'));
  };

  return (
    <div className="sig">
      <div className="sig__modes" role="tablist" aria-label="How to sign">
        <button type="button" role="tab" aria-selected={mode === 'draw'} className={mode === 'draw' ? 'is-active' : ''} onClick={() => { setMode('draw'); clear(); }}><i className="fas fa-signature" /> Draw</button>
        <button type="button" role="tab" aria-selected={mode === 'type'} className={mode === 'type' ? 'is-active' : ''} onClick={() => { setMode('type'); renderTyped(typed); }}><i className="fas fa-keyboard" /> Type</button>
      </div>
      {mode === 'type' && (
        <input className="input sig__typed" value={typed} maxLength={60} onChange={(e) => renderTyped(e.target.value)} placeholder="Type your full name" aria-label="Your name, as a signature" />
      )}
      <div className={`sig__pad${mode === 'draw' ? ' is-drawing' : ''}`}>
        <canvas ref={canvas} style={{ aspectRatio: `${W} / ${H}` }} aria-label="Signature box"
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} />
        <span className="sig__line" aria-hidden="true" />
        {mode === 'draw' && empty && <span className="sig__hint" aria-hidden="true">Sign here with your mouse, finger or pen</span>}
      </div>
      {mode === 'draw' && <button type="button" className="btn btn--text btn--sm sig__clear" onClick={clear} disabled={empty}><i className="fas fa-eraser" /> Clear</button>}
    </div>
  );
};

export default SignaturePad;
