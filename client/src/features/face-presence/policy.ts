export type FaceStatus =
  'loading' | 'present' | 'missing' | 'warning' | 'paused' | 'unavailable';
export type FaceTiming = {
  intervalMs: number;
  warningMs: number;
  pauseMs: number;
  disconnectMs: number;
};
/** Presence only, never an estimate of age or identity. */
export function framePresence(count: number): {
  present: boolean;
  multiple: boolean;
} {
  return { present: count === 1, multiple: count > 1 };
}
export function absenceState(
  absentMs: number,
  timing: FaceTiming,
): { status: FaceStatus; disconnect: boolean } {
  return {
    status:
      absentMs >= timing.pauseMs
        ? 'paused'
        : absentMs >= timing.warningMs
          ? 'warning'
          : 'missing',
    disconnect: absentMs >= timing.disconnectMs,
  };
}
