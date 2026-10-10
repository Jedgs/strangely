import type {
  DescriptionPayload,
  IcePayload,
  SessionInfo,
} from '../../../../shared/protocol';

type Callbacks = {
  description: (payload: DescriptionPayload) => Promise<void>;
  ice: (payload: IcePayload) => Promise<void>;
  remote: (stream: MediaStream) => void;
  connected: () => void;
  failed: (message: string) => void;
};

export class PeerTransport {
  private readonly peer: RTCPeerConnection;
  private active = true;
  private candidates: RTCIceCandidateInit[] = [];
  private readonly timeout: ReturnType<typeof setTimeout>;
  private lostTimeout: ReturnType<typeof setTimeout> | undefined;
  private answering = false;
  private readonly outboundTracks = new Map<
    MediaStreamTrack['kind'],
    MediaStreamTrack
  >();
  private readonly senders = new Map<MediaStreamTrack['kind'], RTCRtpSender>();
  private videoEnabled = true;
  private audioEnabled = true;

  private remoteStream: MediaStream | null = null;

  private getOrCreateRemoteStream(): MediaStream | null {
    if (typeof MediaStream === 'undefined') return null;
    this.remoteStream ??= new MediaStream();
    return this.remoteStream;
  }

  constructor(
    readonly matchId: string,
    session: SessionInfo,
    stream: MediaStream,
    private readonly callbacks: Callbacks,
  ) {
    this.peer = new RTCPeerConnection({
      iceServers: session.iceServers,
      iceTransportPolicy: session.iceTransportPolicy,
    });
    stream.getTracks().forEach((track) => {
      const outbound = track.clone();
      const sender = this.peer.addTrack(outbound, stream);
      this.outboundTracks.set(outbound.kind, outbound);
      this.senders.set(outbound.kind, sender);
    });
    this.peer.onicecandidate = (event) => {
      if (this.active && event.candidate) {
        const candidate = event.candidate;
        void callbacks
          .ice({
            matchId,
            candidate: {
              candidate: candidate.candidate,
              sdpMid: candidate.sdpMid,
              sdpMLineIndex: candidate.sdpMLineIndex,
              ...(candidate.usernameFragment
                ? { usernameFragment: candidate.usernameFragment }
                : {}),
            },
          })
          .catch(() =>
            this.fail(
              'The connection could not be established. Please try another conversation.',
            ),
          );
      }
    };
    this.peer.ontrack = (event) => {
      if (!this.active) return;
      const stream = this.getOrCreateRemoteStream();
      if (event.streams[0]) {
        if (stream) {
          event.streams[0].getTracks().forEach((track) => {
            if (!stream.getTracks().includes(track)) {
              stream.addTrack(track);
            }
          });
        }
      }
      if (event.track && stream && !stream.getTracks().includes(event.track)) {
        stream.addTrack(event.track);
      }
      const outboundStream =
        stream && typeof MediaStream !== 'undefined'
          ? new MediaStream(stream.getTracks())
          : (event.streams[0] ??
            (typeof MediaStream !== 'undefined'
              ? new MediaStream([event.track])
              : (event.streams[0] as unknown as MediaStream)));
      callbacks.remote(outboundStream);
    };
    this.peer.onconnectionstatechange = () => {
      if (!this.active) return;
      if (this.peer.connectionState === 'connected') {
        clearTimeout(this.timeout);
        clearTimeout(this.lostTimeout);
        this.lostTimeout = undefined;
        callbacks.connected();
      } else if (this.peer.connectionState === 'failed') {
        this.fail('The video connection was lost. Please try again.');
      } else if (
        this.peer.connectionState === 'disconnected' &&
        !this.lostTimeout
      ) {
        this.lostTimeout = setTimeout(
          () => this.fail('The video connection was lost. Please try again.'),
          8000,
        );
      }
    };
    this.timeout = setTimeout(
      () =>
        this.fail(
          'The video connection took too long. Please try another conversation.',
        ),
      25000,
    );
  }

  private fail(message: string) {
    if (!this.active) return;
    this.close();
    this.callbacks.failed(message);
  }

