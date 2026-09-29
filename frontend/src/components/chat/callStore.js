// Voice and video calls (WebRTC). Kept outside React so a call carries on while you move between pages.
//
// Flow: the caller creates an offer (with its network candidates gathered up front, so no trickle ICE is
// needed) and POSTs it; the other side sees it via /calls/incoming/, answers, and POSTs its answer; the
// caller picks the answer up by polling the call. Media then flows directly between the two browsers.
import { useSyncExternalStore } from 'react';
import { callsAPI, parseApiErrors } from '../../services/api';
import { announceMessagesChanged } from '../../utils/messageEvents';

const STATUS_POLL_MS = 1500;
const INCOMING_POLL_MS = 2500;
const ENDED_SCREEN_MS = 2500;
const FALLBACK_ICE = [{ urls: ['stun:stun.l.google.com:19302'] }];

const IDLE = Object.freeze({ phase: 'idle' });
let state = IDLE;
const listeners = new Set();
const set = (patch) => {
  state = patch === IDLE ? IDLE : { ...state, ...patch };
  listeners.forEach((l) => l());
};
const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The current call: { phase: idle|outgoing|incoming|connecting|active|ended, kind, peer, call, … } */
export const useCall = () => useSyncExternalStore(subscribe, () => state);

export const callsSupported = () =>
  typeof window !== 'undefined' && Boolean(window.RTCPeerConnection && navigator.mediaDevices?.getUserMedia);

let pc = null;
let localStream = null;
let statusTimer = null;
let incomingTimer = null;
let endTimer = null;
let iceServers = null;
const dismissed = new Set(); // incoming calls this browser already declined

const loadIce = async () => {
  if (!iceServers) {
    try {
      iceServers = (await callsAPI.config()).data.ice_servers;
    } catch {
      iceServers = FALLBACK_ICE;
    }
  }
  return iceServers;
};

// Gather network candidates before sending the description (bounded, so a slow network can't stall the call).
const gatherCandidates = (conn, ms = 3000) =>
  new Promise((resolve) => {
    if (conn.iceGatheringState === 'complete') return resolve();
    const timer = setTimeout(resolve, ms);
    conn.addEventListener('icegatheringstatechange', () => {
      if (conn.iceGatheringState === 'complete') {
        clearTimeout(timer);
        resolve();
      }
    });
  });

const getMedia = (kind) =>
  navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
    video: kind === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false,
  });

const mediaError = (err) =>
  err?.name === 'NotAllowedError'
    ? 'Allow microphone and camera access in your browser to make calls.'
    : err?.name === 'NotFoundError'
      ? 'No microphone or camera was found on this device.'
      : 'Your microphone or camera couldn’t be started.';

const makePeer = async () => {
  const conn = new RTCPeerConnection({ iceServers: await loadIce() });
  const remote = new MediaStream();
  conn.ontrack = (e) => {
    remote.addTrack(e.track);
    set({ remoteStream: remote, remoteVersion: Date.now() });
  };
  conn.onconnectionstatechange = () => {
    if (conn !== pc) return;
    if (conn.connectionState === 'connected') set({ phase: 'active', startedAt: state.startedAt || Date.now() });
    if (conn.connectionState === 'failed') hangup('failed');
  };
  localStream.getTracks().forEach((t) => conn.addTrack(t, localStream));
  return { conn, remote };
};

const cleanup = () => {
  clearInterval(statusTimer);
  statusTimer = null;
  if (pc) {
    pc.ontrack = null;
    pc.onconnectionstatechange = null;
    pc.close();
  }
  pc = null;
  localStream?.getTracks().forEach((t) => t.stop());
  localStream = null;
};

// Show the "call ended" screen briefly, then go back to idle.
const finishLocally = (reason) => {
  cleanup();
  clearTimeout(endTimer);
  set({ phase: 'ended', reason, endedAt: Date.now() });
  endTimer = setTimeout(() => set(IDLE), ENDED_SCREEN_MS);
  announceMessagesChanged(); // the call log is a new chat entry
};

const FINAL = { ended: 'ended', declined: 'declined', missed: 'missed', cancelled: 'missed' };

// Watch the call on the server: pick up the answer (caller) and notice when the other side hangs up.
const watchStatus = (callId) => {
  clearInterval(statusTimer);
  statusTimer = setInterval(async () => {
    try {
      const { data } = await callsAPI.get(callId);
      if (state.call?.id !== callId) return;
      if (FINAL[data.status]) {
        finishLocally(FINAL[data.status]);
        return;
      }
      if (data.status === 'accepted' && data.answer && pc && !pc.currentRemoteDescription) {
        set({ phase: 'connecting', call: { ...state.call, ...data } });
        await pc.setRemoteDescription(JSON.parse(data.answer));
      }
    } catch {
      // a missed poll is fine; the next one will catch up
    }
  }, STATUS_POLL_MS);
};

