import { useEffect, useState } from 'react';
import { getPresence } from '../services/api';
import { Icon } from './Icon';

const REFRESH_INTERVAL = 15_000;

export function ActiveUserCount() {
  const [count, setCount] = useState<number | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending: AbortController | undefined;

    const refresh = async () => {
      if (disposed || document.hidden || pending) return;
      const controller = new AbortController();
      pending = controller;
      try {
        const presence = await getPresence(controller.signal);
        if (!disposed && !controller.signal.aborted) {
          setCount(presence.activeUsers);
          setUnavailable(false);
        }
      } catch {
        if (!disposed && !controller.signal.aborted) {
          setCount(null);
          setUnavailable(true);
        }
      } finally {
        if (pending === controller) pending = undefined;
        if (!disposed && !document.hidden && !controller.signal.aborted)
          timer = setTimeout(() => void refresh(), REFRESH_INTERVAL);
      }
    };

    const visibilityChanged = () => {
      clearTimeout(timer);
      pending?.abort();
      pending = undefined;
      if (!document.hidden) void refresh();
    };
    void refresh();
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => {
      disposed = true;
      clearTimeout(timer);
      pending?.abort();
      document.removeEventListener('visibilitychange', visibilityChanged);
    };
  }, []);

  return (
    <p
      className={`active-user-count ${count !== null ? 'is-live' : ''}`}
      role="status"
      aria-atomic="true"
      title="Users currently connected to Strangely chat. Updates every 15 seconds."
    >
      <span className="presence-dot" aria-hidden="true" />
      <Icon name="users" />
      <span>
        {count === null ? (
          unavailable ? (
            'Live count unavailable'
          ) : (
            'Checking live users...'
          )
        ) : (
          <>
            <strong>{count.toLocaleString()}</strong> active in chat
          </>
        )}
      </span>
    </p>
  );
}
