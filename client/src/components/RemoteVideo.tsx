import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

export function RemoteVideo({ stream }: { stream: MediaStream | null }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [needsPlay, setNeedsPlay] = useState(false);
  const [playError, setPlayError] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;
    let active = true;

    const playVideo = () => {
      if (!video) return;
      if (video.srcObject !== stream) {
        video.srcObject = stream;
      }
      setNeedsPlay(false);
      setPlayError(false);
      void video.play().catch(() => {
        if (active) setNeedsPlay(true);
      });
    };

    playVideo();

    const handleTrackEvent = () => {
      if (active) playVideo();
    };

    stream.addEventListener('addtrack', handleTrackEvent);
    stream.addEventListener('removetrack', handleTrackEvent);

    const tracks = stream.getTracks();
    tracks.forEach((track) => {
      track.addEventListener('unmute', handleTrackEvent);
      track.addEventListener('mute', handleTrackEvent);
      track.addEventListener('ended', handleTrackEvent);
    });

    return () => {
      active = false;
      stream.removeEventListener('addtrack', handleTrackEvent);
      stream.removeEventListener('removetrack', handleTrackEvent);
      tracks.forEach((track) => {
        track.removeEventListener('unmute', handleTrackEvent);
        track.removeEventListener('mute', handleTrackEvent);
        track.removeEventListener('ended', handleTrackEvent);
      });
      if (video.srcObject === stream) {
        video.srcObject = null;
      }
    };
  }, [stream]);

  async function play() {
    try {
      const video = videoRef.current;
      if (video && stream) {
        if (video.srcObject !== stream) {
          video.srcObject = stream;
        }
        await video.play();
      }
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
