import { Navigate, Outlet } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { SplashScreen } from '../feedback/SplashScreen';

export function ProtectedRoute() {
  const { user, loading } = useApp();
  if (loading) return <SplashScreen />;
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}
