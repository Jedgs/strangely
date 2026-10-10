export function cropVideoFrame(
  videoWidth: number,
  videoHeight: number,
  frameWidth: number,
  frameHeight: number,
) {
  if (!videoWidth || !videoHeight || !frameWidth || !frameHeight) return null;

  const sourceRatio = videoWidth / videoHeight;
  const frameRatio = frameWidth / frameHeight;
  const width = sourceRatio > frameRatio ? videoHeight * frameRatio : videoWidth;
  const height = sourceRatio > frameRatio ? videoHeight : videoWidth / frameRatio;
  return {
    width,
    height,
    left: (videoWidth - width) / 2,
    top: (videoHeight - height) / 2,
  };
}
