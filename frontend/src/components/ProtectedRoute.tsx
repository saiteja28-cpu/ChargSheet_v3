
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function ProtectedRoute({
  children,
  adminOnly = false,
}: {
  children: React.ReactNode;
  adminOnly?: boolean;
}) {
  const { user, role, loading } = useAuth();

  if (loading) return <p>Loading...</p>;
  if (!user) return <Navigate to="/login" replace />;

  if (adminOnly && role !== 'admin') {
    if (role === null) return <p>Checking access...</p>;
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
