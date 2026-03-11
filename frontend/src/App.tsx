import { Routes, Route } from 'react-router-dom';
import MapPage from './components/MapPage';
import DroneDetailPage from './components/DroneDetailPage';
import SettingsPage from './components/SettingsPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<MapPage />} />
      <Route path="/drone/:id" element={<DroneDetailPage />} />
      <Route path="/settings" element={<SettingsPage />} />
    </Routes>
  );
}
