import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Search, FileText, FileSpreadsheet, Trash2, Download, X,
  ArrowUpDown, Check, FolderOpen, AlertCircle, RefreshCw,
  Image as ImageIcon, File as FileIcon, LayoutGrid, ZoomIn,
} from 'lucide-react';
import { ProjectFile } from '../../types/project.types';
import { projectService } from '../../services/project.service';

type SortKey = 'name' | 'date' | 'size';
type FileCategory = 'ifc' | 'excel' | 'pdf' | 'image' | 'other';

// thumbnail_url todavía no está en el tipo ProjectFile compartido — se
// agrega acá para no tener que tocar ese archivo. Si ya lo agregaste al
// tipo original, esta línea se puede borrar sin problema.
type FileWithThumbnail = ProjectFile & { thumbnail_url?: string | null };

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatRelativeDate(iso: string): string {
  const timestamp = new Date(iso).getTime();
  const diffMs = Date.now() - timestamp;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Hace un momento';
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `Hace ${diffH} h`;
  const diffDays = Math.floor(diffH / 24);
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return `Hace ${diffDays} días`;
  return new Date(timestamp).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
}

function sortFiles(files: ProjectFile[], key: SortKey): ProjectFile[] {
  const copy = [...files];
  switch (key) {
    case 'name': return copy.sort((a, b) => a.name.localeCompare(b.name));
    case 'size': return copy.sort((a, b) => parseInt(b.file_size, 10) - parseInt(a.file_size, 10));
    case 'date': default: return copy.sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime());
  }
}

// Detecta la categoría de un archivo. Chequea la extensión del nombre de
// forma INDEPENDIENTE de file_type (no como fallback solo-si-type-está-vacío)
// porque el backend puede devolver un file_type que no es exactamente
// "image"/"ifc"/etc. para archivos que sí lo son por extensión — si eso pasa,
// la extensión debe poder "ganar" igual, o el archivo queda mal clasificado
// (ej: una imagen .png cayendo en "Otros" con thumbnail_url presente pero
// invisible porque nunca se llegó a chequear la extensión).
function getFileCategory(file: ProjectFile): FileCategory {
  const type = (file.file_type || '').toLowerCase();
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];
  const EXCEL_EXTS = ['xlsx', 'xls', 'xlsm', 'csv'];

  if (type === 'image' || IMAGE_EXTS.includes(ext)) return 'image';
  if (EXCEL_EXTS.includes(type) || EXCEL_EXTS.includes(ext)) return 'excel';
  if (type === 'ifc' || ext === 'ifc') return 'ifc';
  if (type === 'pdf' || ext === 'pdf') return 'pdf';
  return 'other';
}

const SORT_LABELS: Record<SortKey, string> = { date: 'Más recientes', name: 'Nombre (A-Z)', size: 'Tamaño' };

interface CategoryConfig {
  key: FileCategory | 'all';
  label: string;
  icon: React.ReactNode;
  dotColor: string;
}

const CATEGORY_CONFIG: CategoryConfig[] = [
  { key: 'all', label: 'Todos', icon: <LayoutGrid size={13} />, dotColor: 'bg-gray-400' },
  { key: 'ifc', label: 'IFC', icon: <FileText size={13} />, dotColor: 'bg-[#0056b3]' },
  { key: 'excel', label: 'Excel', icon: <FileSpreadsheet size={13} />, dotColor: 'bg-emerald-500' },
  { key: 'pdf', label: 'PDF', icon: <FileIcon size={13} />, dotColor: 'bg-rose-400' },
  { key: 'image', label: 'Imágenes', icon: <ImageIcon size={13} />, dotColor: 'bg-amber-400' },
  { key: 'other', label: 'Otros', icon: <FolderOpen size={13} />, dotColor: 'bg-gray-400' },
];

