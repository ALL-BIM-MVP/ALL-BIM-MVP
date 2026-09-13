import React, { useState } from 'react';
import AlmacenSidebar from '../Almacen/AlmacenSidebar';
import NuevoIngreso from '../Almacen/pages/Ingresos/NuevoIngreso';

export type AlmacenSection =
  | 'dashboard' | 'inventario' | 'ingresos' | 'salidas' | 'ordenes-compra'
  | 'guias-remision' | 'solicitudes' | 'reportes' | 'bim-modelos' | 'usuarios' | 'configuracion';

const AlmacenTab: React.FC = () => {
  const [section, setSection] = useState<AlmacenSection>('ingresos');

  return (
    <div className="h-full flex bg-white @container">
      <AlmacenSidebar active={section} onSelect={setSection} />
      <div className="flex-1 overflow-y-auto">
        {section === 'ingresos' ? (
          <NuevoIngreso />
        ) : (
          <div className="h-full flex items-center justify-center text-gray-400 text-sm">
            En construcción
          </div>
        )}
      </div>
    </div>
  );
};

export default AlmacenTab;
