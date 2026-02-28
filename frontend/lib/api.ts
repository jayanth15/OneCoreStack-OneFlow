import { clearAccessToken, getAccessToken, setAccessToken } from "./auth";

type FetchOptions = RequestInit & { skipRefresh?: boolean };

/**
 * Authenticated fetch wrapper.
 * – Attaches the Bearer access token on every request.
 * – On 401, attempts a silent token refresh once, then retries.
 * – On second 401, clears the session and redirects to /login.
 */
export async function apiFetch(url: string, options: FetchOptions = {}): Promise<Response> {
  const { skipRefresh = false, ...fetchOptions } = options;

  const token = getAccessToken();
  const res = await fetch(url, {
    ...fetchOptions,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(fetchOptions.headers ?? {}),
    },
  });

  if (res.status === 401 && !skipRefresh) {
    // Attempt silent refresh
    const refreshRes = await fetch("/api/v1/auth/refresh", {
      method: "POST",
      credentials: "include",
    });

    if (refreshRes.ok) {
      const data = await refreshRes.json();
      setAccessToken(data.access_token);
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
    throw new Error(body?.detail ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}
