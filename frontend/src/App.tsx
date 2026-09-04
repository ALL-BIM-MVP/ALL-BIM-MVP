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
import FragmentsPreview from './components/IFCViewer/FragmentsPreview';
import Ayuda from './pages/Ayuda';
import { GlobalHelpShortcut } from './components/GlobalHelpShortcut';


import { AuthProvider } from './context/AuthContext';
import { InvitationsProvider } from './context/InvitationsContext'; //
import { HelpProvider } from './context/HelpContext';
import { ROLE_IDS } from './utils/roles';

function App() {
  return (
    <AuthProvider>
      <InvitationsProvider>{/*  nuevo, envuelve todo el router */}
        <HelpProvider>
        <BrowserRouter>
          <GlobalHelpShortcut />
          <Routes>
            {/* Ruta pública */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/dashboard-projects/:id" element={<DashboardProjects />} />

            {/* Fase 1 de la migración a ThatOpen/Fragments — pantalla de
                validación aparte, no forma parte del visor real todavía
                (ver FragmentsPreview.tsx). Cualquier usuario logueado
                puede entrar; no depende de un rol puntual porque es una
                herramienta de prueba, no una función de producto. */}
            <Route path="/fragments-preview/:ifcFileId" element={
              <ProtectedRoute allowedRoles={[ROLE_IDS.ADMINISTRADOR, ROLE_IDS.SUPERVISOR, ROLE_IDS.MODERADOR, ROLE_IDS.USUARIO]}>
                <FragmentsPreview />
              </ProtectedRoute>
            } />

            {/* Pública a propósito — la guía no pide sesión, así se
                puede abrir en una pestaña nueva y hasta compartir el
                link sin que el destinatario tenga que estar logueado. */}
            <Route path="/ayuda/:seccion?" element={<Ayuda />} />

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

              {/* Nueva: pantalla de "Mi perfil" — cualquier usuario
                  logueado puede editar sus propios datos, sin importar
                  su rol. */}

              {/* Redirección por defecto */}
              <Route path="/" element={<Navigate to="/login" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
        </HelpProvider>
      </InvitationsProvider>
    </AuthProvider>
  );
}

export default App;