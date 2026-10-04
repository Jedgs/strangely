import type { PresenceInfo, SessionInfo } from '../../../shared/protocol';
import { CONSENT_VERSION } from '../../../shared/protocol';
import { apiUrl } from './backend';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  try {
    const response = await fetch(apiUrl(path), {
      ...options,
      credentials: 'include',
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(8000)])
        : AbortSignal.timeout(8000),
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
    // A development proxy or gateway can return an empty/non-JSON error body
    // while the API is restarting. Keep that failure readable in the dialog.
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok || data === null) {
      const message =
        data &&
        typeof data === 'object' &&
        'error' in data &&
        typeof data.error === 'string'
          ? data.error
          : 'The service is unavailable. Please try again.';
      throw new ApiError(message, response.status);
    }
    return data as T;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === 'TimeoutError' ||
        error.name === 'AbortError' ||
        error instanceof TypeError)
    )
      throw new Error(
        'We could not reach Strangely. Please try again in a moment.',
        { cause: error },
      );
    throw error;
  }
}
export const createSession = () =>
  request<SessionInfo>('/api/session', {
    method: 'POST',
    body: JSON.stringify({
      terms: true,
      guidelines: true,
      privacy: true,
      version: CONSENT_VERSION,
    }),
  });
function sessionAuthorization(sessionToken?: string): HeadersInit {
  return sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {};
}
export const getSession = (sessionToken?: string) =>
  request<SessionInfo>('/api/session', {
    headers: sessionAuthorization(sessionToken),
  });
export const endSession = (sessionToken?: string) =>
  request('/api/session/end', {
    method: 'POST',
    body: '{}',
    headers: sessionAuthorization(sessionToken),
  });

export async function getPresence(signal?: AbortSignal): Promise<PresenceInfo> {
  const data = await request<PresenceInfo>('/api/presence', {
    signal: signal ?? null,
  });
  if (
    typeof data !== 'object' ||
    !Number.isSafeInteger(data.activeUsers) ||
    data.activeUsers < 0
  )
    throw new Error('The live user count is unavailable.');
  return data;
}
