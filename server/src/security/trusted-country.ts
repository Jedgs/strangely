import { createHash, timingSafeEqual } from 'node:crypto';
import type { Config } from '../config/env.js';

/** Country is optional metadata. Never use a submitted header as identity evidence. */
export function trustedCountry(
  config: Config,
  headers: Record<string, unknown>,
): string | null {
  const provided = headers['x-strangely-edge-key'];
  const country = headers['cf-ipcountry'];
  if (
    !config.TRUST_EDGE_COUNTRY ||
    !config.EDGE_GEO_SECRET ||
    typeof provided !== 'string' ||
    provided.length > 128 ||
    typeof country !== 'string' ||
    !/^[A-Z]{2}$/.test(country) ||
    ['XX', 'ZZ', 'T1'].includes(country)
  )
    return null;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(provided), digest(config.EDGE_GEO_SECRET))
    ? country
    : null;
}
