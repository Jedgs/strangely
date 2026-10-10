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
  private readonly outboundVideo = new Set<MediaStreamTrack>();
  private videoSender: RTCRtpSender | null = null;
  private videoEnabled = true;

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
      const outbound = track.kind === 'video' ? track.clone() : track;
      const sender = this.peer.addTrack(outbound, stream);
      if (outbound.kind === 'video') {
        this.outboundVideo.add(outbound);
        this.videoSender ??= sender;
      }
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
      callbacks.remote(event.streams[0] ?? new MediaStream([event.track]));
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
    this.outboundVideo.forEach((track) => track.stop());
    this.outboundVideo.clear();
  }
  setVideoEnabled(enabled: boolean) {
    this.videoEnabled = enabled;
    this.outboundVideo.forEach((track) => {
      track.enabled = enabled;
    });
  }

  /** Keep the peer connection alive while replacing a local camera source. */
  async replaceVideoTrack(track: MediaStreamTrack): Promise<void> {
    if (!this.active || !this.videoSender) return;
    const outbound = track.clone();
    outbound.enabled = this.videoEnabled;
    await this.videoSender.replaceTrack(outbound);
    if (!this.active) {
      outbound.stop();
      return;
    }
    this.outboundVideo.forEach((previous) => previous.stop());
    this.outboundVideo.clear();
    this.outboundVideo.add(outbound);
  }
}
