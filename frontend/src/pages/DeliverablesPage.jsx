import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Button, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import PageHeader from '../components/PageHeader';
import FilterBar from '../components/FilterBar';
import DataView from '../components/DataView';
import LoadState from '../components/LoadState';
import StatusChip from '../components/StatusChip';
import ProgressBar from '../components/ProgressBar';
import FormDialog from '../components/FormDialog';
import ConfirmDialog from '../components/ConfirmDialog';
import RowActions from '../components/RowActions';
import useApi from '../hooks/useApi';
import useCrud from '../hooks/useCrud';
import useDebounce from '../hooks/useDebounce';
import useLookups from '../hooks/useLookups';
import { useAuth } from '../context/AuthContext';
import { deliverablesApi } from '../services/resources';
import { DELIVERABLE_STATUSES, formatDate } from '../utils/format';
import { deliverableFields } from './fields';

/** All deliverables across projects with search, filters and CRUD. */
export default function DeliverablesPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const q = useDebounce(search);
  const { projectOptions, userOptions } = useLookups();

  const filterDefs = useMemo(() => [
    { name: 'project_id', label: 'Project', options: projectOptions },
    { name: 'status', label: 'Status', options: DELIVERABLE_STATUSES },
    { name: 'owner_id', label: 'Owner', options: userOptions },
    { name: 'overdue', label: 'Due', options: [{ value: 'true', label: 'Overdue only' }] },
  ], [projectOptions, userOptions]);
  const filters = Object.fromEntries(filterDefs.map((f) => [f.name, params.get(f.name) || '']));
  const filterKey = JSON.stringify(filters);

  const {
    data, loading, error, reload,
  } = useApi(() => deliverablesApi.list({ ...JSON.parse(filterKey), q }), [filterKey, q]);
  const crud = useCrud(deliverablesApi, 'Deliverable', reload);

  // Dependencies limited to the same project for a clearer picker.
  const editingProject = crud.form.editing?.project_id ?? crud.form.defaults?.project_id;
  const all = useApi(() => deliverablesApi.list(), [crud.form.open]);
  const dependencyOptions = (all.data || [])
    .filter((d) => d.id !== crud.form.editing?.id && (!editingProject || d.project_id === editingProject))
    .map((d) => ({ value: d.id, label: `${d.title} (${d.project_name})` }));

  const setFilter = (name, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value); else next.delete(name);
    setParams(next, { replace: true });
  };

  const columns = [
    {
      key: 'title',
      label: 'Deliverable',
      primary: true,
      render: (d) => (
        <Box>
          <Typography sx={{ fontWeight: 600 }}>{d.title}</Typography>
          <Typography variant="caption" color="text.secondary">{d.project_name}</Typography>
        </Box>
      ),
    },
    { key: 'status', label: 'Status', render: (d) => <StatusChip value={d.status} /> },
    { key: 'progress', label: 'Progress', render: (d) => <ProgressBar value={d.progress} /> },
    { key: 'owner_name', label: 'Owner', hideOnMobile: true },
    {
      key: 'due_date',
      label: 'Due',
      render: (d) => (
        <Typography variant="body2" color={d.is_overdue ? 'error' : 'inherit'}>
          {formatDate(d.due_date)}{d.is_overdue ? ' · overdue' : ''}
        </Typography>
      ),
    },
    {
      key: 'open_dependencies',
      label: 'Waiting on',
      render: (d) => (d.open_dependencies ? `${d.open_dependencies} open` : '—'),
    },
  ];

  return (
    <>
      <PageHeader
        title="Deliverables"
        subtitle="Key deliverables, their completion status and dependencies"
        actions={can('create') && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => crud.openCreate({
              status: 'not_started', progress: 0, depends_on: [], project_id: Number(filters.project_id) || '',
            })}
          >
            New deliverable
          </Button>
        )}
      />
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search deliverables"
        filters={filterDefs}
        values={filters}
        onChange={setFilter}
        onClear={() => { setSearch(''); setParams({}, { replace: true }); }}
      />
      <LoadState
        loading={loading && !data}
        error={error}
        onRetry={reload}
        empty={data?.length === 0}
        emptyMessage="No deliverables match your filters."
      >
        <DataView
          ariaLabel="Deliverables"
          columns={columns}
          rows={data || []}
          onRowClick={(d) => navigate(`/deliverables/${d.id}`)}
          actions={(d) => (
            <RowActions label={d.title} onEdit={() => crud.openEdit(d)} onDelete={() => crud.askDelete(d)} />
          )}
        />
      </LoadState>
      <FormDialog
        open={crud.form.open}
        title={crud.form.editing ? 'Edit deliverable' : 'New deliverable'}
        fields={deliverableFields(projectOptions, userOptions, dependencyOptions)}
        initialValues={crud.form.editing || crud.form.defaults}
        onSubmit={crud.submit}
        onClose={crud.closeForm}
      />
      <ConfirmDialog
        open={Boolean(crud.toDelete)}
        title="Delete deliverable?"
        message={`"${crud.toDelete?.title}" will be deleted, and removed from any dependency chains.`}
        onConfirm={crud.confirmDelete}
        onClose={crud.cancelDelete}
      />
    </>
  );
}
