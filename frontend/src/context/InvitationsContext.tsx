import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode
} from 'react';

import {
  getMeInvitations,
  updateInvitationStatus
} from '../services/invitation.service';

interface InvitationsContextType {
  invitations: any[];
  loading: boolean;
  error: string | null;
  respondingId: number | null;
  loadInvitations: () => Promise<void>;
  respondInvitation: (
    projectId: number,
    invitationId: number,
    status: 'aceptado' | 'rechazado'
  ) => Promise<void>;
}

const InvitationsContext = createContext<InvitationsContextType | undefined>(
  undefined
);

export const InvitationsProvider: React.FC<{ children: ReactNode }> = ({
  children
}) => {
  const [invitations, setInvitations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [respondingId, setRespondingId] = useState<number | null>(null);

  const loadInvitations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMeInvitations('pending');
      setInvitations(data);
    } catch (err: any) {
      setError(err.message || 'Error al cargar invitaciones');
    } finally {
      setLoading(false);
    }
  }, []);

  const respondInvitation = useCallback(
    async (
      projectId: number,
      invitationId: number,
      status: 'aceptado' | 'rechazado'
    ) => {
      setRespondingId(invitationId);
      try {
        await updateInvitationStatus(projectId, invitationId, { status });
        await loadInvitations();
      } catch (err: any) {
        setError(err.message || 'Error al responder la invitación');
      } finally {
        setRespondingId(null);
      }
    },
    [loadInvitations]
  );

  useEffect(() => {
    loadInvitations();
  }, [loadInvitations]);

  return (
    <InvitationsContext.Provider
      value={{
        invitations,
        loading,
        error,
        respondingId,
        loadInvitations,
        respondInvitation
      }}
    >
      {children}
    </InvitationsContext.Provider>
  );
};

export const useInvitations = (): InvitationsContextType => {
  const context = useContext(InvitationsContext);
  if (context === undefined) {
    throw new Error('useInvitations debe usarse dentro de un <InvitationsProvider>');
  }
  return context;
};