  async offer() {
    const description = await this.peer.createOffer();
    if (!this.active) return;
    await this.peer.setLocalDescription(description);
    if (this.active && description.sdp)
      await this.callbacks.description({
        matchId: this.matchId,
        description: { type: 'offer', sdp: description.sdp },
      });
  }

  async receiveDescription(payload: DescriptionPayload) {
    if (!this.active || payload.matchId !== this.matchId || this.answering)
      return;
    this.answering = true;
    try {
      await this.peer.setRemoteDescription(payload.description);
      if (!this.active) return;
      for (const candidate of this.candidates) {
        if (!this.active) return;
        await this.peer.addIceCandidate(candidate);
      }
      this.candidates = [];
      if (payload.description.type === 'offer') {
        const answer = await this.peer.createAnswer();
        if (!this.active) return;
        await this.peer.setLocalDescription(answer);
        if (this.active && answer.sdp)
          await this.callbacks.description({
            matchId: this.matchId,
            description: { type: 'answer', sdp: answer.sdp },
          });
      }
    } finally {
      this.answering = false;
    }
  }

  async receiveIce(payload: IcePayload) {
    if (!this.active || payload.matchId !== this.matchId) return;
    const candidate: RTCIceCandidateInit = {
      candidate: payload.candidate.candidate,
      sdpMid: payload.candidate.sdpMid ?? null,
      sdpMLineIndex: payload.candidate.sdpMLineIndex ?? null,
      ...(payload.candidate.usernameFragment
        ? { usernameFragment: payload.candidate.usernameFragment }
        : {}),
    };
    if (this.peer.remoteDescription) await this.peer.addIceCandidate(candidate);
    else if (this.candidates.length < 128) this.candidates.push(candidate);
    else
      this.fail(
        'The video connection could not be established. Please try again.',
      );
  }

  close() {
    if (!this.active) return;
    this.active = false;
    clearTimeout(this.timeout);
    clearTimeout(this.lostTimeout);
    this.peer.onicecandidate = null;
    this.peer.ontrack = null;
    this.peer.onconnectionstatechange = null;
    this.candidates = [];
    this.peer.close();
    this.remoteStream?.getTracks().forEach((track) => track.stop());
    this.remoteStream = null;
    this.outboundTracks.forEach((track) => track.stop());
    this.outboundTracks.clear();
  }
  setVideoEnabled(enabled: boolean) {
    this.videoEnabled = enabled;
    const video = this.outboundTracks.get('video');
    if (video) video.enabled = enabled;
  }
  setAudioEnabled(enabled: boolean) {
    this.audioEnabled = enabled;
    const audio = this.outboundTracks.get('audio');
    if (audio) audio.enabled = enabled;
  }

  /** Release WebRTC clones before a mobile browser changes capture sessions. */
  async detachLocalMedia(): Promise<void> {
    if (!this.active) return;
    await Promise.all(
      [...this.senders.values()].map((sender) => sender.replaceTrack(null)),
    );
    this.outboundTracks.forEach((track) => track.stop());
    this.outboundTracks.clear();
  }

  /** Restore audio/video on the existing peer after a new capture starts. */
  async replaceMediaTracks(stream: MediaStream): Promise<void> {
    if (!this.active) return;
    const replacements = stream.getTracks().flatMap((track) => {
      const sender = this.senders.get(track.kind);
      if (!sender) return [];
      const outbound = track.clone();
      outbound.enabled =
        track.kind === 'video' ? this.videoEnabled : this.audioEnabled;
      return [{ kind: track.kind, sender, outbound }];
    });
    try {
      await Promise.all(
        replacements.map(({ sender, outbound }) =>
          sender.replaceTrack(outbound),
        ),
      );
    } catch (failure) {
      replacements.forEach(({ outbound }) => outbound.stop());
      throw failure;
    }
    if (!this.active) {
      replacements.forEach(({ outbound }) => outbound.stop());
      return;
    }
    this.outboundTracks.forEach((track) => track.stop());
    this.outboundTracks.clear();
    replacements.forEach(({ kind, outbound }) => {
      this.outboundTracks.set(kind, outbound);
    });
  }
}
