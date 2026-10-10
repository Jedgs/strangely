import { describe, expect, it } from 'vitest';
import { cropVideoFrame } from '../src/features/camera/previewFraming';

describe('local camera preview framing', () => {
  it('covers the same portrait preview after switching between lens shapes', () => {
    const stage = { width: 390, height: 335 };
    for (const [width, height] of [
      [640, 480],
      [480, 640],
      [1280, 720],
    ]) {
      const crop = cropVideoFrame(width, height, stage.width, stage.height)!;
      expect(crop.width / crop.height).toBeCloseTo(
        stage.width / stage.height,
      );
      expect(crop.width).toBeLessThanOrEqual(width);
      expect(crop.height).toBeLessThanOrEqual(height);
      expect(crop.left + crop.width / 2).toBeCloseTo(width / 2);
      expect(crop.top + crop.height / 2).toBeCloseTo(height / 2);
    }
  });

  it('waits until the new camera reports a usable frame', () => {
    expect(cropVideoFrame(0, 0, 390, 335)).toBeNull();
  });
});
