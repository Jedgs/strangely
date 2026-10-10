export function coverVideoFrame(
  videoWidth: number,
  videoHeight: number,
  frameWidth: number,
  frameHeight: number,
) {
  if (!videoWidth || !videoHeight || !frameWidth || !frameHeight) return null;

  const scale = Math.max(frameWidth / videoWidth, frameHeight / videoHeight);
  const width = videoWidth * scale;
  const height = videoHeight * scale;
  return {
    width,
    height,
    left: (frameWidth - width) / 2,
    top: (frameHeight - height) / 2,
  };
}
