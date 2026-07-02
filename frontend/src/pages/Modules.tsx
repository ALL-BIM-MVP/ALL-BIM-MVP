import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { projectService } from '../services/project.service';

interface Modulo {
  id: string;
  nombre: string;
}

const modulos: Modulo[] = [
  { id: 'metrados', nombre: 'METRADOS BIM' },
  { id: 'ssomma', nombre: 'SSOMMA BIM' },
  { id: 'calidad', nombre: 'CALIDAD BIM' },
  { id: 'logistica', nombre: 'LOGÍSTICA BIM' },
  { id: 'costos', nombre: 'COSTOS BIM (5D)' },
  { id: 'planos', nombre: 'PLANOS BIM' },
];

export const Modules: React.FC = () => {
  const navigate = useNavigate();
  const { proyectoId } = useParams<{ proyectoId: string }>();

  const proyectoActual = projectService.obtenerPorId(proyectoId || '');

  return (
    <div className="min-h-screen bg-white font-sans antialiased text-slate-800">
      <header className="border-b border-slate-100 bg-white px-8 py-4 flex items-center justify-between">
        <span className="text-2xl font-black tracking-tight text-blue-800">ALL-BIM</span>
        <button 
          onClick={() => navigate('/projects')}
          className="border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium px-4 py-1.5 rounded-lg text-sm transition-colors shadow-sm"
        >
          ← Volver a Proyectos
        </button>
      </header>

      <main className="max-w-7xl mx-auto px-8 py-10">
        <div className="flex justify-between items-baseline mb-10">
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Módulos</h1>
          <span className="text-slate-400 font-medium text-lg">
            {proyectoActual ? proyectoActual.nombre : 'Cargando proyecto...'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {modulos.map((modulo) => {
            const esMetrados = modulo.id === 'metrados';
            return (
              <button
                key={modulo.id}
                disabled={!esMetrados}
                onClick={() => {
                  if (esMetrados) {
                    navigate(`/projects/${proyectoId}/metrados`);
                  }
                }}
                className={`bg-white border text-center p-8 rounded-2xl shadow-sm transition-all font-bold tracking-wide text-sm flex items-center justify-center min-h-[100px] ${
                  esMetrados 
                    ? 'border-red-400 ring-2 ring-red-100 text-slate-800 cursor-pointer hover:shadow-md' 
                    : 'border-slate-100 text-slate-400 cursor-not-allowed opacity-60'
                }`}
              >
                {modulo.nombre}
              </button>
            );
          })}
        </div>
      </main>
    </div>
  );
};