import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Search, Upload, FileText, FileSpreadsheet, Trash2, Download, X,
  ArrowUpDown, Check, FolderOpen, AlertCircle, RefreshCw,
} from 'lucide-react';
import { ProjectFile } from '../../types/project.types';
import { projectService } from '../../services/project.service';
import { useProjects } from '../../hooks/useProjects';

type SortKey = 'name' | 'date' | 'size';

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

const SORT_LABELS: Record<SortKey, string> = { date: 'Más recientes', name: 'Nombre (A-Z)', size: 'Tamaño' };

interface FileListSectionProps {
  title: string;
  icon: React.ReactNode;
  accentColor: string;
  accentText: string;
  emptyLabel: string;
  files: ProjectFile[];
  filteredFiles: ProjectFile[];
  isSearching: boolean;
  currentUserId?: number | null;
  isProjectOwner: boolean;
  onDelete: (file: ProjectFile) => void;
  onDownload: (file: ProjectFile) => void;
  deletingId: string | null;
  downloadingId: string | null;
}

const FileListSection: React.FC<FileListSectionProps> = ({
  title, icon, accentColor, accentText, emptyLabel, files, filteredFiles, isSearching,
  currentUserId, isProjectOwner, onDelete, onDownload, deletingId, downloadingId,
}) => {
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const sorted = useMemo(() => sortFiles(filteredFiles, sortKey), [filteredFiles, sortKey]);
  const totalSize = useMemo(
    () => files.reduce((sum, f) => sum + parseInt(f.file_size, 10), 0),
    [files]
  );

  const handleRemoveClick = (file: ProjectFile) => {
    if (confirmDeleteId === file.file_id) {
      onDelete(file);
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(file.file_id);
    }
  };

  // Solo quien subió el archivo, o el dueño del proyecto, puede borrarlo
  // (mismo criterio que aplica el backend).
  const canDelete = (file: ProjectFile) =>
    isProjectOwner || file.uploaded_by?.user_id === currentUserId;

  return (
    <div className="flex flex-col overflow-hidden relative">
      {/* Encabezado */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-slate-50/60">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-md flex items-center justify-center ${accentColor}`}>
            {icon}
          </div>
          <div>
            <h3 className="font-bold text-gray-800 text-sm leading-tight">{title}</h3>
            <p className="text-[11px] text-gray-400 leading-tight">
              {files.length} archivo{files.length !== 1 ? 's' : ''} · {formatSize(totalSize)}
            </p>
          </div>
        </div>

        <div className="relative">
          <button
            onClick={() => setSortMenuOpen((prev) => !prev)}
            className="flex items-center gap-1 px-2 py-1.5 bg-white border border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700 rounded-md text-xs font-medium transition-colors shadow-sm"
            title="Ordenar"
          >
            <ArrowUpDown size={12} />
            <span className="hidden sm:inline">{SORT_LABELS[sortKey]}</span>
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
                  {sortKey === key && <Check size={12} className={accentText} />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-10 px-4">
            <div className="w-10 h-10 rounded-md bg-gray-50 flex items-center justify-center mb-2">
              {icon}
            </div>
            <p className="text-xs text-gray-400">
              {files.length === 0 ? emptyLabel : (isSearching ? 'Sin resultados para tu búsqueda' : emptyLabel)}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {sorted.map((file) => {
              const isConfirming = confirmDeleteId === file.file_id;
              const isDeleting = deletingId === file.file_id;
              const isDownloading = downloadingId === file.file_id;
              return (
                <div
                  key={file.file_id}
                  className={`group flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${
                    isConfirming ? 'bg-red-50' : 'hover:bg-slate-50'
                  } ${isDeleting ? 'opacity-50 pointer-events-none' : ''}`}
                >
                  <div className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 ${accentColor}`}>
                    {icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-700 truncate">{file.name}</p>
                    <p className="text-[11px] text-gray-400">
                      {formatSize(parseInt(file.file_size, 10))} · {formatRelativeDate(file.uploaded_at)}
                      {file.uploaded_by?.user_name && <> · Subido por {file.uploaded_by.user_name}</>}
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
                        onClick={() => onDownload(file)}
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
  );
};

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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await projectService.getProjectFiles(projectId);
      setFiles(data);
    } catch (err: any) {
      setError(err.message || 'No se pudieron cargar los archivos.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const term = searchTerm.trim().toLowerCase();
  const isSearching = term.length > 0;

  // "ifc" va a la columna de IFC; cualquier otro tipo (xlsx, csv, etc.) va
  // a "Otros archivos" — no asumimos un único tipo fijo para no romper si
  // el backend maneja más de un formato ahí.
  const ifcFiles = useMemo(() => files.filter((f) => f.file_type?.toLowerCase() === 'ifc'), [files]);
  const otherFiles = useMemo(() => files.filter((f) => f.file_type?.toLowerCase() !== 'ifc'), [files]);

  const filteredIfc = useMemo(
    () => (isSearching ? ifcFiles.filter((f) => f.name.toLowerCase().includes(term)) : ifcFiles),
    [ifcFiles, term, isSearching]
  );
  const filteredOther = useMemo(
    () => (isSearching ? otherFiles.filter((f) => f.name.toLowerCase().includes(term)) : otherFiles),
    [otherFiles, term, isSearching]
  );

  const totalSize = useMemo(
    () => files.reduce((sum, f) => sum + parseInt(f.file_size, 10), 0),
    [files]
  );

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

  return (
    <div className="flex flex-col overflow-hidden bg-white border border-gray-200 rounded-md shadow-sm h-full min-h-[600px] max-w-5xl mx-auto w-full">
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
        {files.length > 0 && (
          <p className="text-xs text-gray-400 font-medium whitespace-nowrap">
            {files.length} archivo{files.length !== 1 ? 's' : ''} en total · {formatSize(totalSize)}
          </p>
        )}
      </div>

      {/* Buscador general — filtra ambas listas a la vez */}
      <div className="flex-shrink-0 px-6 py-3 border-b border-gray-100">
        <div className="relative">
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
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
          <FileListSection
            title="Archivos IFC"
            icon={<FileText size={16} className="text-[#0056b3]" />}
            accentColor="bg-blue-50"
            accentText="text-[#0056b3]"
            emptyLabel="Todavía no hay archivos IFC en este proyecto"
            files={ifcFiles}
            filteredFiles={filteredIfc}
            isSearching={isSearching}
            currentUserId={currentUserId}
            isProjectOwner={isProjectOwner}
            onDelete={handleDelete}
            onDownload={handleDownload}
            deletingId={deletingId}
            downloadingId={downloadingId}
          />

          <FileListSection
            title="Otros archivos"
            icon={<FileSpreadsheet size={16} className="text-green-600" />}
            accentColor="bg-green-50"
            accentText="text-green-600"
            emptyLabel="Todavía no hay otros archivos en este proyecto"
            files={otherFiles}
            filteredFiles={filteredOther}
            isSearching={isSearching}
            currentUserId={currentUserId}
            isProjectOwner={isProjectOwner}
            onDelete={handleDelete}
            onDownload={handleDownload}
            deletingId={deletingId}
            downloadingId={downloadingId}
          />
        </div>
      )}
    </div>
  );
};

export default ArchivosTab;