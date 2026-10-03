import { useId } from 'react';
import { Icon } from './Icon';

const messages = [
  'Read each notice at your own pace.',
  'One confirmed. Take a moment to review the rest.',
  'Halfway there. Two confirmations remaining.',
  'One more confirmation to review.',
  'Notices confirmed. Check the access requirements below.',
];

export function ConsentProgress({ completed }: { completed: number }) {
  const labelId = useId();
  return (
    <div className={`consent-progress ${completed === 4 ? 'is-complete' : ''}`}>
      <div className="consent-progress-heading">
        <strong id={labelId}>Review progress</strong>
        <span className="consent-progress-count">
          <Icon name={completed === 4 ? 'check' : 'shield'} />
          {completed} of 4
        </span>
      </div>
      <div
        className="consent-progress-track"
        data-completed={completed}
        role="progressbar"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={completed}
        aria-valuetext={`${completed} of 4 confirmations complete`}
      >
        <span className="consent-progress-fill" />
        <span className="consent-progress-divisions" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </div>
      <p className="consent-progress-message" role="status" aria-atomic="true">
        {messages[completed]}
      </p>
    </div>
  );
}
