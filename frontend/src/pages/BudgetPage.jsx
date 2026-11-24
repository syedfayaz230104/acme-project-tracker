import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Button, Card, CardContent, CardHeader, Grid, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import PageHeader from '../components/PageHeader';
import DataView from '../components/DataView';
import FilterBar from '../components/FilterBar';
import LoadState from '../components/LoadState';
import ProgressBar from '../components/ProgressBar';
import StatusChip from '../components/StatusChip';
import FormDialog from '../components/FormDialog';
import ConfirmDialog from '../components/ConfirmDialog';
import RowActions from '../components/RowActions';
import useApi from '../hooks/useApi';
import useCrud from '../hooks/useCrud';
import useDebounce from '../hooks/useDebounce';
import useLookups from '../hooks/useLookups';
import { useAuth } from '../context/AuthContext';
import { budgetApi, projectsApi } from '../services/resources';
import {
  BUDGET_CATEGORIES, formatCurrency, formatDate, humanize, todayIso,
} from '../utils/format';
import { budgetFields } from './fields';

const EMPTY_FILTERS = {
  project_id: '', category: '', from: '', to: '',
};

/** Budget consumed vs planned per project, plus the ledger of spend entries. */
export default function BudgetPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [search, setSearch] = useState('');
  const q = useDebounce(search);
  const { projectOptions } = useLookups();

  const projects = useApi(() => projectsApi.list(), []);
  const entries = useApi(() => budgetApi.list({ ...filters, q }), [JSON.stringify(filters), q]);
  const crud = useCrud(budgetApi, 'Budget entry', () => {
    entries.reload();
    projects.reload();
  });
  const fields = useMemo(() => budgetFields(projectOptions), [projectOptions]);

  const filteredTotal = (entries.data || []).reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <>
      <PageHeader
        title="Budget"
        subtitle="Planned budget versus actual spend"
        actions={can('create') && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => crud.openCreate({ category: 'labor', entry_date: todayIso(), project_id: Number(filters.project_id) || '' })}
          >
            Record spend
          </Button>
        )}
      />

      <Card sx={{ mb: 3 }}>
        <CardHeader title="Consumption by project" />
        <CardContent sx={{ pt: 0 }}>
          <LoadState loading={projects.loading && !projects.data} error={projects.error} onRetry={projects.reload}>
            <Grid container spacing={2}>
              {(projects.data || []).map((p) => (
                <Grid key={p.id} size={{ xs: 12, sm: 6, lg: 4 }}>
                  <Box
                    sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 2, cursor: 'pointer' }}
                    onClick={() => navigate(`/projects/${p.id}`)}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 1 }}>
                      <Typography sx={{ fontWeight: 600 }}>{p.name}</Typography>
                      <StatusChip value={p.status} />
                    </Box>
                    <ProgressBar value={p.budget_used_pct} warnAt={85} label={`${formatCurrency(p.budget_spent)} of ${formatCurrency(p.budget_planned)}`} />
                    <Typography variant="caption" color={p.budget_remaining < 0 ? 'error' : 'text.secondary'}>
                      {p.budget_remaining < 0
                        ? `${formatCurrency(-p.budget_remaining)} over budget`
                        : `${formatCurrency(p.budget_remaining)} remaining`}
                    </Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
          </LoadState>
        </CardContent>
      </Card>

      <Typography variant="h6" sx={{ mb: 1 }}>Spend entries</Typography>
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search descriptions"
        filters={[
          { name: 'project_id', label: 'Project', options: projectOptions },
          { name: 'category', label: 'Category', options: BUDGET_CATEGORIES },
          { name: 'from', label: 'From', type: 'date' },
          { name: 'to', label: 'To', type: 'date' },
        ]}
        values={filters}
        onChange={(name, value) => setFilters((f) => ({ ...f, [name]: value }))}
        onClear={() => { setSearch(''); setFilters(EMPTY_FILTERS); }}
      />
      <LoadState
        loading={entries.loading && !entries.data}
        error={entries.error}
        onRetry={entries.reload}
        empty={entries.data?.length === 0}
        emptyMessage="No spend entries match your filters."
      >
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {entries.data?.length} entries · total {formatCurrency(filteredTotal)}
        </Typography>
        <DataView
          ariaLabel="Budget entries"
          rows={entries.data || []}
          columns={[
            { key: 'description', label: 'Description', primary: true, render: (e) => e.description || humanize(e.category) },
            { key: 'project_name', label: 'Project' },
            { key: 'category', label: 'Category', render: (e) => humanize(e.category) },
            { key: 'amount', label: 'Amount', align: 'right', render: (e) => formatCurrency(e.amount) },
            { key: 'entry_date', label: 'Date', render: (e) => formatDate(e.entry_date) },
            { key: 'created_by_name', label: 'Recorded by', hideOnMobile: true },
          ]}
          actions={(e) => (
            <RowActions label={e.description || 'entry'} onEdit={() => crud.openEdit(e)} onDelete={() => crud.askDelete(e)} />
          )}
        />
      </LoadState>

      <FormDialog
        open={crud.form.open}
        title={crud.form.editing ? 'Edit spend' : 'Record spend'}
        fields={fields}
        initialValues={crud.form.editing || crud.form.defaults}
        onSubmit={crud.submit}
        onClose={crud.closeForm}
      />
      <ConfirmDialog
        open={Boolean(crud.toDelete)}
        title="Delete spend entry?"
        message={`${formatCurrency(crud.toDelete?.amount)} on ${crud.toDelete?.project_name} will be removed.`}
        onConfirm={crud.confirmDelete}
        onClose={crud.cancelDelete}
      />
    </>
  );
}
