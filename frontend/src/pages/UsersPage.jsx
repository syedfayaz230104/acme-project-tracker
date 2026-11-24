import { useState } from 'react';
import { Box, Button, Chip, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import PageHeader from '../components/PageHeader';
import DataView from '../components/DataView';
import FilterBar from '../components/FilterBar';
import LoadState from '../components/LoadState';
import StatusChip from '../components/StatusChip';
import FormDialog from '../components/FormDialog';
import ConfirmDialog from '../components/ConfirmDialog';
import RowActions from '../components/RowActions';
import useApi from '../hooks/useApi';
import useCrud from '../hooks/useCrud';
import useDebounce from '../hooks/useDebounce';
import { useAuth } from '../context/AuthContext';
import { usersApi } from '../services/resources';
import { humanize, ROLES } from '../utils/format';
import { userFields } from './fields';

/** Admin-only user and role management. */
export default function UsersPage() {
  const { user: me } = useAuth();
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ role: '', active: '' });
  const q = useDebounce(search);
  const {
    data, loading, error, reload,
  } = useApi(() => usersApi.list({ ...filters, q }), [JSON.stringify(filters), q]);
  const crud = useCrud(usersApi, 'User', reload);
  const isEdit = Boolean(crud.form.editing);

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Manage accounts and roles"
        actions={(
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => crud.openCreate({ role: 'viewer', is_active: true })}>
            New user
          </Button>
        )}
      />
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search name, email or title"
        filters={[
          { name: 'role', label: 'Role', options: ROLES },
          { name: 'active', label: 'Status', options: [{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }] },
        ]}
        values={filters}
        onChange={(name, value) => setFilters((f) => ({ ...f, [name]: value }))}
        onClear={() => { setSearch(''); setFilters({ role: '', active: '' }); }}
      />
      <LoadState loading={loading && !data} error={error} onRetry={reload} empty={data?.length === 0} emptyMessage="No users found.">
        <DataView
          ariaLabel="Users"
          rows={data || []}
          columns={[
            {
              key: 'name',
              label: 'Name',
              primary: true,
              render: (u) => (
                <Box>
                  <Typography sx={{ fontWeight: 600 }}>{u.name}{u.id === me.id ? ' (you)' : ''}</Typography>
                  <Typography variant="caption" color="text.secondary">{u.email}</Typography>
                </Box>
              ),
            },
            { key: 'role', label: 'Role', render: (u) => <Chip size="small" label={humanize(u.role)} /> },
            { key: 'title', label: 'Title', hideOnMobile: true },
            { key: 'department', label: 'Department', hideOnMobile: true },
            { key: 'is_active', label: 'Status', render: (u) => <StatusChip value={u.is_active ? 'active' : 'cancelled'} /> },
          ]}
          actions={(u) => (
            <RowActions
              label={u.name}
              editAction="manage_users"
              deleteAction="manage_users"
              onEdit={() => crud.openEdit(u)}
              onDelete={u.id === me.id ? undefined : () => crud.askDelete(u)}
            />
          )}
        />
      </LoadState>
      <FormDialog
        open={crud.form.open}
        title={isEdit ? 'Edit user' : 'New user'}
        fields={userFields(isEdit)}
        initialValues={crud.form.editing || crud.form.defaults}
        onSubmit={crud.submit}
        onClose={crud.closeForm}
      />
      <ConfirmDialog
        open={Boolean(crud.toDelete)}
        title="Delete user?"
        message={`${crud.toDelete?.name} will lose access. Consider deactivating instead to keep their history.`}
        onConfirm={crud.confirmDelete}
        onClose={crud.cancelDelete}
      />
    </>
  );
}
