/** Display formatting and option lists shared across pages. */

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

/** Format a number as USD with no decimals. */
export function formatCurrency(value) {
  return currencyFormatter.format(Number(value) || 0);
}

/** Format an ISO date (YYYY-MM-DD) without timezone shifts. */
export function formatDate(value) {
  if (!value) return '—';
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  return dateFormatter.format(new Date(y, m - 1, d));
}

/** "on_hold" -> "On hold" */
export function humanize(value) {
  if (!value) return '';
  const text = String(value).replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Today's date as YYYY-MM-DD in local time. */
export function todayIso() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const toOptions = (values) => values.map((value) => ({ value, label: humanize(value) }));

export const PROJECT_STATUSES = toOptions(['planning', 'active', 'on_hold', 'completed', 'cancelled']);
export const PRIORITIES = toOptions(['low', 'medium', 'high', 'critical']);
export const RISK_LEVELS = toOptions(['on_track', 'at_risk', 'off_track', 'closed']);
export const DELIVERABLE_STATUSES = toOptions(['not_started', 'in_progress', 'blocked', 'completed']);
export const BUDGET_CATEGORIES = toOptions(['labor', 'software', 'hardware', 'services', 'travel', 'other']);
export const ROLES = toOptions(['admin', 'manager', 'contributor', 'viewer']);
