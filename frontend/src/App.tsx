// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import DashboardAdmin from './pages/Dashboardadmin';
import Dashboard from './pages/Dashboard';  
import AdminUsers from './pages/AdminUsers';
import Invitations from './pages/Invitations';
import { ProtectedRoute } from './components/ProtectedRoute';
import ProjectRegistration from './pages/ProjectRegistration';
import MainLayout from './layouts/MainLayout';
function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Ruta pública */}
        <Route path="/login" element={<Login />} />


        <Route element={<MainLayout />}>
      
        <Route path="/dashboardadmin" element={
          <ProtectedRoute requiredRoleId={1}>
            <DashboardAdmin />
          </ProtectedRoute>
        } />
        
        <Route path="/admin/usuarios" element={
          <ProtectedRoute requiredRoleId={1}>
            <AdminUsers />
          </ProtectedRoute>
        } />
        
        <Route path="/admin/invitaciones" element={
          <ProtectedRoute requiredRoleId={1}>
            <Invitations />
          </ProtectedRoute>
        } />
        
           {/* 
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />  */}

        <Route path="/dashboard" element={
            <Dashboard />
        } />

         <Route path="/dashboard/nuevoproyecto" element={
            <ProjectRegistration />
        } />

   

        {/* Redirección por defecto */}
        <Route path="/" element={<Navigate to="/login" replace />} />
      </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;