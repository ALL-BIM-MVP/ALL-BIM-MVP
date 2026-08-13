import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
  Search, Upload, FileText, FileSpreadsheet, Trash2, Download, X,
  ArrowUpDown, Check, FolderOpen,
} from 'lucide-react';

// Solo visual por ahora: no hay backend conectado para Excel, y la lista de
// IFC tampoco persiste — cuando se conecte el backend real, esto se reemplaza
// por el estado que venga de useProjects()/un hook nuevo para Excel.

interface LocalFile {
  id: string;
  name: string;
  sizeBytes: number;
  uploadedAt: number; // timestamp
}

type SortKey = 'name' | 'date' | 'size';

let fileIdCounter = 0;
const nextFileId = () => `file_${++fileIdCounter}`;

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatRelativeDate(timestamp: number): string {
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

function sortFiles(files: LocalFile[], key: SortKey): LocalFile[] {
  const copy = [...files];
  switch (key) {
    case 'name': return copy.sort((a, b) => a.name.localeCompare(b.name));
    case 'size': return copy.sort((a, b) => b.sizeBytes - a.sizeBytes);
    case 'date': default: return copy.sort((a, b) => b.uploadedAt - a.uploadedAt);
  }
}

const SORT_LABELS: Record<SortKey, string> = { date: 'Más recientes', name: 'Nombre (A-Z)', size: 'Tamaño' };

interface FileListSectionProps {
  title: string;
  icon: React.ReactNode;
  accentColor: string;
  accentText: string;
  accept: string;
  emptyLabel: string;
  files: LocalFile[];
  filteredFiles: LocalFile[];
  isSearching: boolean;
  onUpload: (fileList: FileList) => void;
  onRemove: (id: string) => void;
}

const FileListSection: React.FC<FileListSectionProps> = ({
  title, icon, accentColor, accentText, accept, emptyLabel, files, filteredFiles, isSearching, onUpload, onRemove,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);

  const sorted = useMemo(() => sortFiles(filteredFiles, sortKey), [filteredFiles, sortKey]);

  const totalSize = useMemo(() => files.reduce((sum, f) => sum + f.sizeBytes, 0), [files]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) onUpload(e.target.files);
    e.target.value = '';
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) onUpload(e.dataTransfer.files);
  }, [onUpload]);

  const handleRemoveClick = (id: string) => {
    if (confirmDeleteId === id) {
      onRemove(id);
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(id);
    }
  };

  return (
    <div
      className="flex flex-col overflow-hidden relative"
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
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

        <div className="flex items-center gap-1.5">
          {/* Ordenar */}
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

          <label className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 bg-[#0056b3] text-white rounded-md hover:bg-[#004494] transition-colors text-xs font-semibold shadow-sm">
            <Upload size={13} />
            Subir
            <input ref={inputRef} type="file" accept={accept} multiple className="hidden" onChange={handleFileChange} />
          </label>
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
            {files.length === 0 && (
              <p className="text-[11px] text-gray-300 mt-1">Arrastrá un archivo aquí o usá el botón Subir</p>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            {sorted.map((file) => {
              const isConfirming = confirmDeleteId === file.id;
              const isNew = justAddedId === file.id;
              return (
                <div
                  key={file.id}
                  className={`group flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${
                    isConfirming ? 'bg-red-50' : isNew ? 'bg-blue-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 ${accentColor}`}>
                    {icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-700 truncate">{file.name}</p>
                    <p className="text-[11px] text-gray-400">{formatSize(file.sizeBytes)} · {formatRelativeDate(file.uploadedAt)}</p>
                  </div>

                  {isConfirming ? (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-[11px] text-red-500 font-medium whitespace-nowrap">¿Eliminar?</span>
                      <button
                        onClick={() => handleRemoveClick(file.id)}
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
                        className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:bg-white hover:text-[#0056b3]"
                        title="Descargar"
                      >
                        <Download size={14} />
                      </button>
                      <button
                        onClick={() => handleRemoveClick(file.id)}
                        className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-500"
                        title="Eliminar"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Overlay de drag & drop */}
      {isDragOver && (
        <div className="absolute inset-0 bg-[#0056b3]/5 border-2 border-dashed border-[#0056b3] rounded-md flex items-center justify-center pointer-events-none z-10">
          <div className="flex flex-col items-center gap-2 text-[#0056b3]">
            <Upload size={28} />
            <p className="text-sm font-semibold">Soltá el archivo para subirlo</p>
          </div>
        </div>
      )}
    </div>
  );
};

const ArchivosTab: React.FC = () => {
  const [ifcFiles, setIfcFiles] = useState<LocalFile[]>([]);
  const [excelFiles, setExcelFiles] = useState<LocalFile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  const term = searchTerm.trim().toLowerCase();
  const isSearching = term.length > 0;

  const filteredIfc = useMemo(
    () => (isSearching ? ifcFiles.filter((f) => f.name.toLowerCase().includes(term)) : ifcFiles),
    [ifcFiles, term, isSearching]
  );
  const filteredExcel = useMemo(
    () => (isSearching ? excelFiles.filter((f) => f.name.toLowerCase().includes(term)) : excelFiles),
    [excelFiles, term, isSearching]
  );

  const handleUploadIfc = (fileList: FileList) => {
    const now = Date.now();
    const entries: LocalFile[] = Array.from(fileList).map((f) => ({
      id: nextFileId(), name: f.name, sizeBytes: f.size, uploadedAt: now,
    }));
    setIfcFiles((prev) => [...entries, ...prev]);
  };

  const handleUploadExcel = (fileList: FileList) => {
    const now = Date.now();
    const entries: LocalFile[] = Array.from(fileList).map((f) => ({
      id: nextFileId(), name: f.name, sizeBytes: f.size, uploadedAt: now,
    }));
    setExcelFiles((prev) => [...entries, ...prev]);
  };

  const totalFiles = ifcFiles.length + excelFiles.length;
  const totalSize = useMemo(
    () => [...ifcFiles, ...excelFiles].reduce((sum, f) => sum + f.sizeBytes, 0),
    [ifcFiles, excelFiles]
  );

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
            <p className="text-sm text-gray-500 mt-1.5">Modelos IFC y planillas Excel asociadas a este proyecto.</p>
          </div>
        </div>
        {totalFiles > 0 && (
          <p className="text-xs text-gray-400 font-medium whitespace-nowrap">
            {totalFiles} archivo{totalFiles !== 1 ? 's' : ''} en total · {formatSize(totalSize)}
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

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
        <FileListSection
          title="Archivos IFC"
          icon={<FileText size={16} className="text-[#0056b3]" />}
          accentColor="bg-blue-50"
          accentText="text-[#0056b3]"
          accept=".ifc,.IFC"
          emptyLabel="Todavía no hay archivos IFC en este proyecto"
          files={ifcFiles}
          filteredFiles={filteredIfc}
          isSearching={isSearching}
          onUpload={handleUploadIfc}
          onRemove={(id) => setIfcFiles((prev) => prev.filter((f) => f.id !== id))}
        />

        <FileListSection
          title="Archivos Excel"
          icon={<FileSpreadsheet size={16} className="text-green-600" />}
          accentColor="bg-green-50"
          accentText="text-green-600"
          accept=".xlsx,.xls,.csv"
          emptyLabel="Todavía no hay archivos Excel en este proyecto"
          files={excelFiles}
          filteredFiles={filteredExcel}
          isSearching={isSearching}
          onUpload={handleUploadExcel}
          onRemove={(id) => setExcelFiles((prev) => prev.filter((f) => f.id !== id))}
        />
      </div>
    </div>
  );
};

export default ArchivosTab;