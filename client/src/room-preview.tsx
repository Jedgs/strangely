// Development-only visual fixture; Vite's production entry is index.html.
// No session, consent, camera, microphone, or remote participant is used here.
import { useRef, useState } from 'react';
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
  const conversation: ConversationController = {
    state,
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
    stream: null,
    remoteStream: null,
    localVideoRef,
    faceStatus: 'present',
    micMuted: false,
    cameraOff: false,
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
    leave: action,
  };
  return (
    <ChatRoom conversation={conversation} onLeave={action} onLegal={noop} />
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
