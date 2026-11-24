import PropTypes from 'prop-types';
import { Box, LinearProgress, Typography } from '@mui/material';

/**
 * Labelled progress bar. Turns warning/error when `value` exceeds `warnAt`/100
 * (used for budget consumption and allocation).
 */
export default function ProgressBar({ value, label, warnAt, max = 100 }) {
  const pct = value == null ? 0 : value;
  let color = 'primary';
  if (warnAt != null && pct > max) color = 'error';
  else if (warnAt != null && pct > warnAt) color = 'warning';
  return (
    <Box sx={{ minWidth: 120 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        {label && <Typography variant="caption" color="text.secondary">{label}</Typography>}
        <Typography variant="caption" sx={{ fontWeight: 600, ml: 'auto' }}>
          {value == null ? '—' : `${pct}%`}
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={Math.min(100, Math.max(0, (pct * 100) / max))}
        color={color}
        sx={{ height: 8, borderRadius: 4 }}
        aria-label={label || 'progress'}
      />
    </Box>
  );
}

ProgressBar.propTypes = {
  value: PropTypes.number,
  label: PropTypes.string,
  warnAt: PropTypes.number,
  max: PropTypes.number,
};
