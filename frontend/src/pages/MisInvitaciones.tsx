import React, { useCallback, useEffect, useState } from 'react';
import { Mail, Check, X, Clock, RefreshCw, AlertCircle } from 'lucide-react';
import { useInvitations } from '../context/InvitationsContext';
import { useHelpSection } from '../context/HelpContext';
import PageHeader from '../components/PageHeader';
import { RoleSummary } from '../components/RoleSummary';
import { getMeInvitations } from '../services/invitation.service';
import { MyInvitation } from '../types/invitation.types';

type Tab = 'pendientes' | 'historial';

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  aceptado: { label: 'Aceptada', className: 'bg-green-100 text-green-700' },
  rechazado: { label: 'Rechazada', className: 'bg-red-100 text-red-700' },
  vencido: { label: 'Vencida', className: 'bg-gray-100 text-gray-600' },
};

const MisInvitaciones: React.FC = () => {
  useHelpSection('colaboradores');
  const {
    invitations,
    loading,
    error,
    respondingId,
    respondError,
    loadInvitations,
    respondInvitation
  } = useInvitations();

  // Esta lista vive en un Context montado una sola vez a nivel de toda
  // la app — sin esto, entrar acá después de haber estado en otro
  // lado (ej. un proyecto) mostraba datos viejos hasta hacer F5 o ir a
  // la campanita a refrescar a mano.
  useEffect(() => {
    loadInvitations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [activeTab, setActiveTab] = useState<Tab>('pendientes');

  // El historial NO vive en el Context compartido a propósito — ese
  // Context también alimenta la campanita de notificaciones del
  // header, que tiene que seguir mostrando solo pendientes. 'completed'
  // trae aceptadas/rechazadas/vencidas — no incluye las canceladas por
  // el dueño del proyecto (ver getMeInvitationsToProjectsService en el
  // backend, decisión ya tomada ahí, no acá).
  const [history, setHistory] = useState<MyInvitation[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const data = await getMeInvitations('completed');
      setHistory(data);
      setHistoryLoaded(true);
    } catch (err: any) {
      setHistoryError(err.message || 'Error al cargar el historial');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // Recién pide el historial la primera vez que se abre esa pestaña —
  // si alguien nunca la mira, no hace falta gastar el request.
  useEffect(() => {
    if (activeTab === 'historial' && !historyLoaded) {
      loadHistory();
    }
  }, [activeTab, historyLoaded, loadHistory]);

  const statusOf = (inv: MyInvitation): string =>
    inv.status === 'pendiente' ? 'vencido' : inv.status;

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader title="Mis Invitaciones" subtitle="Invitaciones a proyectos" />

      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center gap-1 mb-5 border border-gray-200 rounded-lg p-1 w-fit bg-white">
          <button
            onClick={() => setActiveTab('pendientes')}
            className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${
              activeTab === 'pendientes' ? 'bg-[#0056b3] text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            Pendientes{invitations.length > 0 ? ` (${invitations.length})` : ''}
          </button>
          <button
            onClick={() => setActiveTab('historial')}
            className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${
              activeTab === 'historial' ? 'bg-[#0056b3] text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            Historial
          </button>
        </div>

        <div className="flex items-center justify-end mb-4">
          <button
            onClick={activeTab === 'pendientes' ? loadInvitations : loadHistory}
            disabled={activeTab === 'pendientes' ? loading : historyLoading}
            className="text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw size={14} className={(activeTab === 'pendientes' ? loading : historyLoading) ? 'animate-spin' : ''} />
            Actualizar
          </button>
        </div>

        {activeTab === 'pendientes' ? (
          loading ? (
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
                      <span className="font-medium">
                        <RoleSummary
                          isAdmin={inv.is_admin}
                          moduleRoles={inv.module_roles}
                          adminLabel="Administrador del proyecto"
                        />
                      </span>
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
          )
        ) : historyLoading ? (
          <div className="text-center py-12">
            <RefreshCw size={28} className="animate-spin mx-auto text-[#0056b3]" />
            <p className="mt-2 text-gray-400">Cargando historial...</p>
          </div>
        ) : historyError ? (
          <div className="text-center py-12 text-red-500">
            <AlertCircle size={28} className="mx-auto mb-2" />
            <p>{historyError}</p>
            <button onClick={loadHistory} className="mt-2 text-[#0056b3] hover:underline">
              Reintentar
            </button>
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Mail size={40} className="mx-auto mb-3 opacity-50" />
            <p>Todavía no tenés invitaciones respondidas ni vencidas</p>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((inv) => {
              const status = STATUS_STYLE[statusOf(inv)];
              return (
                <div
                  key={inv.invitation_id}
                  className="bg-white border border-gray-200 rounded-xl p-5 flex items-center justify-between opacity-90"
                >
                  <div>
                    <p className="font-semibold text-gray-700">{inv.project.project_name}</p>
                    <p className="text-sm text-gray-500 mt-1">
                      Invitado por{' '}
                      <span className="font-medium">
                        {inv.host_name}{inv.host_last_name ? ` ${inv.host_last_name}` : ''}
                      </span>{' '}
                      como{' '}
                      <span className="font-medium">
                        <RoleSummary
                          isAdmin={inv.is_admin}
                          moduleRoles={inv.module_roles}
                          adminLabel="Administrador del proyecto"
                        />
                      </span>
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {inv.responded_at
                        ? `Respondida el ${new Date(inv.responded_at).toLocaleDateString()}`
                        : `Venció el ${new Date(inv.expires_at).toLocaleDateString()} sin respuesta`}
                    </p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-md text-xs font-medium ring-1 ring-inset ring-black/5 ${status.className}`}>
                    {status.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default MisInvitaciones;
