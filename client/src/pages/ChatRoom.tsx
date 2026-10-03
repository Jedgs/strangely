import { useEffect, useRef, useState } from 'react';
import type {
  ConversationController,
  ConversationState,
} from '../features/video-chat/useConversation';
import { Brand } from '../components/Brand';
import { Icon, type IconName } from '../components/Icon';
import type { LegalDocument } from '../components/LegalDialog';
import { RemoteVideo } from '../components/RemoteVideo';
import { ReportDialog } from '../components/ReportDialog';
import { BlockDialog } from '../components/BlockDialog';
import { ConversationControls } from '../components/ConversationControls';
import { RoomNotice } from '../components/RoomNotice';
import { RoomActions } from '../components/RoomActions';
import { Dialog } from '../components/Dialog';

const stageContent: Record<
  ConversationState,
  { title: string; description: string; icon: IconName; label: string }
> = {
  idle: {
    title: 'Your next hello awaits.',
    description: 'Enable your camera when you are ready.',
    icon: 'camera',
    label: 'Ready to begin',
  },
  permission: {
    title: 'Let’s get your camera ready.',
    description: 'Allow camera and microphone access in your browser.',
    icon: 'camera',
    label: 'Waiting for permission',
  },
  preview: {
    title: 'Ready when you are.',
    description: 'Check your preview, then find a conversation.',
    icon: 'globe',
    label: 'Camera preview',
  },
  searching: {
    title: 'Someone new is on the way.',
    description: 'Looking for an available person.',
    icon: 'globe',
    label: 'Searching',
  },
  connecting: {
    title: 'A hello is almost here.',
    description: 'Connecting your conversation now.',
    icon: 'globe',
    label: 'Connecting',
  },
  connected: {
    title: 'Waiting for their video.',
    description: 'Your connection is ready.',
    icon: 'camera',
    label: 'Connected',
  },
  'peer-left': {
    title: 'They’ve left the room.',
    description: 'Find another person whenever you are ready.',
    icon: 'globe',
    label: 'Conversation ended',
  },
  reconnecting: {
    title: 'Let’s reconnect.',
    description: 'Trying to restore your connection.',
    icon: 'refresh',
    label: 'Reconnecting',
  },
  error: {
    title: 'Let’s try that again.',
    description: 'Check the notice above, then restart your camera.',
    icon: 'refresh',
    label: 'Something needs attention',
  },
  stopped: {
    title: 'Take a breather.',
    description: 'Your camera and microphone are off.',
    icon: 'camera-off',
    label: 'Stopped',
  },
};

