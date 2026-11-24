import { useState } from 'react';
import PropTypes from 'prop-types';
import {
  Alert, Autocomplete, Button, Dialog, DialogActions, DialogContent, DialogTitle, Grid, MenuItem, TextField,
} from '@mui/material';
import { ApiError } from '../services/api';
import useResponsive from '../hooks/useResponsive';

/**
 * Validate values against field definitions (mirrors backend rules).
 * @returns {Object<string, string>} field name -> message
 */
// eslint-disable-next-line react-refresh/only-export-components
export function validateFields(fields, values) {
  const errors = {};
  fields.forEach((f) => {
    const v = values[f.name];
    const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && f.required && !v.length);
    if (f.required && empty) {
      errors[f.name] = `${f.label} is required`;
      return;
    }
    if (empty) return;
    if (f.type === 'number') {
      const n = Number(v);
      if (Number.isNaN(n)) errors[f.name] = 'Must be a number';
      else if (f.min != null && n < f.min) errors[f.name] = `Must be at least ${f.min}`;
      else if (f.max != null && n > f.max) errors[f.name] = `Must be at most ${f.max}`;
    }
    if (f.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) errors[f.name] = 'Must be a valid email';
    if (f.type === 'password' && (v.length < 8 || !/[a-z]/i.test(v) || !/\d/.test(v))) {
      errors[f.name] = 'At least 8 characters with letters and numbers';
    }
    if (!errors[f.name] && f.validate) {
      const msg = f.validate(v, values);
      if (msg) errors[f.name] = msg;
    }
  });
  return errors;
}

/**
 * Convert form values into an API payload: '' -> null, numbers parsed,
 * `omitIfEmpty` fields dropped when blank.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function toPayload(fields, values) {
  const out = {};
  fields.forEach((f) => {
    let v = values[f.name];
    if (v === '' || v === undefined) v = null;
    if (f.omitIfEmpty && v === null) return;
    if (f.type === 'number' && v !== null) v = Number(v);
    out[f.name] = v;
  });
  return out;
}

/**
 * Generic create/edit dialog driven by field definitions.
 *
 * Field: `{ name, label, type: text|textarea|number|date|email|password|select|multiselect,
 *           required?, options?: [{value,label}], min?, max?, step?, size?, helperText?,
 *           validate?(value, values), omitIfEmpty? }`
 *
 * Validates on submit, shows server-side field errors next to their inputs and
 * disables the form while saving.
 */
export default function FormDialog({
  open, title, fields, initialValues, onSubmit, onClose, submitLabel = 'Save',
}) {
  const { isMobile } = useResponsive();
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="sm" fullScreen={isMobile}>
      {/* The body mounts fresh on every open, so its state always starts from initialValues. */}
      {open && (
        <FormBody
          title={title}
          fields={fields}
          initialValues={initialValues}
          onSubmit={onSubmit}
          onClose={onClose}
          submitLabel={submitLabel}
          saving={saving}
          setSaving={setSaving}
        />
      )}
    </Dialog>
  );
}

FormDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  title: PropTypes.string.isRequired,
  fields: PropTypes.arrayOf(PropTypes.shape({
    name: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    type: PropTypes.string,
    required: PropTypes.bool,
    options: PropTypes.arrayOf(PropTypes.shape({ value: PropTypes.any, label: PropTypes.string })),
  })).isRequired,
  initialValues: PropTypes.object,
  onSubmit: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  submitLabel: PropTypes.string,
};

/** Form contents of FormDialog: field state, validation and submission. */
function FormBody({
  title, fields, initialValues, onSubmit, onClose, submitLabel, saving, setSaving,
}) {
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((f) => [
    f.name, initialValues?.[f.name] ?? (f.type === 'multiselect' ? [] : ''),
  ])));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');

  const setValue = (name, value) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const found = validateFields(fields, values);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    setFormError('');
    try {
      await onSubmit(toPayload(fields, values));
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.details).length) {
        const fieldNames = new Set(fields.map((f) => f.name));
        const mapped = {};
        const other = [];
        Object.entries(err.details).forEach(([k, msg]) => {
          if (fieldNames.has(k)) mapped[k] = msg;
          else other.push(Array.isArray(msg) ? msg.join(', ') : `${k}: ${msg}`);
        });
        setErrors(mapped);
        setFormError(other.length ? `${err.message}: ${other.join('; ')}` : err.message);
      } else {
        setFormError(err.message || 'Save failed');
      }
    } finally {
      setSaving(false);
    }
  };

  const renderField = (f) => {
    const common = {
      id: `field-${f.name}`,
      label: f.label,
      required: f.required,
      fullWidth: true,
      disabled: saving,
      error: Boolean(errors[f.name]),
      helperText: errors[f.name] || f.helperText,
    };
    if (f.type === 'multiselect') {
      const selected = (f.options || []).filter((o) => (values[f.name] || []).includes(o.value));
      return (
        <Autocomplete
          multiple
          options={f.options || []}
          value={selected}
          disabled={saving}
          getOptionLabel={(o) => o.label}
          isOptionEqualToValue={(a, b) => a.value === b.value}
          onChange={(_e, opts) => setValue(f.name, opts.map((o) => o.value))}
          renderInput={(params) => <TextField {...params} {...common} />}
        />
      );
    }
    if (f.type === 'select') {
      return (
        <TextField {...common} select value={values[f.name] ?? ''} onChange={(e) => setValue(f.name, e.target.value)}>
          {!f.required && <MenuItem value=""><em>None</em></MenuItem>}
          {(f.options || []).map((o) => <MenuItem key={String(o.value)} value={o.value}>{o.label}</MenuItem>)}
        </TextField>
      );
    }
    return (
      <TextField
        {...common}
        type={f.type === 'textarea' ? 'text' : f.type || 'text'}
        multiline={f.type === 'textarea'}
        minRows={f.type === 'textarea' ? 3 : undefined}
        value={values[f.name] ?? ''}
        onChange={(e) => setValue(f.name, e.target.value)}
        slotProps={{
          inputLabel: f.type === 'date' ? { shrink: true } : undefined,
          htmlInput: f.type === 'number' ? { min: f.min, max: f.max, step: f.step || 'any' } : undefined,
        }}
      />
    );
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers>
        {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
        <Grid container spacing={2}>
          {fields.map((f) => (
            <Grid key={f.name} size={{ xs: 12, sm: f.size || 12 }}>{renderField(f)}</Grid>
          ))}
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" variant="contained" loading={saving}>{submitLabel}</Button>
      </DialogActions>
    </form>
  );
}

FormBody.propTypes = {
  title: PropTypes.string.isRequired,
  fields: PropTypes.arrayOf(PropTypes.object).isRequired,
  initialValues: PropTypes.object,
  onSubmit: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  submitLabel: PropTypes.string.isRequired,
  saving: PropTypes.bool.isRequired,
  setSaving: PropTypes.func.isRequired,
};
