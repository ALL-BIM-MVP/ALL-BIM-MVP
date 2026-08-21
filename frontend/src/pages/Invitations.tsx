// src/pages/Invitations.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CheckCircle2, Clock, XCircle, RefreshCw, AlertTriangle, Send,
  Mail, ShieldCheck, Eye, Wrench, User, UserCog,
} from 'lucide-react';
import { createInvitation, getInvitations, InvitationHistoryItem } from '../services/auth.service';
import { INVITATION_ROLES } from '../utils/roles';
import PageHeader from '../components/PageHeader';

// ============================================================
// Helpers de presentación — ícono/color por rol, tiempo relativo,
// avatar con inicial (mismo patrón que ya usa el avatar del sidebar).
// ============================================================

const ROLE_STYLE: Record<string, { icon: React.ReactNode; ring: string; text: string; bg: string }> = {
  ADMINISTRADOR: { icon: <ShieldCheck size={15} />, ring: 'ring-violet-200', text: 'text-violet-700', bg: 'bg-violet-50' },
  SUPERVISOR: { icon: <Eye size={15} />, ring: 'ring-sky-200', text: 'text-sky-700', bg: 'bg-sky-50' },
  MODERADOR: { icon: <Wrench size={15} />, ring: 'ring-amber-200', text: 'text-amber-700', bg: 'bg-amber-50' },
  USUARIO: { icon: <User size={15} />, ring: 'ring-slate-200', text: 'text-slate-600', bg: 'bg-slate-50' },
};
const roleStyle = (name: string) => ROLE_STYLE[name.toUpperCase()] ?? {
  icon: <UserCog size={15} />, ring: 'ring-gray-200', text: 'text-gray-600', bg: 'bg-gray-50',
};

const AVATAR_PALETTE = ['#0056b3', '#7c3aed', '#0d9488', '#c2410c', '#be185d', '#4338ca'];
function avatarColorFor(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
}

// "vence en 2 h" / "venció hace 1 día" / "usada hace 3 días" — mucho
// más rápido de leer en una tabla que dos fechas completas repetidas.
function relativeExpiry(iso: string): { label: string; past: boolean } {
  const diffMs = new Date(iso).getTime() - Date.now();
  const past = diffMs < 0;
  const absMs = Math.abs(diffMs);
  const mins = Math.round(absMs / 60000);
  const hours = Math.round(absMs / 3_600_000);
  const days = Math.round(absMs / 86_400_000);

  let amount: string;
  if (mins < 60) amount = `${mins} min`;
  else if (hours < 24) amount = `${hours} h`;
  else amount = `${days} día${days !== 1 ? 's' : ''}`;

  return { label: past ? `hace ${amount}` : `en ${amount}`, past };
}

// ============================================================
// Insignias
// ============================================================

const StatusBadge: React.FC<{ status: InvitationHistoryItem['status'] }> = ({ status }) => {
  if (status === 'usado') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
        <CheckCircle2 size={12} /> Usado
      </span>
    );
  }
  if (status === 'vencido') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 ring-1 ring-red-200">
        <XCircle size={12} /> Vencido
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 ring-1 ring-blue-200">
      <Clock size={12} /> Pendiente
    </span>
  );
};

