import type { ConversationController } from '../features/video-chat/useConversation';
import { Icon, type IconName } from './Icon';

export function RoomNotice({
  conversation,
  error,
}: {
  conversation: ConversationController;
  error: string | null;
}) {
  const { stream, cameraOff, socketReady, faceStatus, state } = conversation;
  let severity: 'info' | 'warning' | 'error' = 'info';
  let title = 'Conversation update';
  let text = conversation.message;
  let icon: IconName = 'globe';
  if (error) {
    severity = 'error';
    title = 'Something needs attention';
    text = error;
    icon = 'block';
  } else if (stream && cameraOff) {
    severity = 'warning';
    title = 'Camera is off';
    text = 'Turn your camera on before finding another conversation.';
    icon = 'camera-off';
  } else if (stream && !socketReady) {
    severity = 'warning';
    title = 'Connection interrupted';
    text =
      'Waiting to reconnect to Strangely. Try restarting your camera if this continues.';
    icon = 'refresh';
  } else if (
    stream &&
    faceStatus !== 'present' &&
    faceStatus !== 'loading' &&
    faceStatus !== 'unavailable'
  ) {
    severity = faceStatus === 'paused' ? 'error' : 'warning';
    title = faceStatus === 'paused' ? 'Video paused' : 'Camera update';
    text =
      'Keep only your face visible with good lighting. Never involve minors in a call.';
    icon = 'camera';
  } else if (state === 'reconnecting') {
    severity = 'warning';
    title = 'Reconnecting';
    icon = 'refresh';
  } else if (stream && faceStatus === 'loading') {
    title = 'Checking your camera';
    text = 'One moment while we check that your face is visible.';
    icon = 'camera';
  }
  if (!text) return null;
  return (
    <aside
      className={`room-notification notice-${severity}`}
      aria-label="Room notifications"
    >
      <div
        key={`${severity}:${text}`}
        className="room-notice"
        role={severity === 'error' ? 'alert' : 'status'}
      >
        <Icon name={icon} />
        <div>
          <strong>{title}</strong>
          <p>{text}</p>
        </div>
      </div>
    </aside>
  );
}
