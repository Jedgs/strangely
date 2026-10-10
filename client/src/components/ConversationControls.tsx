import type { ConversationController } from '../features/video-chat/useConversation';
import { Icon } from './Icon';

export function ConversationControls({
  conversation,
  onAction,
  onEnd,
  ending,
}: {
  conversation: ConversationController;
  onAction: (action: () => Promise<void>) => Promise<void>;
  onEnd: () => void;
  ending: boolean;
}) {
  const {
    state,
    stream,
    faceStatus,
    cameraOff,
    cameraFacing,
    busy,
    socketReady,
    matchId,
  } = conversation;
  const canSearch = Boolean(
    stream &&
    (faceStatus === 'present' || faceStatus === 'unavailable') &&
    !cameraOff &&
    socketReady &&
    !busy,
  );
  const hasMatch = Boolean(
    matchId && ['connected', 'connecting'].includes(state),
  );
  const spinning = [
    'permission',
    'searching',
    'connecting',
    'reconnecting',
  ].includes(state);
  const restart = cameraOff || (state === 'error' && !socketReady);
  const searchState =
    ['preview', 'peer-left', 'error'].includes(state) && stream && !restart;
  return (
    <div
      className="conversation-controls"
      role="group"
      aria-label="Conversation controls"
    >
      <div className="main-controls">
        <div className="call-action">
          <button
            className="end-call-button"
            type="button"
            aria-label="End call"
            disabled={ending}
            onClick={onEnd}
          >
            <Icon name="phone-end" />
          </button>
          <span aria-hidden="true">{ending ? 'Ending...' : 'End'}</span>
        </div>
        {stream && (
          <div className="call-action">
            <button
              className="switch-camera-button"
              type="button"
              aria-label={`Switch to ${cameraFacing === 'user' ? 'back' : 'front'} camera`}
              disabled={ending || busy || spinning}
              onClick={() => {
                void onAction(conversation.switchCamera);
              }}
            >
              <Icon name="switch-camera" />
            </button>
            <span aria-hidden="true">Flip</span>
          </div>
        )}
        {hasMatch ? (
          <div className="call-action">
            <button
              className="next-call-button"
              type="button"
              aria-label="Next conversation"
              disabled={busy || !socketReady || ending}
              onClick={() => {
                void onAction(conversation.next);
              }}
            >
              <Icon name="next" />
            </button>
            <span aria-hidden="true">Next</span>
            <small aria-hidden="true">Find another stranger</small>
          </div>
        ) : (
          <div className="call-action">
            <button
              className="button button-primary setup-call-button"
              type="button"
              disabled={
                ending ||
                busy ||
                spinning ||
                (Boolean(searchState) && !canSearch)
              }
              onClick={() => {
                void onAction(
                  searchState ? conversation.start : conversation.prepareCamera,
                );
              }}
            >
              {spinning
                ? state === 'permission'
                  ? 'Waiting for camera...'
                  : state === 'searching'
                    ? 'Searching...'
                    : state === 'connecting'
                      ? 'Connecting...'
                      : 'Reconnecting...'
                : searchState
                  ? 'Find a conversation'
                  : restart || stream
                    ? 'Restart camera'
                    : 'Enable camera'}
              {!spinning && <Icon name={searchState ? 'next' : 'camera'} />}
            </button>
            <small aria-hidden="true">
              {spinning
                ? state === 'permission'
                  ? 'Allow camera & microphone'
                  : 'Finding your next hello'
                : searchState
                  ? 'Meet someone new'
                  : 'Camera & microphone'}
            </small>
          </div>
        )}
      </div>
    </div>
  );
}
