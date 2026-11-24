import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Box, Breadcrumbs, Button, Card, CardContent, Grid, Link, Stack, Tab, Tabs, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/EditOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutlined';
import PageHeader from '../components/PageHeader';
import LoadState from '../components/LoadState';
import StatusChip from '../components/StatusChip';
import ProgressBar from '../components/ProgressBar';
import DataView from '../components/DataView';
import FormDialog from '../components/FormDialog';
import ConfirmDialog from '../components/ConfirmDialog';
import RowActions from '../components/RowActions';
import useApi from '../hooks/useApi';
import useCrud from '../hooks/useCrud';
import useLookups from '../hooks/useLookups';
import { useAuth } from '../context/AuthContext';
import {
  allocationsApi, budgetApi, deliverablesApi, projectsApi,
} from '../services/resources';
import { formatCurrency, formatDate, humanize, todayIso } from '../utils/format';
import {
  allocationFields, budgetFields, deliverableFields, projectFields,
} from './fields';

/** Small labelled value used in the project summary. */
function Fact({ label, children }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Box sx={{ fontWeight: 600 }}>{children}</Box>
    </Box>
  );
}

Fact.propTypes = { label: PropTypes.string.isRequired, children: PropTypes.node };

/**
 * One project: health summary plus tabs for its deliverables, team allocations
 * and budget entries, each with inline CRUD.
 */
