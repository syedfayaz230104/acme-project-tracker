import PropTypes from 'prop-types';
import {
  Box, Card, CardActionArea, CardContent, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Paper, Typography,
} from '@mui/material';
import useResponsive from '../hooks/useResponsive';

/**
 * Responsive list: a table on desktop/tablet, stacked cards on mobile.
 *
 * Columns: `{ key, label, render?(row), align?, primary?, hideOnMobile? }`.
 * The `primary` column becomes the card title on mobile.
 */
export default function DataView({
  columns, rows, onRowClick, actions, getRowKey = (row) => row.id, ariaLabel,
}) {
  const { isMobile } = useResponsive();
  const cell = (col, row) => (col.render ? col.render(row) : (row[col.key] ?? '—'));

  if (isMobile) {
    const primary = columns.find((c) => c.primary) || columns[0];
    const rest = columns.filter((c) => c !== primary && !c.hideOnMobile);
    return (
      <Stack spacing={1.5} aria-label={ariaLabel}>
        {rows.map((row) => {
          const body = (
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>{cell(primary, row)}</Typography>
              <Stack spacing={0.75}>
                {rest.map((col) => (
                  <Box key={col.key} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Typography variant="body2" color="text.secondary">{col.label}</Typography>
                    <Box sx={{ textAlign: 'right', minWidth: 0 }}>{cell(col, row)}</Box>
                  </Box>
                ))}
              </Stack>
            </CardContent>
          );
          return (
            <Card key={getRowKey(row)}>
              {onRowClick ? <CardActionArea onClick={() => onRowClick(row)}>{body}</CardActionArea> : body}
              {actions && <Box sx={{ px: 1, pb: 1, display: 'flex', justifyContent: 'flex-end' }}>{actions(row)}</Box>}
            </Card>
          );
        })}
      </Stack>
    );
  }

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small" aria-label={ariaLabel}>
        <TableHead>
          <TableRow>
            {columns.map((col) => <TableCell key={col.key} align={col.align}>{col.label}</TableCell>)}
            {actions && <TableCell align="right">Actions</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={getRowKey(row)}
              hover
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              sx={{ cursor: onRowClick ? 'pointer' : 'default' }}
            >
              {columns.map((col) => (
                <TableCell key={col.key} align={col.align} sx={{ py: 1.25 }}>{cell(col, row)}</TableCell>
              ))}
              {actions && (
                <TableCell align="right" onClick={(e) => e.stopPropagation()} sx={{ whiteSpace: 'nowrap' }}>
                  {actions(row)}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

DataView.propTypes = {
  columns: PropTypes.arrayOf(PropTypes.shape({
    key: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    render: PropTypes.func,
    align: PropTypes.oneOf(['left', 'right', 'center']),
    primary: PropTypes.bool,
    hideOnMobile: PropTypes.bool,
  })).isRequired,
  rows: PropTypes.arrayOf(PropTypes.object).isRequired,
  onRowClick: PropTypes.func,
  actions: PropTypes.func,
  getRowKey: PropTypes.func,
  ariaLabel: PropTypes.string,
};
