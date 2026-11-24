import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FormDialog, { toPayload, validateFields } from './FormDialog';
import { ApiError } from '../services/api';

const FIELDS = [
  { name: 'name', label: 'Name', required: true },
  { name: 'pct', label: 'Percent', type: 'number', min: 1, max: 100 },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'start', label: 'Start', type: 'date' },
  {
    name: 'end', label: 'End', type: 'date', validate: (v, all) => (all.start && v < all.start ? 'Too early' : null),
  },
  { name: 'secret', label: 'Secret', type: 'password', omitIfEmpty: true },
];

describe('validateFields', () => {
  it('reports required, range, format and custom errors', () => {
    const errors = validateFields(FIELDS, {
      name: '', pct: '150', email: 'nope', start: '2026-02-01', end: '2026-01-01', secret: 'short',
    });
    expect(errors).toEqual({
      name: 'Name is required',
      pct: 'Must be at most 100',
      email: 'Must be a valid email',
      end: 'Too early',
      secret: 'At least 8 characters with letters and numbers',
    });
  });

  it('accepts valid values', () => {
    expect(validateFields(FIELDS, { name: 'x', pct: '50', email: 'a@b.co' })).toEqual({});
  });
});

describe('toPayload', () => {
  it('converts blanks to null, parses numbers and omits optional blanks', () => {
    expect(toPayload(FIELDS, {
      name: 'x', pct: '42', email: '', start: '', end: '', secret: '',
    })).toEqual({
      name: 'x', pct: 42, email: null, start: null, end: null,
    });
  });
});

describe('<FormDialog />', () => {
  const renderDialog = (onSubmit) => render(
    <FormDialog open title="New thing" fields={FIELDS.slice(0, 2)} onSubmit={onSubmit} onClose={() => {}} />,
  );

  it('blocks submission until required fields are filled', async () => {
    const onSubmit = vi.fn();
    renderDialog(onSubmit);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Name is required')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits a clean payload', async () => {
    const onSubmit = vi.fn().mockResolvedValue({});
    renderDialog(onSubmit);
    await userEvent.type(screen.getByLabelText(/Name/), 'Alpha');
    await userEvent.type(screen.getByLabelText(/Percent/), '30');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ name: 'Alpha', pct: 30 }));
  });

  it('shows server-side field errors next to the field', async () => {
    const onSubmit = vi.fn().mockRejectedValue(
      new ApiError(409, 'conflict', 'A record with this name already exists', { name: 'must be unique' }),
    );
    renderDialog(onSubmit);
    await userEvent.type(screen.getByLabelText(/Name/), 'Dup');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('must be unique')).toBeInTheDocument();
    expect(screen.getByText('A record with this name already exists')).toBeInTheDocument();
  });
});
