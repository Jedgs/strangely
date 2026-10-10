import { describe, expect, it } from 'vitest';
import { coverVideoFrame } from '../src/features/camera/previewFraming';

describe('local camera preview framing', () => {
  it('covers the same portrait preview after switching between lens shapes', () => {
    const stage = { width: 390, height: 335 };
    for (const [width, height] of [
      [640, 480],
      [480, 640],
      [1280, 720],
    ]) {
      const frame = coverVideoFrame(width, height, stage.width, stage.height)!;
      expect(frame.width).toBeGreaterThanOrEqual(stage.width);
      expect(frame.height).toBeGreaterThanOrEqual(stage.height);
      expect(frame.left + frame.width / 2).toBeCloseTo(stage.width / 2);
      expect(frame.top + frame.height / 2).toBeCloseTo(stage.height / 2);
    }
  });

  it('waits until the new camera reports a usable frame', () => {
    expect(coverVideoFrame(0, 0, 390, 335)).toBeNull();
  });
});
