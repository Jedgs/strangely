import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

export function Dialog({
  title,
  eyebrow,
  intro,
  children,
  onClose,
  busy = false,
  className = '',
}: {
  title: string;
  eyebrow?: string;
  intro?: ReactNode;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  className?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const introId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialog.showModal();
    dialog.querySelector<HTMLElement>('[data-dialog-initial-focus]')?.focus();
    return () => {
      dialog.close();
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={`dialog ${className}`}
      aria-labelledby={titleId}
      aria-describedby={intro ? introId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="dialog-toolbar">
        <button
          type="button"
          className="icon-button dialog-close"
          aria-label="Close dialog"
          disabled={busy}
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="dialog-body">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2 id={titleId} tabIndex={-1} data-dialog-initial-focus>
          {title}
        </h2>
        {intro && (
          <div className="dialog-intro" id={introId}>
            {intro}
          </div>
        )}
        {children}
      </div>
    </dialog>
  );
}
