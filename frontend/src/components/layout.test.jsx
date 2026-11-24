/** App shell, routing, responsive list rendering and small presentational components. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Context as ResponsiveContext } from 'react-responsive';
import { ThemeProvider } from '@mui/material';
import theme from '../theme';
import App from '../App';
import DataView from './DataView';
import StatusChip from './StatusChip';
import ProgressBar from './ProgressBar';
import { AuthProvider } from '../context/AuthContext';
import { NotificationProvider } from '../context/NotificationContext';
import { signInAs } from '../test/utils';
import { installFakeApi } from '../test/fakeApi';
import { loadSession } from '../services/api';

/** Wrap UI in react-responsive's Context so media queries see a fixed viewport width. */
function atWidth(width, ui) {
  return <ResponsiveContext.Provider value={{ width }}>{ui}</ResponsiveContext.Provider>;
}

function renderRoutedApp(route = '/', width = 1280) {
  return render(atWidth(
    width,
    <ThemeProvider theme={theme}>
      <NotificationProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={[route]}>
            <App />
          </MemoryRouter>
        </AuthProvider>
      </NotificationProvider>
    </ThemeProvider>,
  ));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App routing and layout', () => {
  it('sends anonymous users to the login page', async () => {
    installFakeApi();
    renderRoutedApp('/projects');
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('shows the admin-only Users link to admins and signs out', async () => {
    signInAs('admin');
    installFakeApi();
    renderRoutedApp('/');
    const nav = await screen.findByRole('navigation', { name: 'Main navigation' });
    expect(within(nav).getByText('Users')).toBeInTheDocument();
    expect(await screen.findByText('Projects needing attention')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(loadSession()).toBeNull();
  });

  it('hides Users from managers and blocks the route', async () => {
    signInAs('manager');
    installFakeApi();
    renderRoutedApp('/users');
    const nav = await screen.findByRole('navigation', { name: 'Main navigation' });
    expect(within(nav).queryByText('Users')).not.toBeInTheDocument();
    expect(await screen.findByText('Projects needing attention')).toBeInTheDocument();
  });

  it('uses a slide-out drawer on mobile', async () => {
    signInAs('viewer');
    installFakeApi();
    renderRoutedApp('/budget', 375);
    await userEvent.click(await screen.findByRole('button', { name: 'Open navigation' }));
    await userEvent.click(await screen.findByRole('link', { name: 'Deliverables' }));
    expect(await screen.findByRole('heading', { name: 'Deliverables' })).toBeInTheDocument();
  });

  it('renders the not-found page for unknown routes', async () => {
    signInAs('viewer');
    installFakeApi();
    renderRoutedApp('/nope');
    expect(await screen.findByText('Page not found')).toBeInTheDocument();
  });
});

describe('DataView', () => {
  const columns = [
    { key: 'name', label: 'Name', primary: true },
    { key: 'owner', label: 'Owner' },
    { key: 'secret', label: 'Secret', hideOnMobile: true },
  ];
  const rows = [{ id: 1, name: 'Alpha', owner: null, secret: 'x' }];

  it('renders a table on desktop with row clicks and actions', async () => {
    const onRowClick = vi.fn();
    render(atWidth(1280, <DataView columns={columns} rows={rows} onRowClick={onRowClick} actions={() => <button type="button">Act</button>} ariaLabel="Things" />));
    expect(screen.getByRole('table', { name: 'Things' })).toBeInTheDocument();
    expect(screen.getByText('Secret')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Act' }));
    expect(onRowClick).not.toHaveBeenCalled();
    await userEvent.click(screen.getByText('Alpha'));
    expect(onRowClick).toHaveBeenCalledWith(rows[0]);
  });

  it('renders cards on mobile and hides low-priority columns', async () => {
    const onRowClick = vi.fn();
    render(atWidth(375, <DataView columns={columns} rows={rows} onRowClick={onRowClick} actions={() => <button type="button">Act</button>} />));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('Secret')).not.toBeInTheDocument();
    expect(screen.getByText('Owner')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Alpha'));
    expect(onRowClick).toHaveBeenCalled();
  });
});

describe('presentational components', () => {
  it('StatusChip renders labels and nothing for empty values', () => {
    const { container } = render(<StatusChip value={null} />);
    expect(container).toBeEmptyDOMElement();
    render(<StatusChip value="on_hold" />);
    expect(screen.getByText('On hold')).toBeInTheDocument();
  });

  it('ProgressBar shows a dash for unknown values and caps the bar', () => {
    render(<ProgressBar value={null} label="Budget" />);
    expect(screen.getByText('—')).toBeInTheDocument();
    render(<ProgressBar value={150} label="Over" warnAt={85} />);
    expect(screen.getByRole('progressbar', { name: 'Over' })).toHaveAttribute('aria-valuenow', '100');
  });
});
