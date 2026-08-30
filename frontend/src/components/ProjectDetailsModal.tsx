import React, { useRef, useState } from 'react';
import { Project } from '../types/project.types';
import { resolveMediaUrl } from '../utils/media';
import { projectService } from '../services/project.service';

interface ProjectDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project | null;
  onCoverImageUpdated?: (projectId: number, coverImage: Project['cover_image']) => void;
  // El PADRE hace el borrado de verdad (useProjects().deleteProject) —
  // no este modal — porque ese hook, al terminar, también saca el
  // proyecto de la lista compartida. Si este modal llamara al
  // servicio directo (como hacía antes), el borrado funcionaba pero
  // la lista de Projects.tsx nunca se enteraba — quedaba desactualizada
  // hasta cambiar de filtro o hacer F5 (bug real reportado por el
  // usuario el 2026-08-30).
  onProjectDeleted?: (projectId: number) => Promise<void>;
}

const ProjectDetailsModal: React.FC<ProjectDetailsModalProps> = ({
  isOpen,
  onClose,
  project,
  onCoverImageUpdated,
  onProjectDeleted
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  
  const [localCoverImage, setLocalCoverImage] = useState(project?.cover_image ?? null);

 
  React.useEffect(() => {
    setLocalCoverImage(project?.cover_image ?? null);
    setUploadError(null);
    setDeleteError(null);
  }, [project?.project_id]);

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

  const handlePickImage = () => {
    if (uploading) return;
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite volver a elegir el mismo archivo después
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    try {
      const newCoverImage = await projectService.setCoverImage(project.project_id, file);
      setLocalCoverImage(newCoverImage);
      onCoverImageUpdated?.(project.project_id, newCoverImage);
    } catch (err: any) {
      setUploadError(err.message || 'No se pudo subir la imagen.');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteProject = async () => {
    const confirmed = window.confirm(
      `¿Seguro que querés eliminar "${project.name}"? Esta acción no se puede deshacer: se borran también sus archivos, colaboradores e invitaciones.`
    );
    if (!confirmed) return;

    setDeleting(true);
    setDeleteError(null);
    try {
      await onProjectDeleted?.(project.project_id);
      onClose();
    } catch (err: any) {
      setDeleteError(err.message || 'No se pudo eliminar el proyecto.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-96 max-h-[85vh] overflow-y-auto p-6 shadow-2xl animate-floatIn">
        <div className="flex items-center justify-between mb-4 pb-2.5 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
             Características
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition text-xl"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          {/* Portada */}
          <div>
            <div
              onClick={handlePickImage}
              className="relative group rounded-lg overflow-hidden border border-gray-200 bg-gray-100 h-28 cursor-pointer"
            >
              {localCoverImage && (
                <img
                  src={resolveMediaUrl(localCoverImage.url)}
                  alt={project.name}
                  className="w-full h-full object-cover"
                />
              )}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-semibold px-2.5 py-1 bg-black/50 rounded-lg">
                  {uploading ? 'Subiendo...' : 'Cambiar portada'}
                </span>
              </div>
              {uploading && (
                <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                  <span className="text-xs font-semibold text-gray-600">Subiendo...</span>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelected}
              className="hidden"
            />
            {uploadError && (
              <p className="text-[11px] text-red-600 mt-1">{uploadError}</p>
            )}
          </div>

          <h4 className="text-base font-bold text-gray-800">{project.name}</h4>

          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Ubicación</p>
            <p className="text-sm text-gray-800">{project.location || '---'}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Cliente</p>
              <p className="text-sm text-gray-800">{project.client || '---'}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Contratista</p>
              <p className="text-sm text-gray-800">{project.contractor || '---'}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Inicio</p>
              <p className="text-sm text-gray-800">{formatDate(project.start_date)}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Final</p>
              <p className="text-sm text-gray-800">{formatDate(project.end_date)}</p>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Estado</p>
            <span className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${getStatusColor(project.estado)}`}>
              {project.estado}
            </span>
          </div>

          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Descripción</p>
            <p className="text-sm text-gray-800">{project.description || 'Sin descripción'}</p>
          </div>

          

          <div className="pt-3 mt-1 border-t border-gray-200">
            <button
              onClick={handleDeleteProject}
              disabled={deleting}
              className="w-full text-center text-red-600 hover:bg-red-50 border border-red-200 text-xs font-semibold py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {deleting ? 'Eliminando...' : 'Eliminar proyecto'}
            </button>
            {deleteError && (
              <p className="text-[11px] text-red-600 mt-1 text-center">{deleteError}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectDetailsModal;