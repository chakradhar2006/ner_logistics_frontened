import { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { setNavigate, installGlobalBindings } from './legacy/legacy.js';

import MoreMenu from './components/MoreMenu.jsx';

import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Roads from './pages/Roads.jsx';
import Vehicles from './pages/Vehicles.jsx';
import RouteOptimization from './pages/RouteOptimization.jsx';
import Velocity from './pages/Velocity.jsx';
import Weather from './pages/Weather.jsx';
import Profile from './pages/Profile.jsx';
import Settings from './pages/Settings.jsx';
import ReportIncident from './pages/ReportIncident.jsx';
import Sync from './pages/Sync.jsx';
import Alerts from './pages/Alerts.jsx';
import Deliveries from './pages/Deliveries.jsx';
import Reports from './pages/Reports.jsx';

export default function App() {
  const navigate = useNavigate();

  useEffect(() => {
    setNavigate(navigate);
    installGlobalBindings();
  }, [navigate]);

  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/roads" element={<Roads />} />
        <Route path="/vehicles" element={<Vehicles />} />
        <Route path="/route-optimization" element={<RouteOptimization />} />
        <Route path="/velocity" element={<Velocity />} />
        <Route path="/weather" element={<Weather />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/report" element={<ReportIncident />} />
        <Route path="/sync" element={<Sync />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/deliveries" element={<Deliveries />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      <MoreMenu />
    </>
  );
}
