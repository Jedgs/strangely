import { useRef, useState, type FormEvent } from 'react';
import type { ReportReason } from '../../../shared/protocol';
import { Dialog } from './Dialog';
import { Icon } from './Icon';

const reasons: { value: ReportReason; label: string }[] = [
  { value: 'inappropriate', label: 'Sexual or inappropriate content' },
  { value: 'harassment', label: 'Harassment or hate' },
  { value: 'underage', label: 'Someone may be under 18' },
  { value: 'abuse', label: 'Threats or abusive behavior' },
  { value: 'spam', label: 'Spam or advertising' },
  { value: 'other', label: 'Something else' },
];

export function ReportDialog({
  onSubmit,
  onClose,
}: {
  onSubmit: (reason: ReportReason, description: string) => Promise<void>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<ReportReason>('inappropriate');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const pending = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(reason, description.trim());
      setSubmitted(true);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Your report could not be sent. Please try again.',
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={submitted ? 'Your report was received.' : 'Tell us what happened.'}
      eyebrow="Make room for respect"
      onClose={onClose}
      busy={busy}
      intro={
        <p>
          {submitted
            ? 'Thank you for taking a moment to report unwanted behavior.'
            : 'This report is for the participant you selected. You can leave a conversation at any time.'}
        </p>
      }
    >
      {submitted ? (
        <div className="report-success">
          <span className="success-symbol">
            <Icon name="check" />
          </span>
          <p>
            Your report has been stored for review. This development version
            does not have a staffed moderation team or a guaranteed response
            time.
          </p>
          <button
            type="button"
            className="button button-primary"
            onClick={onClose}
          >
            Back to your room
          </button>
        </div>
      ) : (
        <form
          className="report-form"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <label htmlFor="report-reason">What would you like to report?</label>
          <select
            id="report-reason"
            value={reason}
            disabled={busy}
            onChange={(event) => setReason(event.target.value as ReportReason)}
          >
            {reasons.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          {reason === 'underage' && (
            <p className="form-error">
              If someone may be under 18, end the conversation and report it. Do
              not record them, request ID, or share their image. This report
              will be flagged for operator review.
            </p>
          )}
          <label htmlFor="report-details">
            Anything else? <span>(optional)</span>
          </label>
          <textarea
            id="report-details"
            value={description}
            maxLength={1000}
            rows={4}
            disabled={busy}
            aria-describedby="report-details-hint"
            onChange={(event) => setDescription(event.target.value)}
          />
          <div className="field-hint">
            <p id="report-details-hint">
              Briefly describe what happened. Do not include sensitive personal
              information.
            </p>
            <span aria-hidden="true">{description.length}/1000</span>
          </div>
          <p className="draft-note">
            Reports contain your written details and anonymous session metadata.
            Video and audio are not attached.
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <button
              type="button"
              className="button button-outline"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="button button-primary"
              disabled={busy}
            >
              {busy ? 'Sending report…' : 'Send report'}
              <Icon name="flag" />
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
