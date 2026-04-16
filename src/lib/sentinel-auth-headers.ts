import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

const SESSION_REFRESH_BUFFER_MS = 60_000;

function sessionNeedsRefresh(session: Session | null): boolean {
  if (!session?.access_token) return true;
  if (!session.expires_at) return false;
  return session.expires_at * 1000 <= Date.now() + SESSION_REFRESH_BUFFER_MS;
}

export async function getFreshSession(): Promise<Session | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!sessionNeedsRefresh(session)) {
    return session;
  }

  const { data, error } = await supabase.auth.refreshSession();
  if (error) {
    console.warn("[auth] Session refresh failed:", error.message);
    return data.session ?? session ?? null;
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
