export function releaseMedia(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export type CameraFacingMode = 'user' | 'environment';

const audioConstraints: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
};

function videoConstraints(facingMode: CameraFacingMode): MediaTrackConstraints {
  return {
    width: { ideal: 640 },
    height: { ideal: 480 },
    frameRate: { ideal: 24, max: 30 },
    // Keep one conventional landscape capture shape for both lenses. Mobile
    // WebKit can switch to a narrow portrait stream when asked for 9:16 after
    // a lens flip, which leaves letterbox bars in the fixed preview stage.
    aspectRatio: { ideal: 4 / 3 },
    // `ideal`, rather than `exact`, lets a browser use a compatible camera if
    // it does not expose a distinct front/rear lens (common on mobile WebKit).
    facingMode: { ideal: facingMode },
  };
}

function cameraError(error: unknown, microphoneRequired: boolean): Error {
  const device = microphoneRequired ? 'camera and microphone' : 'camera';
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return new Error(
      microphoneRequired
        ? 'Camera or microphone access was declined. Allow both in your browser’s site settings, then try again.'
        : 'Camera access was declined. Allow it in your browser’s site settings, then try again.',
      { cause: error },
    );
  if (name === 'NotFoundError')
    return new Error(
      `We could not find a ${device}. Connect it, then try again.`,
      { cause: error },
    );
  if (name === 'NotReadableError' || name === 'AbortError')
    return new Error(
      `Your ${device} may be in use by another app. Close it and try again.`,
      { cause: error },
    );
  if (name === 'OverconstrainedError')
    return new Error(
      'Your camera could not use these settings. Try another camera or browser.',
      { cause: error },
    );
  return new Error(
    'Your camera could not start. Check the device and try again.',
    {
      cause: error,
    },
  );
}

async function capture(
  facingMode: CameraFacingMode,
  audio: MediaTrackConstraints | false,
): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia)
    throw new Error(
      'Camera access needs a secure connection and a supported browser.',
    );
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: videoConstraints(facingMode),
      audio,
    });
  } catch (error) {
    // Some mobile browsers advertise a constraint but reject it at runtime.
    // Retry without optional video preferences; permissions are not retried.
    if (
      error instanceof DOMException &&
      error.name === 'OverconstrainedError'
    ) {
      try {
        return await navigator.mediaDevices.getUserMedia({
          video: true,
          audio,
        });
      } catch (fallbackError) {
        throw cameraError(fallbackError, audio !== false);
      }
    }
    throw cameraError(error, audio !== false);
  }
}

export function acquireMedia(facingMode: CameraFacingMode = 'user') {
  return capture(facingMode, audioConstraints);
}
