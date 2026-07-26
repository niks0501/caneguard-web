type SessionExpiredListener = () => void;

const listeners = new Set<SessionExpiredListener>();

export function notifySessionExpired() {
  listeners.forEach((listener) => listener());
}

export function subscribeToSessionExpiration(
  listener: SessionExpiredListener,
) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
