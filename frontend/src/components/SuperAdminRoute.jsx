import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function SuperAdminRoute() {
  const { token, operator, loading } = useAuth();

  if (loading) return null;
  if (!token) return <Navigate to="/login" replace />;
  if (operator?.perfil !== 'SUPERADMIN') return <Navigate to="/dashboard" replace />;

  return <Outlet />;
}
