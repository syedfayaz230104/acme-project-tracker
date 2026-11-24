import PropTypes from 'prop-types';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import {
  Box, Breadcrumbs, Card, CardContent, CardHeader, Grid, Link, List, ListItem, ListItemButton, ListItemText,
  Stack, Typography,
} from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import PageHeader from '../components/PageHeader';
import LoadState from '../components/LoadState';
import StatusChip from '../components/StatusChip';
import ProgressBar from '../components/ProgressBar';
import useApi from '../hooks/useApi';
import { deliverablesApi } from '../services/resources';
import { formatDate } from '../utils/format';

/** List of deliverables in a dependency chain, indented by depth. */
function Chain({ title, subheader, icon, items, emptyText }) {
  const navigate = useNavigate();
  return (
    <Card sx={{ height: '100%' }}>
      <CardHeader avatar={icon} title={title} subheader={subheader} />
      <CardContent sx={{ pt: 0 }}>
        {items.length === 0 ? (
          <Typography color="text.secondary">{emptyText}</Typography>
        ) : (
          <List dense disablePadding>
            {items.map((d) => (
              <ListItem key={d.id} disablePadding divider>
                <ListItemButton onClick={() => navigate(`/deliverables/${d.id}`)} sx={{ pl: 1 + (d.depth - 1) * 2 }}>
                  <ListItemText
                    primary={`${d.depth > 1 ? '↳ ' : ''}${d.title}`}
                    secondary={`${d.project_name} · due ${formatDate(d.due_date)} · level ${d.depth}`}
                  />
                  <StatusChip value={d.status} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </CardContent>
    </Card>
  );
}

Chain.propTypes = {
  title: PropTypes.string.isRequired,
  subheader: PropTypes.string.isRequired,
  icon: PropTypes.node.isRequired,
  items: PropTypes.arrayOf(PropTypes.object).isRequired,
  emptyText: PropTypes.string.isRequired,
};

/** One deliverable with its full upstream (blocked by) and downstream (blocks) chains. */
export default function DeliverableDetailPage() {
  const { id } = useParams();
  const {
    data, loading, error, reload,
  } = useApi(() => deliverablesApi.dependencies(Number(id)), [id]);
  const d = data?.deliverable;

  return (
    <LoadState loading={loading && !data} error={error} onRetry={reload}>
      {d && (
        <>
          <Breadcrumbs sx={{ mb: 1 }}>
            <Link component={RouterLink} to="/deliverables" underline="hover">Deliverables</Link>
            <Link component={RouterLink} to={`/projects/${d.project_id}`} underline="hover">{d.project_name}</Link>
            <Typography color="text.primary">{d.title}</Typography>
          </Breadcrumbs>
          <PageHeader title={d.title} subtitle={d.description} />
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Grid container spacing={2} sx={{ alignItems: 'center' }}>
                <Grid size={{ xs: 6, md: 2 }}>
                  <Typography variant="caption" color="text.secondary" component="div">Status</Typography>
                  <StatusChip value={d.status} />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <Typography variant="caption" color="text.secondary" component="div">Owner</Typography>
                  <Typography sx={{ fontWeight: 600 }}>{d.owner_name || 'Unassigned'}</Typography>
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <Typography variant="caption" color="text.secondary" component="div">Due</Typography>
                  <Typography sx={{ fontWeight: 600 }} color={d.is_overdue ? 'error' : 'inherit'}>
                    {formatDate(d.due_date)}{d.is_overdue ? ' (overdue)' : ''}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 6, md: 4 }}><ProgressBar value={d.progress} label="Progress" /></Grid>
              </Grid>
            </CardContent>
          </Card>
          <Stack spacing={1} sx={{ mb: 2 }}>
            <Typography variant="h6">Dependency chain</Typography>
            <Box>
              <Typography color="text.secondary" variant="body2">
                {d.open_dependencies
                  ? `Waiting on ${d.open_dependencies} unfinished direct dependenc${d.open_dependencies === 1 ? 'y' : 'ies'}.`
                  : 'All direct dependencies are complete.'}
              </Typography>
            </Box>
          </Stack>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Chain
                title="Depends on"
                subheader="Must finish before this one (upstream)"
                icon={<ArrowUpwardIcon color="primary" />}
                items={data.upstream}
                emptyText="No upstream dependencies."
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Chain
                title="Blocks"
                subheader="Waiting on this one (downstream)"
                icon={<ArrowDownwardIcon color="secondary" />}
                items={data.downstream}
                emptyText="Nothing depends on this deliverable."
              />
            </Grid>
          </Grid>
        </>
      )}
    </LoadState>
  );
}
