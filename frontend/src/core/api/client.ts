import type { ApiErrorBody, AuthSession, Portal } from "@mashkoor/shared";
import { sessionStore } from "../auth/session-store";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }

  get fieldErrors(): Record<string, string> {
    const details = this.details as { fieldErrors?: Record<string, string> } | undefined;
    return details?.fieldErrors ?? {};
  }
}

const refreshInFlight = new Map<Portal, Promise<boolean>>();

/** Exchanges the httpOnly refresh cookie for a new access token. Concurrent callers share one request. */
export function refreshSession(portal: Portal): Promise<boolean> {
  const existing = refreshInFlight.get(portal);
  if (existing) return existing;

  const attempt = fetch(`/api/v1/auth/${portal}/refresh`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "x-mashkoor-client": "web" },
  })
    .then(async (res) => {
      if (!res.ok) {
        sessionStore.clear(portal);
        return false;
      }
      const session = (await res.json()) as AuthSession;
      sessionStore.setSession(portal, session);
      return true;
    })
    .catch(() => false)
    .finally(() => refreshInFlight.delete(portal));

  refreshInFlight.set(portal, attempt);
  return attempt;
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = body as Partial<ApiErrorBody>;
    throw new ApiError(res.status, err.code ?? "UNKNOWN", err.message ?? "Something went wrong", err.details);
  }
  return body as T;
}

type RequestOptions = { method?: string; body?: unknown; query?: Record<string, string | number | boolean | undefined | null> };

/** Raw request to any API path. Adds the portal's access token and retries once after a refresh on 401. */
export async function request<T>(portal: Portal, path: string, options: RequestOptions = {}): Promise<T> {
  const url = new URL(path, window.location.origin);
  for (const [k, v] of Object.entries(options.query ?? {})) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));

  const send = () => {
    const token = sessionStore.get(portal).accessToken;
    return fetch(url, {
      method: options.method ?? "GET",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  };

  let res = await send();
  if (res.status === 401 && sessionStore.get(portal).accessToken && (await refreshSession(portal))) {
    res = await send();
  }
  return parse<T>(res);
}

/**
 * Fetches a file (a PDF, say) with the same login handling as every other request: the access token is attached, an expired
 * one is refreshed and the request retried, and a failure carries the server's own message instead of a generic one.
 */
export async function download(portal: Portal, path: string, query: RequestOptions["query"] = {}): Promise<Blob> {
  const url = new URL(path, window.location.origin);
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));

  const send = () => {
    const token = sessionStore.get(portal).accessToken;
    return fetch(url, { credentials: "same-origin", headers: token ? { Authorization: `Bearer ${token}` } : {} });
  };

  let res: Response;
  try {
    res = await send();
    if (res.status === 401 && sessionStore.get(portal).accessToken && (await refreshSession(portal))) res = await send();
  } catch {
    throw new ApiError(0, "NETWORK", "Couldn't reach the server. Please try again in a moment.");
  }
  if (!res.ok) await parse<never>(res);
  return res.blob();
}

/** Hands a downloaded file to the browser's save dialog. */
export function saveFile(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/** Portal-scoped client: `api("admin").get("/users")` → GET /api/v1/admin/users */
export const api = (portal: Portal) => {
  const base = `/api/v1/${portal}`;
  return {
    get: <T>(path: string, query?: RequestOptions["query"]) => request<T>(portal, base + path, { query }),
    post: <T>(path: string, body?: unknown) => request<T>(portal, base + path, { method: "POST", body }),
    patch: <T>(path: string, body?: unknown) => request<T>(portal, base + path, { method: "PATCH", body }),
    put: <T>(path: string, body?: unknown) => request<T>(portal, base + path, { method: "PUT", body }),
    delete: <T>(path: string) => request<T>(portal, base + path, { method: "DELETE" }),
  };
};

/** Auth endpoints: `authApi("admin").post("/login", …)` → POST /api/v1/auth/admin/login */
export const authApi = (portal: Portal) => ({
  get: <T>(path: string) => request<T>(portal, `/api/v1/auth/${portal}${path}`),
  post: <T>(path: string, body?: unknown) => request<T>(portal, `/api/v1/auth/${portal}${path}`, { method: "POST", body }),
});

/** Portal-independent auth endpoints (accept invite, reset password). */
export const publicAuthPost = async <T>(path: string, body: unknown) =>
  parse<T>(await fetch(`/api/v1/auth${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

/** Unauthenticated endpoints under /api/v1/public — the token in the path is the only credential. */
export const publicApi = {
  get: async <T>(path: string) => parse<T>(await fetch(`/api/v1/public${path}`, { headers: { Accept: "application/json" } })),
  post: async <T>(path: string, body?: unknown) =>
    parse<T>(await fetch(`/api/v1/public${path}`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) })),
};
