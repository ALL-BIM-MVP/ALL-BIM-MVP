// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';

import AdminUsers from './pages/AdminUsers';
import Invitations from './pages/Invitations';
import { ProtectedRoute } from './components/ProtectedRoute';
import Projects from './pages/Projects';
import MainLayout from './layouts/MainLayout';
import Register from './pages/Register';
import DashboardProjects from './pages/DashboardProjects';
import MisInvitaciones from './pages/MisInvitaciones';
import { AuthProvider } from './context/AuthContext';
import { InvitationsProvider } from './context/InvitationsContext'; // 
import { ROLE_IDS } from './utils/roles';

function App() {
  return (
    <AuthProvider>
      <InvitationsProvider>{/*  nuevo, envuelve todo el router */}
        <BrowserRouter>
          <Routes>
            {/* Ruta pública */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/dashboard-projects/:id" element={<DashboardProjects />} />

            <Route element={<MainLayout />}>

              <Route path="/admin/usuarios" element={
                <ProtectedRoute allowedRoles={[ROLE_IDS.ADMINISTRADOR]}>
                  <AdminUsers />
                </ProtectedRoute>
              } />

              <Route path="/admin/invitaciones" element={
                <ProtectedRoute allowedRoles={[ROLE_IDS.ADMINISTRADOR, ROLE_IDS.SUPERVISOR]}>
                  <Invitations />
                </ProtectedRoute>
              } />

              {/* FIX: faltaba SUPERVISOR acá — según usePermissions.ts
                  (canCreateProject, canJoinProject), un SUPERVISOR SÍ
                  puede crear/unirse a proyectos, así que también tiene
                  que poder VERLOS. Sin esto, un usuario SUPERVISOR
                  quedaba en loop infinito de redirect (ProtectedRoute
                  lo mandaba de vuelta a esta misma ruta, que a su vez
                  se la volvía a negar) — pantalla en blanco para
                  siempre, sin ningún error visible en consola. */}
              <Route path="/dashboard/projects" element={
                <ProtectedRoute allowedRoles={[ROLE_IDS.MODERADOR, ROLE_IDS.ADMINISTRADOR, ROLE_IDS.SUPERVISOR]}>
                  <Projects />
                </ProtectedRoute>
              } />

              {/* FIX: mismo problema — faltaba SUPERVISOR acá también. */}
              <Route path="/mis-invitaciones" element={
                <ProtectedRoute allowedRoles={[ROLE_IDS.MODERADOR, ROLE_IDS.ADMINISTRADOR, ROLE_IDS.USUARIO, ROLE_IDS.SUPERVISOR]}>
                  <MisInvitaciones />
                </ProtectedRoute>
              } />

              {/* Redirección por defecto */}
              <Route path="/" element={<Navigate to="/login" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </InvitationsProvider>
    </AuthProvider>
  );
}

export default App;