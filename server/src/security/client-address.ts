import { isIP } from 'node:net';

export function clientAddress(
  direct: string,
  forwarded: string | string[] | undefined,
  trustProxy: boolean,
): string {
  // Only enable proxy trust behind a perimeter that blocks direct requests and
  // overwrites forwarded headers. An untrusted header never affects identity.
  if (!trustProxy || typeof forwarded !== 'string' || forwarded.length > 512)
    return direct;
  const first = forwarded.split(',')[0]?.trim();
  return first && isIP(first) ? first : direct;
}
