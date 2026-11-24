/**
 * HTTP client for the core API.
 *
 * - Adds the bearer token to every request.
 * - On 401, refreshes the access token once and retries.
 * - Normalises every failure into an ApiError with status, code, message and field details.
 */

const API_BASE = `${(import.meta.env.VITE_API_URL || '').replace(/\/$/, '')}/api/core`;
const STORAGE_KEY = 'acme.auth';

/** Error thrown for any failed API call. */
export class ApiError extends Error {
  /**
   * @param {number} status HTTP status (0 for network errors)
   * @param {string} code Machine-readable error code
   * @param {string} message Human-readable message
   * @param {Object<string, string>} [details] Field-level validation messages
   */
  constructor(status, code, message, details = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** @returns {{access_token: string, refresh_token: string, user: object} | null} */
export function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Persist (or clear, when null) the auth session. */
export function saveSession(session) {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable (private mode): session lives only in memory.
  }
}

let onSessionExpired = () => {};

/** Register a callback fired when the session can no longer be refreshed. */
export function setSessionExpiredHandler(handler) {
  onSessionExpired = handler;
}

function buildUrl(path, query) {
  const params = new URLSearchParams();
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.append(key, value);
  });
  const qs = params.toString();
  return `${API_BASE}${path}${qs ? `?${qs}` : ''}`;
}

async function parseResponse(response) {
  if (response.status === 204) return null;
  const isJson = (response.headers.get('content-type') || '').includes('application/json');
  const body = isJson ? await response.json().catch(() => null) : null;
  if (!response.ok) {
    const err = body?.error || {};
    throw new ApiError(
      response.status,
      err.code || 'http_error',
      err.message || `Request failed (${response.status})`,
      err.details || {},
    );
  }
  if (!isJson) {
    throw new ApiError(response.status, 'unexpected_response', 'The server returned an unexpected response');
  }
  return body;
}

async function rawRequest(method, path, { body, query, token } = {}) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network_error', 'Cannot reach the server. Check your connection and try again.');
  }
  return parseResponse(response);
}

let refreshInFlight = null;

async function refreshSession() {
  const session = loadSession();
  if (!session?.refresh_token) return null;
  if (!refreshInFlight) {
    refreshInFlight = rawRequest('POST', '/auth/refresh', { body: { refresh_token: session.refresh_token } })
      .then((fresh) => {
        saveSession(fresh);
        return fresh;
      })
      .catch(() => null)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

/**
 * Perform an authenticated API request.
 * @param {string} method HTTP method
 * @param {string} path Path below /api/core, e.g. "/projects"
 * @param {{body?: object, query?: object}} [options]
 * @returns {Promise<any>} Parsed JSON body (null for 204)
 */
export async function request(method, path, options = {}) {
  const session = loadSession();
  try {
    return await rawRequest(method, path, { ...options, token: session?.access_token });
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401 || !session) throw err;
    const fresh = await refreshSession();
    if (!fresh) {
      saveSession(null);
      onSessionExpired();
      throw new ApiError(401, 'session_expired', 'Your session has expired. Please sign in again.');
    }
    return rawRequest(method, path, { ...options, token: fresh.access_token });
  }
}

/** Log in with email + password and persist the session. */
export async function login(email, password) {
  const session = await rawRequest('POST', '/auth/login', { body: { email, password } });
  saveSession(session);
  return session;
}

/** Clear the stored session. */
export function logout() {
  saveSession(null);
}

export const api = {
  get: (path, query) => request('GET', path, { query }),
  post: (path, body) => request('POST', path, { body }),
  put: (path, body) => request('PUT', path, { body }),
  del: (path) => request('DELETE', path),
};
