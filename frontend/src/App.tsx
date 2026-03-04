import { Routes, Route } from 'react-router-dom';
import MapPage from './components/MapPage';
import DroneDetailPage from './components/DroneDetailPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<MapPage />} />
      <Route path="/drone/:id" element={<DroneDetailPage />} />
    </Routes>
  );
}
