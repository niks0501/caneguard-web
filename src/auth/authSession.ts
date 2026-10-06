type SessionExpiredListener = (reason?: "account_disabled") => void;

const AUTH_SESSION_HINT_KEY = "caneguard.auth-session";
const listeners = new Set<SessionExpiredListener>();

export function hasAuthSessionHint(): boolean {
  if (typeof window === "undefined") return false;

  try {
    const storedHint = window.localStorage.getItem(AUTH_SESSION_HINT_KEY);
    if (storedHint !== null) return storedHint === "true";
  } catch {
    // Fall back to the readable Sanctum CSRF cookie when storage is unavailable.
  }

  return (
    typeof document !== "undefined" &&
    document.cookie
      .split(";")
      .some((cookie) => cookie.trim().startsWith("XSRF-TOKEN="))
  );
}

export function setAuthSessionHint(isAuthenticated: boolean) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      AUTH_SESSION_HINT_KEY,
      isAuthenticated ? "true" : "false",
    );
  } catch {
    // Session restoration can still use the readable Sanctum CSRF cookie.
  }
}

export function notifySessionExpired(reason?: "account_disabled") {
  listeners.forEach((listener) => listener(reason));
}

export function subscribeToSessionExpiration(
  listener: SessionExpiredListener,
) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
