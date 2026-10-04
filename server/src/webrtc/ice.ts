import { createHmac } from 'node:crypto';
import type { SessionInfo } from '../../../shared/protocol.js';
import type { Config } from '../config/env.js';

export function makeIceServers(
  config: Config,
  sessionId: string,
  now = Date.now(),
): SessionInfo['iceServers'] {
  const servers: SessionInfo['iceServers'] = [{ urls: config.STUN_SERVER_URL }];
  if (config.TURN_SERVER_URL) {
    const username = `${Math.floor(now / 1000) + config.TURN_CREDENTIAL_TTL_SECONDS}:${sessionId}`;
    const credential = createHmac('sha1', config.TURN_SHARED_SECRET)
      .update(username)
      .digest('base64');
    servers.push({
      urls: config.TURN_SERVER_URL.split(',').map((url) => url.trim()),
      username,
      credential,
    });
  }
  return servers;
}

/** Fetch short-lived ICE credentials from Xirsys without exposing its API secret. */
export async function makeXirsysIceServers(
  config: Config,
): Promise<SessionInfo['iceServers']> {
  const response = await fetch(
    `https://global.xirsys.net/_turn/${encodeURIComponent(config.XIRSYS_CHANNEL)}?webrtc=1`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.XIRSYS_IDENT}:${config.XIRSYS_SECRET}`).toString('base64')}`,
      },
      signal: AbortSignal.timeout(5000),
    },
  );
  if (!response.ok) throw new Error(`Xirsys ICE request failed (${response.status})`);
  const body = (await response.json()) as { v?: { iceServers?: unknown } };
  if (!Array.isArray(body.v?.iceServers) || body.v.iceServers.length === 0)
    throw new Error('Xirsys returned no ICE servers');
  return body.v.iceServers.filter((entry): entry is SessionInfo['iceServers'][number] => {
    if (!entry || typeof entry !== 'object') return false;
    const value = entry as Record<string, unknown>;
    return (
      (typeof value.urls === 'string' || Array.isArray(value.urls)) &&
      (!('username' in value) || typeof value.username === 'string') &&
      (!('credential' in value) || typeof value.credential === 'string')
    );
  });
}
