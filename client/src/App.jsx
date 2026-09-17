import { Routes, Route } from 'react-router-dom';
import CapturePage from './pages/CapturePage';
import AdminPage from './pages/AdminPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<CapturePage />} />
      <Route path="/admin" element={<AdminPage />} />
    </Routes>
  );
}
