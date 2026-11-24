import { api } from './api';

/**
 * Build a standard CRUD client for a REST collection.
 * @param {string} base Collection path, e.g. "/projects"
 */
function crud(base) {
  return {
    list: (query) => api.get(base, query),
    get: (id) => api.get(`${base}/${id}`),
    create: (data) => api.post(base, data),
    update: (id, data) => api.put(`${base}/${id}`, data),
    remove: (id) => api.del(`${base}/${id}`),
  };
}

export const projectsApi = crud('/projects');
export const deliverablesApi = {
  ...crud('/deliverables'),
  dependencies: (id) => api.get(`/deliverables/${id}/dependencies`),
};
export const allocationsApi = {
  ...crud('/allocations'),
  utilisation: (date) => api.get('/allocations/utilisation', { date }),
};
export const budgetApi = crud('/budget');
export const usersApi = crud('/users');
export const dashboardApi = { get: () => api.get('/dashboard') };
export const authApi = {
  me: () => api.get('/auth/me'),
  changePassword: (data) => api.put('/auth/password', data),
};
