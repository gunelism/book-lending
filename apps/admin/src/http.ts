import { HttpError } from 'react-admin';

/**
 * Same-origin HTTP client. The session lives in an HttpOnly cookie the
 * browser sends automatically; every state-changing request also carries the
 * CSRF token in the X-CSRF-Token header (double-submit pattern).
 */
let csrfToken: string | null = null;

export function setCsrfToken(token: string | null | undefined) {
  csrfToken = token ?? null;
}

async function fetchCsrfToken(): Promise<string> {
  const res = await fetch('/auth/csrf', { credentials: 'same-origin' });
  const body = await res.json();
  csrfToken = body.csrfToken;
  return csrfToken!;
}

export async function api(path: string, init: RequestInit = {}, retry = true): Promise<any> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  if (method !== 'GET' && method !== 'HEAD') headers.set('X-CSRF-Token', csrfToken ?? (await fetchCsrfToken()));
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');

  const res = await fetch(path, { ...init, method, headers, credentials: 'same-origin' });
  const text = await res.text();
  const body = text ? safeJson(text) : null;

  if (res.status === 403 && body?.code === 'CSRF_INVALID' && retry) {
    await fetchCsrfToken(); // token rotated (e.g. after login elsewhere) — get a fresh one and retry once
    return api(path, init, false);
  }
  if (!res.ok) {
    const message = Array.isArray(body?.message) ? body.message.join('; ') : body?.message ?? res.statusText;
    throw new HttpError(message, res.status, body);
  }
  return body;
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

const CODE_TO_STATUS: Record<string, number> = { UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404 };

/** Runs a GraphQL operation; GraphQL errors become react-admin HttpErrors with a readable message. */
export async function gql<T = any>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const body = await api('/graphql', { method: 'POST', body: JSON.stringify({ query, variables }) });
  if (body?.errors?.length) {
    const err = body.errors[0];
    const code = err.extensions?.code as string | undefined;
    throw new HttpError(err.message, CODE_TO_STATUS[code ?? ''] ?? 400, { code });
  }
  return body.data as T;
}