export function ChatRoom({
  conversation,
  onLeave,
  onLegal,
  legalOpen = false,
}: {
  conversation: ConversationController;
  onLeave: () => Promise<void>;
  onLegal: (document: LegalDocument) => void;
  legalOpen?: boolean;
}) {
  const [dialog, setDialog] = useState<{
    type: 'report' | 'block';
    matchId: string;
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [showChrome, setShowChrome] = useState(true);
  const [interaction, setInteraction] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  const lastPointerActivity = useRef(0);
  const keyboardNavigation = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { state, stream, cameraOff, micMuted } = conversation;
  const content = stageContent[state];
  const error = actionError ?? conversation.error;
  const keepChromeVisible = Boolean(
    error ||
    dialog ||
    conversation.busy ||
    moreOpen ||
    pinned ||
    helpOpen ||
    legalOpen,
  );
  const chromeVisible = showChrome || keepChromeVisible;
  function revealControls() {
    setShowChrome(true);
    setInteraction((value) => value + 1);
  }
  useEffect(() => {
    if (keepChromeVisible) return;
    const timer = window.setTimeout(() => {
      // Keep controls available while someone is navigating them by keyboard.
      if (
        keyboardNavigation.current &&
        (headerRef.current?.contains(document.activeElement) ||
          footerRef.current?.contains(document.activeElement))
      )
        return;
      setShowChrome(false);
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [interaction, keepChromeVisible, state]);
  const spinning = [
    'permission',
    'searching',
    'connecting',
    'reconnecting',
  ].includes(state);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  async function run(action: () => Promise<void>) {
    setActionError(null);
    try {
      await action();
    } catch (failure) {
      setActionError(
        failure instanceof Error
          ? failure.message
          : 'That action could not finish. Please try again.',
      );
    }
  }
  async function leave() {
    if (leaving) return;
    setLeaving(true);
    try {
      await onLeave();
    } catch (failure) {
      setActionError(
        failure instanceof Error
          ? failure.message
          : 'We could not end the call. Please try again.',
      );
      setLeaving(false);
    }
  }
  return (
    <div
      className={`room-page ${chromeVisible ? 'chrome-visible' : 'chrome-hidden'} ${error ? 'has-error-notice' : ''}`}
      onPointerDown={() => {
        keyboardNavigation.current = false;
      }}
      onPointerMove={(event) => {
        if (
          event.pointerType === 'mouse' &&
          performance.now() - lastPointerActivity.current > 1000
        ) {
          lastPointerActivity.current = performance.now();
          revealControls();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Tab') keyboardNavigation.current = true;
        if (event.key !== 'Enter' && event.key !== ' ') revealControls();
      }}
    >
      <a className="skip-link" href="#room-content">
        Skip to your room
      </a>
      <header
        ref={headerRef}
        className="call-header"
        inert={!chromeVisible}
        onFocusCapture={revealControls}
        onBlurCapture={revealControls}
      >
        <Brand
          onClick={() => {
            void leave();
          }}
        />
        <p className="connection-status" role="status">
          <span
            className={`status-dot ${state === 'connected' ? 'is-connected' : ''}`}
          />
          {content.label}
        </p>
        <RoomActions
          canModerate={Boolean(
            conversation.lastMatchId && conversation.socketReady,
          )}
          onReport={() => {
            if (conversation.lastMatchId)
              setDialog({ type: 'report', matchId: conversation.lastMatchId });
          }}
          onBlock={() => {
            if (conversation.lastMatchId)
              setDialog({ type: 'block', matchId: conversation.lastMatchId });
          }}
          onGuidelines={() => onLegal('guidelines')}
          onHelp={() => setHelpOpen(true)}
          pinned={pinned}
          onPin={() => {
            setPinned((value) => !value);
            revealControls();
          }}
          open={moreOpen}
          onOpenChange={setMoreOpen}
        />
      </header>
      <main id="room-content" className="call-layout">
        <button
          type="button"
          className="video-controls-toggle"
          aria-label={
            chromeVisible
              ? 'Keep conversation controls visible'
              : 'Show conversation controls'
          }
          aria-expanded={chromeVisible}
          aria-controls="room-controls"
          onClick={revealControls}
        />
        <h1 ref={headingRef} tabIndex={-1} className="sr-only">
          Your Strangely video conversation
        </h1>
        <section
          className={`remote-stage call-pane ${conversation.remoteStream ? 'has-video' : ''}`}
          aria-label="Conversation video"
        >
          {conversation.remoteStream ? (
            <RemoteVideo stream={conversation.remoteStream} />
          ) : (
            <div className="stage-placeholder">
              <div className={`stage-symbol ${spinning ? 'is-searching' : ''}`}>
                <Icon name={content.icon} />
              </div>
              <h2>{content.title}</h2>
              <p>{content.description}</p>
            </div>
          )}
          <span className="pane-caption">
            {conversation.remoteStream
              ? 'Your conversation'
              : 'Finding someone new'}
          </span>
        </section>
        <section
          className="local-stage call-pane"
          aria-label="Your camera preview"
        >
          <video
            ref={conversation.localVideoRef}
            autoPlay
            playsInline
            muted
            className={`local-video ${cameraOff ? 'camera-is-off' : ''}`}
            aria-label="Your private camera preview"
          />
          {(!stream || cameraOff) && (
            <div className="local-placeholder">
              <Icon name={cameraOff ? 'camera-off' : 'camera'} />
              <span>
                {cameraOff
                  ? 'Your camera is off'
                  : 'Your preview will appear here'}
              </span>
            </div>
          )}
          <span className="pane-caption">You {micMuted && '· muted'}</span>
        </section>
      </main>
      <RoomNotice conversation={conversation} error={error} />
      <footer
        id="room-controls"
        ref={footerRef}
        className="call-footer"
        inert={!chromeVisible}
        onFocusCapture={revealControls}
        onBlurCapture={revealControls}
        onPointerDown={revealControls}
      >
        <ConversationControls
          conversation={conversation}
          onAction={run}
          onEnd={() => {
            void leave();
          }}
          ending={leaving}
        />
      </footer>
      {helpOpen && (
        <Dialog
          title="Keep your camera and mic ready."
          eyebrow="Camera & microphone help"
          onClose={() => setHelpOpen(false)}
          intro={
            <p>
              Your camera and microphone stay on during a conversation. Use End
              to leave and turn them off.
            </p>
          }
        >
          <ul className="room-help-list">
            <li>
              Allow camera and microphone access in your browser’s site
              permissions.
            </li>
            <li>
              Keep your face visible with good lighting. Safety checks may pause
              video or end a conversation when no face is visible.
            </li>
            <li>
              Only one face should be visible. Multiple detected faces pause
              outgoing video. These checks do not establish age; never involve
              minors.
            </li>
            <li>
              If your camera cannot start, close other apps using it, then try
              Enable camera again.
            </li>
            <li>
              Tap the video to show controls. Use More to keep them visible.
            </li>
          </ul>
        </Dialog>
      )}
      {dialog?.type === 'report' && (
        <ReportDialog
          onSubmit={(reason, description) =>
            conversation.report(reason, description, dialog.matchId)
          }
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'block' && (
        <BlockDialog
          onBlock={() => conversation.block(dialog.matchId)}
          onClose={() => setDialog(null)}
          onBlocked={() => setDialog(null)}
        />
      )}
    </div>
  );
}
