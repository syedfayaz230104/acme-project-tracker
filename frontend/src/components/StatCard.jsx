import PropTypes from 'prop-types';
import { Card, CardActionArea, CardContent, Typography } from '@mui/material';

/** Headline metric tile; clickable when `onClick` is provided. */
export default function StatCard({ label, value, hint, tone = 'text.primary', onClick }) {
  const content = (
    <CardContent>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="h4" sx={{ color: tone, my: 0.5 }}>{value}</Typography>
      {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
    </CardContent>
  );
  return (
    <Card sx={{ height: '100%' }}>
      {onClick ? <CardActionArea onClick={onClick} sx={{ height: '100%' }}>{content}</CardActionArea> : content}
    </Card>
  );
}

StatCard.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.node.isRequired,
  hint: PropTypes.node,
  tone: PropTypes.string,
  onClick: PropTypes.func,
};
