import React, { useRef, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { AlmacenSummary, Project } from '../../types/project.types';
import { resolveMediaUrl } from '../../utils/media';
import { projectService } from '../../services/project.service';

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
  const [checkingAlmacen, setCheckingAlmacen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // No-null: hay que vaciar Almacén antes de eliminar el proyecto — se pide confirmación aparte.
  const [almacenSummary, setAlmacenSummary] = useState<AlmacenSummary | null>(null);
  
  const [localCoverImage, setLocalCoverImage] = useState(project?.cover_image ?? null);

 
  React.useEffect(() => {
    setLocalCoverImage(project?.cover_image ?? null);
    setUploadError(null);
    setDeleteError(null);
    setAlmacenSummary(null);
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

  // Punto de entrada del botón "Eliminar proyecto": primero revisa si Almacén tiene algo que vaciar.
  const handleDeleteClick = async () => {
    setDeleteError(null);
    setCheckingAlmacen(true);
    try {
      const summary = await projectService.getAlmacenSummary(project.project_id);
      if (summary.is_empty) await confirmAndDeleteProject();
      else setAlmacenSummary(summary);
    } catch (err: any) {
      setDeleteError(err.message || 'No se pudo verificar el contenido de Almacén.');
    } finally {
      setCheckingAlmacen(false);
    }
  };

  // Camino simple: sin datos de Almacén, un solo confirm de siempre.
  const confirmAndDeleteProject = async () => {
    const confirmed = window.confirm(
      `¿Seguro que querés eliminar "${project.name}"? Esta acción no se puede deshacer: se borran también sus archivos, colaboradores e invitaciones.`
    );
    if (!confirmed) return;
    await deleteProjectNow();
  };

  // Camino con datos de Almacén: el panel de abajo ya es la confirmación, sin doble aviso.
  const handleEmptyAndDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await projectService.emptyAlmacenContent(project.project_id);
      await deleteProjectNow();
    } catch (err: any) {
      setDeleteError(err.message || 'No se pudo eliminar el proyecto.');
      setDeleting(false);
    }
  };

  const deleteProjectNow = async () => {
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

        {almacenSummary ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-red-600">
              <TriangleAlert size={18} />
              <h4 className="text-sm font-bold">Este proyecto tiene datos de Almacén BIM</h4>
            </div>
            <p className="text-xs text-gray-500">Se van a borrar junto con el proyecto, de forma irreversible:</p>
            <ul className="text-sm text-gray-800 bg-red-50 border border-red-100 rounded-lg divide-y divide-red-100">
              {[
                { label: 'Almacén(es)', value: almacenSummary.warehouses },
                { label: 'Estante(s)', value: almacenSummary.racks },
                { label: 'Casilla(s)', value: almacenSummary.bins },
                { label: 'Producto(s)', value: almacenSummary.products },
                { label: 'Ingreso(s)', value: almacenSummary.goods_receipts },
                { label: 'Vale(s) de salida', value: almacenSummary.goods_issues },
                { label: 'Movimiento(s) de Kardex', value: almacenSummary.inventory_movements },
              ].filter((item) => item.value > 0).map((item) => (
                <li key={item.label} className="flex items-center justify-between px-3 py-1.5">
                  <span>{item.label}</span>
                  <span className="font-semibold">{item.value}</span>
                </li>
              ))}
            </ul>
            {deleteError && <p className="text-[11px] text-red-600">{deleteError}</p>}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setAlmacenSummary(null)}
                disabled={deleting}
                className="flex-1 border border-gray-200 text-gray-600 text-xs font-semibold py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleEmptyAndDelete}
                disabled={deleting}
                className="flex-1 bg-red-600 text-white text-xs font-semibold py-2 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Eliminando...' : 'Vaciar y eliminar definitivamente'}
              </button>
            </div>
          </div>
        ) : (
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
              onClick={handleDeleteClick}
              disabled={deleting || checkingAlmacen}
              className="w-full text-center text-red-600 hover:bg-red-50 border border-red-200 text-xs font-semibold py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {checkingAlmacen ? 'Verificando...' : deleting ? 'Eliminando...' : 'Eliminar proyecto'}
            </button>
            {deleteError && (
              <p className="text-[11px] text-red-600 mt-1 text-center">{deleteError}</p>
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  );
};

export default ProjectDetailsModal;