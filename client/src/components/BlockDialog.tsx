import { useRef, useState } from 'react';
import { Dialog } from './Dialog';
import { Icon } from './Icon';

export function BlockDialog({
  onBlock,
  onClose,
  onBlocked,
}: {
  onBlock: () => Promise<void>;
  onClose: () => void;
  onBlocked: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  async function block() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await onBlock();
      onBlocked();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'The participant could not be blocked. Please try again.',
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog
      title="Make space for someone else."
      eyebrow="Block this participant"
      onClose={onClose}
      busy={busy}
      intro={
        <p>
          This prevents the participant you selected from being matched with
          your current anonymous session again. If you are still speaking with
          them, it also ends that conversation.
        </p>
      }
    >
      <p className="block-explanation">
        A block applies to this session. It cannot recognize the same person if
        they start a new session. You can also submit a report.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <button
          className="button button-outline"
          type="button"
          disabled={busy}
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          className="button button-primary"
          type="button"
          disabled={busy}
          onClick={() => {
            void block();
          }}
        >
          {busy ? 'Blocking…' : 'Block participant'}
          <Icon name="block" />
        </button>
      </div>
    </Dialog>
  );
}
