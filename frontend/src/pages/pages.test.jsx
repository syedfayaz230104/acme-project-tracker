import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from './LoginPage';
import ProjectsPage from './ProjectsPage';
import ProtectedRoute from '../components/ProtectedRoute';
import { mockFetch, renderApp, signInAs } from '../test/utils';
import { loadSession } from '../services/api';

const PROJECT = {
  id: 7,
  name: 'Apollo',
  department: 'Engineering',
  status: 'active',
  priority: 'high',
  risk_level: 'at_risk',
  risk_reasons: ['1 overdue deliverable(s)'],
  manager_name: 'Maya',
  progress: 40,
  budget_used_pct: 50,
  budget_spent: 500,
  budget_planned: 1000,
  end_date: '2026-12-31',
};

function apiWithProjects(projects = [PROJECT]) {
  return mockFetch((method, path) => {
    if (method === 'GET' && path === '/projects') return [200, projects];
    if (method === 'GET' && path === '/users') return [200, [{ id: 1, name: 'Maya' }]];
    if (method === 'GET' && path === '/auth/me') return [200, loadSession().user];
    return [404, { error: { code: 'not_found', message: 'nope' } }];
  });
}

describe('LoginPage', () => {
  it('validates input before calling the API', async () => {
    const fetchMock = mockFetch(() => [200, {}]);
    renderApp(<LoginPage />, { route: '/login', path: '/login' });
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the server error for bad credentials', async () => {
    mockFetch(() => [401, { error: { code: 'unauthorized', message: 'Invalid email or password' } }]);
    renderApp(<LoginPage />, { route: '/login', path: '/login' });
    await userEvent.type(screen.getByLabelText(/Email/), 'a@acme.com');
    await userEvent.type(screen.getByLabelText(/Password/), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Invalid email or password')).toBeInTheDocument();
  });

  it('fills credentials from a demo account button', async () => {
    mockFetch(() => [200, {}]);
    renderApp(<LoginPage />, { route: '/login', path: '/login' });
    await userEvent.click(screen.getByRole('button', { name: 'Manager' }));
    expect(screen.getByLabelText(/Email/)).toHaveValue('manager@acme.com');
  });
});

describe('ProtectedRoute', () => {
  it('redirects anonymous users to login', () => {
    renderApp(<ProtectedRoute><div>Secret</div></ProtectedRoute>);
    expect(screen.getByText('Login screen')).toBeInTheDocument();
  });

  it('renders children for signed-in users', () => {
    signInAs('viewer');
    mockFetch(() => [200, { id: 1, role: 'viewer', permissions: ['read'] }]);
    renderApp(<ProtectedRoute><div>Secret</div></ProtectedRoute>);
    expect(screen.getByText('Secret')).toBeInTheDocument();
  });
});

describe('ProjectsPage', () => {
  it('lists projects with risk and hides write actions from viewers', async () => {
    signInAs('viewer');
    apiWithProjects();
    renderApp(<ProjectsPage />, { route: '/projects' });
    expect(await screen.findByText('Apollo')).toBeInTheDocument();
    expect(screen.getByText('At risk')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /New project/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Apollo' })).not.toBeInTheDocument();
  });

  it('shows create/edit/delete actions for managers', async () => {
    signInAs('manager');
    apiWithProjects();
    renderApp(<ProjectsPage />, { route: '/projects' });
    expect(await screen.findByText('Apollo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /New project/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Apollo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Apollo' })).toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    signInAs('viewer');
    apiWithProjects([]);
    renderApp(<ProjectsPage />, { route: '/projects' });
    expect(await screen.findByText('No projects match your filters.')).toBeInTheDocument();
  });

  it('passes URL filters to the API', async () => {
    signInAs('viewer');
    const fetchMock = apiWithProjects();
    renderApp(<ProjectsPage />, { route: '/projects?status=active' });
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes('/projects?status=active'))).toBe(true));
  });
});
