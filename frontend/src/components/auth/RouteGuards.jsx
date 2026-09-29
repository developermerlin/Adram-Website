import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { dashboardPathFor } from '../../config/roles';
import { Spinner } from '../ui/Section';

// Signed-in users only; optionally restricted to certain roles.
export const ProtectedRoute = ({ children, roles }) => {
  const { user, isAuthenticated, initializing } = useAuth();
  const location = useLocation();

  if (initializing) return <Spinner />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user?.role)) return <Navigate to="/unauthorized" replace />;
  return children;
};

// Login/register: signed-in users go back where they were heading, or to their dashboard.
export const GuestRoute = ({ children }) => {
  const { user, isAuthenticated, initializing } = useAuth();
  const location = useLocation();

  if (initializing) return <Spinner />;
  if (isAuthenticated) return <Navigate to={location.state?.from || dashboardPathFor(user?.role)} replace />;
  return children;
};
