import { clearAccessToken, getAccessToken, setAccessToken } from "./auth";

type FetchOptions = RequestInit & { skipRefresh?: boolean };

// Single-flight refresh: concurrent 401s share one refresh attempt.
// The backend rotates refresh tokens, so firing N refreshes at once would
// revoke all but the first cookie and log the user out.
let refreshPromise: Promise<boolean> | null = null;

function refreshAccessToken(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch("/api/v1/auth/refresh", {
      method: "POST",
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) return false;
        const data = await res.json();
        setAccessToken(data.access_token);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

/**
 * Authenticated fetch wrapper.
 * – Attaches the Bearer access token on every request.
 * – On 401, attempts a silent token refresh once, then retries.
 * – On second 401, clears the session and redirects to /login.
 */
export async function apiFetch(url: string, options: FetchOptions = {}): Promise<Response> {
  const { skipRefresh = false, ...fetchOptions } = options;

  const token = getAccessToken();
  const isFormData = typeof FormData !== "undefined" && fetchOptions.body instanceof FormData;
  const res = await fetch(url, {
    ...fetchOptions,
    credentials: "include",
    headers: {
      ...(!isFormData ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(fetchOptions.headers ?? {}),
    },
  });

  if (res.status === 401 && !skipRefresh) {
    // Attempt silent refresh (shared across concurrent 401s)
    const refreshed = await refreshAccessToken();

    if (refreshed) {
      // Retry original request once with new token
      return apiFetch(url, { ...options, skipRefresh: true });
    } else {
      clearAccessToken();
      if (typeof window !== "undefined") window.location.href = "/login";
      throw new Error("Session expired");
    }
  }

  return res;
}

/** Helper: throws a readable error if the response is not ok. */
export async function apiFetchJson<T>(url: string, options?: FetchOptions): Promise<T> {
  const res = await apiFetch(url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    let message = body?.detail;
    if (Array.isArray(message)) {
      // Pydantic validation error — extract first message
      message = message[0]?.msg ?? `Request failed: ${res.status}`;
    } else if (!message) {
      message = `Request failed: ${res.status}`;
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
