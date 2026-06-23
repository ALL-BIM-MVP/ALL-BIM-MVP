import React from 'react';

interface Proyecto {
  id: string;
  nombre: string;
  ubicacion: string;
  fecha: string;
}

const proyectosIniciales: Proyecto[] = [
  { id: '1', nombre: 'Hospital Antonio Lorena', ubicacion: 'Cusco', fecha: '2025-03-12' },
  { id: '2', nombre: 'Hospital Altiplano Puno', ubicacion: 'Puno', fecha: '2025-03-15' }
];

export const Projects: React.FC = () => {
  return (
    <div className="min-h-screen bg-white font-sans antialiased text-slate-800">
      <header className="border-b border-slate-100 bg-white px-8 py-4 flex items-center justify-between">
        <span className="text-2xl font-black tracking-tight text-blue-800">
          ALL-BIM
        </span>
        <div className="border border-slate-400 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-50">
          Franklin_ModeladorBIM
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-8 py-10">
        <h1 className="text-3xl font-extrabold text-slate-900 mb-6 tracking-tight">
          Proyectos BIM
        </h1>

        <div className="flex items-center gap-4 mb-8">
          <button className="bg-blue-700 hover:bg-blue-800 text-white font-semibold px-4 py-2.5 rounded-lg text-sm transition-colors shadow-sm">
            + Nuevo Proyecto
          </button>
          <span className="text-slate-400 text-sm">
            Selecciona un proyecto para abrir módulos
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {proyectosIniciales.map((proyecto) => (
            <div
              key={proyecto.id}
              className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
            >
              <h2 className="text-xl font-bold text-blue-800 mb-4 group-hover:text-blue-900 transition-colors">
                {proyecto.nombre}
              </h2>
              
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <span>📍</span>
                  <span>{proyecto.ubicacion}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <span>📅</span>
                  <span>{proyecto.fecha}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
};