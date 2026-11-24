import { mockFetch } from './utils';
import { loadSession } from '../services/api';

/** Realistic fixtures matching the backend's response shapes. */
export function fixtures() {
  const project = {
    id: 1,
    name: 'Apollo',
    description: 'Moon shot',
    department: 'Engineering',
    status: 'active',
    priority: 'high',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    budget_planned: 1000,
    budget_spent: 1200,
    budget_remaining: -200,
    budget_used_pct: 120,
    manager_id: 2,
    manager_name: 'Maya Manager',
    progress: 40,
    schedule_elapsed_pct: 80,
    deliverables_total: 2,
    deliverables_completed: 1,
    overdue_deliverables: 1,
    blocked_deliverables: 0,
    team_size: 2,
    risk_level: 'off_track',
    risk_reasons: ['Over budget (120% used)', '1 overdue deliverable(s)'],
  };
  const deliverables = [
    {
      id: 10, project_id: 1, project_name: 'Apollo', title: 'Design', description: null, status: 'completed',
      progress: 100, due_date: '2026-03-01', owner_id: 3, owner_name: 'Carl', is_overdue: false, depends_on: [],
      open_dependencies: 0,
    },
    {
      id: 11, project_id: 1, project_name: 'Apollo', title: 'Build', description: 'Make it', status: 'in_progress',
      progress: 50, due_date: '2026-02-01', owner_id: null, owner_name: null, is_overdue: true, depends_on: [10],
      open_dependencies: 0,
    },
  ];
  const allocations = [
    {
      id: 20, user_id: 3, user_name: 'Carl', project_id: 1, project_name: 'Apollo', role: 'Dev', allocation_pct: 60,
      start_date: '2026-01-01', end_date: '2026-12-31',
    },
  ];
  const utilisation = [
    {
      user_id: 3, user_name: 'Carl', title: 'Engineer', department: 'Eng', total_pct: 110, project_count: 2,
      over_allocated: true,
      allocations: [{ allocation_id: 20, project_id: 1, project_name: 'Apollo', role: 'Dev', allocation_pct: 60 }],
    },
    {
      user_id: 4, user_name: 'Vera', title: null, department: null, total_pct: 0, project_count: 0,
      over_allocated: false, allocations: [],
    },
  ];
  const budget = [
    {
      id: 30, project_id: 1, project_name: 'Apollo', category: 'labor', description: 'Sprint work', amount: 1200,
      entry_date: '2026-02-01', created_by_name: 'Ada',
    },
  ];
  const users = [
    {
      id: 1, name: 'Ada Admin', email: 'admin@acme.com', role: 'admin', title: 'Admin', department: 'IT', is_active: true,
    },
    {
      id: 3, name: 'Carl', email: 'carl@acme.com', role: 'contributor', title: null, department: null, is_active: false,
    },
  ];
  const dashboard = {
    as_of: '2026-06-01',
    totals: {
      projects: 2, active_projects: 1, at_risk: 0, off_track: 1, over_allocated_people: 1, overdue_deliverables: 1,
    },
    status_counts: { active: 1, completed: 1 },
    risk_counts: { off_track: 1, closed: 1 },
    projects: [project],
    at_risk_projects: [project],
    deliverable_status_counts: { completed: 1, in_progress: 1 },
    upcoming_deliverables: [{
      id: 11, title: 'Build', status: 'in_progress', progress: 50, due_date: '2026-02-01', project_id: 1,
      project_name: 'Apollo', owner_name: null,
    }],
    blocked_by_dependencies: [{
      id: 11, title: 'Build', project_name: 'Apollo', waiting_on: [{ id: 10, title: 'Design', status: 'in_progress' }],
    }],
    utilisation,
    over_allocated: utilisation.slice(0, 1),
    budget: {
      planned: 1000, spent: 1200, remaining: -200, by_project: [{ id: 1, name: 'Apollo', planned: 1000, spent: 1200, used_pct: 120 }],
    },
  };
  const chain = {
    deliverable: deliverables[1],
    upstream: [{ ...deliverables[0], depth: 1 }],
    downstream: [],
  };
  return {
    project, deliverables, allocations, utilisation, budget, users, dashboard, chain,
  };
}

/**
 * Install a fetch mock that serves the fixtures for every endpoint and records
 * write calls. `overrides` maps "METHOD /path" to a handler returning [status, body].
 * @returns {{fetch: import('vitest').Mock, calls: Array, data: object}}
 */
export function installFakeApi(overrides = {}) {
  const data = fixtures();
  const calls = [];
  const fetch = mockFetch((method, path, body, search) => {
    const key = `${method} ${path}`;
    calls.push({
      method, path, body, search,
    });
    if (overrides[key]) return overrides[key](body, search);
    if (method === 'GET') {
      const routes = {
        '/auth/me': () => loadSession()?.user,
        '/dashboard': () => data.dashboard,
        '/projects': () => [data.project],
        '/projects/1': () => data.project,
        '/deliverables': () => data.deliverables,
        '/deliverables/11': () => data.deliverables[1],
        '/deliverables/11/dependencies': () => data.chain,
        '/allocations': () => data.allocations,
        '/allocations/utilisation': () => data.utilisation,
        '/budget': () => data.budget,
        '/users': () => data.users,
      };
      if (routes[path]) return [200, routes[path]()];
      return [404, { error: { code: 'not_found', message: `${path} not found` } }];
    }
    if (method === 'POST') return [201, { id: 99, ...body }];
    if (method === 'PUT') return [200, { id: Number(path.split('/').pop()), ...body }];
    if (method === 'DELETE') return [204, null];
    return [405, { error: { code: 'method_not_allowed', message: 'nope' } }];
  });
  return { fetch, calls, data };
}
