/**
 * Page-level tests against a fake API: rendering, role-aware actions,
 * create/edit/delete flows, filters and error states.
 */
import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DashboardPage from './DashboardPage';
import ProjectDetailPage from './ProjectDetailPage';
import DeliverablesPage from './DeliverablesPage';
import DeliverableDetailPage from './DeliverableDetailPage';
import ResourcesPage from './ResourcesPage';
import BudgetPage from './BudgetPage';
import UsersPage from './UsersPage';
import NotFoundPage from './NotFoundPage';
import ProjectsPage from './ProjectsPage';
import { renderApp, signInAs } from '../test/utils';
import { installFakeApi } from '../test/fakeApi';

const writes = (calls, method) => calls.filter((c) => c.method === method);

describe('DashboardPage', () => {
  it('answers the business questions', async () => {
    signInAs('viewer');
    installFakeApi();
    renderApp(<DashboardPage />);
    expect(await screen.findByText('Projects needing attention')).toBeInTheDocument();
    expect(screen.getByText(/Over budget \(120% used\)/)).toBeInTheDocument();
    expect(screen.getByText('Over-allocated people')).toBeInTheDocument();
    expect(screen.getByText('Blocked by dependencies')).toBeInTheDocument();
    expect(screen.getByText(/Waiting on: Design/)).toBeInTheDocument();
    expect(screen.getAllByText('Apollo').length).toBeGreaterThan(0);
    expect(screen.getByText('$1,200')).toBeInTheDocument();
  });

  it('shows a retryable error when the API fails', async () => {
    signInAs('viewer');
    installFakeApi({ 'GET /dashboard': () => [500, { error: { code: 'internal_error', message: 'Boom' } }] });
    renderApp(<DashboardPage />);
    expect(await screen.findByText('Boom')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});

describe('ProjectsPage', () => {
  it('creates a project through the form', async () => {
    signInAs('manager');
    const { calls } = installFakeApi();
    renderApp(<ProjectsPage />);
    await screen.findByText('Apollo');
    await userEvent.click(screen.getByRole('button', { name: /New project/ }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/Project name/), 'Gemini');
    await userEvent.type(within(dialog).getByLabelText(/End date/), '2027-01-31');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(calls, 'POST')).toHaveLength(1));
    expect(writes(calls, 'POST')[0].body).toMatchObject({ name: 'Gemini', status: 'planning', end_date: '2027-01-31' });
    expect(await screen.findByText('Project created')).toBeInTheDocument();
  });

  it('deletes a project after confirmation', async () => {
    signInAs('manager');
    const { calls } = installFakeApi();
    renderApp(<ProjectsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Apollo' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(writes(calls, 'DELETE')[0].path).toBe('/projects/1'));
    expect(await screen.findByText('Project deleted')).toBeInTheDocument();
  });

  it('shows delete failures as a toast', async () => {
    signInAs('manager');
    installFakeApi({ 'DELETE /projects/1': () => [500, { error: { code: 'x', message: 'Cannot delete' } }] });
    renderApp(<ProjectsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Apollo' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Cannot delete')).toBeInTheDocument();
  });

  it('applies select filters', async () => {
    signInAs('viewer');
    const { calls } = installFakeApi();
    renderApp(<ProjectsPage />, { route: '/projects?status=active' });
    await screen.findByText('Apollo');
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(calls.at(-1).search).not.toContain('status'));
  });
});

describe('ProjectDetailPage', () => {
  const route = { route: '/projects/1', path: '/projects/:id' };

  it('shows health, risk reasons and tabs', async () => {
    signInAs('manager');
    installFakeApi();
    renderApp(<ProjectDetailPage />, route);
    expect(await screen.findByRole('heading', { name: 'Apollo' })).toBeInTheDocument();
    expect(screen.getByText(/Over budget \(120% used\)/)).toBeInTheDocument();
    expect(await screen.findByText('Build')).toBeInTheDocument();
    expect(screen.getByText(/\(overdue\)/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: /Team/ }));
    expect(await screen.findByText('Carl')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /Budget/ }));
    expect(await screen.findByText('Sprint work')).toBeInTheDocument();
  });

  it('adds a deliverable with project pre-selected', async () => {
    signInAs('contributor');
    const { calls } = installFakeApi();
    renderApp(<ProjectDetailPage />, route);
    await userEvent.click(await screen.findByRole('button', { name: 'Add deliverable' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/Title/), 'Launch');
    await userEvent.type(within(dialog).getByLabelText(/Due date/), '2026-11-01');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(calls, 'POST')[0]?.body).toMatchObject({
      title: 'Launch', project_id: 1, status: 'not_started', progress: 0, depends_on: [],
    }));
  });

  it('records spend and allocates people', async () => {
    signInAs('manager');
    const { calls } = installFakeApi();
    renderApp(<ProjectDetailPage />, route);
    await screen.findByRole('heading', { name: 'Apollo' });

    await userEvent.click(screen.getByRole('tab', { name: /Budget/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Record spend' }));
    let dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/Amount/), '250');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(calls, 'POST').at(-1).path).toBe('/budget'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole('tab', { name: /Team/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Carl' }));
    dialog = await screen.findByRole('dialog');
    const pct = within(dialog).getByLabelText(/Allocation/);
    await userEvent.clear(pct);
    await userEvent.type(pct, '40');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(calls, 'PUT').at(-1)).toMatchObject({ path: '/allocations/20' }));
    expect(writes(calls, 'PUT').at(-1).body.allocation_pct).toBe(40);
  });

  it('hides write actions from viewers', async () => {
    signInAs('viewer');
    installFakeApi();
    renderApp(<ProjectDetailPage />, route);
    await screen.findByRole('heading', { name: 'Apollo' });
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add deliverable' })).not.toBeInTheDocument();
  });

  it('shows not-found errors', async () => {
    signInAs('viewer');
    installFakeApi();
    renderApp(<ProjectDetailPage />, { route: '/projects/5', path: '/projects/:id' });
    expect(await screen.findByText('/projects/5 not found')).toBeInTheDocument();
  });
});

