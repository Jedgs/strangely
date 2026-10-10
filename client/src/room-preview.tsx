// Development-only visual fixture; Vite's production entry is index.html.
// No session, consent, camera, microphone, or remote participant is used here.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ChatRoom } from './pages/ChatRoom';
import { Dialog } from './components/Dialog';
import { ConsentProgress } from './components/ConsentProgress';
import type {
  ConversationController,
  ConversationState,
} from './features/video-chat/useConversation';
import './styles.css';
import './room.css';

const requestedState = new URLSearchParams(location.search).get('state');
const progressPreview =
  new URLSearchParams(location.search).get('view') === 'progress';
const cameraPreview =
  new URLSearchParams(location.search).get('camera') === 'on';
const simulatedCamera =
  new URLSearchParams(location.search).get('camera') === 'simulated';
const state: ConversationState =
  requestedState === 'error'
    ? 'error'
    : requestedState === 'connected'
      ? 'connected'
      : requestedState === 'warning'
        ? 'reconnecting'
        : 'idle';
const noop = () => {};
const action = async () => {};

function RoomPreview() {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const emptyStream = useMemo(
    () => (cameraPreview ? new MediaStream() : null),
    [],
  );
  const [simulatedStream, setSimulatedStream] = useState<MediaStream | null>(
    null,
  );
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>(
    'user',
  );
  const stream = simulatedCamera ? simulatedStream : emptyStream;
  useEffect(() => {
    if (!simulatedCamera) return;
    const canvas = document.createElement('canvas');
    canvas.width = cameraFacing === 'user' ? 640 : 480;
    canvas.height = cameraFacing === 'user' ? 480 : 640;
    const context = canvas.getContext('2d');
    if (!context) return;
    const draw = () => {
      context.fillStyle = cameraFacing === 'user' ? '#d42b91' : '#1259c7';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#fff';
      context.font = 'bold 32px sans-serif';
      context.fillText(cameraFacing === 'user' ? 'FRONT' : 'BACK', 48, 80);
      context.beginPath();
      context.arc(canvas.width / 2, canvas.height / 2, 70, 0, Math.PI * 2);
      context.lineWidth = 8;
      context.stroke();
    };
    const source = canvas.captureStream(12);
    draw();
    const timer = window.setInterval(draw, 200);
    setSimulatedStream(source);
    return () => {
      window.clearInterval(timer);
      source.getTracks().forEach((track) => track.stop());
    };
  }, [cameraFacing]);
  useEffect(() => {
    const video = localVideoRef.current;
    if (!video || !simulatedCamera) return;
    video.srcObject = simulatedStream;
    if (simulatedStream) void video.play().catch(() => {});
  }, [simulatedStream]);
  const conversation: ConversationController = {
    state: simulatedCamera ? 'preview' : state,
    message:
      state === 'connected'
        ? 'You’re connected. A simple hello is a good start.'
        : state === 'reconnecting'
          ? 'Connection lost. Trying to reconnect…'
          : 'First, make yourself comfortable.',
    error:
      state === 'error'
        ? 'We could not reach Strangely. Please check your connection and try again in a moment.'
        : null,
    session: null,
    stream,
    remoteStream: null,
    localVideoRef,
    faceStatus: 'present',
    micMuted: false,
    cameraOff: false,
    cameraFacing,
    socketReady: state !== 'error',
    busy: false,
    matchId: state === 'connected' ? 'visual-fixture' : null,
    lastMatchId: state === 'connected' ? 'visual-fixture' : null,
    acceptConsent: action,
    prepareCamera: action,
    start: action,
    next: action,
    stop: action,
    report: action,
    block: action,
    toggleMute: noop,
    toggleCamera: noop,
    switchCamera: async () => {
      setCameraFacing((current) =>
        current === 'user' ? 'environment' : 'user',
      );
    },
    leave: action,
  };
  return (
    <>
      <ChatRoom conversation={conversation} onLeave={action} onLegal={noop} />
      {simulatedCamera && (
        <button
          type="button"
          style={{ position: 'fixed', zIndex: 100, top: 8, left: 8 }}
          onClick={() => {
            void conversation.switchCamera();
          }}
        >
          Flip simulated camera
        </button>
      )}
    </>
  );
}

function ProgressPreview() {
  const [items, setItems] = useState([false, false, false, false]);
  return (
    <Dialog
      title="Review progress preview"
      onClose={noop}
      className="consent-dialog"
      intro={
        <p>
          Design test only. These controls do not accept notices or start a
          session.
        </p>
      }
    >
      <ConsentProgress completed={items.filter(Boolean).length} />
      <div className="consent-checks">
        {items.map((checked, index) => (
          <div className="consent-row" key={index}>
            <label>
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => {
                  const value = event.target.checked;
                  setItems((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? value : item,
                    ),
                  );
                }}
              />
              <span>Preview confirmation {index + 1}</span>
            </label>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

createRoot(document.getElementById('root')!).render(
  progressPreview ? <ProgressPreview /> : <RoomPreview />,
);
