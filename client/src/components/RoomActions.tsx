import { useEffect, useId, useRef } from 'react';
import { Icon } from './Icon';

export function RoomActions({
  canModerate,
  onReport,
  onBlock,
  onGuidelines,
  onHelp,
  pinned,
  onPin,
  open,
  onOpenChange,
}: {
  canModerate: boolean;
  onReport: () => void;
  onBlock: () => void;
  onGuidelines: () => void;
  onHelp: () => void;
  pinned: boolean;
  onPin: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        onOpenChange(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onOpenChange(false);
        moreButton.current?.focus();
      }
    }
    window.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('pointerdown', outside);
      window.removeEventListener('keydown', escape);
    };
  }, [open, onOpenChange]);
  return (
    <div className="room-actions" ref={root}>
      <button
        className="room-safety-button"
        type="button"
        disabled={!canModerate}
        onClick={onReport}
      >
        <Icon name="shield" />
        <span>Report</span>
      </button>
      <button
        className="room-safety-button"
        type="button"
        disabled={!canModerate}
        onClick={onBlock}
      >
        <Icon name="block" />
        <span>Block</span>
      </button>
      <div className="room-more">
        <button
          ref={moreButton}
          className="room-more-button"
          type="button"
          aria-label="More options"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => onOpenChange(!open)}
        >
          <Icon name="more" />
        </button>
        {open && (
          <div
            className="room-more-panel"
            id={panelId}
            role="group"
            aria-label="More conversation options"
          >
            <button type="button" aria-pressed={pinned} onClick={onPin}>
              <Icon name="check" />
              {pinned ? 'Auto-hide controls' : 'Keep controls visible'}
            </button>
            <button
              type="button"
              onClick={() => {
                moreButton.current?.focus();
                onOpenChange(false);
                onHelp();
              }}
            >
              <Icon name="camera" />
              Camera & microphone help
            </button>
            <button
              type="button"
              onClick={() => {
                moreButton.current?.focus();
                onOpenChange(false);
                onGuidelines();
              }}
            >
              <Icon name="shield" />
              Community guidelines
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