const RoleBadge: React.FC<{ name: string }> = ({ name }) => {
  const s = roleStyle(name);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${s.bg} ${s.text} ring-1 ${s.ring}`}>
      {s.icon}
      {name}
    </span>
  );
};

const Invitations: React.FC = () => {
  const [email, setEmail] = useState('');
  const [role_id, setRolId] = useState(2);
  const [loading, setLoading] = useState(false);

  const [invitations, setInvitations] = useState<InvitationHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const selectedRole = useMemo(
    () => INVITATION_ROLES.find((r) => r.id === role_id),
    [role_id]
  );

  const loadInvitations = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const data = await getInvitations();
      setInvitations(data);
    } catch (err: any) {
      setHistoryError(err.message || 'No se pudo cargar el historial de invitaciones.');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInvitations();
  }, [loadInvitations]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await createInvitation({ email, role_id });
      alert(` ${result.message}`);
      setEmail('');
      setRolId(2);
      loadInvitations();
    } catch (error: any) {
      alert(error.message || 'Error al enviar invitación');
    } finally {
      setLoading(false);
    }
  };

  const pendingCount = invitations.filter((i) => i.status === 'pendiente').length;

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader title="Invitar Usuario" subtitle="Envía invitaciones a nuevos usuarios" />

      <main className="max-w-4xl mx-auto p-8 space-y-6">
        {/* ---------- Formulario de nueva invitación ---------- */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-8 pt-7 pb-1 flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-[#0056b3]/10 flex items-center justify-center flex-shrink-0">
              <Mail size={18} className="text-[#0056b3]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-800 leading-tight">Nueva invitación</h2>
              <p className="text-sm text-gray-400 mt-0.5">
                La persona recibe un correo con un enlace para crear su cuenta.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="px-8 pb-8 pt-5">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Correo electrónico
            </label>
            <div className="relative mb-6">
              <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0056b3]/25 focus:border-[#0056b3] transition-shadow"
                placeholder="ejemplo@correo.com"
                required
              />
            </div>

            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Rol asignado
            </label>
            <div className="flex flex-wrap gap-1.5 mb-7">
              {INVITATION_ROLES.map((role) => {
                const s = roleStyle(role.name);
                const active = role.id === role_id;
                return (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => setRolId(role.id)}
                    className={`inline-flex items-center gap-1.5 pl-2 pr-3 py-1.5 rounded-full border transition-all ${
                      active
                        ? 'border-[#0056b3] bg-[#0056b3]/5'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center [&>svg]:w-3 [&>svg]:h-3 ${active ? 'bg-[#0056b3] text-white' : `${s.bg} ${s.text}`}`}>
                      {s.icon}
                    </span>
                    <span className={`text-[11px] font-semibold ${active ? 'text-[#0056b3]' : 'text-gray-600'}`}>
                      {role.name}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-2 bg-[#0056b3] text-white px-6 py-2.5 rounded-xl hover:bg-[#004494] hover:shadow-md active:scale-[0.99] transition-all disabled:opacity-50 disabled:hover:shadow-none font-semibold text-sm"
              >
                {loading ? (
                  <>
                    <RefreshCw size={15} className="animate-spin" /> Enviando...
                  </>
                ) : (
                  <>
                    <Send size={15} /> Enviar invitación{selectedRole ? ` como ${selectedRole.name.toLowerCase()}` : ''}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* ---------- Historial de invitaciones enviadas ---------- */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-8 py-5 border-b border-gray-100">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-gray-800">Invitaciones enviadas</h2>
                {pendingCount > 0 && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                    {pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-400 mt-0.5">Más reciente primero.</p>
            </div>
            <button
              onClick={loadInvitations}
              disabled={historyLoading}
              title="Actualizar"
              className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={16} className={historyLoading ? 'animate-spin' : ''} />
            </button>
          </div>

          {historyLoading ? (
            <div className="py-16 text-center text-gray-400">
              <RefreshCw size={22} className="animate-spin mx-auto mb-2" />
              <p className="text-sm">Cargando historial...</p>
            </div>
          ) : historyError ? (
            <div className="py-16 text-center text-red-500">
              <AlertTriangle size={22} className="mx-auto mb-2" />
              <p className="text-sm">{historyError}</p>
              <button onClick={loadInvitations} className="text-xs font-semibold text-[#0056b3] hover:underline mt-2">
                Reintentar
              </button>
            </div>
          ) : invitations.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-3">
                <Send size={22} className="text-gray-300" />
              </div>
              <p className="text-sm font-medium text-gray-500">Todavía no enviaste ninguna invitación</p>
              <p className="text-xs text-gray-400 mt-1">Las que mandes van a aparecer acá, con su estado al día.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="px-8 py-2.5 text-left font-semibold text-gray-400 text-[11px] uppercase tracking-wide">Invitado</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-400 text-[11px] uppercase tracking-wide">Rol</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-400 text-[11px] uppercase tracking-wide">Enviada</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-400 text-[11px] uppercase tracking-wide">Vencimiento</th>
                    <th className="px-8 py-2.5 text-left font-semibold text-gray-400 text-[11px] uppercase tracking-wide">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {invitations.map((inv, i) => {
                    const expiry = relativeExpiry(inv.expires_at);
                    return (
                      <tr
                        key={inv.invitation_id}
                        className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors animate-rowIn"
                        style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
                      >
                        <td className="px-8 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <span
                              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
                              style={{ backgroundColor: avatarColorFor(inv.email) }}
                            >
                              {inv.email.charAt(0).toUpperCase()}
                            </span>
                            <span className="text-gray-800 truncate max-w-[220px]">{inv.email}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <RoleBadge name={inv.role.role_name} />
                        </td>
                        <td className="px-4 py-3.5 text-gray-500 text-xs">{formatDate(inv.created_at)}</td>
                        <td className="px-4 py-3.5 text-xs">
                          <span className={inv.status === 'vencido' ? 'text-red-500 font-medium' : 'text-gray-500'}>
                            {inv.status === 'usado' ? formatDate(inv.expires_at) : expiry.label}
                          </span>
                        </td>
                        <td className="px-8 py-3.5">
                          <StatusBadge status={inv.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      <style>{`
        @keyframes rowIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-rowIn { animation: rowIn 0.25s ease-out both; }
      `}</style>
    </div>
  );
};

export default Invitations;