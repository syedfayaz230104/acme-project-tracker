import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from '@mui/material';
import theme from '../theme';
import { AuthProvider } from '../context/AuthContext';
import { NotificationProvider } from '../context/NotificationContext';
import { saveSession } from '../services/api';

const PERMISSIONS = {
  admin: ['create', 'delete', 'manage_users', 'read', 'update'],
  manager: ['create', 'delete', 'read', 'update'],
  contributor: ['create', 'read', 'update'],
  viewer: ['read'],
};

/** Store a fake session for the given role so AuthProvider starts signed in. */
export function signInAs(role) {
  saveSession({
    access_token: 'token',
    refresh_token: 'refresh',
    user: {
      id: 1, name: `Test ${role}`, email: `${role}@acme.com`, role, permissions: PERMISSIONS[role],
    },
  });
}

/** Mock fetch with a function (method, path, body) -> [status, body]. */
export function mockFetch(handler) {
  const fn = vi.fn(async (url, init = {}) => {
    const { pathname, search } = new URL(url, 'http://localhost');
    const path = pathname.replace(/^\/api\/core/, '');
    const [status, body] = await handler(init.method || 'GET', path, init.body ? JSON.parse(init.body) : undefined, search);
    return new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

/** Render inside theme, notification, auth and router providers. */
export function renderApp(ui, { route = '/', path = '*' } = {}) {
  return render(
    <ThemeProvider theme={theme}>
      <NotificationProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={[route]}>
            <Routes>
              <Route path={path} element={ui} />
              <Route path="/login" element={<div>Login screen</div>} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </NotificationProvider>
    </ThemeProvider>,
  );
}
