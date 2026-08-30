import React, { useState } from 'react';
import { NewProjectData } from '../types/project.types';

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (projectData: NewProjectData) => Promise<void>;
}

const NewProjectModal: React.FC<NewProjectModalProps> = ({
  isOpen,
  onClose,
  onCreate
}) => {
  const [newProject, setNewProject] = useState<NewProjectData>({
    name: '',
    location: '',
    startDate: '',
    endDate: '',
    description: '',
    client: '',
    contractor: ''
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onCreate({
        ...newProject,
        // Campos opcionales: si quedaron vacíos, mandamos null en vez de
        // string vacío (el backend acepta null, y así no guardamos "" como dato).
        client: newProject.client?.trim() ? newProject.client.trim() : null,
        contractor: newProject.contractor?.trim() ? newProject.contractor.trim() : null,
      });
      setNewProject({ name: '', location: '', startDate: '', endDate: '', description: '', client: '', contractor: '' });
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">

      <div className="bg-white rounded-2xl w-[500px] max-h-[90vh] overflow-hidden shadow-2xl animate-floatIn flex flex-col">
        <div className="overflow-y-auto p-8">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-2xl font-bold text-gray-800">Nuevo Proyecto</h3>
          <button
            onClick={onClose}
            disabled={submitting}
            className="text-gray-400 hover:text-gray-600 text-2xl transition-colors disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Nombre del Proyecto *
            </label>
            <input
              type="text"
              required
              placeholder="Ej. Proyecto Largo ALL-BIM"
              value={newProject.name}
              onChange={(e) => setNewProject({...newProject, name: e.target.value})}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0056b3] focus:border-transparent outline-none transition"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Ubicación
            </label>
            <input
              type="text"
              placeholder="Ej. Lima, Perú"
              value={newProject.location}
              onChange={(e) => setNewProject({...newProject, location: e.target.value})}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0056b3] focus:border-transparent outline-none transition"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Cliente
              </label>
              <input
                type="text"
                placeholder="Ej. Municipalidad de Puno"
                value={newProject.client ?? ''}
                onChange={(e) => setNewProject({...newProject, client: e.target.value})}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0056b3] focus:border-transparent outline-none transition"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Contratista
              </label>
              <input
                type="text"
                placeholder="Ej. ALL-BIM Constructora SAC"
                value={newProject.contractor ?? ''}
                onChange={(e) => setNewProject({...newProject, contractor: e.target.value})}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0056b3] focus:border-transparent outline-none transition"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Fecha Inicio
              </label>
              <input
                type="date"
                value={newProject.startDate}
                onChange={(e) => setNewProject({...newProject, startDate: e.target.value})}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0056b3] focus:border-transparent outline-none transition"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Fecha Final
              </label>
              <input
                type="date"
                value={newProject.endDate}
                onChange={(e) => setNewProject({...newProject, endDate: e.target.value})}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0056b3] focus:border-transparent outline-none transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Descripción
            </label>
            <textarea
              rows={3}
              placeholder="Descripción del proyecto..."
              value={newProject.description}
              onChange={(e) => setNewProject({...newProject, description: e.target.value})}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0056b3] focus:border-transparent outline-none resize-none transition"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-semibold disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2.5 bg-[#0056b3] text-white rounded-lg hover:bg-[#004494] transition font-semibold disabled:opacity-50"
            >
              {submitting ? 'Creando...' : 'Crear Proyecto'}
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
};

export default NewProjectModal;