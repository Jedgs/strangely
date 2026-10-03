import { randomUUID } from 'node:crypto';
import type { Connections } from '../database/connections.js';
import { ServiceError, unavailable } from '../security/errors.js';
import * as scripts from './scripts.js';

export interface EndedMatch {
  matchId: string;
  peerId: string;
  peerOwner: string;
}
export interface RecentPeer {
  peerId: string;
  peerRef: string;
}
export type JoinedQueue =
  | { kind: 'waiting' }
  | { kind: 'match'; matchId: string; peerId: string; peerOwner: string };

const messages: Record<string, string> = {
  SESSION_EXPIRED: 'Your session has expired. Please start again.',
  SESSION_IN_USE:
    'This session is already open in another tab. Close it and try again.',
  ALREADY_MATCHED: 'You are already in a conversation.',
  MATCH_ENDED: 'That conversation has ended.',
  QUEUE_FULL: 'The waiting room is busy. Please try again shortly.',
};

export class MatchStore {
  constructor(private readonly redis: Connections['redis']) {}
  private async run(script: string, args: string[]): Promise<unknown[]> {
    if (!this.redis.isReady) throw unavailable();
    let result: unknown;
    try {
      result = await this.redis.eval(script, { arguments: args });
    } catch {
      throw unavailable();
    }
    const values = result as unknown[];
    if (values[0] === 'ERR') {
      const code = String(values[1]);
      throw new ServiceError(
        code,
        messages[code] ?? 'Please try again.',
        code === 'SESSION_EXPIRED' ? 401 : 409,
      );
    }
    return values;
  }
  private ended(value: unknown): EndedMatch | undefined {
    const array = value as string[];
    return array?.length
      ? { matchId: array[0]!, peerId: array[1]!, peerOwner: array[2]! }
      : undefined;
  }
  async claim(
    sessionId: string,
    owner: string,
  ): Promise<EndedMatch | undefined> {
    return this.ended(
      (await this.run(scripts.CLAIM_OWNER, [sessionId, owner]))[1],
    );
  }
  async heartbeat(
    sessionId: string,
    owner: string,
  ): Promise<EndedMatch | undefined> {
    return this.ended(
      (await this.run(scripts.HEARTBEAT, [sessionId, owner]))[1],
    );
  }
  async join(sessionId: string, owner: string): Promise<JoinedQueue> {
    const values = await this.run(scripts.JOIN_QUEUE, [
      sessionId,
      owner,
      randomUUID(),
      String(Date.now()),
    ]);
    if (values[0] === 'WAITING') return { kind: 'waiting' };
    return {
      kind: 'match',
      matchId: String(values[1]),
      peerId: String(values[2]),
      peerOwner: String(values[3]),
    };
  }
  async leave(
    sessionId: string,
    owner: string,
    matchId = '',
  ): Promise<EndedMatch | undefined> {
    return this.ended(
      (await this.run(scripts.LEAVE_MATCH, [sessionId, owner, matchId]))[1],
    );
  }
  async disconnect(
    sessionId: string,
    owner: string,
  ): Promise<EndedMatch | undefined> {
    return this.ended(
      (await this.run(scripts.DISCONNECT, [sessionId, owner]))[1],
    );
  }
  async peer(
    sessionId: string,
    owner: string,
    matchId: string,
  ): Promise<{ peerId: string; peerOwner: string; initiator: boolean }> {
    const values = await this.run(scripts.CURRENT_PEER, [
      sessionId,
      owner,
      matchId,
    ]);
    return {
      peerId: String(values[1]),
      peerOwner: String(values[2]),
      initiator: values[3] === '1',
    };
  }
  async recentPeer(
    sessionId: string,
    owner: string,
    matchId: string,
  ): Promise<RecentPeer> {
    const values = await this.run(scripts.RECENT_PEER, [
      sessionId,
      owner,
      matchId,
    ]);
    return JSON.parse(String(values[1])) as RecentPeer;
  }
  async block(
    sessionId: string,
    owner: string,
    matchId: string,
  ): Promise<EndedMatch | undefined> {
    return this.ended(
      (await this.run(scripts.BLOCK_PEER, [sessionId, owner, matchId]))[1],
    );
  }
  async prune(): Promise<void> {
    if (!this.redis.isReady) return;
    await this.redis.eval(scripts.PRUNE_QUEUE);
  }
}
