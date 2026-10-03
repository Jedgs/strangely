import type { AdminOverview, AgeStatus } from '../../../shared/admin';
import { request } from './api';
const post = <T>(path: string, value: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(value) });
export const adminLogin = (password: string, otp: string) =>
  post('/api/admin/login', { password, otp });
export const adminLogout = () => post('/api/admin/logout', {});
export const adminOverview = (
  cursor?: { at: string; id: string },
  signal?: AbortSignal,
) =>
  request<AdminOverview>(
    `/api/admin/overview${cursor ? `?before=${encodeURIComponent(cursor.at)}&beforeId=${encodeURIComponent(cursor.id)}` : ''}`,
    { signal: signal ?? null },
  );
export const adminBan = (
  targetRef: string,
  scope: 'session' | 'network',
  reason: string,
  hours: number,
) => post('/api/admin/ban', { targetRef, scope, reason, hours });
export const adminReview = (id: string, status: 'reviewed' | 'dismissed') =>
  post('/api/admin/reports/review', { id, status });
export const adminRevoke = (id: string, reason: string) =>
  post('/api/admin/bans/revoke', { id, reason });
export const ageStatus = () => request<AgeStatus>('/api/age/status');
export const ageStart = () => post<{ url: string }>('/api/age/start', {});
