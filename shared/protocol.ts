import { z } from 'zod';

export const CONSENT_VERSION = '2026-10-04-general';
export const consentSchema = z
  .object({
    terms: z.literal(true),
    guidelines: z.literal(true),
    privacy: z.literal(true),
    version: z.literal(CONSENT_VERSION),
  })
  .strict();
export const matchSchema = z.object({ matchId: z.uuid() }).strict();
export const emptySchema = z.object({}).strict();
export const descriptionSchema = z
  .object({
    matchId: z.uuid(),
    description: z
      .object({
        type: z.enum(['offer', 'answer']),
        sdp: z.string().min(1).max(32768),
      })
      .strict(),
  })
  .strict();
export const iceSchema = z
  .object({
    matchId: z.uuid(),
    candidate: z
      .object({
        candidate: z.string().max(4096),
        sdpMid: z.string().max(128).nullable().optional(),
        sdpMLineIndex: z.number().int().min(0).max(64).nullable().optional(),
        usernameFragment: z.string().max(256).nullable().optional(),
      })
      .strict(),
  })
  .strict();
export const reportReasons = [
  'inappropriate',
  'harassment',
  'spam',
  'underage',
  'abuse',
  'other',
] as const;
export const reportSchema = z
  .object({
    matchId: z.uuid(),
    reason: z.enum(reportReasons),
    description: z.string().trim().max(1000).optional(),
  })
  .strict();

export type DescriptionPayload = z.infer<typeof descriptionSchema>;
export type IcePayload = z.infer<typeof iceSchema>;
export type ReportPayload = z.infer<typeof reportSchema>;
export type ReportReason = (typeof reportReasons)[number];
export type Ack =
  | { ok: true }
  | { ok: false; code: string; message: string; retryAfterMs?: number };
export type Reply = (result: Ack) => void;
export type MatchFound = { matchId: string; initiator: boolean };
export type MatchEnded = {
  matchId: string;
  reason: 'next' | 'stop' | 'disconnect' | 'block' | 'expired';
};
export interface ServerEvents {
  'session:ready': (payload: { sessionId: string }) => void;
  'session:ended': (payload: { message: string }) => void;
  'queue:waiting': () => void;
  'match:found': (payload: MatchFound) => void;
  'match:ended': (payload: MatchEnded) => void;
  'signal:description': (payload: DescriptionPayload) => void;
  'signal:ice': (payload: IcePayload) => void;
}
export interface ClientEvents {
  'queue:join': (payload: Record<string, never>, reply: Reply) => void;
  'queue:next': (payload: { matchId: string }, reply: Reply) => void;
  'queue:stop': (payload: Record<string, never>, reply: Reply) => void;
  'signal:description': (payload: DescriptionPayload, reply: Reply) => void;
  'signal:ice': (payload: IcePayload, reply: Reply) => void;
  'moderation:report': (payload: ReportPayload, reply: Reply) => void;
  'moderation:block': (payload: { matchId: string }, reply: Reply) => void;
}
export interface PresenceInfo {
  /** Unique users currently connected to the authenticated chat server. */
  activeUsers: number;
}
export interface SessionInfo {
  sessionId: string;
  expiresAt: number;
  iceServers: {
    urls: string | string[];
    username?: string;
    credential?: string;
  }[];
  iceTransportPolicy: 'all' | 'relay';
  face: {
    intervalMs: number;
    warningMs: number;
    pauseMs: number;
    disconnectMs: number;
  };
}
