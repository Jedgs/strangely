import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  acquireCamera,
  acquireMedia,
  isCameraBusyError,
} from '../src/features/camera/media';

const media = {} as MediaStream;

afterEach(() => vi.unstubAllGlobals());

describe('browser media acquisition', () => {
  it('prefers the front camera without requiring that constraint', async () => {
    const getUserMedia = vi.fn().mockResolvedValue(media);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    await expect(acquireMedia()).resolves.toBe(media);
    expect(getUserMedia).toHaveBeenCalledWith({
      video: expect.objectContaining({ facingMode: { ideal: 'user' } }),
      audio: { echoCancellation: true, noiseSuppression: true },
    });
  });

  it('requests only a compatible back-camera video track when flipping', async () => {
    const getUserMedia = vi.fn().mockResolvedValue(media);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    await expect(acquireCamera('environment')).resolves.toBe(media);
    expect(getUserMedia).toHaveBeenCalledWith({
      video: expect.objectContaining({ facingMode: { ideal: 'environment' } }),
      audio: false,
    });
  });

  it('falls back when a mobile browser rejects optional video constraints', async () => {
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(
        new DOMException('unsupported', 'OverconstrainedError'),
      )
      .mockResolvedValueOnce(media);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    await expect(acquireCamera('environment')).resolves.toBe(media);
    expect(getUserMedia).toHaveBeenLastCalledWith({
      video: true,
      audio: false,
    });
  });

  it('recognizes a camera-busy failure that can be retried after a flip handoff', () => {
    const error = new Error('camera busy', {
      cause: new DOMException('busy', 'NotReadableError'),
    });
    expect(isCameraBusyError(error)).toBe(true);
    expect(isCameraBusyError(new Error('permission denied'))).toBe(false);
  });
});
