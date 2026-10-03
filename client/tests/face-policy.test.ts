import { describe, it, expect } from 'vitest';
import {
  absenceState,
  framePresence,
} from '../src/features/face-presence/policy';
const timing = {
  intervalMs: 1500,
  warningMs: 10000,
  pauseMs: 30000,
  disconnectMs: 60000,
};
describe('face absence grace', () => {
  it('requires exactly one detected face without inferring anyone’s age', () => {
    expect(framePresence(0)).toEqual({ present: false, multiple: false });
    expect(framePresence(1)).toEqual({ present: true, multiple: false });
    expect(framePresence(2)).toEqual({ present: false, multiple: true });
  });
  it('tolerates transient absence before escalating', () => {
    expect(absenceState(9999, timing)).toEqual({
      status: 'missing',
      disconnect: false,
    });
    expect(absenceState(10000, timing)).toEqual({
      status: 'warning',
      disconnect: false,
    });
    expect(absenceState(30000, timing)).toEqual({
      status: 'paused',
      disconnect: false,
    });
    expect(absenceState(60000, timing)).toEqual({
      status: 'paused',
      disconnect: true,
    });
  });
});
