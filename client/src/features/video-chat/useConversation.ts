import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  Ack,
  ClientEvents,
  ServerEvents,
  SessionInfo,
  ReportReason,
} from '../../../../shared/protocol';
import { createSession, getSession, endSession } from '../../services/api';
import { API_ORIGIN } from '../../services/backend';
import { acquireMedia, releaseMedia } from '../camera/media';
import { useFacePresence } from '../face-presence/useFacePresence';
import { PeerTransport } from './PeerTransport';

export type ConversationState =
  | 'idle'
  | 'permission'
  | 'preview'
  | 'searching'
  | 'connecting'
  | 'connected'
  | 'peer-left'
  | 'reconnecting'
  | 'error'
  | 'stopped';
type Connection = Socket<ServerEvents, ClientEvents>;

function acknowledged(
  send: (reply: (ack: Ack) => void) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('We did not hear back. Please try again.')),
      8000,
    );
    send((result) => {
      clearTimeout(timeout);
      if (result.ok) resolve();
      else reject(new Error(result.message));
    });
  });
}

export function useConversation() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [state, setState] = useState<ConversationState>('idle');
  const [message, setMessage] = useState('Your next conversation starts here.');
  const [error, setError] = useState<string | null>(null);
  const [socketReady, setSocketReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [lastMatchId, setLastMatchId] = useState<string | null>(null);
  const socketRef = useRef<Connection | null>(null);
  const peerRef = useRef<PeerTransport | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const currentMatch = useRef<string | null>(null);
  const desiredConversation = useRef(false);
  const pendingNext = useRef<string | null>(null);
  const generation = useRef(0);
  const actionBusy = useRef(false);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const stateRef = useRef(state);
  const sessionRef = useRef(session);
  stateRef.current = state;

  const clearPeer = useCallback(() => {
    peerRef.current?.close();
    peerRef.current = null;
    currentMatch.current = null;
    setMatchId(null);
    setRemoteStream(null);
  }, []);

  const stop = useCallback(async () => {
    const token = ++generation.current;
    desiredConversation.current = false;
    pendingNext.current = null;
    clearPeer();
    releaseMedia(streamRef.current);
    streamRef.current = null;
    setStream(null);
    setMicMuted(false);
    setCameraOff(false);
    setError(null);
    setState('stopped');
    setMessage('You’ve stopped. Your camera and microphone are off.');
    actionBusy.current = false;
    setBusy(false);
    const socket = socketRef.current;
    if (socket?.connected) {
      try {
        await acknowledged((reply) => socket.emit('queue:stop', {}, reply));
      } catch {
        if (socketRef.current !== socket) socket.disconnect();
        else if (generation.current === token) {
          socket.disconnect();
          setSocketReady(false);
          setMessage('You’ve stopped. Reconnect before starting again.');
        }
      }
    }
  }, [clearPeer]);

  const faceDisconnect = useCallback(() => {
    const stopping = stop();
    const token = generation.current;
    void stopping.then(() => {
      if (generation.current === token)
        setMessage(
          'We couldn’t see a face for a while. Your conversation ended. Improve the lighting and try again.',
        );
    });
  }, [stop]);
  const faceStatus = useFacePresence(
    localVideoRef,
    stream,
    session?.face,
    faceDisconnect,
  );
  const faceFlags = useRef({ status: faceStatus, cameraOff });
  faceFlags.current = { status: faceStatus, cameraOff };

  useEffect(() => {
    const video = localVideoRef.current;
    if (video) {
      video.srcObject = stream;
      if (stream) void video.play().catch(() => {});
    }
  }, [stream]);

  useEffect(() => {
    if (!stream) return;
    // Keep the private preview available for detecting a returning face while
    // independent outbound video tracks are paused.
    stream.getVideoTracks().forEach((track) => {
      track.enabled = !cameraOff;
    });
    peerRef.current?.setVideoEnabled(!cameraOff && faceStatus !== 'paused');
    if (
      faceStatus === 'unavailable' &&
      ['searching', 'connecting', 'connected'].includes(stateRef.current)
    ) {
      const stopping = stop();
      const token = generation.current;
      void stopping.then(() => {
        if (generation.current === token)
          setError(
            'The camera check stopped working. Restart your camera before searching again.',
          );
      });
    }
  }, [faceStatus, cameraOff, stream, stop]);

  useEffect(() => {
    if (!session) return;
    const socket: Connection = io(API_ORIGIN || undefined, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 4,
      reconnectionDelay: 1000,
      timeout: 8000,
      withCredentials: true,
      auth: { sessionToken: session.sessionToken },
    });
    socketRef.current = socket;
    let readyTimeout: ReturnType<typeof setTimeout>;
    const armTimeout = () => {
      clearTimeout(readyTimeout);
      readyTimeout = setTimeout(() => {
        setState('error');
        setError('We couldn’t connect. Check your connection and try again.');
      }, 20000);
    };
    socket.on('session:ready', () => {
      clearTimeout(readyTimeout);
      setSocketReady(true);
      setError(null);
      if (stateRef.current === 'reconnecting' || stateRef.current === 'error') {
        setState(streamRef.current ? 'preview' : 'idle');
        setMessage('You’re back. Choose when to find a new conversation.');
      }
    });
    socket.on('session:ended', (payload) => {
      clearTimeout(readyTimeout);
      generation.current++;
      desiredConversation.current = false;
      pendingNext.current = null;
      actionBusy.current = false;
      setBusy(false);
      clearPeer();
      releaseMedia(streamRef.current);
      streamRef.current = null;
      setStream(null);
      setSocketReady(false);
      setError(payload.message);
      setState('error');
      socket.disconnect();
    });
    socket.on('queue:waiting', () => {
      if (streamRef.current) {
        setState('searching');
        setMessage('Looking for someone to say hello to.');
      }
    });
    const failPeer = (text: string) => {
      desiredConversation.current = false;
      clearPeer();
      setState('error');
      setError(text);
      if (socket.connected)
        void acknowledged((reply) =>
          socket.emit('queue:stop', {}, reply),
        ).catch(() => socket.disconnect());
    };
    socket.on('match:found', (payload) => {
      if (!streamRef.current || !desiredConversation.current) {
        void acknowledged((reply) =>
          socket.emit('queue:stop', {}, reply),
        ).catch(() => {});
        return;
      }
      clearPeer();
      currentMatch.current = payload.matchId;
      setMatchId(payload.matchId);
      setLastMatchId(payload.matchId);
      setState('connecting');
      setMessage('Someone’s here. Connecting your video…');
      setError(null);
      try {
        const transport = new PeerTransport(
          payload.matchId,
          sessionRef.current ?? session,
          streamRef.current,
          {
            description: (value) =>
              acknowledged((reply) =>
                socket.emit('signal:description', value, reply),
              ),
            ice: (value) =>
              acknowledged((reply) => socket.emit('signal:ice', value, reply)),
            remote: (value) => {
              if (currentMatch.current === payload.matchId)
                setRemoteStream(value);
            },
            connected: () => {
              if (currentMatch.current === payload.matchId) {
                setState('connected');
                setMessage('You’re connected. A simple hello is a good start.');
              }
            },
            failed: (text) => {
              if (currentMatch.current === payload.matchId) failPeer(text);
            },
          },
        );
        transport.setVideoEnabled(
          !faceFlags.current.cameraOff &&
            faceFlags.current.status !== 'paused' &&
            faceFlags.current.status !== 'unavailable',
        );
        peerRef.current = transport;
        if (payload.initiator)
          void transport.offer().catch(() => {
            if (currentMatch.current === payload.matchId)
              failPeer('The connection could not start. Please try again.');
          });
      } catch {
        failPeer(
          'Your browser could not start a video connection. Try a current browser.',
        );
      }
    });
    socket.on('match:ended', (payload) => {
      if (currentMatch.current !== payload.matchId) return;
      desiredConversation.current =
        payload.reason === 'next' && pendingNext.current === payload.matchId;
      clearPeer();
      setState('peer-left');
      setMessage(
        payload.reason === 'block'
          ? 'This conversation has ended.'
          : 'They’ve left the room. You can find someone new.',
      );
    });
    socket.on('signal:description', (payload) => {
      void peerRef.current?.receiveDescription(payload).catch(() => {
        if (currentMatch.current === payload.matchId)
          failPeer('We couldn’t connect the video. Please try again.');
      });
    });
    socket.on('signal:ice', (payload) => {
      void peerRef.current?.receiveIce(payload).catch(() => {
        if (currentMatch.current === payload.matchId)
          failPeer('We couldn’t connect the video. Please try again.');
      });
    });
    socket.on('disconnect', () => {
      generation.current++;
      desiredConversation.current = false;
      pendingNext.current = null;
      actionBusy.current = false;
      setBusy(false);
      setSocketReady(false);
      clearPeer();
      if (stateRef.current !== 'stopped') {
        setState('reconnecting');
        setMessage('Connection lost. Trying to reconnect…');
        armTimeout();
      }
    });
    socket.on('connect_error', (failure: Error & { data?: Ack }) => {
      clearTimeout(readyTimeout);
      setSocketReady(false);
      const denied = failure.data;
      setError(
        denied &&
          !denied.ok &&
          [
            'SESSION_CAPACITY',
            'RATE_LIMIT',
            'BANNED',
            'SESSION_EXPIRED',
            'AGE_REQUIRED',
            'SESSION_REQUIRED',
          ].includes(denied.code)
          ? denied.message
          : 'We couldn’t connect to Strangely. Please try again.',
      );
    });
    socket.connect();
    armTimeout();
    return () => {
      clearTimeout(readyTimeout);
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      clearPeer();
    };
  }, [session, clearPeer]);

  useEffect(() => {
    const release = () => {
      generation.current++;
      releaseMedia(streamRef.current);
      streamRef.current = null;
      peerRef.current?.close();
      socketRef.current?.disconnect();
    };
    window.addEventListener('pagehide', release);
    return () => {
      window.removeEventListener('pagehide', release);
      release();
    };
  }, []);

  async function acceptConsent() {
    const info = await createSession();
    sessionRef.current = info;
    setSession(info);
    setError(null);
    setState('idle');
    setMessage('First, make yourself comfortable.');
  }

  async function prepareCamera() {
    if (actionBusy.current) return;
    actionBusy.current = true;
    setBusy(true);
    const token = ++generation.current;
    setState('permission');
    setError(null);
    setMessage('Allow camera and microphone access in your browser.');
    try {
      const info = await getSession(sessionRef.current?.sessionToken);
      if (token !== generation.current) return;
      sessionRef.current = info;
      setSession(info);
      const media = await acquireMedia();
      if (token !== generation.current) {
        releaseMedia(media);
        return;
      }
      releaseMedia(streamRef.current);
      streamRef.current = media;
      setStream(media);
      media.getTracks().forEach((track) =>
        track.addEventListener(
          'ended',
          () => {
            if (streamRef.current === media) {
              const stopping = stop();
              const current = generation.current;
              void stopping.then(() => {
                if (generation.current === current)
                  setError(
                    'Your camera or microphone disconnected. Check your devices and try again.',
                  );
              });
            }
          },
          { once: true },
        ),
      );
      setState('preview');
      setMessage('Make sure your face is visible, then find a conversation.');
    } catch (failure) {
      if (token !== generation.current) return;
      setState('error');
      setError(
        failure instanceof Error
          ? failure.message
          : 'Your camera could not start. Please try again.',
      );
    } finally {
      if (token === generation.current) {
        actionBusy.current = false;
        setBusy(false);
      }
    }
  }

  async function queue(nextMatch?: string) {
    if (actionBusy.current) return;
    const socket = socketRef.current;
    if (nextMatch) {
      clearPeer();
      setState('preview');
    }
    if (!streamRef.current || faceStatus !== 'present' || cameraOff) {
      if (nextMatch && socket?.connected)
        await acknowledged((reply) => socket.emit('queue:stop', {}, reply));
      desiredConversation.current = false;
      throw new Error(
        'Keep your camera on and your face visible before searching.',
      );
    }
    if (!socket?.connected || !socketReady) {
      socket?.connect();
      throw new Error(
        'We’re connecting to Strangely. Please try again in a moment.',
      );
    }
    actionBusy.current = true;
    setBusy(true);
    setError(null);
    desiredConversation.current = true;
    pendingNext.current = nextMatch ?? null;
    const token = generation.current;
    try {
      // Refresh short-lived TURN credentials before each new conversation.
      const info = await getSession(sessionRef.current?.sessionToken);
      if (token !== generation.current) return;
      if (socketRef.current !== socket || !socket.connected)
        throw new Error('Your connection changed. Please try searching again.');
      // Refresh the connection settings without restarting a healthy socket.
      sessionRef.current = info;
      if (info.expiresAt <= Date.now())
        throw new Error(
          'Your session expired. Return to the start page to continue.',
        );
      if (nextMatch)
        await acknowledged((reply) =>
          socket.emit('queue:next', { matchId: nextMatch }, reply),
        );
      else await acknowledged((reply) => socket.emit('queue:join', {}, reply));
    } catch (failure) {
      if (token === generation.current) {
        desiredConversation.current = false;
        if (nextMatch && socket.connected) {
          try {
            await acknowledged((reply) => socket.emit('queue:stop', {}, reply));
          } catch {
            if (generation.current === token) socket.disconnect();
          }
        }
        if (token !== generation.current) return;
        if (!currentMatch.current) setState('error');
        setError(
          failure instanceof Error
            ? failure.message
            : 'We couldn’t start searching. Please try again.',
        );
      }
    } finally {
      if (token === generation.current) {
        actionBusy.current = false;
        pendingNext.current = null;
        setBusy(false);
      }
    }
  }

  async function report(
    reason: ReportReason,
    description: string,
    targetMatchId = lastMatchId,
  ) {
    const id = targetMatchId;
    const socket = socketRef.current;
    if (!id || !socket?.connected)
      throw new Error('Reconnect before sending this report.');
    await acknowledged((reply) =>
      socket.emit(
        'moderation:report',
        { matchId: id, reason, description },
        reply,
      ),
    );
  }
  async function block(targetMatchId = lastMatchId) {
    const id = targetMatchId;
    const socket = socketRef.current;
    if (!id || !socket?.connected)
      throw new Error('Reconnect before blocking this participant.');
    await acknowledged((reply) =>
      socket.emit('moderation:block', { matchId: id }, reply),
    );
    // A dialog can refer to a previous conversation while a new peer arrives.
    // The server emits match:ended if the blocked participant is still active.
    if (currentMatch.current === id) {
      desiredConversation.current = false;
      clearPeer();
      setState('peer-left');
      setMessage('Blocked for this session. You can find someone new.');
    } else if (!currentMatch.current && stateRef.current === 'peer-left') {
      setMessage('Blocked for this session. You can find someone new.');
    }
  }
  function toggleMute() {
    const muted = !micMuted;
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
    setMicMuted(muted);
  }
  function toggleCamera() {
    setCameraOff((value) => !value);
  }
  async function leave() {
    const sessionToken = sessionRef.current?.sessionToken;
    void stop();
    setSession(null);
    sessionRef.current = null;
    setLastMatchId(null);
    setState('idle');
    // Media is released first even if the server is unavailable during logout.
    await endSession(sessionToken).catch(() => {});
  }

  return {
    state,
    message,
    error,
    session,
    stream,
    remoteStream,
    localVideoRef,
    faceStatus,
    micMuted,
    cameraOff,
    socketReady,
    busy,
    matchId,
    lastMatchId,
    acceptConsent,
    prepareCamera,
    start: () => queue(),
    next: () => (currentMatch.current ? queue(currentMatch.current) : queue()),
    stop,
    report,
    block,
    toggleMute,
    toggleCamera,
    leave,
  };
}
export type ConversationController = ReturnType<typeof useConversation>;
