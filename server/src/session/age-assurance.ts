import type { z } from 'zod';
import type { consentSchema } from '../../../shared/protocol.js';

export interface AgeAssuranceResult {
  adultAllowed: boolean;
  assurance: 'self-declared' | 'provider-verified';
}
export interface AgeAssuranceProvider {
  assess(
    consent: z.infer<typeof consentSchema>,
    proof?: { challenge?: string; ip: string },
  ): Promise<AgeAssuranceResult>;
}

// General-audience mode has no age claim. A replaceable assurance boundary is
// retained for any future regulated room without trusting client input.
export class SelfDeclaredAgeProvider implements AgeAssuranceProvider {
  async assess(
    consent: z.infer<typeof consentSchema>,
  ): Promise<AgeAssuranceResult> {
    void consent;
    return { adultAllowed: true, assurance: 'self-declared' };
  }
}
