import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

const SESSION_REFRESH_BUFFER_MS = 60_000;
const SUPABASE_STORAGE_KEY_PREFIX = "sb-";
const AUTH_REQUEST_TIMEOUT_MS = 12_000;

export class AuthRequestTimeoutError extends Error {
  constructor(operation: string) {
    super(`Supabase auth ${operation} timed out`);
    this.name = "AuthRequestTimeoutError";
  }
}

async function withAuthTimeout<T>(operation: string, promise: Promise<T>): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new AuthRequestTimeoutError(operation)), AUTH_REQUEST_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

function sessionNeedsRefresh(session: Session | null): boolean {
  if (!session?.access_token) return false;
  if (!session.expires_at) return false;
  return session.expires_at * 1000 <= Date.now() + SESSION_REFRESH_BUFFER_MS;
}

export async function clearLocalAuthState() {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch (error) {
    console.warn("[auth] Failed to clear local Supabase session:", error);
  }

  if (typeof window === "undefined") return;

  for (const key of Object.keys(window.localStorage)) {
    if (!key.startsWith(SUPABASE_STORAGE_KEY_PREFIX)) continue;
    window.localStorage.removeItem(key);
  }

  for (const key of Object.keys(window.sessionStorage)) {
    if (!key.startsWith(SUPABASE_STORAGE_KEY_PREFIX)) continue;
    window.sessionStorage.removeItem(key);
  }
}

export async function signInWithPasswordWithTimeout(credentials: { email: string; password: string }) {
  return withAuthTimeout("sign in", supabase.auth.signInWithPassword(credentials));
}

export async function getFreshSession(): Promise<Session | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return null;
  }

  if (!sessionNeedsRefresh(session)) {
    return session;
  }

  let refreshResult;
  try {
    refreshResult = await withAuthTimeout("session refresh", supabase.auth.refreshSession());
  } catch (error) {
    console.warn("[auth] Session refresh timed out:", error);
    await clearLocalAuthState();
    return null;
  }

  const { data, error } = refreshResult;
  if (error) {
    console.warn("[auth] Session refresh failed:", error.message);
    await clearLocalAuthState();
    return data.session ?? null;
  }

  return data.session ?? session ?? null;
}

function withBearer(headersInit: HeadersInit | undefined, accessToken: string): Headers {
  const headers = new Headers(headersInit);
  headers.set("Authorization", `Bearer ${accessToken}`);
  return headers;
}

/** Bearer + JSON headers for authenticated Sentinel API routes (same pattern as dialer panels). */
export async function sentinelAuthHeaders(json = true): Promise<Record<string, string>> {
  const session = await getFreshSession();
  if (!session?.access_token) {
    throw new Error("Session expired. Please sign in again.");
  }

  const headers: Record<string, string> = {};
  if (json) headers["Content-Type"] = "application/json";
  headers.Authorization = `Bearer ${session.access_token}`;
  return headers;
}

export async function authorizedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const session = await getFreshSession();
  if (!session?.access_token) {
    throw new Error("Session expired. Please sign in again.");
  }

  let response = await fetch(input, {
    ...init,
    headers: withBearer(init.headers, session.access_token),
  });

  if (response.status !== 401) {
    return response;
  }

  const refreshedSession = await getFreshSession();
  if (!refreshedSession?.access_token || refreshedSession.access_token === session.access_token) {
    return response;
  }

  response = await fetch(input, {
    ...init,
    headers: withBearer(init.headers, refreshedSession.access_token),
  });

  return response;
}
