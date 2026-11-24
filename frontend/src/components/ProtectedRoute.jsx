import PropTypes from 'prop-types';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Redirect to /login when signed out, and to the dashboard when the user's role
 * lacks the required `action` permission.
 */
export default function ProtectedRoute({ children, action }) {
  const { user, can } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (action && !can(action)) return <Navigate to="/" replace />;
  return children;
}

ProtectedRoute.propTypes = {
  children: PropTypes.node.isRequired,
  action: PropTypes.string,
};
