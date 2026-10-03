import { z } from 'zod';

export const adminLoginSchema = z
  .object({
    password: z.string().min(16).max(128),
    otp: z.string().regex(/^$|^\d{6}$/),
  })
  .strict();
export const adminBanSchema = z
  .object({
    targetRef: z.string().regex(/^[a-f0-9]{64}$/),
    scope: z.enum(['session', 'network']),
    hours: z.number().int().min(1).max(168),
    reason: z.string().trim().min(8).max(500),
  })
  .strict();
export const adminReviewSchema = z
  .object({ id: z.uuid(), status: z.enum(['reviewed', 'dismissed']) })
  .strict();
export const adminRevokeSchema = z
  .object({ id: z.uuid(), reason: z.string().trim().min(8).max(500) })
  .strict();
export const adminPageSchema = z
  .object({
    before: z.iso.datetime().optional(),
    beforeId: z.uuid().optional(),
  })
  .strict()
  .refine((value) => Boolean(value.before) === Boolean(value.beforeId));
export interface AdminUser {
  sessionRef: string;
  networkRef: string;
  connectedAt: string;
  state: string;
  country: string | null;
  assurance: string;
}
export interface AuditEvent {
  id: string;
  createdAt: string;
  severity: 'info' | 'warning' | 'critical';
  code: string;
  networkRef: string | null;
  sessionRef: string | null;
}
export interface AdminReport {
  id: string;
  createdAt: string;
  subjectRef: string;
  reason: string;
  description: string | null;
  status: string;
}
export interface AdminBan {
  id: string;
  targetRef: string;
  reason: string;
  expiresAt: string;
}
export interface AdminOverview {
  activeCount: number;
  users: AdminUser[];
  events: AuditEvent[];
  reports: AdminReport[];
  bans: AdminBan[];
  nextBefore: { at: string; id: string } | null;
  audit: { dropped: number; pending: number; failed: boolean };
  ageMode: string;
}
export interface AgeStatus {
  required: boolean;
  status: 'development' | 'pending' | 'verified' | 'rejected' | 'not-started';
}