describe('DeliverablesPage', () => {
  it('lists deliverables and edits one, keeping its dependencies', async () => {
    signInAs('manager');
    const { calls } = installFakeApi();
    renderApp(<DeliverablesPage />);
    expect(await screen.findByText('Build')).toBeInTheDocument();
    expect(screen.getByText(/overdue/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Edit Build' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(calls, 'PUT')[0]).toMatchObject({ path: '/deliverables/11' }));
    expect(writes(calls, 'PUT')[0].body.depends_on).toEqual([10]);
  });

  it('blocks 100% progress unless completed', async () => {
    signInAs('manager');
    installFakeApi();
    renderApp(<DeliverablesPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Build' }));
    const dialog = await screen.findByRole('dialog');
    const progress = within(dialog).getByLabelText(/Progress/);
    await userEvent.clear(progress);
    await userEvent.type(progress, '100');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('Set status to Completed for 100%')).toBeInTheDocument();
  });

  it('searches with a debounce', async () => {
    signInAs('viewer');
    const { calls } = installFakeApi();
    renderApp(<DeliverablesPage />);
    await screen.findByText('Build');
    await userEvent.type(screen.getByRole('textbox', { name: 'Search deliverables' }), 'des');
    await waitFor(() => expect(calls.some((c) => c.path === '/deliverables' && c.search.includes('q=des'))).toBe(true));
  });
});

describe('DeliverableDetailPage', () => {
  it('shows the upstream and downstream chain', async () => {
    signInAs('viewer');
    installFakeApi();
    renderApp(<DeliverableDetailPage />, { route: '/deliverables/11', path: '/deliverables/:id' });
    expect(await screen.findByRole('heading', { name: 'Build' })).toBeInTheDocument();
    expect(screen.getByText('Depends on')).toBeInTheDocument();
    expect(screen.getByText('Design')).toBeInTheDocument();
    expect(screen.getByText('Nothing depends on this deliverable.')).toBeInTheDocument();
  });
});

describe('ResourcesPage', () => {
  it('flags over-allocated people and lists allocations', async () => {
    signInAs('manager');
    installFakeApi();
    renderApp(<ResourcesPage />);
    expect(await screen.findByText(/1 person is allocated above 100%/)).toBeInTheDocument();
    expect(screen.getByText('Over-allocated')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Allocations' }));
    expect(await screen.findByRole('button', { name: 'Edit Carl on Apollo' })).toBeInTheDocument();
  });

  it('validates the allocation form', async () => {
    signInAs('manager');
    const { calls } = installFakeApi();
    renderApp(<ResourcesPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'New allocation' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('Team member is required')).toBeInTheDocument();
    expect(writes(calls, 'POST')).toHaveLength(0);
  });
});

describe('BudgetPage', () => {
  it('shows consumption and over-budget projects', async () => {
    signInAs('viewer');
    installFakeApi();
    renderApp(<BudgetPage />);
    expect(await screen.findByText('$200 over budget')).toBeInTheDocument();
    expect(await screen.findByText('Sprint work')).toBeInTheDocument();
    expect(screen.getByText(/1 entries · total \$1,200/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Record spend' })).not.toBeInTheDocument();
  });

  it('edits a spend entry', async () => {
    signInAs('contributor');
    const { calls } = installFakeApi();
    renderApp(<BudgetPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Sprint work' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(calls, 'PUT')[0]).toMatchObject({ path: '/budget/30' }));
    // contributors may update but not delete
    expect(screen.queryByRole('button', { name: 'Delete Sprint work' })).not.toBeInTheDocument();
  });
});

describe('UsersPage', () => {
  it('lets admins manage users but not delete themselves', async () => {
    signInAs('admin');
    const { calls } = installFakeApi();
    renderApp(<UsersPage />);
    expect(await screen.findByText('Ada Admin (you)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete Ada Admin' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Carl' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Edit Carl' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(calls, 'PUT')[0]).toMatchObject({ path: '/users/3' }));
    expect(writes(calls, 'PUT')[0].body).not.toHaveProperty('password');
  });

  it('requires a strong password for new users', async () => {
    signInAs('admin');
    installFakeApi();
    renderApp(<UsersPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'New user' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/Full name/), 'New Person');
    await userEvent.type(within(dialog).getByLabelText(/Email/), 'new@acme.com');
    await userEvent.type(within(dialog).getByLabelText(/^Password/), 'weak');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('At least 8 characters with letters and numbers')).toBeInTheDocument();
  });
});

describe('NotFoundPage', () => {
  it('links back to the dashboard', () => {
    renderApp(<NotFoundPage />);
    expect(screen.getByRole('link', { name: 'Back to dashboard' })).toHaveAttribute('href', '/');
  });
});
