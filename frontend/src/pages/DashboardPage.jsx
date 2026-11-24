import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Card, CardContent, CardHeader, Chip, Grid, List, ListItem, ListItemButton, ListItemText, Stack,
  Typography,
} from '@mui/material';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import StatusChip from '../components/StatusChip';
import ProgressBar from '../components/ProgressBar';
import LoadState from '../components/LoadState';
import useApi from '../hooks/useApi';
import { dashboardApi } from '../services/resources';
import { formatCurrency, formatDate, humanize } from '../utils/format';

/**
 * Portfolio overview answering the key business questions: project status, deadline
 * risk, resource allocation, deliverable progress, over-allocation, dependency
 * blockers and budget consumption.
 */
export default function DashboardPage() {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi(() => dashboardApi.get(), []);

  return (
    <>
      <PageHeader title="Dashboard" subtitle={data ? `Portfolio health as of ${formatDate(data.as_of)}` : undefined} />
      <LoadState loading={loading && !data} error={error} onRetry={reload}>
        {data && <DashboardContent data={data} navigate={navigate} />}
      </LoadState>
    </>
  );
}

/** Dashboard body rendered once data has loaded. */
function DashboardContent({ data, navigate }) {
  const { totals, budget } = data;
  const budgetPct = budget.planned ? Math.round((budget.spent * 100) / budget.planned) : null;

  return (
    <Stack spacing={3}>
      <Grid container spacing={2}>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatCard label="Active projects" value={totals.active_projects} hint={`${totals.projects} total`}
            onClick={() => navigate('/projects?status=active')} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatCard label="At risk / off track" value={totals.at_risk + totals.off_track}
            tone={totals.at_risk + totals.off_track ? 'warning.main' : 'success.main'}
            hint={`${totals.off_track} off track`} onClick={() => navigate('/projects?risk=at_risk')} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatCard label="Over-allocated people" value={totals.over_allocated_people}
            tone={totals.over_allocated_people ? 'error.main' : 'success.main'} hint="> 100% allocated today"
            onClick={() => navigate('/resources')} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatCard label="Overdue deliverables" value={totals.overdue_deliverables}
            tone={totals.overdue_deliverables ? 'error.main' : 'success.main'}
            onClick={() => navigate('/deliverables?overdue=true')} />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Card sx={{ height: '100%' }}>
            <CardHeader title="Projects needing attention" subheader="Deadline, schedule or budget risk" />
            <CardContent sx={{ pt: 0 }}>
              {data.at_risk_projects.length === 0 ? (
                <Alert severity="success">All open projects are on track.</Alert>
              ) : (
                <List disablePadding>
                  {data.at_risk_projects.map((p) => (
                    <ListItem key={p.id} disablePadding divider>
                      <ListItemButton onClick={() => navigate(`/projects/${p.id}`)} sx={{ px: 1 }}>
                        <ListItemText
                          primary={(
                            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                              <Typography sx={{ fontWeight: 600 }}>{p.name}</Typography>
                              <StatusChip value={p.risk_level} />
                            </Box>
                          )}
                          secondary={`${p.risk_reasons.join(' · ')} — due ${formatDate(p.end_date)}`}
                        />
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, lg: 5 }}>
          <Card sx={{ height: '100%' }}>
            <CardHeader title="Budget" subheader="Open projects: spent vs planned" />
            <CardContent sx={{ pt: 0 }}>
              <Typography variant="h5">
                {formatCurrency(budget.spent)}
                <Typography component="span" color="text.secondary"> of {formatCurrency(budget.planned)}</Typography>
              </Typography>
              <Box sx={{ my: 2 }}><ProgressBar value={budgetPct} label="Overall consumed" warnAt={85} /></Box>
              <Stack spacing={1.5}>
                {budget.by_project.map((p) => (
                  <ProgressBar key={p.id} value={p.used_pct} label={`${p.name} · ${formatCurrency(p.spent)}`} warnAt={85} />
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card>
        <CardHeader title="Project status" />
        <CardContent sx={{ pt: 0 }}>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1, mb: 2 }}>
            {Object.entries(data.status_counts).map(([status, count]) => (
              <Chip key={status} label={`${humanize(status)}: ${count}`} onClick={() => navigate(`/projects?status=${status}`)} />
            ))}
          </Stack>
          <Grid container spacing={2}>
            {data.projects.map((p) => (
              <Grid key={p.id} size={{ xs: 12, sm: 6, xl: 4 }}>
                <Card variant="outlined" sx={{ cursor: 'pointer', height: '100%' }} onClick={() => navigate(`/projects/${p.id}`)}>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 1 }}>
                      <Typography sx={{ fontWeight: 600 }}>{p.name}</Typography>
                      <StatusChip value={p.status} />
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                      {p.manager_name || 'No manager'} · ends {formatDate(p.end_date)}
                    </Typography>
                    <Stack spacing={1}>
                      <ProgressBar value={p.progress} label={`Progress (${p.deliverables_completed}/${p.deliverables_total} done)`} />
                      <ProgressBar value={p.schedule_elapsed_pct} label="Schedule elapsed" />
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ height: '100%' }}>
            <CardHeader title="Resource allocation" subheader="Current load per person" />
            <CardContent sx={{ pt: 0 }}>
              <Stack spacing={1.5}>
                {data.utilisation.filter((u) => u.total_pct > 0).map((u) => (
                  <Box key={u.user_id}>
                    <ProgressBar
                      value={u.total_pct}
                      label={`${u.user_name} · ${u.project_count} project${u.project_count === 1 ? '' : 's'}`}
                      warnAt={90}
                    />
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ height: '100%' }}>
            <CardHeader title="Blocked by dependencies" subheader="Deliverables waiting on unfinished work" />
            <CardContent sx={{ pt: 0 }}>
              {data.blocked_by_dependencies.length === 0 ? (
                <Typography color="text.secondary">No deliverables are waiting on dependencies.</Typography>
              ) : (
                <List disablePadding dense>
                  {data.blocked_by_dependencies.map((d) => (
                    <ListItem key={d.id} disablePadding divider>
                      <ListItemButton onClick={() => navigate(`/deliverables/${d.id}`)} sx={{ px: 1 }}>
                        <ListItemText
                          primary={`${d.title} (${d.project_name})`}
                          secondary={`Waiting on: ${d.waiting_on.map((w) => `${w.title} [${humanize(w.status)}]`).join(', ')}`}
                        />
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card>
        <CardHeader title="Upcoming & overdue deliverables" subheader="Due within the next 14 days" />
        <CardContent sx={{ pt: 0 }}>
          {data.upcoming_deliverables.length === 0 ? (
            <Typography color="text.secondary">Nothing due soon.</Typography>
          ) : (
            <List disablePadding dense>
              {data.upcoming_deliverables.map((d) => (
                <ListItem key={d.id} disablePadding divider>
                  <ListItemButton onClick={() => navigate(`/deliverables/${d.id}`)} sx={{ px: 1 }}>
                    <ListItemText primary={d.title} secondary={`${d.project_name} · ${d.owner_name || 'Unassigned'}`} />
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <StatusChip value={d.status} />
                      <Typography variant="body2" color={d.due_date < data.as_of ? 'error' : 'text.secondary'} sx={{ whiteSpace: 'nowrap' }}>
                        {formatDate(d.due_date)}
                      </Typography>
                    </Stack>
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}

DashboardContent.propTypes = {
  data: PropTypes.object.isRequired,
  navigate: PropTypes.func.isRequired,
};
