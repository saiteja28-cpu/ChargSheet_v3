
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Admin from './pages/Admin';
import Expenses from './pages/Expenses';

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <p>Loading...</p>;
  return <Navigate to={user ? '/dashboard' : '/login'} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/dashboard"
        element={<ProtectedRoute><Dashboard /></ProtectedRoute>}
      />
      <Route
        path="/admin"
        element={<ProtectedRoute adminOnly><Admin /></ProtectedRoute>}
      />
      <Route path="*" element={<Navigate to="/" replace />} />

      <Route
        path="/expenses/new"
        element={<ProtectedRoute>
        <Expenses />
        </ProtectedRoute>
        }
        />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
