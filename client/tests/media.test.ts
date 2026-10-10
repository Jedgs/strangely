import { afterEach, describe, expect, it, vi } from 'vitest';
import { acquireMedia } from '../src/features/camera/media';

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

  it('requests a compatible back camera and microphone as one capture', async () => {
    const getUserMedia = vi.fn().mockResolvedValue(media);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    await expect(acquireMedia('environment')).resolves.toBe(media);
    expect(getUserMedia).toHaveBeenCalledWith({
      video: expect.objectContaining({ facingMode: { ideal: 'environment' } }),
      audio: { echoCancellation: true, noiseSuppression: true },
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
    await expect(acquireMedia('environment')).resolves.toBe(media);
    expect(getUserMedia).toHaveBeenLastCalledWith({
      video: true,
      audio: { echoCancellation: true, noiseSuppression: true },
    });
  });
});
