// The call screen: incoming call (with ringtone), calling, in-call (video or voice) and "call ended".
import { useEffect, useRef, useState } from 'react';
import Avatar from '../ui/Avatar';
import { formatDuration } from '../../utils/chatFiles';
import { acceptIncoming, declineIncoming, hangup, toggleCamera, toggleMute, useCall } from './callStore';

const ENDED_TEXT = {
  ended: 'Call ended',
  declined: 'Call declined',
  missed: 'No answer',
  failed: 'The connection was lost',
  media: 'Couldn’t start your microphone or camera',
  taken: 'Another administrator answered',
  error: 'The call couldn’t be connected',
  unsupported: 'Calls aren’t supported in this browser',
};

// A soft two-tone ring, made in the browser (no audio file needed). Browsers may block sound until the
// page has been clicked once; the ring is then silent but the call screen still shows.
const useRingtone = (on, outgoing) => {
  useEffect(() => {
    if (!on) return undefined;
    let ctx;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return undefined;
    }
    const ring = () => {
      const now = ctx.currentTime;
      [0, 0.45].forEach((offset, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = outgoing ? 425 : i ? 660 : 880;
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(outgoing ? 0.05 : 0.12, now + offset + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.4);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.42);
      });
    };
    ring();
    const timer = setInterval(ring, outgoing ? 3000 : 2000);
    return () => {
      clearInterval(timer);
      ctx.close().catch(() => {});
    };
  }, [on, outgoing]);
};

const useTimer = (startedAt) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  return startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
};

const Video = ({ stream, muted = false, className, version }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && stream && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream, version]);
  return <video ref={ref} className={className} autoPlay playsInline muted={muted} />;
};

// Plays the other side's sound in a voice call (video calls play it through the video element).
const RemoteAudio = ({ stream, version }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && stream && ref.current.srcObject !== stream) {
      ref.current.srcObject = stream;
      ref.current.play?.().catch(() => {});
    }
  }, [stream, version]);
  return <audio ref={ref} autoPlay />;
};

export const CallOverlay = () => {
  const call = useCall();
  const { phase, kind, peer } = call;
  const video = kind === 'video';
  const seconds = useTimer(phase === 'active' ? call.startedAt : null);
  useRingtone(phase === 'incoming' || (phase === 'outgoing' && Boolean(call.call)), phase === 'outgoing');

  if (phase === 'idle') return null;

  const hasRemoteVideo = video && call.remoteStream?.getVideoTracks().length > 0 && phase === 'active';
  const status = {
    incoming: `Incoming ${video ? 'video' : 'voice'} call`,
    outgoing: call.call ? 'Ringing…' : 'Calling…',
    connecting: 'Connecting…',
    active: formatDuration(seconds),
    ended: call.error || ENDED_TEXT[call.reason] || 'Call ended',
  }[phase];

  return (
    <div className={`call${video ? ' call--video' : ''}${hasRemoteVideo ? ' has-remote' : ''} call--${phase}`} role="dialog" aria-modal="true" aria-label={`${video ? 'Video' : 'Voice'} call with ${peer?.name || ''}`}>
      {hasRemoteVideo && <Video stream={call.remoteStream} version={call.remoteVersion} className="call__remote" />}
      {!video && call.remoteStream && <RemoteAudio stream={call.remoteStream} version={call.remoteVersion} />}

      <div className="call__who">
        {!hasRemoteVideo && (
          <span className={`call__avatar${phase === 'incoming' || phase === 'outgoing' ? ' is-ringing' : ''}`}>
            {peer?.person ? <Avatar person={peer.person} size={112} /> : <span className="call__team"><i className="fas fa-headset" /></span>}
          </span>
        )}
        <h2>{peer?.name}</h2>
        <p className={`call__status${phase === 'active' ? ' is-live' : ''}`} aria-live="polite">
          {phase === 'active' && <i className="fas fa-circle" aria-hidden="true" />} {status}
        </p>
      </div>

      {video && call.localStream && phase !== 'ended' && (
        <Video stream={call.localStream} muted className={`call__self${call.cameraOff ? ' is-off' : ''}`} />
      )}

      <div className="call__controls">
        {phase === 'incoming' && (
          <>
            <button type="button" className="call__btn call__btn--decline" onClick={declineIncoming} aria-label="Decline">
              <i className="fas fa-phone-slash" /><span>Decline</span>
            </button>
            <button type="button" className="call__btn call__btn--accept" onClick={acceptIncoming} aria-label="Accept">
              <i className={`fas ${video ? 'fa-video' : 'fa-phone'}`} /><span>Accept</span>
            </button>
          </>
        )}
        {['outgoing', 'connecting', 'active'].includes(phase) && (
          <>
            <button type="button" className={`call__btn${call.muted ? ' is-on' : ''}`} onClick={toggleMute} aria-pressed={Boolean(call.muted)} aria-label={call.muted ? 'Unmute' : 'Mute'}>
              <i className={`fas ${call.muted ? 'fa-microphone-slash' : 'fa-microphone'}`} /><span>{call.muted ? 'Unmute' : 'Mute'}</span>
            </button>
            {video && (
              <button type="button" className={`call__btn${call.cameraOff ? ' is-on' : ''}`} onClick={toggleCamera} aria-pressed={Boolean(call.cameraOff)} aria-label={call.cameraOff ? 'Turn camera on' : 'Turn camera off'}>
                <i className={`fas ${call.cameraOff ? 'fa-video-slash' : 'fa-video'}`} /><span>{call.cameraOff ? 'Camera on' : 'Camera off'}</span>
              </button>
            )}
            <button type="button" className="call__btn call__btn--decline" onClick={() => hangup('ended')} aria-label={phase === 'active' ? 'End call' : 'Cancel call'}>
              <i className="fas fa-phone-slash" /><span>{phase === 'active' ? 'End' : 'Cancel'}</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default CallOverlay;
