// How a chat attachment looks inside a message: a photo thumbnail, a voice-message player or a file card.
// Attachments are private, so they're fetched with the sign-in token and shown from a temporary object URL.
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { openPrivateFile, privateFileUrl } from '../../services/api';
import { fileIcon, formatDuration, formatSize } from '../../utils/chatFiles';

// One download per attachment for the whole session (messages re-render on every poll).
const urls = new Map();
const blobUrl = (id) => {
  if (!urls.has(id)) {
    const pending = privateFileUrl('messages', id).catch((err) => {
      urls.delete(id);
      throw err;
    });
    urls.set(id, pending);
  }
  return urls.get(id);
};

const open = (id) => openPrivateFile('messages', id).catch(() => toast.error('That file couldn’t be opened.'));

const ImageAttachment = ({ a }) => {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    blobUrl(a.id).then((url) => alive && setSrc(url)).catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [a.id]);

  return (
    <button type="button" className="att-image" onClick={() => open(a.id)} title={`Open ${a.name}`}>
      {src ? <img src={src} alt={a.name} /> : <span className={failed ? 'att-image__failed' : 'skeleton att-image__loading'}>{failed && <i className="fas fa-image" />}</span>}
    </button>
  );
};

// A compact player: play/pause, a clickable progress bar and the time.
const VoiceAttachment = ({ a, ours }) => {
  const audio = useRef(null);
  const [state, setState] = useState('idle'); // idle | loading | playing | paused
  const [time, setTime] = useState(0);
  const [length, setLength] = useState(a.duration || 0);

  const toggle = async () => {
    const el = audio.current;
    if (state === 'playing') {
      el.pause();
      return;
    }
    try {
      if (!el.src) {
        setState('loading');
        el.src = await blobUrl(a.id);
      }
      await el.play();
    } catch {
      setState('idle');
      toast.error('That voice message couldn’t be played.');
    }
  };

  const seek = (e) => {
    const el = audio.current;
    if (!el.src || !length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    el.currentTime = Math.min(length, ((e.clientX - rect.left) / rect.width) * length);
  };

  const pct = length ? Math.min(100, (time / length) * 100) : 0;
  return (
    <div className={`att-voice${ours ? ' att-voice--ours' : ''}`}>
      <button type="button" className="att-voice__play" onClick={toggle} aria-label={state === 'playing' ? 'Pause voice message' : 'Play voice message'}>
        <i className={`fas ${state === 'loading' ? 'fa-spinner fa-spin' : state === 'playing' ? 'fa-pause' : 'fa-play'}`} />
      </button>
      <div className="att-voice__track" onClick={seek} role="presentation">
        <span className="att-voice__bar"><span style={{ width: `${pct}%` }} /></span>
      </div>
      {/* Elapsed time while playing or paused mid-way; otherwise the message's length */}
      <span className="att-voice__time">{formatDuration(state === 'playing' || time > 0 ? time : length)}</span>
      <i className="fas fa-microphone att-voice__mic" aria-hidden="true" />
      <audio
        ref={audio}
        preload="none"
        onPlay={() => setState('playing')}
        onPause={() => setState('paused')}
        onEnded={() => {
          setState('paused');
          setTime(0);
        }}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setLength(e.currentTarget.duration)}
      />
    </div>
  );
};

const FileAttachment = ({ a }) => (
  <button type="button" className="att-file" onClick={() => open(a.id)} title={`Open ${a.name}`}>
    <span className="att-file__icon"><i className={`fas ${fileIcon(a.name)}`} aria-hidden="true" /></span>
    <span className="att-file__text">
      <strong>{a.name}</strong>
      <small>{formatSize(a.size)} · {a.name.split('.').pop().toUpperCase()}</small>
    </span>
    <i className="fas fa-download att-file__dl" aria-hidden="true" />
  </button>
);

export const Attachment = ({ attachment, ours }) => {
  if (!attachment) return null;
  if (attachment.kind === 'image') return <ImageAttachment a={attachment} />;
  if (attachment.kind === 'audio') return <VoiceAttachment a={attachment} ours={ours} />;
  return <FileAttachment a={attachment} />;
};

export default Attachment;
