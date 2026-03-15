import { Routes, Route } from 'react-router-dom';
import MapPage from './components/MapPage';
import DroneDetailPage from './components/DroneDetailPage';
import SettingsPage from './components/SettingsPage';
import LoginPage from './components/LoginPage';
import ProtectedRoute from './components/ProtectedRoute';
import FlightReportView from './components/FlightReportView';
import HelpPage from './components/HelpPage';
import AdminLayout from './components/admin/AdminLayout';
import AdminDashboard from './components/admin/AdminDashboard';
import TenantList from './components/admin/TenantList';
import UserList from './components/admin/UserList';
import ReceiverList from './components/admin/ReceiverList';
import SimulationTab from './components/admin/SimulationTab';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<ProtectedRoute><MapPage /></ProtectedRoute>} />
      <Route path="/drone/:id" element={<ProtectedRoute><DroneDetailPage /></ProtectedRoute>} />
      <Route path="/report/:recordId" element={<ProtectedRoute><FlightReportView /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
      <Route path="/help" element={<ProtectedRoute><HelpPage /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute requiredRole="tenant_admin"><AdminLayout /></ProtectedRoute>}>
        <Route index element={<AdminDashboard />} />
        <Route path="tenants" element={<TenantList />} />
        <Route path="users" element={<UserList />} />
        <Route path="receivers" element={<ReceiverList />} />
        <Route path="simulation" element={<SimulationTab />} />
      </Route>
    </Routes>
  );
}
