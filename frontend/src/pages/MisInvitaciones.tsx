import React from 'react';
import { Mail, Check, X, Clock, RefreshCw, AlertCircle } from 'lucide-react';
import { useInvitations } from '../context/InvitationsContext';
import PageHeader from '../components/PageHeader';

const MisInvitaciones: React.FC = () => {
  const {
    invitations,
    loading,
    error,
    respondingId,
    respondError,
    loadInvitations,
    respondInvitation
  } = useInvitations();

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader title="Mis Invitaciones" subtitle="Invitaciones pendientes de respuesta" />

      <div className="max-w-3xl mx-auto px-4 py-8">
        {loading ? (
          <div className="text-center py-12">
            <RefreshCw size={28} className="animate-spin mx-auto text-[#0056b3]" />
            <p className="mt-2 text-gray-400">Cargando invitaciones...</p>
          </div>
        ) : error ? (
          <div className="text-center py-12 text-red-500">
            <AlertCircle size={28} className="mx-auto mb-2" />
            <p>{error}</p>
            <button onClick={loadInvitations} className="mt-2 text-[#0056b3] hover:underline">
              Reintentar
            </button>
          </div>
        ) : invitations.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Mail size={40} className="mx-auto mb-3 opacity-50" />
            <p>No tenés invitaciones pendientes</p>
          </div>
        ) : (
          <div className="space-y-4">
            {invitations.map((inv) => (
              <div
                key={inv.invitation_id}
                className="bg-white border border-gray-200 rounded-xl p-5 flex items-center justify-between"
              >
                <div>
                  <p className="font-semibold text-gray-800">{inv.project.project_name}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Invitado por{' '}
                    <span className="font-medium">
                      {inv.host_name}{inv.host_last_name ? ` ${inv.host_last_name}` : ''}
                    </span>{' '}
                    como{' '}
                    <span className="font-medium">{inv.project_role_name}</span>
                  </p>
                  <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                    <Clock size={12} />
                    Expira: {new Date(inv.expires_at).toLocaleDateString()}
                  </p>
                  {respondError?.invitationId === inv.invitation_id && (
                    <p className="text-xs text-red-500 mt-1">{respondError.message}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => respondInvitation(inv.project.project_id, inv.invitation_id, 'rechazado')}
                    disabled={respondingId === inv.invitation_id}
                    className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 text-sm font-medium flex items-center gap-1 disabled:opacity-50"
                  >
                    <X size={16} /> Rechazar
                  </button>
                  <button
                    onClick={() => respondInvitation(inv.project.project_id, inv.invitation_id, 'aceptado')}
                    disabled={respondingId === inv.invitation_id}
                    className="px-4 py-2 bg-[#0056b3] text-white rounded-lg hover:bg-[#004494] text-sm font-medium flex items-center gap-1 disabled:opacity-50"
                  >
                    <Check size={16} /> Aceptar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MisInvitaciones;