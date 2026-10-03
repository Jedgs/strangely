import { createHmac } from 'node:crypto';
import type { Config } from '../config/env.js';

export function privateReference(
  config: Config,
  purpose: string,
  value: string,
): string {
  return createHmac('sha256', config.SESSION_SECRET)
    .update(`${purpose}:${value}`)
    .digest('hex');
}
