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

// Consent is an adult declaration; this provider does not establish anyone's age.
export class SelfDeclaredAgeProvider implements AgeAssuranceProvider {
  async assess(
    consent: z.infer<typeof consentSchema>,
  ): Promise<AgeAssuranceResult> {
    return { adultAllowed: consent.adult, assurance: 'self-declared' };
  }
}
