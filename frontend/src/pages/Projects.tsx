
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Proyecto } from '../types/Project'; 
import { projectService } from '../services/project.service'; 

export const Projects: React.FC = () => {
  const navigate = useNavigate();

  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleCargarProyecto = () => {
    if (!selectedFile) return;

    const nuevoProyecto = projectService.crearDesdeIFC(selectedFile);

    setProyectos([...proyectos, nuevoProyecto]);
    setIsModalOpen(false);
    setSelectedFile(null);
  };

  return (
    <div className="min-h-screen bg-white font-sans antialiased text-slate-800 relative">
      <header className="border-b border-slate-100 bg-white px-8 py-4 flex items-center justify-between">
        <span className="text-2xl font-black tracking-tight text-blue-800">
          ALL-BIM
        </span>
        <div className="rounded-md border border-zinc-200 bg-zinc-50/50 px-4 py-2 text-sm font-medium text-zinc-600 backdrop-blur-sm">
         Nombre del usuario
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-8 py-10">
        <h1 className="text-3xl font-extrabold text-slate-900 mb-6 tracking-tight">
          Proyectos BIM
        </h1>

        <div className="flex items-center gap-4 mb-8">
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-blue-700 hover:bg-blue-800 text-white font-semibold px-4 py-2.5 rounded-lg text-sm transition-colors shadow-sm"
          >
            + Nuevo Proyecto
          </button>
          <span className="text-slate-400 text-sm">
            Selecciona un proyecto para abrir módulos
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {proyectos.map((proyecto) => (
            <div
              key={proyecto.id}
              onClick={() => navigate(`/projects/${proyecto.id}`)}
              className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all cursor-pointer group hover:border-blue-200"
            >
              <h2 className="text-xl font-bold text-blue-800 mb-4 group-hover:text-blue-900 transition-colors">
                {proyecto.nombre}
              </h2>
              
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <span> </span>
                  <span>{proyecto.ubicacion}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <span> </span>
                  <span>{proyecto.fecha}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {proyectos.length === 0 && (
          <div className="text-center py-20 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50 mt-4">
            <p className="text-slate-500 font-medium">No tienes proyectos cargados en esta sesión.</p>
            <p className="text-slate-400 text-sm mt-1">Presiona "+ Nuevo Proyecto" para subir un modelo .ifc</p>
          </div>
        )}
      </main>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-bold text-slate-900 mb-1">Crear Nuevo Proyecto</h2>
            <p className="text-sm text-slate-500 mb-6">Selecciona el modelo IFC desde tu computadora.</p>

            <div className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl p-8 text-center cursor-pointer relative bg-slate-50 transition-colors">
              <input 
                type="file" 
                accept=".ifc" 
                onChange={handleFileChange}
                className="absolute inset-0 opacity-0 cursor-pointer" 
              />
              
              {selectedFile ? (
                <div>
                  <p className="text-blue-600 font-medium text-sm">✓ Archivo listo:</p>
                  <p className="text-slate-800 text-base font-semibold mt-1 truncate">{selectedFile.name}</p>
                  <p className="text-xs text-slate-400 mt-1">({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)</p>
                </div>
              ) : (
                <div>
                  <p className="text-slate-700 font-medium text-sm">Haz clic para buscar archivo .ifc</p>
                  <p className="text-xs text-slate-400 mt-1">El navegador leerá el modelo localmente</p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button 
                onClick={() => { setIsModalOpen(false); setSelectedFile(null); }}
                className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button 
                disabled={!selectedFile}
                onClick={handleCargarProyecto}
                className={`px-4 py-2 text-sm font-semibold rounded-lg text-white shadow-sm transition-colors ${
                  selectedFile ? 'bg-blue-700 hover:bg-blue-800' : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                Cargar Proyecto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};