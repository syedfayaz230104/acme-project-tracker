import PropTypes from 'prop-types';
import { Chip } from '@mui/material';
import { humanize } from '../utils/format';

const COLORS = {
  // project status
  planning: 'default',
  active: 'primary',
  on_hold: 'warning',
  completed: 'success',
  cancelled: 'default',
  // deliverable status
  not_started: 'default',
  in_progress: 'primary',
  blocked: 'error',
  // risk
  on_track: 'success',
  at_risk: 'warning',
  off_track: 'error',
  closed: 'default',
  // priority
  low: 'default',
  medium: 'info',
  high: 'warning',
  critical: 'error',
};

/** Colour-coded chip for statuses, risk levels and priorities. */
export default function StatusChip({ value, size = 'small', variant }) {
  if (!value) return null;
  const color = COLORS[value] || 'default';
  return (
    <Chip
      label={humanize(value)}
      color={color}
      size={size}
      variant={variant || (color === 'default' ? 'outlined' : 'filled')}
    />
  );
}

StatusChip.propTypes = {
  value: PropTypes.string,
  size: PropTypes.oneOf(['small', 'medium']),
  variant: PropTypes.oneOf(['filled', 'outlined']),
};
