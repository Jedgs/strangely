import { useEffect, useState, type RefObject } from 'react';
import { absenceState, type FaceStatus, type FaceTiming } from './policy';

export function useFacePresence(
  videoRef: RefObject<HTMLVideoElement | null>,
  stream: MediaStream | null,
  timing: FaceTiming | undefined,
  onDisconnect: () => void,
) {
  const [status, setStatus] = useState<FaceStatus>('loading');
  useEffect(() => {
    if (!stream || !timing) return;
    let cancelled = false;
    let ready = false;
    let pending = false;
    let missingSince: number | null = null;
    let deadline = 0;
    let disconnected = false;
    setStatus('loading');
    if (!('Worker' in window) || !('createImageBitmap' in window)) {
      setStatus('unavailable');
      return;
    }
    const worker = new Worker(new URL('./face.worker.ts', import.meta.url), {
      type: 'module',
    });
    const fail = () => {
      if (!cancelled) {
        ready = false;
        setStatus('unavailable');
      }
    };
    const loadingTimeout = window.setTimeout(fail, 20000);
    worker.onerror = fail;
    worker.onmessage = (
      event: MessageEvent<{
        type: string;
        present?: boolean;
        multiple?: boolean;
      }>,
    ) => {
      if (cancelled) return;
      if (event.data.type === 'ready') {
        ready = true;
        window.clearTimeout(loadingTimeout);
      }
      if (event.data.type === 'error') {
        fail();
        return;
      }
      if (event.data.type !== 'result') return;
      pending = false;
      if (event.data.present) {
        missingSince = null;
        setStatus('present');
      } else {
        missingSince ??= Date.now();
        const result = absenceState(Date.now() - missingSince, timing);
        // Multiple detected faces pause outgoing video immediately; this cannot
        // tell which person is an adult, and must not create a persistent ban.
        setStatus(event.data.multiple ? 'paused' : result.status);
        if (result.disconnect && !disconnected) {
          disconnected = true;
          onDisconnect();
        }
      }
    };
    worker.postMessage({ type: 'init', baseUrl: window.location.origin });
    const tick = window.setInterval(() => {
      if (pending && Date.now() > deadline) {
        fail();
        return;
      }
      const video = videoRef.current;
      if (
        !ready ||
        pending ||
        !video ||
        video.readyState < 2 ||
        !video.videoWidth
      )
        return;
      // Downscale each transient input and never queue more than one inference.
      pending = true;
      deadline = Date.now() + 10000;
      void createImageBitmap(video, { resizeWidth: 320, resizeHeight: 240 })
        .then((bitmap) => {
          if (cancelled) {
            bitmap.close();
            return;
          }
          worker.postMessage(
            { type: 'frame', bitmap, timestamp: performance.now() },
            [bitmap],
          );
        })
        .catch(() => {
          pending = false;
          fail();
        });
    }, timing.intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(tick);
      window.clearTimeout(loadingTimeout);
      worker.terminate();
    };
  }, [stream, timing, videoRef, onDisconnect]);
  return status;
}
