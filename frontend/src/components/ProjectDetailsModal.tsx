import React from 'react';
import { Project } from '../types/project.types';

interface ProjectDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project | null;
}

const ProjectDetailsModal: React.FC<ProjectDetailsModalProps> = ({
  isOpen,
  onClose,
  project
}) => {
  if (!isOpen || !project) return null;

  const formatDate = (date: string) => {
    if (!date) return '---';
    return new Date(date).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Activo': return 'bg-green-100 text-green-700';
      case 'Completado': return 'bg-blue-100 text-blue-700';
      case 'Pendiente': return 'bg-yellow-100 text-yellow-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-[500px] max-h-[90vh] overflow-y-auto p-8 shadow-2xl animate-floatIn">
        <div className="flex items-center justify-between mb-6 pb-3 border-b border-gray-200">
          <h3 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
             Características
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition text-2xl"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <h4 className="text-xl font-bold text-gray-800">{project.name}</h4>
          
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Ubicación</p>
            <p className="text-base text-gray-800">{project.location || '---'}</p>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Inicio</p>
              <p className="text-base text-gray-800">{formatDate(project.start_date)}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Final</p>
              <p className="text-base text-gray-800">{formatDate(project.end_date)}</p>
            </div>
          </div>
          
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Estado</p>
            <span className={`inline-block mt-1 px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(project.estado)}`}>
              {project.estado}
            </span>
          </div>
          
        
          
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Descripción</p>
            <p className="text-base text-gray-800">{project.description || 'Sin descripción'}</p>
          </div>
          
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Archivos IFC</p>
            {project.hasIFC ? (
              <div className="mt-2 bg-green-50 text-green-700 p-3 rounded-lg text-sm font-semibold">
                 Archivo IFC cargado
              </div>
            ) : (
              <p className="text-base text-gray-400">Sin archivos IFC</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectDetailsModal;