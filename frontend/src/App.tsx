import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Login from './pages/Login';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Ruta raíz directa: al entrar a http://localhost:5173/ cargará el Login */}
        <Route path="/" element={<Login />} />
        {/* Ruta alterna por si acaso */}
        <Route path="/login" element={<Login />} />
      </Routes>
    </BrowserRouter>
  );
}