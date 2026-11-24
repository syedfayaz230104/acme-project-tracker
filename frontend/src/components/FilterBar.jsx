import PropTypes from 'prop-types';
import {
  Box, Button, InputAdornment, MenuItem, TextField,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';

/**
 * Search box plus select/date filters. Controlled: `values` + `onChange(name, value)`.
 * Filter: `{ name, label, type?: 'select'|'date', options? }`.
 */
export default function FilterBar({
  search, onSearchChange, searchPlaceholder = 'Search…', filters = [], values = {}, onChange, onClear,
}) {
  const active = Boolean(search) || filters.some((f) => values[f.name]);
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 2, alignItems: 'center' }}>
      {onSearchChange && (
        <TextField
          size="small"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          sx={{ flex: '1 1 220px', minWidth: 200, bgcolor: 'background.paper' }}
          slotProps={{
            htmlInput: { 'aria-label': searchPlaceholder },
            input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> },
          }}
        />
      )}
      {filters.map((f) => (
        <TextField
          key={f.name}
          size="small"
          label={f.label}
          select={f.type !== 'date'}
          type={f.type === 'date' ? 'date' : undefined}
          value={values[f.name] ?? ''}
          onChange={(e) => onChange(f.name, e.target.value)}
          sx={{ flex: '0 1 170px', minWidth: 140, bgcolor: 'background.paper' }}
          slotProps={f.type === 'date' ? { inputLabel: { shrink: true } } : undefined}
        >
          {f.type !== 'date' && [
            <MenuItem key="" value=""><em>All</em></MenuItem>,
            ...(f.options || []).map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>),
          ]}
        </TextField>
      ))}
      {onClear && active && <Button onClick={onClear} size="small">Clear filters</Button>}
    </Box>
  );
}

FilterBar.propTypes = {
  search: PropTypes.string,
  onSearchChange: PropTypes.func,
  searchPlaceholder: PropTypes.string,
  filters: PropTypes.arrayOf(PropTypes.shape({
    name: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    type: PropTypes.oneOf(['select', 'date']),
    options: PropTypes.array,
  })),
  values: PropTypes.object,
  onChange: PropTypes.func,
  onClear: PropTypes.func,
};
