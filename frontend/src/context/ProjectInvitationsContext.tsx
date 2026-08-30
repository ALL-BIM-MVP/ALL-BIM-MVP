import React, { createContext, useContext } from 'react';
import { useProjectInvitations } from '../hooks/useProjectInvitations';

// Antes, ColaboradoresTab.tsx y DashboardProjects.tsx llamaban al
// hook por separado — cada uno con su PROPIA copia de invitations/
// members, sin conexión entre sí (invitar a alguien actualizaba una
// copia, no la otra). Un Context (mismo patrón que
// InvitationsContext.tsx) resuelve esto: una sola instancia, todos
// los consumidores ven el mismo estado al instante.
type ProjectInvitationsContextType = ReturnType<typeof useProjectInvitations>;

const ProjectInvitationsContext = createContext<ProjectInvitationsContextType | undefined>(undefined);

export const ProjectInvitationsProvider: React.FC<{ projectId: number; children: React.ReactNode }> = ({
  projectId,
  children,
}) => {
  const value = useProjectInvitations(projectId);
  return (
    <ProjectInvitationsContext.Provider value={value}>
      {children}
    </ProjectInvitationsContext.Provider>
  );
};

export const useProjectInvitationsContext = (): ProjectInvitationsContextType => {
  const ctx = useContext(ProjectInvitationsContext);
  if (ctx === undefined) {
    throw new Error('useProjectInvitationsContext debe usarse dentro de un <ProjectInvitationsProvider>');
  }
  return ctx;
};
