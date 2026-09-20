import React, { useState } from 'react';
import AlmacenSidebar from '../Almacen/AlmacenSidebar';
import Almacenes from '../Almacen/pages/Almacenes/Almacenes';
import Ingresos from '../Almacen/pages/Ingresos/Ingresos';
import ValesSalida from '../Almacen/pages/Salidas/ValesSalida';
import Inventario from '../Almacen/pages/Inventario/Inventario';
import Kardex from '../Almacen/pages/Kardex/Kardex';
import BuscarUbicacion from '../Almacen/pages/BuscarUbicacion/BuscarUbicacion';

export type AlmacenSection =
  | 'dashboard' | 'almacenes' | 'inventario' | 'ingresos' | 'salidas' | 'kardex' | 'buscar-ubicacion'
  | 'ordenes-compra' | 'guias-remision' | 'solicitudes' | 'reportes' | 'bim-modelos' | 'usuarios' | 'configuracion';

interface AlmacenTabProps {
  projectId: number;
}

const AlmacenTab: React.FC<AlmacenTabProps> = ({ projectId }) => {
  const [section, setSection] = useState<AlmacenSection>('ingresos');

  return (
    <div className="h-full flex bg-white @container">
      <AlmacenSidebar active={section} onSelect={setSection} />
      <div className="flex-1 overflow-y-auto">
        {section === 'almacenes' ? (
          <Almacenes projectId={projectId} />
        ) : section === 'ingresos' ? (
          <Ingresos projectId={projectId} />
        ) : section === 'salidas' ? (
          <ValesSalida projectId={projectId} />
        ) : section === 'kardex' ? (
          <Kardex projectId={projectId} />
        ) : section === 'buscar-ubicacion' ? (
          <BuscarUbicacion projectId={projectId} />
        ) : section === 'inventario' ? (
          <Inventario projectId={projectId} />
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
