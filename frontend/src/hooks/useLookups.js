import { useMemo } from 'react';
import useApi from './useApi';
import { projectsApi, usersApi } from '../services/resources';

/**
 * Projects and active users as `{value, label}` options for selects and filters.
 * @returns {{projectOptions: Array, userOptions: Array, loading: boolean}}
 */
export default function useLookups() {
  const projects = useApi(() => projectsApi.list(), []);
  const users = useApi(() => usersApi.list({ active: true }), []);

  return useMemo(() => ({
    projectOptions: (projects.data || []).map((p) => ({ value: p.id, label: p.name })),
    userOptions: (users.data || []).map((u) => ({ value: u.id, label: u.name })),
    loading: projects.loading || users.loading,
  }), [projects.data, projects.loading, users.data, users.loading]);
}