/** Call someone. Admins pass userId; people call the ADRAM team. peer = { name, picture } for the screen. */
export const startCall = async ({ kind, userId, peer }) => {
  if (state.phase !== 'idle' && state.phase !== 'ended') return;
  clearTimeout(endTimer);
  if (!callsSupported()) {
    set({ phase: 'ended', kind, peer, reason: 'unsupported' });
    endTimer = setTimeout(() => set(IDLE), ENDED_SCREEN_MS * 2);
    return;
  }
  set({ ...IDLE, phase: 'outgoing', kind, peer, muted: false, cameraOff: false, call: null, startedAt: null, error: '' });
  try {
    localStream = await getMedia(kind);
  } catch (err) {
    set({ error: mediaError(err) });
    finishLocally('media');
    return;
  }
  set({ localStream });
  try {
    const { conn, remote } = await makePeer();
    pc = conn;
    set({ remoteStream: remote });
    await conn.setLocalDescription(await conn.createOffer());
    await gatherCandidates(conn);
    if (pc !== conn) return; // hung up while connecting
    const { data } = await callsAPI.start(kind, JSON.stringify(conn.localDescription), userId);
    set({ call: data });
    watchStatus(data.id);
  } catch (err) {
    set({ error: parseApiErrors(err, 'The call couldn’t be started.').form });
    finishLocally('error');
  }
};

/** Answer the call that's ringing. */
export const acceptIncoming = async () => {
  const { call } = state;
  if (state.phase !== 'incoming' || !call) return;
  set({ phase: 'connecting' });
  try {
    localStream = await getMedia(call.kind);
  } catch (err) {
    set({ error: mediaError(err) });
    callsAPI.decline(call.id).catch(() => {});
    finishLocally('media');
    return;
  }
  set({ localStream });
  try {
    const { conn, remote } = await makePeer();
    pc = conn;
    set({ remoteStream: remote });
    await conn.setRemoteDescription(JSON.parse(call.offer));
    await conn.setLocalDescription(await conn.createAnswer());
    await gatherCandidates(conn);
    await callsAPI.answer(call.id, JSON.stringify(conn.localDescription));
    watchStatus(call.id);
  } catch (err) {
    const taken = err?.response?.status === 409;
    set({ error: taken ? parseApiErrors(err).form : 'The call couldn’t be connected.' });
    finishLocally(taken ? 'taken' : 'error');
  }
};

export const declineIncoming = () => {
  const { call } = state;
  if (!call) return;
  dismissed.add(call.id);
  callsAPI.decline(call.id).catch(() => {});
  set(IDLE);
  announceMessagesChanged();
};

/** Hang up (or cancel an unanswered call). */
export const hangup = (reason = 'ended') => {
  const id = state.call?.id;
  if (id && state.phase !== 'incoming') callsAPI.end(id).catch(() => {});
  finishLocally(reason);
};

export const toggleMute = () => {
  const muted = !state.muted;
  localStream?.getAudioTracks().forEach((t) => {
    t.enabled = !muted;
  });
  set({ muted });
};

export const toggleCamera = () => {
  const cameraOff = !state.cameraOff;
  localStream?.getVideoTracks().forEach((t) => {
    t.enabled = !cameraOff;
  });
  set({ cameraOff });
};

// Ring when someone calls. Started by the portal layout while someone is signed in.
const checkIncoming = async () => {
  if (state.phase !== 'idle' && state.phase !== 'incoming') return;
  try {
    const { data } = await callsAPI.incoming();
    const ringing = data.find((c) => !dismissed.has(c.id));
    if (state.phase === 'idle' && ringing) {
      set({
        ...IDLE,
        phase: 'incoming',
        kind: ringing.kind,
        call: ringing,
        peer: { name: ringing.from_staff ? `${ringing.caller_name} · ADRAM team` : ringing.user.full_name, picture: ringing.caller_picture, person: ringing.from_staff ? null : ringing.user },
      });
    } else if (state.phase === 'incoming' && !data.some((c) => c.id === state.call.id)) {
      set(IDLE); // the caller hung up, or another administrator answered
      announceMessagesChanged();
    }
  } catch {
    // signed out or offline: try again next time
  }
};

export const watchIncomingCalls = () => {
  if (incomingTimer) return () => {};
  checkIncoming();
  incomingTimer = setInterval(checkIncoming, INCOMING_POLL_MS);
  return () => {
    clearInterval(incomingTimer);
    incomingTimer = null;
  };
};
