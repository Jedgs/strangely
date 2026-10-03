import { useRef, useState, type FormEvent } from 'react';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import { ConsentProgress } from './ConsentProgress';
import { AgeVerification } from './AgeVerification';
import type { LegalDocument } from './LegalDialog';

const confirmations = [
  {
    id: 'adult',
    label: 'I confirm I am at least 18 years old.',
    note: 'Do not involve minors in a call. A declaration alone is not verified age assurance.',
  },
  {
    id: 'terms',
    label: 'I have read and accept the Terms.',
    document: 'terms',
    link: 'Read Terms',
  },
  {
    id: 'guidelines',
    label: 'I have read and agree to the Community Guidelines.',
    document: 'guidelines',
    link: 'Read Community Guidelines',
  },
  {
    id: 'privacy',
    label: 'I have read and acknowledge the Privacy Notice.',
    document: 'privacy',
    link: 'Read Privacy Notice',
  },
] as const;
type Confirmation = (typeof confirmations)[number]['id'];

export function ConsentDialog({
  onAccept,
  onClose,
  onLegal,
}: {
  onAccept: () => Promise<void>;
  onClose: () => void;
  onLegal: (document: LegalDocument) => void;
}) {
  const [checked, setChecked] = useState<Record<Confirmation, boolean>>({
    adult: false,
    terms: false,
    guidelines: false,
    privacy: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ageReady, setAgeReady] = useState(false);
  const pending = useRef(false);
  const completed = Object.values(checked).filter(Boolean).length;
  const allChecked = Object.values(checked).every(Boolean);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!allChecked || !ageReady || pending.current) return;
    pending.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await onAccept();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'We couldn’t start your session. Please try again.',
      );
    } finally {
      pending.current = false;
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      title="Before we say hello."
      eyebrow="A room for adults · 18+ only"
      onClose={onClose}
      busy={submitting}
      className="consent-dialog"
      intro={
        <p>
          A good conversation starts with a little understanding. Please read
          and confirm each item below.
        </p>
      }
    >
      <form
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <ConsentProgress completed={completed} />
        <AgeVerification onReady={setAgeReady} />
        <fieldset className="consent-checks" disabled={submitting}>
          <legend className="sr-only">Required confirmations</legend>
          {confirmations.map((item) => (
            <div className="consent-row" key={item.id}>
              <label>
                <input
                  type="checkbox"
                  required
                  checked={checked[item.id]}
                  onChange={(event) =>
                    setChecked((current) => ({
                      ...current,
                      [item.id]: event.target.checked,
                    }))
                  }
                />
                <span>{item.label}</span>
              </label>
              {'note' in item && <p className="consent-helper">{item.note}</p>}
              {'document' in item && (
                <button
                  className="policy-link"
                  type="button"
                  onClick={() => onLegal(item.document)}
                >
                  {item.link}
                  <Icon name="arrow" />
                </button>
              )}
            </div>
          ))}
        </fieldset>
        <div className="privacy-reminder">
          <Icon name="shield" />
          <p>
            <strong>Share a moment, protect your privacy.</strong> Direct video
            connections may reveal your IP address. Another person can record
            outside this service. Keep personal information to yourself.
          </p>
        </div>
        <p className="draft-note">
          Development version. Policies are drafts; moderation is not staffed.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="button button-primary consent-submit"
          type="submit"
          disabled={!allChecked || !ageReady || submitting}
        >
          {submitting
            ? 'Starting your session…'
            : !ageReady && allChecked
              ? 'Complete age check to continue'
              : 'Continue to camera preview'}
          {!submitting && <Icon name="arrow" />}
        </button>
        <p className="consent-bottom" aria-live="polite">
          {submitting
            ? 'One moment. Your camera and microphone are still off.'
            : allChecked && !ageReady
              ? 'Complete the age access check above. Your camera is still off.'
              : allChecked
                ? 'Next, you choose when to enable your camera and microphone.'
                : 'Confirm all four items to continue. Your camera is still off.'}
        </p>
      </form>
    </Dialog>
  );
}
