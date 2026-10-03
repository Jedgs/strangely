import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

export function RemoteVideo({ stream }: { stream: MediaStream | null }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [needsPlay, setNeedsPlay] = useState(false);
  const [playError, setPlayError] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let active = true;
    video.srcObject = stream;
    setNeedsPlay(false);
    setPlayError(false);
    if (stream)
      void video.play().catch(() => {
        if (active) setNeedsPlay(true);
      });
    return () => {
      active = false;
      video.srcObject = null;
    };
  }, [stream]);

  async function play() {
    try {
      await videoRef.current?.play();
      setNeedsPlay(false);
      setPlayError(false);
    } catch {
      setPlayError(true);
    }
  }

  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="remote-video"
        aria-label="Other participant’s live camera"
      />
      {needsPlay && (
        <div className="play-prompt">
          <button
            className="button button-primary"
            type="button"
            onClick={() => {
              void play();
            }}
          >
            <Icon name="mic" />
            Play conversation audio
          </button>
          {playError && (
            <p role="alert">
              Your browser could not play this conversation. Try again or use
              Next.
            </p>
          )}
        </div>
      )}
    </>
  );
}
