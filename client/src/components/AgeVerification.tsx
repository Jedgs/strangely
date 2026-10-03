import { useEffect, useState } from 'react';
import { ageStart, ageStatus } from '../services/admin';
import type { AgeStatus } from '../../../shared/admin';
import { Icon } from './Icon';

export function AgeVerification({
  onReady,
}: {
  onReady: (ready: boolean) => void;
}) {
  const [status, setStatus] = useState<AgeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void ageStatus()
      .then((value) => {
        if (active) {
          setStatus(value);
          onReady(!value.required || value.status === 'verified');
        }
      })
      .catch(() => {
        if (active)
          setError(
            'Age-check status is unavailable. Please reopen this dialog.',
          );
      });
    return () => {
      active = false;
    };
  }, [onReady]);
  async function verify() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await ageStart();
      const destination = new URL(url);
      if (destination.protocol !== 'https:')
        throw new Error('The verification service is unavailable.');
      window.location.assign(destination.href);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Verification could not start.',
      );
      setBusy(false);
    }
  }
  return (
    <div className="age-verification">
      <Icon name="shield" />
      <div>
        <strong>
          {status?.required ? 'Verified 18+ access' : 'Age assurance notice'}
        </strong>
        <p>
          {!status
            ? 'Checking age-verification requirements…'
            : !status.required
              ? 'Local development uses your declaration only. Public launch is blocked until provider age verification is configured. Face presence cannot verify age or detect every minor.'
              : status.status === 'verified'
                ? 'Your 18+ decision is approved. Review all notices to continue.'
                : status.status === 'rejected'
                  ? 'Access declined. An approved 18+ decision is required.'
                  : 'Complete the independent age check before accessing a camera session. No ID images are stored by Strangely.'}
        </p>
        {status?.required && status.status !== 'verified' && (
          <button
            type="button"
            className="button button-secondary"
            onClick={() => void verify()}
            disabled={busy}
          >
            {busy ? 'Opening verification…' : 'Verify 18+ access'}{' '}
            <Icon name="arrow" />
          </button>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
