import { useState } from 'react';
import { useNotify } from '../context/NotificationContext';

/**
 * Shared create / edit / delete workflow for list pages.
 *
 * @param {{create: Function, update: Function, remove: Function}} client CRUD API client
 * @param {string} entity Human name, e.g. "Project"
 * @param {() => void} onChanged Called after any successful change (usually `reload`)
 */
export default function useCrud(client, entity, onChanged) {
  const notify = useNotify();
  const [form, setForm] = useState({ open: false, editing: null });
  const [toDelete, setToDelete] = useState(null);

  return {
    form,
    openCreate: (defaults = null) => setForm({ open: true, editing: null, defaults }),
    openEdit: (row) => setForm({ open: true, editing: row }),
    closeForm: () => setForm({ open: false, editing: null }),
    /** Submit handler for FormDialog; errors propagate so the dialog can show them. */
    submit: async (payload) => {
      const saved = form.editing
        ? await client.update(form.editing.id, payload)
        : await client.create(payload);
      notify.success(`${entity} ${form.editing ? 'updated' : 'created'}`);
      setForm({ open: false, editing: null });
      onChanged?.(saved);
      return saved;
    },
    toDelete,
    askDelete: (row) => setToDelete(row),
    cancelDelete: () => setToDelete(null),
    confirmDelete: async () => {
      try {
        await client.remove(toDelete.id);
        notify.success(`${entity} deleted`);
        setToDelete(null);
        onChanged?.(null);
      } catch (err) {
        notify.error(err.message);
      }
    },
  };
}
