import type { Connections } from '../database/connections.js';
import { ServiceError, unavailable } from '../security/errors.js';

export class BanService {
  constructor(private readonly db: Connections['db']) {}
  async assertAllowed(...references: string[]): Promise<void> {
    let result;
    try {
      result = await this.db.query<{ banned: boolean }>(
        'SELECT EXISTS (SELECT 1 FROM bans WHERE target_ref = ANY($1::text[]) AND revoked_at IS NULL AND expires_at > NOW()) AS banned',
        [references],
      );
    } catch {
      throw unavailable();
    }
    if (result.rows[0]?.banned)
      throw new ServiceError(
        'BANNED',
        'This session is temporarily restricted.',
        403,
      );
  }
}
