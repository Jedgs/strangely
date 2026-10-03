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
