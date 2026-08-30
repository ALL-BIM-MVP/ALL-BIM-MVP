import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { MemberModuleRole } from '../types/invitation.types';

interface RoleSummaryProps {
  isAdmin: boolean;
  moduleRoles: MemberModuleRole[];
  adminLabel: string;
  emptyLabel?: string;
}

// Cómo se resume el rol de alguien en un proyecto — reusado en las 3
// pantallas que necesitan mostrarlo (Mis Invitaciones, la campanita de
// notificaciones, el header dentro de un proyecto): administrador es
// un caso aparte (no vive en module_roles), un solo módulo se lee
// directo, y con varios se resume corto + un panel al hacer clic con
// el detalle completo. Cada pantalla lo envuelve en su propia
// insignia/estilo — esto solo resuelve el texto + el detalle.
//
// El panel se porta a document.body (no un simple position:absolute
// adentro del flujo normal) — la campanita de notificaciones envuelve
// esto en una lista con overflow-y-auto propio, que recortaría el
// panel casi entero si se dejara adentro (mismo bug real que ya se
// encontró y arregló en RoleDropdown, ColaboradoresTab.tsx).
export const RoleSummary: React.FC<RoleSummaryProps> = ({
  isAdmin,
  moduleRoles,
  adminLabel,
  emptyLabel = 'Sin rol asignado',
}) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const PANEL_WIDTH = 256; // w-64

  const toggleOpen = () => {
    if (!open && wrapRef.current) {
      const rect = wrapRef.current.getBoundingClientRect();
      const margin = 4;
      const left = Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 8);
      setPos({ top: rect.bottom + margin, left: Math.max(8, left) });
    }
    setOpen((o) => !o);
  };

  if (isAdmin) return <>{adminLabel}</>;
  if (moduleRoles.length === 0) return <>{emptyLabel}</>;

  const [first, ...rest] = moduleRoles;
  const label = `${first.module_name}: ${first.role_name}`;

  if (rest.length === 0) return <>{label}</>;

  return (
    <span className="relative inline-block" ref={wrapRef}>
      <button
        type="button"
        onClick={toggleOpen}
        className="inline-flex items-center gap-1 hover:underline"
      >
        {label} +{rest.length}
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && pos && createPortal(
        <div
          ref={panelRef}
          data-role-summary-panel
          className="fixed z-[10200] w-64 bg-white border border-gray-200 rounded-lg shadow-xl py-1.5 text-left"
          style={{ top: pos.top, left: pos.left }}
        >
          {moduleRoles.map((mr) => (
            <div key={mr.module_code} className="px-3 py-1.5 flex items-center justify-between gap-2 text-sm">
              <span className="text-gray-700">{mr.module_name}</span>
              <span className="text-gray-500">{mr.role_name}</span>
            </div>
          ))}
        </div>,
        document.body
      )}
    </span>
  );
};

export default RoleSummary;
