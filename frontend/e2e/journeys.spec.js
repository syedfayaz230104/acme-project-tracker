// @ts-check
/**
 * Critical user journeys, run in a real browser against a running stack
 * (local or deployed). Test data is uniquely named and cleaned up.
 */
import { expect, test } from '@playwright/test';

const PASSWORD = 'Password123';
const PREFIX = 'E2E ';
const unique = () => `${PREFIX}${Date.now().toString(36)}`;

/** API base for cleanup: the local proxy in dev, CloudFront /api/core when deployed. */
function apiBase(baseURL) {
  if (process.env.E2E_API_URL) return process.env.E2E_API_URL;
  return baseURL.includes('localhost:3000') ? 'http://localhost:3001/api/core' : `${baseURL}/api/core`;
}

// Remove any projects created by these tests, even if a test failed midway.
test.afterAll(async ({ request, baseURL }) => {
  const api = apiBase(baseURL);
  const login = await request.post(`${api}/auth/login`, { data: { email: 'admin@acme.com', password: PASSWORD } });
  if (!login.ok()) return;
  const headers = { Authorization: `Bearer ${(await login.json()).access_token}` };
  const projects = await (await request.get(`${api}/projects`, { headers, params: { q: PREFIX } })).json();
  for (const p of projects.filter((x) => x.name.startsWith(PREFIX))) {
    await request.delete(`${api}/projects/${p.id}`, { headers });
  }
});

/** Sign in through the login form. */
async function signIn(page, email) {
  await page.goto('/#/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

test.describe('authentication', () => {
  test('rejects bad credentials, then signs in and out', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/#\/login/);
    await page.getByLabel('Email').fill('manager@acme.com');
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Invalid email or password')).toBeVisible();

    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });
});

test.describe('dashboard', () => {
  test('answers the business questions', async ({ page }) => {
    await signIn(page, 'viewer@acme.com');
    for (const section of ['Projects needing attention', 'Budget', 'Project status', 'Resource allocation',
      'Blocked by dependencies', 'Upcoming & overdue deliverables']) {
      await expect(page.getByText(section, { exact: true }).first()).toBeVisible();
    }
    await page.getByText('Over-allocated people').click();
    await expect(page.getByRole('heading', { name: 'Resources' })).toBeVisible();
  });
});

test.describe('role-based access', () => {
  test('viewer is read-only and cannot reach user management', async ({ page }) => {
    await signIn(page, 'viewer@acme.com');
    await page.getByRole('link', { name: 'Projects' }).click();
    await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New project' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Users' })).toHaveCount(0);
    await page.goto('/#/users');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('admin can open user management', async ({ page }) => {
    await signIn(page, 'admin@acme.com');
    await page.getByRole('link', { name: 'Users' }).click();
    await expect(page.getByText('Ada Admin (you)')).toBeVisible();
  });
});

test.describe('project lifecycle', () => {
  test('manager creates a project, adds work, records spend, then deletes it', async ({ page }) => {
    const name = unique();
    await signIn(page, 'manager@acme.com');

    // Create
    await page.getByRole('link', { name: 'Projects' }).click();
    await page.getByRole('button', { name: 'New project' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Project name').fill(name);
    await dialog.getByLabel('Department').fill('QA');
    await dialog.getByLabel('End date').fill('2099-12-31');
    await dialog.getByLabel('Planned budget (USD)').fill('1000');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Project created')).toBeVisible();

    // Search finds it; open detail
    await page.getByRole('textbox', { name: 'Search projects' }).fill(name);
    await page.getByText(name, { exact: true }).click();
    await expect(page.getByRole('heading', { name })).toBeVisible();

    // Two deliverables with a dependency
    for (const title of ['Plan', 'Execute']) {
      await page.getByRole('button', { name: 'Add deliverable' }).click();
      await dialog.getByLabel('Title').fill(title);
      await dialog.getByLabel('Due date').fill('2099-06-01');
      if (title === 'Execute') {
        await dialog.getByLabel('Depends on').click();
        await page.getByRole('option', { name: 'Plan' }).click();
        await dialog.getByRole('heading', { name: 'New deliverable' }).click(); // close the listbox, not the dialog
      }
      await dialog.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByText('Deliverable created')).toBeVisible();
    }
    await expect(page.getByRole('tab', { name: 'Deliverables (2)' })).toBeVisible();

    // Completing "Execute" before "Plan" is refused by the dependency rule
    await page.getByRole('button', { name: 'Edit Execute' }).click();
    await dialog.getByLabel('Status').click();
    await page.getByRole('option', { name: 'Completed' }).click();
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.getByText(/Cannot complete/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    // Dependency chain view
    await page.getByRole('cell', { name: 'Execute', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Execute' })).toBeVisible();
    await expect(page.getByText('Must finish before this one (upstream)')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Plan/ })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('heading', { name })).toBeVisible();

    // Overspend flips the project to off track
    await page.getByRole('tab', { name: /Budget/ }).click();
    await page.getByRole('button', { name: 'Record spend' }).click();
    await dialog.getByLabel('Amount (USD)').fill('1500');
    await dialog.getByLabel('Description').fill('Overspend');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Budget entry created')).toBeVisible();
    await expect(page.getByText(/Off track:.*Over budget \(150% used\)/)).toBeVisible();

    // Delete (cleanup)
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('Project deleted')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
  });

  test('form validation blocks bad input', async ({ page }) => {
    await signIn(page, 'manager@acme.com');
    await page.getByRole('link', { name: 'Projects' }).click();
    await page.getByRole('button', { name: 'New project' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Start date').fill('2026-06-01');
    await dialog.getByLabel('End date').fill('2026-01-01');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.getByText('Project name is required')).toBeVisible();
    await expect(dialog.getByText('Must be on or after the start date')).toBeVisible();
  });
});

test.describe('responsive layout', () => {
  test('mobile shows cards and a navigation drawer @mobile', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile project only');
    await signIn(page, 'viewer@acme.com');
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.getByRole('link', { name: 'Projects' }).click();
    await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
    await expect(page.getByRole('table')).toHaveCount(0);
    await expect(page.getByText('Customer Portal Revamp')).toBeVisible();
  });
});