const CATEGORY_ICON: Record<FileCategory, { icon: React.ReactNode; bg: string }> = {
  ifc: { icon: <FileText size={16} className="text-[#0056b3]" />, bg: 'bg-blue-50' },
  excel: { icon: <FileSpreadsheet size={16} className="text-emerald-600" />, bg: 'bg-emerald-50' },
  pdf: { icon: <FileIcon size={16} className="text-rose-500" />, bg: 'bg-rose-50' },
  image: { icon: <ImageIcon size={16} className="text-amber-500" />, bg: 'bg-amber-50' },
  other: { icon: <FolderOpen size={16} className="text-gray-500" />, bg: 'bg-gray-100' },
};

// Fase 3 — mismo criterio que en Visor3DTab.tsx: badge chico de versión,
// no es un error ni algo para ocultar cuando no es la vigente.
const VersionBadge: React.FC<{ file: ProjectFile }> = ({ file }) => {
  if (file.version_number === null || file.version_number === undefined) return null;
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-[10px] font-semibold text-slate-400">v{file.version_number}</span>
      {file.is_current === false && (
        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
          versión anterior
        </span>
      )}
    </span>
  );
};

interface LightboxState {
  file: FileWithThumbnail;
  blobUrl: string | null;
  loading: boolean;
  error: string | null;
}

interface ArchivosTabProps {
  projectId: number;
  currentUserId?: number | null;
  isProjectOwner: boolean;
}

