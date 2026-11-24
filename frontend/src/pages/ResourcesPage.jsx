import { useMemo, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, CardHeader, Chip, Stack, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import PageHeader from '../components/PageHeader';
import DataView from '../components/DataView';
import FilterBar from '../components/FilterBar';
import LoadState from '../components/LoadState';
import ProgressBar from '../components/ProgressBar';
import FormDialog from '../components/FormDialog';
import ConfirmDialog from '../components/ConfirmDialog';
import RowActions from '../components/RowActions';
import useApi from '../hooks/useApi';
import useCrud from '../hooks/useCrud';
import useLookups from '../hooks/useLookups';
import { useAuth } from '../context/AuthContext';
import { allocationsApi } from '../services/resources';
import { formatDate, todayIso } from '../utils/format';
import { allocationFields } from './fields';

/**
 * Resource allocation: per-person utilisation on a chosen date (highlighting
 * over-allocation) and the full list of allocations with CRUD.
 */
export default function ResourcesPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState(0);
  const [onDate, setOnDate] = useState(todayIso());
  const [filters, setFilters] = useState({ project_id: '', user_id: '', active: '' });
  const { projectOptions, userOptions } = useLookups();

  const utilisation = useApi(() => allocationsApi.utilisation(onDate || undefined), [onDate]);
  const allocations = useApi(() => allocationsApi.list(filters), [JSON.stringify(filters)]);
  const reloadAll = () => {
    utilisation.reload();
    allocations.reload();
  };
  const crud = useCrud(allocationsApi, 'Allocation', reloadAll);
  const fields = useMemo(() => allocationFields(projectOptions, userOptions), [projectOptions, userOptions]);

  const overAllocated = (utilisation.data || []).filter((u) => u.over_allocated);

  return (
    <>
      <PageHeader
        title="Resources"
        subtitle="Who is working on what, and who is over-allocated"
        actions={can('create') && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => crud.openCreate({ allocation_pct: 50, start_date: todayIso() })}>
            New allocation
          </Button>
        )}
      />
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={tab} onChange={(_e, v) => setTab(v)}>
          <Tab label="Utilisation" />
          <Tab label="Allocations" />
        </Tabs>
      </Box>

      {tab === 0 && (
        <Stack spacing={2}>
          <TextField
            type="date"
            label="Utilisation on"
            size="small"
            value={onDate}
            onChange={(e) => setOnDate(e.target.value)}
            sx={{ maxWidth: 220, bgcolor: 'background.paper' }}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          {overAllocated.length > 0 && (
            <Alert severity="error">
              {overAllocated.length} {overAllocated.length === 1 ? 'person is' : 'people are'} allocated above 100%:{' '}
              {overAllocated.map((u) => `${u.user_name} (${u.total_pct}%)`).join(', ')}
            </Alert>
          )}
          <LoadState loading={utilisation.loading && !utilisation.data} error={utilisation.error} onRetry={utilisation.reload}>
            <Stack spacing={1.5}>
              {(utilisation.data || []).map((u) => (
                <Card key={u.user_id} sx={{ borderColor: u.over_allocated ? 'error.main' : undefined }}>
                  <CardHeader
                    sx={{ pb: 0 }}
                    title={u.user_name}
                    subheader={[u.title, u.department].filter(Boolean).join(' · ')}
                    action={u.over_allocated && <Chip color="error" label="Over-allocated" size="small" sx={{ mt: 1, mr: 1 }} />}
                  />
                  <CardContent>
                    <ProgressBar value={u.total_pct} label={`${u.project_count} active allocation(s)`} warnAt={90} />
                    {u.allocations.length > 0 && (
                      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1, mt: 1.5 }}>
                        {u.allocations.map((a) => (
                          <Chip
                            key={a.allocation_id}
                            size="small"
                            variant="outlined"
                            label={`${a.project_name}: ${a.allocation_pct}%${a.role ? ` · ${a.role}` : ''}`}
                          />
                        ))}
                      </Stack>
                    )}
                  </CardContent>
                </Card>
              ))}
            </Stack>
          </LoadState>
        </Stack>
      )}

      {tab === 1 && (
        <>
          <FilterBar
            filters={[
              { name: 'project_id', label: 'Project', options: projectOptions },
              { name: 'user_id', label: 'Person', options: userOptions },
              { name: 'active', label: 'Period', options: [{ value: 'true', label: 'Active today' }, { value: 'false', label: 'Not active' }] },
            ]}
            values={filters}
            onChange={(name, value) => setFilters((f) => ({ ...f, [name]: value }))}
            onClear={() => setFilters({ project_id: '', user_id: '', active: '' })}
          />
          <LoadState
            loading={allocations.loading && !allocations.data}
            error={allocations.error}
            onRetry={allocations.reload}
            empty={allocations.data?.length === 0}
            emptyMessage="No allocations match your filters."
          >
            <DataView
              ariaLabel="Allocations"
              rows={allocations.data || []}
              columns={[
                { key: 'user_name', label: 'Person', primary: true },
                { key: 'project_name', label: 'Project' },
                { key: 'role', label: 'Role', hideOnMobile: true },
                { key: 'allocation_pct', label: 'Allocation', render: (a) => `${a.allocation_pct}%` },
                {
                  key: 'period',
                  label: 'Period',
                  render: (a) => (
                    <Typography variant="body2">{formatDate(a.start_date)} → {formatDate(a.end_date)}</Typography>
                  ),
                },
              ]}
              actions={(a) => (
                <RowActions label={`${a.user_name} on ${a.project_name}`} onEdit={() => crud.openEdit(a)} onDelete={() => crud.askDelete(a)} />
              )}
            />
          </LoadState>
        </>
      )}

      <FormDialog
        open={crud.form.open}
        title={crud.form.editing ? 'Edit allocation' : 'New allocation'}
        fields={fields}
        initialValues={crud.form.editing || crud.form.defaults}
        onSubmit={crud.submit}
        onClose={crud.closeForm}
      />
      <ConfirmDialog
        open={Boolean(crud.toDelete)}
        title="Delete allocation?"
        message={`Remove ${crud.toDelete?.user_name} from ${crud.toDelete?.project_name}?`}
        onConfirm={crud.confirmDelete}
        onClose={crud.cancelDelete}
      />
    </>
  );
}
