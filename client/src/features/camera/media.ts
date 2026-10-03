export function releaseMedia(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}
export async function acquireMedia(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia)
    throw new Error(
      'Camera access needs a secure connection and a supported browser.',
    );
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 24, max: 30 },
        facingMode: 'user',
      },
      audio: { echoCancellation: true, noiseSuppression: true },
    });
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError')
      throw new Error(
        'Camera or microphone access was declined. Allow both in your browser’s site settings, then try again.',
        { cause: error },
      );
    if (name === 'NotFoundError')
      throw new Error(
        'We could not find a camera and microphone. Connect both, then try again.',
        { cause: error },
      );
    if (name === 'NotReadableError' || name === 'AbortError')
      throw new Error(
        'Your camera or microphone may be in use by another app. Close it and try again.',
        { cause: error },
      );
    if (name === 'OverconstrainedError')
      throw new Error(
        'Your camera could not use these settings. Try another camera or browser.',
        { cause: error },
      );
    throw new Error(
      'Your camera could not start. Check the device and try again.',
      { cause: error },
    );
  }
}
