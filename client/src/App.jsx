import { Routes, Route } from 'react-router-dom';
import CapturePage from './pages/CapturePage';
import AdminPage from './pages/AdminPage';
import FillPage from './pages/FillPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<CapturePage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/fill/:token" element={<FillPage />} />
    </Routes>
  );
}
