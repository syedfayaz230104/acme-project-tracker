/**
 * Form field definitions shared by list and detail pages (single source of truth
 * for labels, required flags and client-side constraints).
 */
import {
  BUDGET_CATEGORIES, DELIVERABLE_STATUSES, PRIORITIES, PROJECT_STATUSES, ROLES,
} from '../utils/format';

const endAfterStart = (startKey) => (value, values) => (
  values[startKey] && value && value < values[startKey] ? 'Must be on or after the start date' : null
);

/** @param {Array} userOptions */
export function projectFields(userOptions) {
  return [
    { name: 'name', label: 'Project name', required: true },
    { name: 'description', label: 'Description', type: 'textarea' },
    { name: 'department', label: 'Department', size: 6 },
    { name: 'manager_id', label: 'Project manager', type: 'select', options: userOptions, size: 6 },
    { name: 'status', label: 'Status', type: 'select', options: PROJECT_STATUSES, required: true, size: 6 },
    { name: 'priority', label: 'Priority', type: 'select', options: PRIORITIES, required: true, size: 6 },
    { name: 'start_date', label: 'Start date', type: 'date', required: true, size: 6 },
    { name: 'end_date', label: 'End date', type: 'date', required: true, size: 6, validate: endAfterStart('start_date') },
    { name: 'budget_planned', label: 'Planned budget (USD)', type: 'number', min: 0, required: true },
  ];
}

/**
 * @param {Array} projectOptions
 * @param {Array} userOptions
 * @param {Array} deliverableOptions Candidates for dependencies (excluding the one being edited)
 */
export function deliverableFields(projectOptions, userOptions, deliverableOptions) {
  return [
    { name: 'title', label: 'Title', required: true },
    { name: 'project_id', label: 'Project', type: 'select', options: projectOptions, required: true },
    { name: 'description', label: 'Description', type: 'textarea' },
    { name: 'status', label: 'Status', type: 'select', options: DELIVERABLE_STATUSES, required: true, size: 6 },
    {
      name: 'progress', label: 'Progress (%)', type: 'number', min: 0, max: 100, step: 5, required: true, size: 6,
      validate: (v, values) => (Number(v) === 100 && values.status !== 'completed'
        ? 'Set status to Completed for 100%' : null),
    },
    { name: 'due_date', label: 'Due date', type: 'date', required: true, size: 6 },
    { name: 'owner_id', label: 'Owner', type: 'select', options: userOptions, size: 6 },
    {
      name: 'depends_on', label: 'Depends on', type: 'multiselect', options: deliverableOptions,
      helperText: 'Deliverables that must be completed first',
    },
  ];
}

/** @param {Array} projectOptions @param {Array} userOptions */
export function allocationFields(projectOptions, userOptions) {
  return [
    { name: 'user_id', label: 'Team member', type: 'select', options: userOptions, required: true, size: 6 },
    { name: 'project_id', label: 'Project', type: 'select', options: projectOptions, required: true, size: 6 },
    { name: 'role', label: 'Role on project', size: 6 },
    { name: 'allocation_pct', label: 'Allocation (%)', type: 'number', min: 1, max: 100, step: 5, required: true, size: 6 },
    { name: 'start_date', label: 'Start date', type: 'date', required: true, size: 6 },
    { name: 'end_date', label: 'End date', type: 'date', required: true, size: 6, validate: endAfterStart('start_date') },
  ];
}

/** @param {Array} projectOptions */
export function budgetFields(projectOptions) {
  return [
    { name: 'project_id', label: 'Project', type: 'select', options: projectOptions, required: true },
    { name: 'category', label: 'Category', type: 'select', options: BUDGET_CATEGORIES, required: true, size: 6 },
    { name: 'amount', label: 'Amount (USD)', type: 'number', min: 0.01, required: true, size: 6 },
    { name: 'entry_date', label: 'Date', type: 'date', required: true, size: 6 },
    { name: 'description', label: 'Description', size: 6 },
  ];
}

/** @param {boolean} isEdit Password is optional when editing */
export function userFields(isEdit) {
  return [
    { name: 'name', label: 'Full name', required: true, size: 6 },
    { name: 'email', label: 'Email', type: 'email', required: true, size: 6 },
    { name: 'role', label: 'Role', type: 'select', options: ROLES, required: true, size: 6 },
    {
      name: 'is_active', label: 'Status', type: 'select', required: true, size: 6,
      options: [{ value: true, label: 'Active' }, { value: false, label: 'Inactive' }],
    },
    { name: 'title', label: 'Job title', size: 6 },
    { name: 'department', label: 'Department', size: 6 },
    {
      name: 'password',
      label: isEdit ? 'New password (leave blank to keep)' : 'Password',
      type: 'password',
      required: !isEdit,
      omitIfEmpty: true,
    },
  ];
}
