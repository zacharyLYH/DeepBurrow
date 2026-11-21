const AUTH_EXPIRED = "deepburrow:auth-expired";

let refreshing: Promise<boolean> | null = null;

export const notifyAuthExpired = () => window.dispatchEvent(new Event(AUTH_EXPIRED));

export const onAuthExpired = (listener: () => void) => {
  window.addEventListener(AUTH_EXPIRED, listener);
  return () => window.removeEventListener(AUTH_EXPIRED, listener);
};

async function refreshSession() {
  refreshing ??= fetch("/api/auth/refresh", { method: "POST" })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

// Access cookies are short-lived. Retry once after a refresh; the auth
// middleware rejects before any route handler runs, so a retry cannot duplicate
// a mutation.
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit, retry = true) {
  const response = await fetch(input, init);
  if (response.status !== 401 || !retry) return response;
  if (!(await refreshSession())) {
    notifyAuthExpired();
    return response;
  }
  return apiFetch(input, init, false);
}

export type Session = {
  user: { id: string; email: string };
  burrowId: string;
};
