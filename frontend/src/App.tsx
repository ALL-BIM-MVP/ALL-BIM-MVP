import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import { Projects } from './pages/Projects';
import  Dashboardadmin from './pages/Dashboardadmin';
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />
        <Route path="/projects" element={<Projects />} />
        
        <Route path="/dashboardadmin" element={<Dashboardadmin />} />
        
        
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}