const ArchivosTab: React.FC<ArchivosTabProps> = ({ projectId, currentUserId, isProjectOwner }) => {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<FileCategory | 'all'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  // IDs de miniaturas que fallaron al cargar (token vencido, red, etc.)
  // -> mostramos el ícono genérico en su lugar.
  const [thumbErrorIds, setThumbErrorIds] = useState<Set<string>>(new Set());
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const lightboxBlobUrlRef = useRef<string | null>(null);
  // Fase 3 — default ON (solo vigentes), igual que en el modal de
  // Visor3DTab.tsx, para no mostrar tombstones viejos de entrada.
  const [onlyCurrentVersions, setOnlyCurrentVersions] = useState(true);

  const markThumbError = useCallback((fileId: string) => {
    setThumbErrorIds((prev) => {
      if (prev.has(fileId)) return prev;
      const next = new Set(prev);
      next.add(fileId);
      return next;
    });
  }, []);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await projectService.getProjectFiles(projectId, onlyCurrentVersions);
      setFiles(data);
      // Al refrescar la lista, las miniaturas vienen con tokens nuevos:
      // limpiamos los errores viejos para darles otra oportunidad.
      setThumbErrorIds(new Set());
    } catch (err: any) {
      setError(err.message || 'No se pudieron cargar los archivos.');
    } finally {
      setLoading(false);
    }
  }, [projectId, onlyCurrentVersions]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  // La URL firmada de cada miniatura vence a los 5 min. Si el usuario deja
  // el tab abierto más que eso, refrescamos la lista sola para traer
  // tokens nuevos (evita que las miniaturas se vean rotas sin motivo
  // aparente). No afecta imágenes ya cargadas en el DOM.
  useEffect(() => {
    const interval = setInterval(() => {
      loadFiles();
    }, 4 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadFiles]);

  const term = searchTerm.trim().toLowerCase();
  const isSearching = term.length > 0;

  const categoryCounts = useMemo(() => {
    const counts: Record<FileCategory, number> = { ifc: 0, excel: 0, pdf: 0, image: 0, other: 0 };
    files.forEach((f) => { counts[getFileCategory(f)] += 1; });
    return counts;
  }, [files]);

  const totalSize = useMemo(
    () => files.reduce((sum, f) => sum + parseInt(f.file_size, 10), 0),
    [files]
  );

  const filteredFiles = useMemo(() => {
    let result = files;
    if (categoryFilter !== 'all') {
      result = result.filter((f) => getFileCategory(f) === categoryFilter);
    }
    if (isSearching) {
      result = result.filter((f) => f.name.toLowerCase().includes(term));
    }
    return sortFiles(result, sortKey);
  }, [files, categoryFilter, term, isSearching, sortKey]);

  // Solo quien subió el archivo, o el dueño del proyecto, puede borrarlo
  // (mismo criterio que aplica el backend).
  const canDelete = (file: ProjectFile) =>
    isProjectOwner || file.uploaded_by?.user_id === currentUserId;

  const handleRemoveClick = (file: ProjectFile) => {
    if (confirmDeleteId === file.file_id) {
      handleDelete(file);
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(file.file_id);
    }
  };

  const handleDelete = async (file: ProjectFile) => {
    setDeletingId(file.file_id);
    try {
      await projectService.deleteProjectFile(projectId, file.file_id);
      setFiles((prev) => prev.filter((f) => f.file_id !== file.file_id));
    } catch (err: any) {
      alert(err.message || 'No se pudo eliminar el archivo.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDownload = async (file: ProjectFile) => {
    setDownloadingId(file.file_id);
    try {
      await projectService.downloadFile(file.file_id, file.name);
    } catch (err: any) {
      alert(err.message || 'No se pudo descargar el archivo.');
    } finally {
      setDownloadingId(null);
    }
  };

  // Abre el visor en grande. Recién acá se pide /files/:id/content
  // autenticado (Bearer) + Blob — on-demand, una sola request, tal como
  // indica la doc (no hay N+1 que evitar en este caso puntual).
  const openLightbox = useCallback(async (file: FileWithThumbnail) => {
    setLightbox({ file, blobUrl: null, loading: true, error: null });
    try {
      const blob = await projectService.getFileContentBlob(file.file_id);
      const url = URL.createObjectURL(blob);
      lightboxBlobUrlRef.current = url;
      setLightbox({ file, blobUrl: url, loading: false, error: null });
    } catch (err: any) {
      setLightbox({ file, blobUrl: null, loading: false, error: err.message || 'No se pudo cargar la imagen.' });
    }
  }, []);

  const closeLightbox = useCallback(() => {
    if (lightboxBlobUrlRef.current) {
      URL.revokeObjectURL(lightboxBlobUrlRef.current);
      lightboxBlobUrlRef.current = null;
    }
    setLightbox(null);
  }, []);

  // Cerrar con Escape mientras el visor está abierto.
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeLightbox(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, closeLightbox]);

  return (
    <div className="flex flex-col overflow-hidden bg-white border border-gray-200 rounded-md shadow-sm h-full min-h-[600px] max-w-5xl mx-auto w-full relative">
      <div className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-gray-100 flex items-end justify-between">
        <div className="flex items-start gap-3.5 border-l-[3px] border-[#0056b3] pl-4">
          <div className="w-10 h-10 rounded-md bg-[#0056b3] flex items-center justify-center flex-shrink-0 mt-0.5">
            <FolderOpen size={18} className="text-white" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-[#0056b3] uppercase tracking-wider mb-0.5">
              Gestión de documentos
            </p>
            <h2 className="text-xl leading-none">
              <span className="font-bold text-gray-800">Archivos</span>{' '}
              <span className="font-normal text-gray-400">del proyecto</span>
            </h2>
            <p className="text-sm text-gray-500 mt-1.5">Modelos IFC y otros archivos asociados a este proyecto.</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {files.length > 0 && (
            <p className="text-xs text-gray-400 font-medium whitespace-nowrap">
              {files.length} archivo{files.length !== 1 ? 's' : ''} en total · {formatSize(totalSize)}
            </p>
          )}
          <button
            onClick={loadFiles}
            disabled={loading}
            className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-50 hover:text-[#0056b3] disabled:opacity-50"
            title="Actualizar lista"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Buscador */}
      <div className="flex-shrink-0 px-6 pt-3 border-b border-gray-100 pb-3">
        <div className="relative mb-3">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar en todos los archivos..."
            className="w-full pl-9 pr-8 py-2 text-sm bg-slate-50 border border-gray-200 rounded-md focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3] outline-none transition-colors"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          {/* Chips de filtro por tipo */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 -mx-0.5 px-0.5">
            {CATEGORY_CONFIG.map((cat) => {
              const isActive = categoryFilter === cat.key;
              const count = cat.key === 'all' ? files.length : categoryCounts[cat.key as FileCategory];
              return (
                <button
                  key={cat.key}
                  onClick={() => setCategoryFilter(cat.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold whitespace-nowrap transition-colors flex-shrink-0 ${
                    isActive
                      ? 'bg-[#0056b3] text-white border-[#0056b3] shadow-sm'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-white/70' : cat.dotColor}`} />
                  {cat.label}
                  <span className={`text-[10px] ${isActive ? 'text-white/70' : 'text-gray-400'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Fase 3: toggle ver todo el historial vs. solo vigentes.
              Solo afecta a los archivos IFC (el resto no tiene versión). */}
          <label className="flex items-center gap-1.5 text-[11px] text-gray-500 cursor-pointer select-none flex-shrink-0 whitespace-nowrap">
            <input
              type="checkbox"
              checked={!onlyCurrentVersions}
              onChange={(e) => setOnlyCurrentVersions(!e.target.checked)}
              className="rounded border-gray-300 text-[#0056b3] focus:ring-[#0056b3]"
            />
            Ver todas las versiones
          </label>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-gray-400">
          <RefreshCw size={22} className="animate-spin" />
          <p className="text-sm">Cargando archivos...</p>
        </div>
      ) : error ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-red-500 px-6 text-center">
          <AlertCircle size={22} />
          <p className="text-sm">{error}</p>
          <button onClick={loadFiles} className="text-xs font-semibold text-[#0056b3] hover:underline mt-1">
            Reintentar
          </button>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Barra de orden */}
          <div className="flex-shrink-0 flex items-center justify-end px-5 py-2 border-b border-gray-100">
            <div className="relative">
              <button
                onClick={() => setSortMenuOpen((prev) => !prev)}
                className="flex items-center gap-1 px-2 py-1.5 bg-white border border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700 rounded-md text-xs font-medium transition-colors shadow-sm"
                title="Ordenar"
              >
                <ArrowUpDown size={12} />
                <span>{SORT_LABELS[sortKey]}</span>
              </button>
              {sortMenuOpen && (
                <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-md shadow-lg py-1 min-w-[150px]">
                  {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                    <button
                      key={key}
                      onClick={() => { setSortKey(key); setSortMenuOpen(false); }}
                      className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-left text-gray-600 hover:bg-gray-50"
                    >
                      {SORT_LABELS[key]}
                      {sortKey === key && <Check size={12} className="text-[#0056b3]" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Lista */}
          <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
            {filteredFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-14 px-4">
                <div className="w-10 h-10 rounded-md bg-gray-50 flex items-center justify-center mb-2">
                  <FolderOpen size={16} className="text-gray-300" />
                </div>
                <p className="text-xs text-gray-400">
                  {isSearching || categoryFilter !== 'all'
                    ? 'Sin resultados para este filtro'
                    : 'Todavía no hay archivos en este proyecto'}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredFiles.map((file) => {
                  const fileWithThumb = file as FileWithThumbnail;
                  const cat = getFileCategory(file);
                  const { icon, bg } = CATEGORY_ICON[cat];
                  const isConfirming = confirmDeleteId === file.file_id;
                  const isDeleting = deletingId === file.file_id;
                  const isDownloading = downloadingId === file.file_id;

                  const thumbSrc = cat === 'image' ? projectService.getThumbnailSrc(fileWithThumb) : null;
                  const showThumb = !!thumbSrc && !thumbErrorIds.has(file.file_id);
                  const isImageClickable = cat === 'image';

                  return (
                    <div
                      key={file.file_id}
                      className={`group flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${
                        isConfirming ? 'bg-red-50' : 'hover:bg-slate-50'
                      } ${isDeleting ? 'opacity-50 pointer-events-none' : ''}`}
                    >
                      <button
                        type="button"
                        onClick={isImageClickable ? () => openLightbox(fileWithThumb) : undefined}
                        disabled={!isImageClickable}
                        className={`relative w-14 h-14 rounded-md flex items-center justify-center flex-shrink-0 overflow-hidden ${showThumb ? 'bg-gray-100' : bg} ${
                          isImageClickable ? 'cursor-zoom-in group/thumb' : 'cursor-default'
                        }`}
                        title={isImageClickable ? 'Ver imagen completa' : undefined}
                      >
                        {showThumb ? (
                          <>
                            <img
                              src={thumbSrc!}
                              alt={file.name}
                              className="w-full h-full object-cover"
                              loading="lazy"
                              onError={() => markThumbError(file.file_id)}
                            />
                            <span className="absolute inset-0 bg-black/0 group-hover/thumb:bg-black/30 flex items-center justify-center transition-colors">
                              <ZoomIn size={18} className="text-white opacity-0 group-hover/thumb:opacity-100 transition-opacity" />
                            </span>
                          </>
                        ) : (
                          <span className="scale-[1.6]">{icon}</span>
                        )}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-gray-700 truncate">{file.name}</p>
                          <VersionBadge file={file} />
                        </div>
                        <p className="text-[11px] text-gray-400">
                          {formatSize(parseInt(file.file_size, 10))} · {formatRelativeDate(file.uploaded_at)}
                          {file.uploaded_by?.user_name && <> · Subido por {file.uploaded_by.user_name}</>}
                          {file.specialty_name && <> · {file.specialty_name}</>}
                        </p>
                      </div>

                      {isConfirming ? (
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className="text-[11px] text-red-500 font-medium whitespace-nowrap">¿Eliminar?</span>
                          <button
                            onClick={() => handleRemoveClick(file)}
                            className="px-2 py-1 rounded-md bg-red-500 text-white text-[11px] font-semibold hover:bg-red-600"
                          >
                            Sí
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1 rounded-md bg-gray-100 text-gray-600 text-[11px] font-semibold hover:bg-gray-200"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          <button
                            onClick={() => handleDownload(file)}
                            disabled={isDownloading}
                            className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:bg-white hover:text-[#0056b3] disabled:opacity-50"
                            title="Descargar"
                          >
                            {isDownloading ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
                          </button>
                          {canDelete(file) && (
                            <button
                              onClick={() => handleRemoveClick(file)}
                              className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-500"
                              title="Eliminar"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Visor de imagen completa — pide /content autenticado on-demand.
          Se renderiza vía Portal directo a document.body: si algún
          contenedor padre (el layout de la app, el header, etc.) tiene
          transform/filter/overflow, eso rompe silenciosamente el
          position:fixed de los hijos (los "atrapa" dentro de ese
          contenedor en vez de cubrir el viewport completo) — el header
          terminaba quedando por encima del overlay y su botón de cerrar.
          El Portal se salta ese problema por completo. */}
      {lightbox && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-6"
          onClick={closeLightbox}
        >
          <button
            onClick={closeLightbox}
            className="absolute top-4 right-4 z-[10000] w-11 h-11 flex items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 transition-colors shadow-lg"
            title="Cerrar (Esc)"
          >
            <X size={20} />
          </button>

          <div
            className="max-w-[90vw] max-h-[85vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            {lightbox.loading ? (
              <div className="flex flex-col items-center gap-3 text-white/80">
                <RefreshCw size={28} className="animate-spin" />
                <p className="text-sm">Cargando imagen...</p>
              </div>
            ) : lightbox.error ? (
              <div className="flex flex-col items-center gap-2 text-white/80 text-center px-6">
                <AlertCircle size={28} />
                <p className="text-sm">{lightbox.error}</p>
                <button
                  onClick={() => openLightbox(lightbox.file)}
                  className="text-xs font-semibold text-white underline mt-1"
                >
                  Reintentar
                </button>
              </div>
            ) : (
              <>
                <img
                  src={lightbox.blobUrl!}
                  alt={lightbox.file.name}
                  className="max-w-full max-h-[75vh] rounded-md shadow-2xl object-contain"
                />
                <div className="flex items-center justify-between w-full mt-3 px-1">
                  <p className="text-white/80 text-xs truncate pr-4">{lightbox.file.name}</p>
                  <button
                    onClick={() => handleDownload(lightbox.file)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-white/90 hover:text-white flex-shrink-0"
                  >
                    <Download size={13} />
                    Descargar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default ArchivosTab;