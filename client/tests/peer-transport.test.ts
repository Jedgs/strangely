import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PeerTransport } from '../src/features/video-chat/PeerTransport';
import type { SessionInfo } from '../../shared/protocol';

class FakePeer {
  static current: FakePeer;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  connectionState = 'new';
  onicecandidate = null;
  ontrack = null;
  onconnectionstatechange: (() => void) | null = null;
  addTrack = vi.fn();
  addIceCandidate = vi.fn(async () => {});
  createOffer = vi.fn(async () => ({ type: 'offer' as const, sdp: 'offer' }));
  createAnswer = vi.fn(async () => ({
    type: 'answer' as const,
    sdp: 'answer',
  }));
  setLocalDescription = vi.fn(async () => {});
  setRemoteDescription = vi.fn(async (value: RTCSessionDescriptionInit) => {
    this.remoteDescription = value;
  });
  close = vi.fn();
  constructor() {
    FakePeer.current = this;
  }
}
const session: SessionInfo = {
  sessionId: 'session',
  sessionToken: 'a'.repeat(43),
  expiresAt: Date.now() + 60000,
  iceServers: [],
  iceTransportPolicy: 'all',
  face: {
    intervalMs: 1500,
    warningMs: 10000,
    pauseMs: 30000,
    disconnectMs: 60000,
  },
};
let transport: PeerTransport;
const clonedTrack = { kind: 'video', enabled: true, stop: vi.fn() };
const originalTrack = {
  kind: 'video',
  enabled: true,
  stop: vi.fn(),
  clone: () => clonedTrack,
};
const stream = { getTracks: () => [originalTrack] } as unknown as MediaStream;
const callbacks = {
  description: vi.fn(async () => {}),
  ice: vi.fn(async () => {}),
  remote: vi.fn(),
  connected: vi.fn(),
  failed: vi.fn(),
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal('RTCPeerConnection', FakePeer);
  originalTrack.enabled = true;
  clonedTrack.enabled = true;
  transport = new PeerTransport('match', session, stream, callbacks);
});
afterEach(() => {
  transport.close();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('peer lifecycle', () => {
  it('buffers ICE before a remote description and ignores foreign matches', async () => {
    await transport.receiveIce({
      matchId: 'foreign',
      candidate: { candidate: 'untrusted' },
    });
    await transport.receiveIce({
      matchId: 'match',
      candidate: { candidate: 'early' },
    });
    expect(FakePeer.current.addIceCandidate).not.toHaveBeenCalled();
    await transport.receiveDescription({
      matchId: 'match',
      description: { type: 'offer', sdp: 'remote' },
    });
    expect(FakePeer.current.addIceCandidate).toHaveBeenCalledExactlyOnceWith({
      candidate: 'early',
      sdpMid: null,
      sdpMLineIndex: null,
    });
    expect(callbacks.description).toHaveBeenCalledWith({
      matchId: 'match',
      description: { type: 'answer', sdp: 'answer' },
    });
  });
  it('does not signal an offer completing after Next or Stop', async () => {
    let finish!: (value: { type: 'offer'; sdp: string }) => void;
    FakePeer.current.createOffer.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const offering = transport.offer();
    transport.close();
    finish({ type: 'offer', sdp: 'late' });
    await offering;
    expect(callbacks.description).not.toHaveBeenCalled();
    expect(FakePeer.current.setLocalDescription).not.toHaveBeenCalled();
  });
  it('pauses only outbound video, keeps local detection usable and releases cloned tracks', () => {
    transport.setVideoEnabled(false);
    expect(clonedTrack.enabled).toBe(false);
    expect(originalTrack.enabled).toBe(true);
    transport.close();
    expect(clonedTrack.stop).toHaveBeenCalledOnce();
    expect(originalTrack.stop).not.toHaveBeenCalled();
  });
  it('times out a connection that never completes', () => {
    vi.advanceTimersByTime(25000);
    expect(callbacks.failed).toHaveBeenCalledOnce();
    expect(FakePeer.current.close).toHaveBeenCalledOnce();
  });
  it('restarts the loss timer after a recovered network disconnect', () => {
    const peer = FakePeer.current;
    peer.connectionState = 'connected';
    peer.onconnectionstatechange?.();
    peer.connectionState = 'disconnected';
    peer.onconnectionstatechange?.();
    vi.advanceTimersByTime(4000);
    peer.connectionState = 'connected';
    peer.onconnectionstatechange?.();
    peer.connectionState = 'disconnected';
    peer.onconnectionstatechange?.();
    vi.advanceTimersByTime(8000);
    expect(callbacks.failed).toHaveBeenCalledOnce();
    expect(peer.close).toHaveBeenCalledOnce();
  });
});
