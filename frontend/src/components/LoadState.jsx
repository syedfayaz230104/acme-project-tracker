import PropTypes from 'prop-types';
import {
  Alert, Box, Button, CircularProgress, Typography,
} from '@mui/material';

/**
 * Renders a spinner while loading (first load only), an error with retry,
 * an empty message, or the children.
 */
export default function LoadState({
  loading, error, empty, emptyMessage = 'Nothing to show yet.', onRetry, children,
}) {
  if (error) {
    return (
      <Alert
        severity="error"
        action={onRetry && <Button color="inherit" size="small" onClick={onRetry}>Retry</Button>}
      >
        {error.message || 'Something went wrong.'}
      </Alert>
    );
  }
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }} role="status" aria-label="Loading">
        <CircularProgress />
      </Box>
    );
  }
  if (empty) {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <Typography color="text.secondary">{emptyMessage}</Typography>
      </Box>
    );
  }
  return children;
}

LoadState.propTypes = {
  loading: PropTypes.bool,
  error: PropTypes.instanceOf(Error),
  empty: PropTypes.bool,
  emptyMessage: PropTypes.string,
  onRetry: PropTypes.func,
  children: PropTypes.node,
};
