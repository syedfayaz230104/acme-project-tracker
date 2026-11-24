import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError, api, loadSession, login, saveSession, setSessionExpiredHandler,
} from './api';

function jsonResponse(status, body) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api client', () => {
  it('sends the bearer token and query string', async () => {
    saveSession({ access_token: 'abc', refresh_token: 'r' });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, [{ id: 1 }]));
    vi.stubGlobal('fetch', fetchMock);

    const data = await api.get('/projects', { status: 'active', q: '' });

    expect(data).toEqual([{ id: 1 }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url.endsWith('/api/core/projects?status=active')).toBe(true);
    expect(init.headers.Authorization).toBe('Bearer abc');
  });

  it('turns error envelopes into ApiError with field details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(400, {
      error: { code: 'validation_error', message: 'Validation failed', details: { name: 'is required' } },
    })));
    const err = await api.post('/projects', {}).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.details).toEqual({ name: 'is required' });
  });

  it('reports network failures clearly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const err = await api.get('/projects').catch((e) => e);
    expect(err.code).toBe('network_error');
  });

  it('rejects non-JSON success responses (e.g. an HTML fallback page)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html></html>', {
      status: 200, headers: { 'Content-Type': 'text/html' },
    })));
    const err = await api.get('/projects').catch((e) => e);
    expect(err.code).toBe('unexpected_response');
  });

  it('refreshes an expired access token once and retries', async () => {
    saveSession({ access_token: 'old', refresh_token: 'r1' });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'unauthorized', message: 'Token has expired' } }))
      .mockResolvedValueOnce(jsonResponse(200, { access_token: 'new', refresh_token: 'r2', user: { id: 1 } }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await api.get('/dashboard')).toEqual({ ok: true });
    expect(fetchMock.mock.calls[1][0].endsWith('/api/core/auth/refresh')).toBe(true);
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer new');
    expect(loadSession().access_token).toBe('new');
  });

  it('clears the session and notifies when refresh fails', async () => {
    saveSession({ access_token: 'old', refresh_token: 'bad' });
    const onExpired = vi.fn();
    setSessionExpiredHandler(onExpired);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse(401, { error: { code: 'unauthorized', message: 'Invalid token' } }),
    ));

    const err = await api.get('/dashboard').catch((e) => e);
    expect(err.code).toBe('session_expired');
    expect(onExpired).toHaveBeenCalled();
    expect(loadSession()).toBeNull();
  });

  it('login stores the session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, {
      access_token: 't', refresh_token: 'r', user: { id: 2, role: 'viewer' },
    })));
    await login('viewer@acme.com', 'Password123');
    expect(loadSession().user.role).toBe('viewer');
  });
});