export default function ProjectDetailPage() {
  const { id } = useParams();
  const projectId = Number(id);
  const navigate = useNavigate();
  const { can } = useAuth();
  const [tab, setTab] = useState(0);

  const project = useApi(() => projectsApi.get(projectId), [projectId]);
  const deliverables = useApi(() => deliverablesApi.list({ project_id: projectId }), [projectId]);
  const allocations = useApi(() => allocationsApi.list({ project_id: projectId }), [projectId]);
  const budget = useApi(() => budgetApi.list({ project_id: projectId }), [projectId]);
  const { projectOptions, userOptions } = useLookups();

  const reloadAll = () => {
    project.reload();
    deliverables.reload();
    allocations.reload();
    budget.reload();
  };

  const projectCrud = useCrud(projectsApi, 'Project', (saved) => (saved ? project.reload() : navigate('/projects')));
  const deliverableCrud = useCrud(deliverablesApi, 'Deliverable', reloadAll);
  const allocationCrud = useCrud(allocationsApi, 'Allocation', reloadAll);
  const budgetCrud = useCrud(budgetApi, 'Budget entry', reloadAll);

  const deliverableOptions = useMemo(
    () => (deliverables.data || [])
      .filter((d) => d.id !== deliverableCrud.form.editing?.id)
      .map((d) => ({ value: d.id, label: d.title })),
    [deliverables.data, deliverableCrud.form.editing],
  );

  const p = project.data;
  const titleById = Object.fromEntries((deliverables.data || []).map((d) => [d.id, d.title]));

  return (
    <LoadState loading={project.loading && !p} error={project.error} onRetry={project.reload}>
      {p && (
        <>
          <Breadcrumbs sx={{ mb: 1 }}>
            <Link component={RouterLink} to="/projects" underline="hover">Projects</Link>
            <Typography color="text.primary">{p.name}</Typography>
          </Breadcrumbs>
          <PageHeader
            title={p.name}
            subtitle={p.description}
            actions={(
              <>
                {can('update') && (
                  <Button variant="outlined" startIcon={<EditIcon />} onClick={() => projectCrud.openEdit(p)}>Edit</Button>
                )}
                {can('delete') && (
                  <Button color="error" variant="outlined" startIcon={<DeleteIcon />} onClick={() => projectCrud.askDelete(p)}>
                    Delete
                  </Button>
                )}
              </>
            )}
          />

          {p.risk_reasons.length > 0 && (
            <Alert severity={p.risk_level === 'off_track' ? 'error' : 'warning'} sx={{ mb: 2 }}>
              <strong>{humanize(p.risk_level)}:</strong> {p.risk_reasons.join(' · ')}
            </Alert>
          )}

          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Grid container spacing={2}>
                <Grid size={{ xs: 6, sm: 4, md: 2 }}><Fact label="Status"><StatusChip value={p.status} /></Fact></Grid>
                <Grid size={{ xs: 6, sm: 4, md: 2 }}><Fact label="Risk"><StatusChip value={p.risk_level} /></Fact></Grid>
                <Grid size={{ xs: 6, sm: 4, md: 2 }}><Fact label="Priority"><StatusChip value={p.priority} variant="outlined" /></Fact></Grid>
                <Grid size={{ xs: 6, sm: 4, md: 2 }}><Fact label="Manager">{p.manager_name || '—'}</Fact></Grid>
                <Grid size={{ xs: 6, sm: 4, md: 2 }}><Fact label="Department">{p.department || '—'}</Fact></Grid>
                <Grid size={{ xs: 6, sm: 4, md: 2 }}><Fact label="Team size">{p.team_size}</Fact></Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <ProgressBar value={p.progress} label={`Progress · ${p.deliverables_completed}/${p.deliverables_total} deliverables`} />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <ProgressBar value={p.schedule_elapsed_pct} label={`Schedule · ${formatDate(p.start_date)} → ${formatDate(p.end_date)}`} />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <ProgressBar
                    value={p.budget_used_pct}
                    warnAt={85}
                    label={`Budget · ${formatCurrency(p.budget_spent)} of ${formatCurrency(p.budget_planned)}`}
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
            <Tabs value={tab} onChange={(_e, v) => setTab(v)} variant="scrollable" allowScrollButtonsMobile>
              <Tab label={`Deliverables (${deliverables.data?.length ?? 0})`} />
              <Tab label={`Team (${allocations.data?.length ?? 0})`} />
              <Tab label={`Budget (${budget.data?.length ?? 0})`} />
            </Tabs>
          </Box>

          {tab === 0 && (
            <Section
              addLabel="Add deliverable"
              onAdd={() => deliverableCrud.openCreate({
                project_id: projectId, status: 'not_started', progress: 0, depends_on: [],
              })}
              state={deliverables}
              empty="No deliverables yet."
            >
              <DataView
                ariaLabel="Deliverables"
                rows={deliverables.data || []}
                onRowClick={(d) => navigate(`/deliverables/${d.id}`)}
                columns={[
                  { key: 'title', label: 'Deliverable', primary: true },
                  { key: 'status', label: 'Status', render: (d) => <StatusChip value={d.status} /> },
                  { key: 'progress', label: 'Progress', render: (d) => <ProgressBar value={d.progress} /> },
                  { key: 'owner_name', label: 'Owner' },
                  {
                    key: 'due_date',
                    label: 'Due',
                    render: (d) => (
                      <Typography variant="body2" color={d.is_overdue ? 'error' : 'inherit'}>
                        {formatDate(d.due_date)}{d.is_overdue ? ' (overdue)' : ''}
                      </Typography>
                    ),
                  },
                  {
                    key: 'depends_on',
                    label: 'Depends on',
                    hideOnMobile: true,
                    render: (d) => (d.depends_on.length ? d.depends_on.map((x) => titleById[x] || `#${x}`).join(', ') : '—'),
                  },
                ]}
                actions={(d) => (
                  <RowActions label={d.title} onEdit={() => deliverableCrud.openEdit(d)} onDelete={() => deliverableCrud.askDelete(d)} />
                )}
              />
            </Section>
          )}

          {tab === 1 && (
            <Section
              addLabel="Allocate person"
              onAdd={() => allocationCrud.openCreate({
                project_id: projectId, start_date: p.start_date, end_date: p.end_date, allocation_pct: 50,
              })}
              state={allocations}
              empty="Nobody is allocated to this project yet."
            >
              <DataView
                ariaLabel="Team allocations"
                rows={allocations.data || []}
                columns={[
                  { key: 'user_name', label: 'Person', primary: true },
                  { key: 'role', label: 'Role' },
                  { key: 'allocation_pct', label: 'Allocation', render: (a) => `${a.allocation_pct}%` },
                  { key: 'period', label: 'Period', render: (a) => `${formatDate(a.start_date)} → ${formatDate(a.end_date)}` },
                ]}
                actions={(a) => (
                  <RowActions label={a.user_name} onEdit={() => allocationCrud.openEdit(a)} onDelete={() => allocationCrud.askDelete(a)} />
                )}
              />
            </Section>
          )}

          {tab === 2 && (
            <Section
              addLabel="Record spend"
              onAdd={() => budgetCrud.openCreate({ project_id: projectId, category: 'labor', entry_date: todayIso() })}
              state={budget}
              empty="No spend recorded yet."
            >
              <DataView
                ariaLabel="Budget entries"
                rows={budget.data || []}
                columns={[
                  { key: 'description', label: 'Description', primary: true },
                  { key: 'category', label: 'Category', render: (b) => humanize(b.category) },
                  { key: 'amount', label: 'Amount', align: 'right', render: (b) => formatCurrency(b.amount) },
                  { key: 'entry_date', label: 'Date', render: (b) => formatDate(b.entry_date) },
                ]}
                actions={(b) => (
                  <RowActions label={b.description || 'entry'} onEdit={() => budgetCrud.openEdit(b)} onDelete={() => budgetCrud.askDelete(b)} />
                )}
              />
            </Section>
          )}

          <FormDialog
            open={projectCrud.form.open}
            title="Edit project"
            fields={projectFields(userOptions)}
            initialValues={projectCrud.form.editing}
            onSubmit={projectCrud.submit}
            onClose={projectCrud.closeForm}
          />
          <FormDialog
            open={deliverableCrud.form.open}
            title={deliverableCrud.form.editing ? 'Edit deliverable' : 'New deliverable'}
            fields={deliverableFields(projectOptions, userOptions, deliverableOptions)}
            initialValues={deliverableCrud.form.editing || deliverableCrud.form.defaults}
            onSubmit={deliverableCrud.submit}
            onClose={deliverableCrud.closeForm}
          />
          <FormDialog
            open={allocationCrud.form.open}
            title={allocationCrud.form.editing ? 'Edit allocation' : 'Allocate person'}
            fields={allocationFields(projectOptions, userOptions)}
            initialValues={allocationCrud.form.editing || allocationCrud.form.defaults}
            onSubmit={allocationCrud.submit}
            onClose={allocationCrud.closeForm}
          />
          <FormDialog
            open={budgetCrud.form.open}
            title={budgetCrud.form.editing ? 'Edit spend' : 'Record spend'}
            fields={budgetFields(projectOptions)}
            initialValues={budgetCrud.form.editing || budgetCrud.form.defaults}
            onSubmit={budgetCrud.submit}
            onClose={budgetCrud.closeForm}
          />
          {[
            [projectCrud, 'project', `"${p.name}" and everything in it will be permanently deleted.`],
            [deliverableCrud, 'deliverable', `"${deliverableCrud.toDelete?.title}" will be deleted.`],
            [allocationCrud, 'allocation', `Remove ${allocationCrud.toDelete?.user_name} from this project?`],
            [budgetCrud, 'budget entry', 'This spend entry will be deleted.'],
          ].map(([c, name, message]) => (
            <ConfirmDialog
              key={name}
              open={Boolean(c.toDelete)}
              title={`Delete ${name}?`}
              message={message}
              onConfirm={c.confirmDelete}
              onClose={c.cancelDelete}
            />
          ))}
        </>
      )}
    </LoadState>
  );
}

/** Tab body: optional add button plus loading/empty handling around a list. */
function Section({
  addLabel, onAdd, state, empty, children,
}) {
  const { can } = useAuth();
  return (
    <Stack spacing={2}>
      {can('create') && (
        <Box><Button startIcon={<AddIcon />} variant="contained" onClick={onAdd}>{addLabel}</Button></Box>
      )}
      <LoadState
        loading={state.loading && !state.data}
        error={state.error}
        onRetry={state.reload}
        empty={state.data?.length === 0}
        emptyMessage={empty}
      >
        {children}
      </LoadState>
    </Stack>
  );
}

Section.propTypes = {
  addLabel: PropTypes.string.isRequired,
  onAdd: PropTypes.func.isRequired,
  state: PropTypes.shape({
    data: PropTypes.array, loading: PropTypes.bool, error: PropTypes.instanceOf(Error), reload: PropTypes.func,
  }).isRequired,
  empty: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
};
