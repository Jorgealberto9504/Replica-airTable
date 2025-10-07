import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading, mustChangePassword } = useAuth();
  const loc = useLocation();

  if (loading) return null;

  // Si hay user, priorizamos su flag (más confiable que el boolean global)
  const needChange = (user?.mustChangePassword ?? mustChangePassword) === true;

  if (!user) return <Navigate to="/login" replace />;

  // Evitar loop cuando ya estamos en /change-password
  if (needChange && loc.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  return <>{children}</>;
}