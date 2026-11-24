import PropTypes from 'prop-types';
import { IconButton, Tooltip } from '@mui/material';
import EditIcon from '@mui/icons-material/EditOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutlined';
import { useAuth } from '../context/AuthContext';

/**
 * Edit / delete icon buttons, shown only when the user's role permits them.
 * `editAction`/`deleteAction` default to the standard CRUD permissions.
 */
export default function RowActions({
  label, onEdit, onDelete, editAction = 'update', deleteAction = 'delete',
}) {
  const { can } = useAuth();
  return (
    <>
      {onEdit && can(editAction) && (
        <Tooltip title="Edit">
          <IconButton size="small" aria-label={`Edit ${label}`} onClick={onEdit}><EditIcon fontSize="small" /></IconButton>
        </Tooltip>
      )}
      {onDelete && can(deleteAction) && (
        <Tooltip title="Delete">
          <IconButton size="small" aria-label={`Delete ${label}`} onClick={onDelete} color="error">
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </>
  );
}

RowActions.propTypes = {
  label: PropTypes.string.isRequired,
  onEdit: PropTypes.func,
  onDelete: PropTypes.func,
  editAction: PropTypes.string,
  deleteAction: PropTypes.string,
};
