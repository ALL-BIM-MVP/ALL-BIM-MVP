// src/pages/AdminUsers.tsx
import React from "react";
import {
  Users as UsersIcon, ShieldCheck, Eye, Wrench, User, UserCog, RefreshCw, AlertTriangle,
} from "lucide-react";
import { useUsers } from "../hooks/useUsers";
import PageHeader from "../components/PageHeader";
import { resolveMediaUrl } from "../utils/media";

// ============================================================
// Helpers de presentación — mismo patrón que Invitations.tsx: ícono/color
// por rol, y avatar con color determinístico según un string (acá el
// correo, igual que ahí) en vez de aleatorio en cada render.
// ============================================================

const ROLE_STYLE: Record<string, { icon: React.ReactNode; ring: string; text: string; bg: string }> = {
  ADMINISTRADOR: { icon: <ShieldCheck size={15} />, ring: "ring-violet-200", text: "text-violet-700", bg: "bg-violet-50" },
  SUPERVISOR: { icon: <Eye size={15} />, ring: "ring-sky-200", text: "text-sky-700", bg: "bg-sky-50" },
  MODERADOR: { icon: <Wrench size={15} />, ring: "ring-amber-200", text: "text-amber-700", bg: "bg-amber-50" },
  USUARIO: { icon: <User size={15} />, ring: "ring-slate-200", text: "text-slate-600", bg: "bg-slate-50" },
};
const roleStyle = (name: string) => ROLE_STYLE[(name || "").toUpperCase()] ?? {
  icon: <UserCog size={15} />, ring: "ring-gray-200", text: "text-gray-600", bg: "bg-gray-50",
};

const AVATAR_PALETTE = ["#0056b3", "#7c3aed", "#0d9488", "#c2410c", "#be185d", "#4338ca"];
function avatarColorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

// ============================================================
// Insignia de rol — idéntica en estructura a la de Invitations.tsx
// ============================================================

const RoleBadge: React.FC<{ name: string }> = ({ name }) => {
  const s = roleStyle(name);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${s.bg} ${s.text} ring-1 ${s.ring}`}>
      {s.icon}
      {name || "Sin rol"}
    </span>
  );
};

const AdminUsers: React.FC = () => {
  const { users, loading: usersLoading } = useUsers();

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader title="Gestión de Usuarios" subtitle="Administra los usuarios del sistema" />

      <main className="max-w-4xl mx-auto p-8">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-8 py-5 border-b border-gray-100">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-[#0056b3]/10 flex items-center justify-center flex-shrink-0">
                <UsersIcon size={18} className="text-[#0056b3]" />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-800 leading-tight">Usuarios del sistema</h2>
                <p className="text-sm text-gray-400 mt-0.5">
                  {usersLoading ? "Cargando..." : `${users.length} usuario${users.length !== 1 ? "s" : ""} en total`}
                </p>
              </div>
            </div>
          </div>

          {usersLoading ? (
            <div className="py-16 text-center text-gray-400">
              <RefreshCw size={22} className="animate-spin mx-auto mb-2" />
              <p className="text-sm">Cargando usuarios...</p>
            </div>
          ) : users.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-3">
                <UsersIcon size={22} className="text-gray-300" />
              </div>
              <p className="text-sm font-medium text-gray-500">Todavía no hay usuarios registrados</p>
              <p className="text-xs text-gray-400 mt-1">Los usuarios invitados van a aparecer acá una vez creen su cuenta.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="px-8 py-2.5 text-left font-semibold text-gray-400 text-[11px] uppercase tracking-wide">Nombre</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-400 text-[11px] uppercase tracking-wide">Correo</th>
                    <th className="px-8 py-2.5 text-left font-semibold text-gray-400 text-[11px] uppercase tracking-wide">Rol</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, i) => (
                    <tr
                      key={u.user_id}
                      className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors animate-rowIn"
                      style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
                    >
                      <td className="px-8 py-3.5">
                        <div className="flex items-center gap-2.5">
                          {u.profile_picture_url ? (
                            <img
                              src={resolveMediaUrl(u.profile_picture_url)}
                              alt={u.name}
                              className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                            />
                          ) : (
                            <span
                              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
                              style={{ backgroundColor: avatarColorFor(u.email || u.name || String(u.user_id)) }}
                            >
                              {(u.name || u.email || "?").charAt(0).toUpperCase()}
                            </span>
                          )}
                          <span className="text-gray-800">
                            {u.name}{u.last_name ? ` ${u.last_name}` : ''}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-gray-500 text-xs">{u.email}</td>
                      <td className="px-8 py-3.5">
                        <RoleBadge name={u.role_name} />
                      </td>
                    </tr>
                  ))}
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

export default AdminUsers;