// Records a voice message with the browser's microphone (MediaRecorder).
// start() asks for microphone permission; stop() hands the recording to onDone({ file, duration }); cancel() discards it.
import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_VOICE_SECONDS } from '../../utils/chatFiles';

// The first format this browser can record, and the extension the server expects for it.
const FORMATS = [
  ['audio/webm;codecs=opus', 'webm'],
  ['audio/webm', 'webm'],
  ['audio/mp4', 'mp4'],
  ['audio/ogg;codecs=opus', 'ogg'],
];

export const canRecordVoice = () =>
  typeof window !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && typeof window.MediaRecorder !== 'undefined';

export const useVoiceRecorder = (onDone) => {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef(null);
  const stream = useRef(null);
  const chunks = useRef([]);
  const timer = useRef(null);
  const startedAt = useRef(0);
  const keep = useRef(true);
  const done = useRef(onDone);

  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  const release = () => {
    clearInterval(timer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    recorder.current = null;
    setRecording(false);
  };

  const stop = useCallback((send = true) => {
    keep.current = send;
    if (recorder.current?.state === 'recording') recorder.current.stop();
    else release();
  }, []);

  const start = useCallback(async () => {
    if (!canRecordVoice()) throw new Error('unsupported');
    stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    const [mimeType, ext] = FORMATS.find(([type]) => window.MediaRecorder.isTypeSupported?.(type)) || ['', 'webm'];
    const rec = new window.MediaRecorder(stream.current, mimeType ? { mimeType } : undefined);
    chunks.current = [];
    keep.current = true;
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    rec.onstop = () => {
      const duration = Math.round((Date.now() - startedAt.current) / 1000);
      const blob = new Blob(chunks.current, { type: rec.mimeType || mimeType || 'audio/webm' });
      release();
      if (keep.current && blob.size > 0 && duration >= 1) {
        done.current({ file: new File([blob], `voice-message.${ext}`, { type: blob.type }), duration });
      }
    };
    recorder.current = rec;
    startedAt.current = Date.now();
    setSeconds(0);
    rec.start(250);
    setRecording(true);
    timer.current = setInterval(() => {
      const s = Math.round((Date.now() - startedAt.current) / 1000);
      setSeconds(s);
      if (s >= MAX_VOICE_SECONDS) stop(true); // send what was recorded at the limit
    }, 250);
  }, [stop]);

  // Leaving the page mid-recording discards it and turns the microphone off.
  useEffect(() => () => {
    keep.current = false;
    clearInterval(timer.current);
    if (recorder.current?.state === 'recording') recorder.current.stop();
    stream.current?.getTracks().forEach((t) => t.stop());
  }, []);

  return { recording, seconds, start, stop: () => stop(true), cancel: () => stop(false) };
};

export default useVoiceRecorder;
