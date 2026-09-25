import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  SquaresFour, Package, ArrowLineDown, ArrowLineUp, ShoppingCart, Handshake, Receipt, Storefront,
  FileText, ClipboardText, ChartBar, Cube, UsersThree, Gear, Buildings, MagnifyingGlass,
  TreeStructure, ClockCounterClockwise,
} from '@phosphor-icons/react';
import type { AlmacenSection } from '../tabs/AlmacenTab';

interface SidebarItem {
  id: AlmacenSection;
  label: string;
  icon: React.ElementType;
}

interface SidebarSection {
  label: string;
  items: SidebarItem[];
}

// Mismo agrupamiento que el resto de la app real: lo operativo de siempre, lo nuevo de
// abastecimiento/auditoría, y las consultas de trazabilidad/ajustes.
const SECTIONS: SidebarSection[] = [
  {
    label: 'Operación',
    items: [
      { id: 'dashboard', label: 'Inicio', icon: SquaresFour },
      { id: 'almacenes', label: 'Almacenes', icon: Buildings },
      { id: 'inventario', label: 'Inventario', icon: Package },
      { id: 'ingresos', label: 'Ingresos', icon: ArrowLineDown },
      { id: 'salidas', label: 'Salidas', icon: ArrowLineUp },
      { id: 'kardex', label: 'Kardex', icon: FileText },
    ],
  },
  {
    label: 'proceso de compras',
    items: [
      { id: 'requerimientos', label: 'Requerimientos', icon: ClipboardText },
      { id: 'cotizaciones', label: 'Cotizaciones', icon: Handshake },
      { id: 'ordenes-compra', label: 'Órdenes de compra', icon: ShoppingCart },
      { id: 'facturas', label: 'Facturas', icon: Receipt },
      { id: 'proveedores', label: 'Proveedores', icon: Storefront },
    ],
  },
  {
    label: 'Consultas',
    items: [
      { id: 'trazabilidad', label: 'Trazabilidad', icon: TreeStructure },
      { id: 'ajustes', label: 'Ajustes', icon: ClockCounterClockwise },
      { id: 'configuracion', label: 'Administración', icon: Gear },
    ],
  },
];

interface AlmacenSidebarProps {
  active: AlmacenSection;
  onSelect: (section: AlmacenSection) => void;
}

const AlmacenSidebar: React.FC<AlmacenSidebarProps> = ({ active, onSelect }) => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <nav className={`${collapsed ? 'w-14' : 'w-56'} flex-shrink-0 bg-white border-r border-gray-200 py-4 flex flex-col gap-0.5 overflow-y-auto transition-[width] duration-200`}>
      <button
        onClick={() => setCollapsed((prev) => !prev)}
        className="flex items-center justify-center w-full py-1.5 mb-2 text-gray-400 hover:text-gray-600"
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>

      {SECTIONS.map((section, sectionIndex) => (
        <div key={section.label} className={sectionIndex > 0 ? 'mt-3 pt-3 border-t border-gray-100' : ''}>
          {!collapsed && (
            <p className="px-4 mb-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">{section.label}</p>
          )}
          {section.items.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.id;
            return (
              <div key={item.id} className="relative w-full flex items-center justify-center group">
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-[#0056b3]" />
                )}

                <button
                  onClick={() => onSelect(item.id)}
                  className={`flex items-center gap-3 w-full px-4 py-2.5 text-sm text-left transition-colors ${
                    isActive ? 'bg-[#0056b3]/10 text-[#0056b3] font-semibold' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Icon size={18} weight="duotone" className="flex-shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </button>

                {collapsed && (
                  <span
                    className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 whitespace-nowrap
                               rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-semibold text-white
                               opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0
                               transition-all duration-150 shadow-lg z-10"
                  >
                    {item.label}
                    <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-800" />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </nav>
  );
};

export default AlmacenSidebar;
