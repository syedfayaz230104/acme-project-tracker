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
import { projectsApi } from '../services/resources';
import {
  formatCurrency, formatDate, PRIORITIES, PROJECT_STATUSES, RISK_LEVELS, todayIso,
} from '../utils/format';
import { projectFields } from './fields';

const FILTERS = [
  { name: 'status', label: 'Status', options: PROJECT_STATUSES },
  { name: 'priority', label: 'Priority', options: PRIORITIES },
  { name: 'risk', label: 'Risk', options: RISK_LEVELS },
];

/** Project list with search, filters (synced to the URL) and CRUD dialogs. */
export default function ProjectsPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') || '');
  const q = useDebounce(search);
  const filters = Object.fromEntries(FILTERS.map((f) => [f.name, params.get(f.name) || '']));
  const filterKey = JSON.stringify(filters);

  const {
    data, loading, error, reload,
  } = useApi(() => projectsApi.list({ ...JSON.parse(filterKey), q }), [filterKey, q]);
  const { userOptions } = useLookups();
  const crud = useCrud(projectsApi, 'Project', reload);
  const fields = useMemo(() => projectFields(userOptions), [userOptions]);

  const setFilter = (name, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value); else next.delete(name);
    setParams(next, { replace: true });
  };

  const columns = [
    {
      key: 'name',
      label: 'Project',
      primary: true,
      render: (p) => (
        <Box>
          <Typography sx={{ fontWeight: 600 }}>{p.name}</Typography>
          <Typography variant="caption" color="text.secondary">{p.department || '—'}</Typography>
        </Box>
      ),
    },
    { key: 'status', label: 'Status', render: (p) => <StatusChip value={p.status} /> },
    { key: 'risk_level', label: 'Risk', render: (p) => <StatusChip value={p.risk_level} /> },
    { key: 'priority', label: 'Priority', render: (p) => <StatusChip value={p.priority} variant="outlined" />, hideOnMobile: true },
    { key: 'manager_name', label: 'Manager', hideOnMobile: true },
    { key: 'progress', label: 'Progress', render: (p) => <ProgressBar value={p.progress} /> },
    {
      key: 'budget',
      label: 'Budget used',
      render: (p) => <ProgressBar value={p.budget_used_pct} label={formatCurrency(p.budget_spent)} warnAt={85} />,
    },
    { key: 'end_date', label: 'End date', render: (p) => formatDate(p.end_date) },
  ];

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="Status, risk, progress and budget across the portfolio"
        actions={can('create') && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => crud.openCreate({
              status: 'planning', priority: 'medium', start_date: todayIso(), budget_planned: 0,
            })}
          >
            New project
          </Button>
        )}
      />
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search projects"
        filters={FILTERS}
        values={filters}
        onChange={setFilter}
        onClear={() => { setSearch(''); setParams({}, { replace: true }); }}
      />
      <LoadState
        loading={loading && !data}
        error={error}
        onRetry={reload}
        empty={data?.length === 0}
        emptyMessage="No projects match your filters."
      >
        <DataView
          ariaLabel="Projects"
          columns={columns}
          rows={data || []}
          onRowClick={(p) => navigate(`/projects/${p.id}`)}
          actions={(p) => (
            <RowActions label={p.name} onEdit={() => crud.openEdit(p)} onDelete={() => crud.askDelete(p)} />
          )}
        />
      </LoadState>

      <FormDialog
        open={crud.form.open}
        title={crud.form.editing ? 'Edit project' : 'New project'}
        fields={fields}
        initialValues={crud.form.editing || crud.form.defaults}
        onSubmit={crud.submit}
        onClose={crud.closeForm}
      />
      <ConfirmDialog
        open={Boolean(crud.toDelete)}
        title="Delete project?"
        message={`"${crud.toDelete?.name}" and all its deliverables, allocations and budget entries will be permanently deleted.`}
        onConfirm={crud.confirmDelete}
        onClose={crud.cancelDelete}
      />
    </>
  );
}
