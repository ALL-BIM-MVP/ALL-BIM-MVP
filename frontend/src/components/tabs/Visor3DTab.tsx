import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Upload, FileText, X, Maximize2, Minimize2, FileSearch, Box,
  ChevronLeft, ChevronRight, Search, RefreshCw, FileDown,
  HardDrive, CloudDownload, Eye, Cpu, CheckCircle2, AlertTriangle, Loader2, Info,
} from 'lucide-react';
import IFCViewer, { IFCViewerHandle } from '../IFCViewer/IFCViewer';
import { parseIfcHeader, IfcFileInfo } from '../IFCViewer/utils/parseIfcHeader';
import { UploadSimple, X as XIcon } from '@phosphor-icons/react';
import PartidasTree from './PartidasTree';
import {
  IfcFile,
  IfcStatus,
  listProjectIfcFiles,
  getFileContentArrayBuffer,
  uploadAndProcessIfcFile,
  processExistingIfcFile,
  pollIfcProcessStatus,
} from '../../services/ifcfiles.service';
import { useAuth } from '../../context/AuthContext';

interface Visor3DTabProps {
  projectId: number;
}

type PanelStatus = 'unprocessed' | 'processing' | 'done' | 'error';

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
    <p className="text-xs text-slate-700">{value || '—'}</p>
  </div>
);

function formatBytes(bytesStr: string): string {
  const bytes = Number(bytesStr);
  if (!Number.isFinite(bytes)) return '—';
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function ifcStatusToPanelStatus(status: IfcStatus): PanelStatus {
  if (status === 'done') return 'done';
  if (status === 'processing') return 'processing';
  if (status === 'error') return 'error';
  return 'unprocessed';
}

const IfcStatusBadge: React.FC<{ status: IfcFile['ifc_status'] }> = ({ status }) => {
  if (status === 'done') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <CheckCircle2 size={11} /> Procesado
      </span>
    );
  }
  if (status === 'processing') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
        <Loader2 size={11} className="animate-spin" /> Procesando
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-700 border border-red-200">
        <AlertTriangle size={11} /> Error
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">
      Sin procesar
    </span>
  );
};

const Visor3DTab: React.FC<Visor3DTabProps> = ({ projectId }) => {
  const { user } = useAuth();
  const [ifcFile, setIfcFile] = useState<File | null>(null);
  const [ifcArrayBuffer, setIfcArrayBuffer] = useState<ArrayBuffer | null>(null);
  const [ifcLoading, setIfcLoading] = useState(false);
  const [ifcInfo, setIfcInfo] = useState<IfcFileInfo | null>(null);
  const [activePanelTab, setActivePanelTab] = useState<'resumen' | 'metrados'>('resumen');
  const [infoPopoverOpen, setInfoPopoverOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchId, setSearchId] = useState('');
  const [searchError, setSearchError] = useState<string | null>(null);
  const viewerRef = useRef<IFCViewerHandle>(null);

  const [currentFileId, setCurrentFileId] = useState<string | null>(null);
  const [panelStatus, setPanelStatus] = useState<PanelStatus>('unprocessed');
  const [panelErrorMessage, setPanelErrorMessage] = useState<string | null>(null);

  const [showEntryPopover, setShowEntryPopover] = useState<'center' | 'floating' | null>(null);
  const entryPopoverRef = useRef<HTMLDivElement>(null);
  const localInputRef = useRef<HTMLInputElement>(null);

  const [pendingLocalFile, setPendingLocalFile] = useState<File | null>(null);
  const [pendingLocalBuffer, setPendingLocalBuffer] = useState<ArrayBuffer | null>(null);

  const [showLoadedModal, setShowLoadedModal] = useState(false);
  const [loadedTab, setLoadedTab] = useState<'procesados' | 'no_procesados'>('procesados');
  const [loadedFiles, setLoadedFiles] = useState<IfcFile[]>([]);
  const [loadedLoading, setLoadedLoading] = useState(false);
  const [loadedError, setLoadedError] = useState<string | null>(null);
  const [loadedSearch, setLoadedSearch] = useState('');
  const [selectedLoadedFileId, setSelectedLoadedFileId] = useState<string | null>(null);
  const [applyingSelection, setApplyingSelection] = useState(false);

  const closeSearchOnInteract = () => {
    if (searchOpen) setSearchOpen(false);
  };

  const [panelWidth, setPanelWidth] = useState(384);
  const [isResizing, setIsResizing] = useState(false);
  const MIN_PANEL_WIDTH = 280;
  const MAX_PANEL_WIDTH = 640;
  const isResizingRef = useRef(false);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(384);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    setIsResizing(true);
    resizeStartXRef.current = e.clientX;
    resizeStartWidthRef.current = panelWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const delta = resizeStartXRef.current - e.clientX;
      const newWidth = Math.min(
        MAX_PANEL_WIDTH,
        Math.max(MIN_PANEL_WIDTH, resizeStartWidthRef.current + delta)
      );
      setPanelWidth(newWidth);
    };
    const handleMouseUp = () => {
      if (!isResizingRef.current) return;
      isResizingRef.current = false;
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  useEffect(() => {
    if (!showEntryPopover) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (entryPopoverRef.current && !entryPopoverRef.current.contains(event.target as Node)) {
        setShowEntryPopover(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEntryPopover]);

  const loadBufferIntoViewer = (buffer: ArrayBuffer, sourceFile: File | null) => {
    setIfcArrayBuffer(buffer);
    setIfcInfo(parseIfcHeader(buffer));
    setIfcFile(sourceFile);
  };

  const runProcessing = useCallback(
    async ({ file, existingFileId }: { file: File | null; existingFileId: string | null }) => {
      setPanelStatus('processing');
      setPanelErrorMessage(null);
      try {
        let ifcFileId: string;
        if (existingFileId) {
          const initial = await processExistingIfcFile(projectId, existingFileId);
          ifcFileId = String(initial.ifc_file_id ?? existingFileId);
        } else if (file) {
          const initial = await uploadAndProcessIfcFile(projectId, file);
          ifcFileId = String(initial.ifc_file_id);
        } else {
          throw new Error('No hay archivo para procesar.');
        }
        setCurrentFileId(ifcFileId);

        const final = await pollIfcProcessStatus(ifcFileId);
        setPanelStatus(final.status === 'done' ? 'done' : 'error');
        if (final.status === 'error') {
          setPanelErrorMessage(final.error_message || 'Error al procesar el archivo.');
        }
      } catch (err: any) {
        console.error('Error al procesar el archivo IFC:', err);
        setPanelStatus('error');
        setPanelErrorMessage(err.message || 'Error al subir/procesar el archivo.');
      }
    },
    [projectId]
  );

  const openLocalPicker = () => {
    setShowEntryPopover(null);
    localInputRef.current?.click();
  };

  const handleLocalFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setIfcLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      setPendingLocalFile(file);
      setPendingLocalBuffer(buffer);
    } catch (err) {
      console.error('Error al leer el archivo IFC:', err);
    } finally {
      setIfcLoading(false);
    }
  };

  const handleChooseSoloGraficar = () => {
    if (!pendingLocalFile || !pendingLocalBuffer) return;
    loadBufferIntoViewer(pendingLocalBuffer, pendingLocalFile);
    setCurrentFileId(null);
    setPanelStatus('unprocessed');
    setPanelErrorMessage(null);
    setActivePanelTab('resumen');
    setPendingLocalFile(null);
    setPendingLocalBuffer(null);
  };

  const handleChooseProcesar = async () => {
    if (!pendingLocalFile || !pendingLocalBuffer) return;

    loadBufferIntoViewer(pendingLocalBuffer, pendingLocalFile);
    setActivePanelTab('metrados');

    const fileToProcess = pendingLocalFile;
    setPendingLocalFile(null);
    setPendingLocalBuffer(null);

    await runProcessing({ file: fileToProcess, existingFileId: null });
  };

  const cancelPendingLocal = () => {
    setPendingLocalFile(null);
    setPendingLocalBuffer(null);
  };

  const handleProcesarDesdeMetrados = () => {
    if (currentFileId) {
      runProcessing({ file: null, existingFileId: currentFileId });
    } else if (ifcFile) {
      runProcessing({ file: ifcFile, existingFileId: null });
    }
  };

  const fetchLoadedFiles = useCallback(async () => {
    setLoadedLoading(true);
    setLoadedError(null);
    try {
      const processed = loadedTab === 'procesados';
      const files = await listProjectIfcFiles(projectId, processed);
      setLoadedFiles(files);
    } catch (err: any) {
      setLoadedError(err.message || 'Error al cargar los archivos del proyecto');
    } finally {
      setLoadedLoading(false);
    }
  }, [projectId, loadedTab]);

  useEffect(() => {
    if (showLoadedModal) {
      fetchLoadedFiles();
    }
  }, [showLoadedModal, fetchLoadedFiles]);

  const openLoadedModal = () => {
    setShowEntryPopover(null);
    setSelectedLoadedFileId(null);
    setLoadedSearch('');
    setLoadedTab('procesados');
    setShowLoadedModal(true);
  };

  const filteredLoadedFiles = loadedFiles.filter((f) =>
    f.name.toLowerCase().includes(loadedSearch.trim().toLowerCase())
  );

  const handleApplyLoadedSelection = async () => {
    if (!selectedLoadedFileId) return;
    const selected = loadedFiles.find((f) => f.file_id === selectedLoadedFileId);
    setApplyingSelection(true);
    try {
      const buffer = await getFileContentArrayBuffer(selectedLoadedFileId);
      loadBufferIntoViewer(buffer, selected ? new File([buffer], selected.name, { type: selected.mime_type }) : null);

      setCurrentFileId(selectedLoadedFileId);
      const initialStatus = ifcStatusToPanelStatus(selected?.ifc_status ?? null);
      setPanelStatus(initialStatus);
      setPanelErrorMessage(selected?.ifc_error_message ?? null);
      setActivePanelTab('resumen');
      setShowLoadedModal(false);

      if (initialStatus === 'processing') {
        try {
          const final = await pollIfcProcessStatus(selectedLoadedFileId);
          setPanelStatus(final.status === 'done' ? 'done' : 'error');
          if (final.status === 'error') {
            setPanelErrorMessage(final.error_message || 'Error al procesar el archivo.');
          }
        } catch (err: any) {
          setPanelStatus('error');
          setPanelErrorMessage(err.message || 'Error al consultar el estado del procesamiento.');
        }
      }
    } catch (err: any) {
      console.error('Error al cargar el archivo seleccionado:', err);
      setLoadedError(err.message || 'No se pudo cargar el archivo seleccionado.');
    } finally {
      setApplyingSelection(false);
    }
  };

  const clearIFC = () => {
    setIfcFile(null);
    setIfcArrayBuffer(null);
    setIfcInfo(null);
    setCurrentFileId(null);
    setPanelStatus('unprocessed');
    setPanelErrorMessage(null);
    setActivePanelTab('resumen');
  };

  const handleSearchById = async () => {
    const value = searchId.trim();
    if (!value) {
      setSearchError('Ingresá un ID numérico o un GUID IFC');
      return;
    }
    setSearchError(null);
    const found = await viewerRef.current?.selectByIdOrGuid(value);
    if (!found) {
      setSearchError('No se encontró ningún elemento con ese ID o GUID');
    }
  };

  const handleSelectAllInViewer = useCallback((expressIds: number[]) => {
    viewerRef.current?.isolateElementsByIds(expressIds);
  }, []);

  const handleSelectGroupInViewer = useCallback((expressIds: number[]) => {
    viewerRef.current?.selectGroupInViewer(expressIds);
  }, []);

  const EntryPopover: React.FC<{ align?: 'center' | 'up' }> = ({ align = 'center' }) => (
    <div
      ref={entryPopoverRef}
      className={`absolute z-[10100] bg-white rounded shadow-2xl border border-gray-200 p-2 w-52 ${
        align === 'up' ? 'bottom-full mb-2 left-1/2 -translate-x-1/2' : 'top-full mt-2 left-1/2 -translate-x-1/2'
      }`}
    >
      <button
        onClick={openLocalPicker}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors text-left"
      >
        <HardDrive size={16} className="text-[#0056b3]" />
        Local
      </button>
      <button
        onClick={openLoadedModal}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors text-left"
      >
        <CloudDownload size={16} className="text-[#0056b3]" />
        Ya está cargado
      </button>
    </div>
  );

  return (
    <div className="h-full">
      <input
        ref={localInputRef}
        type="file"
        accept=".ifc,.IFC"
        className="hidden"
        onChange={handleLocalFileSelected}
      />

      <div
        className={
          isFullscreen
            ? "fixed inset-0 z-[9999] bg-[#6B7280] flex flex-col overflow-hidden"
            : "w-full h-full bg-[#2D3B4E] flex flex-col overflow-hidden relative"
        }
      >
        <div className="flex-1 min-h-0 flex relative overflow-hidden">

          <div
            className="flex-1 flex flex-col items-center justify-center text-gray-700 relative overflow-hidden bg-[#EEEEEE]"
            onMouseDown={closeSearchOnInteract}
            onWheel={closeSearchOnInteract}
          >
            {ifcLoading ? (
              <div className="flex flex-col items-center justify-center h-full">
                <div className="text-center text-gray-700">
                  <div className="w-12 h-12 border-4 border-[#0056b3] border-t-transparent rounded-full animate-spin mx-auto"></div>
                  <p className="mt-4">Cargando archivo IFC...</p>
                </div>
              </div>
            ) : ifcArrayBuffer ? (
              <IFCViewer
                ref={viewerRef}
                fileBuffer={ifcArrayBuffer}
                projectId={projectId}
                viewCubeRightOffset={panelOpen ? panelWidth : 0}
              />
            ) : (
              <div className="relative z-10 text-center flex flex-col items-center gap-4 px-6">
                <div className="w-16 h-16 rounded bg-slate-100/70 border border-slate-300/60 flex items-center justify-center">
                  <Box size={30} className="text-slate-500" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-slate-600">Aún no hay ningún modelo aquí</h3>
                  <p className="text-slate-500 text-sm mt-1.5 max-w-xs mx-auto">
                    Carga tu archivo IFC exportado desde Revit para empezar a explorar el modelo en 3D.
                  </p>
                </div>

                <div className="relative">
                  <button
                    onClick={() => setShowEntryPopover(showEntryPopover === 'center' ? null : 'center')}
                    className="cursor-pointer flex items-center gap-2 px-5 py-2.5 bg-[#0056b3] text-white rounded hover:bg-[#004494] transition-colors font-medium text-sm"
                  >
                    <Upload size={16} />
                    Cargar archivo IFC
                  </button>
                  {showEntryPopover === 'center' && <EntryPopover align="center" />}
                </div>
                <p className="text-slate-400 text-xs">Formatos soportados: .ifc, .IFC</p>
              </div>
            )}
          </div>

          <button
            onClick={() => setPanelOpen((prev) => !prev)}
            className={`absolute top-1/2 -translate-y-1/2 z-[9600] w-6 h-16 flex items-center justify-center bg-white/95 hover:bg-white text-slate-600 rounded shadow-lg border border-r-0 border-slate-300/60 ${
              isResizing ? '' : 'transition-[right] duration-300 ease-in-out'
            }`}
            style={{ right: panelOpen ? `${panelWidth}px` : '0' }}
            title={panelOpen ? 'Ocultar panel' : 'Mostrar panel'}
          >
            {panelOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>

          <div
            className={`absolute top-0 bottom-3 right-0 flex-shrink-0 flex flex-col p-5 text-slate-700 overflow-hidden bg-[#FFFFFF] shadow-2xl border-l border-slate-400/40 rounded z-[9500] ${
              panelOpen ? 'translate-x-0' : 'translate-x-full'
            } ${isResizing ? '' : 'transition-transform duration-300 ease-in-out'}`}
            style={{ width: `${panelWidth}px` }}
          >
            {panelOpen && (
              <div
                onMouseDown={handleResizeStart}
                className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-[#0056b3]/30 active:bg-[#0056b3]/50 transition-colors z-10"
                title="Arrastrar para cambiar el ancho"
              />
            )}

            <div className="flex-shrink-0">
              <div className="flex items-center gap-2.5 mb-3">
                <h2 className="text-lg font-bold text-[#0056b3] tracking-tight">Metrados</h2>
                {panelStatus === 'done' && (
                  <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200">
                    <CheckCircle2 size={10} className="text-emerald-600 flex-shrink-0" />
                    <p className="text-[9px] font-semibold text-emerald-700 whitespace-nowrap">Metrados listos</p>
                  </div>
                )}
              </div>

              <div className="relative flex items-center gap-2 bg-slate-100/60 border border-slate-300/60 rounded px-2 py-1.5 mb-2.5">
                <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${ifcFile ? 'bg-green-100' : 'bg-slate-200'}`}>
                  <FileText size={11} className={ifcFile ? 'text-green-600' : 'text-slate-400'} />
                </div>
                <div className="min-w-0 flex-1">
                  {ifcFile ? (
                    <>
                      <p className="text-[11px] font-semibold text-slate-700 truncate leading-tight">{ifcFile.name}</p>
                      <p className="text-[9px] text-slate-500 leading-tight">
                        {(ifcFile.size / 1024 / 1024).toFixed(2)} MB · Cargado
                      </p>
                    </>
                  ) : (
                    <p className="text-[9px] text-slate-500 leading-tight">
                      Carga un archivo IFC exportado desde Revit para ver el visor 3D y los metadatos automáticos por disciplina.
                    </p>
                  )}
                </div>

                {ifcInfo && (
                  <button
                    onClick={() => setInfoPopoverOpen((prev) => !prev)}
                    className={`w-6 h-6 flex-shrink-0 flex items-center justify-center rounded transition-colors ${
                      infoPopoverOpen ? 'bg-[#0056b3] text-white' : 'text-slate-400 hover:bg-slate-200 hover:text-slate-600'
                    }`}
                    title="Información del archivo IFC"
                  >
                    <Info size={13} />
                  </button>
                )}

                {infoPopoverOpen && ifcInfo && (
                  <div className="absolute top-full right-0 mt-1.5 z-50 w-72 bg-white rounded shadow-2xl border border-slate-200 p-3.5">
                    <div className="flex items-center justify-between mb-2.5">
                      <p className="text-xs font-bold text-slate-700">Información del proyecto</p>
                      <button
                        onClick={() => setInfoPopoverOpen(false)}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <X size={13} />
                      </button>
                    </div>
                    <div className="space-y-2.5 max-h-80 overflow-y-auto">
                      <InfoRow label="Proyecto" value={ifcInfo.projectName} />
                      <InfoRow label="Descripción" value={ifcInfo.projectDescription} />
                      <InfoRow label="Nombre largo" value={ifcInfo.projectLongName} />
                      <InfoRow label="Fecha de exportación" value={ifcInfo.timestamp} />
                      <InfoRow label="Autor" value={ifcInfo.author} />
                      <InfoRow label="Organización" value={ifcInfo.organization} />
                      <InfoRow label="Software de origen" value={ifcInfo.originatingSystem} />
                      <InfoRow label="Esquema IFC" value={ifcInfo.schema} />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              {!ifcArrayBuffer ? (
                <div className="h-full flex flex-col items-center justify-center text-center gap-2 py-8">
                  <div className="w-12 h-12 rounded-full bg-slate-100/70 flex items-center justify-center">
                    <FileSearch size={22} className="text-slate-400" />
                  </div>
                  <p className="text-sm font-medium text-slate-500">Carga un archivo para ver los metrados</p>
                </div>
              ) : panelStatus === 'unprocessed' ? (
                <div className="rounded bg-slate-200 text-slate-800 p-6 flex flex-col items-center text-center gap-3">
                  <p className="text-sm font-bold tracking-wide">ARCHIVO no procesado</p>
                  <button
                    onClick={handleProcesarDesdeMetrados}
                    className="px-4 py-2 bg-[#0056b3] text-white rounded text-xs font-bold hover:bg-[#004494] transition-colors"
                  >
                    Procesar archivo
                  </button>
                  <p className="text-xs text-slate-600 mt-2">
                    Se requiere procesar para ver metrados
                  </p>
                </div>
              ) : panelStatus === 'processing' ? (
                <div className="rounded bg-slate-200 text-slate-800 p-6 flex flex-col items-center text-center gap-3">
                  <Loader2 size={22} className="animate-spin" />
                  <p className="text-sm font-bold tracking-wide">Procesando archivo...</p>
                  <p className="text-xs text-slate-600">
                    Esto puede tardar unos segundos, dependiendo del tamaño del modelo.
                  </p>
                </div>
              ) : panelStatus === 'error' ? (
                <div className="rounded bg-slate-200 text-slate-800 p-6 flex flex-col items-center text-center gap-3">
                  <AlertTriangle size={22} />
                  <p className="text-sm font-bold tracking-wide">Error al procesar</p>
                  <p className="text-xs text-slate-600">{panelErrorMessage || 'Ocurrió un error inesperado.'}</p>
                  <button
                    onClick={handleProcesarDesdeMetrados}
                    className="px-4 py-2 bg-[#0056b3] text-white rounded text-xs font-bold hover:bg-[#004494] transition-colors"
                  >
                    Reintentar
                  </button>
                </div>
              ) : (
                <div className="h-full min-h-0">
                  {currentFileId && (
                    <PartidasTree
                      ifcFileId={currentFileId}
                      currentUserId={user?.id ?? undefined}
                      onSelectAllInViewer={handleSelectAllInViewer}
                      onSelectGroupInViewer={handleSelectGroupInViewer}
                    />
                  )}
                </div>
              )}
            </div>

          </div>

          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[9700] flex items-center bg-white/95 backdrop-blur-md border border-gray-200 rounded shadow-xl px-0.5 py-0.5">

            <div className="relative">
              <button
                onClick={() => setShowEntryPopover(showEntryPopover === 'floating' ? null : 'floating')}
                className="flex flex-col items-center gap-0.5 px-2 py-1 rounded text-gray-700 hover:bg-gray-100 hover:text-[#0056b3] transition-colors duration-200"
              >
                <UploadSimple size={14} weight="regular" />
                <span className="text-[9px] font-medium whitespace-nowrap">
                  {ifcFile ? 'Cambiar IFC' : 'Cargar IFC'}
                </span>
              </button>
              {showEntryPopover === 'floating' && <EntryPopover align="up" />}
            </div>

            {ifcFile && (
              <button
                onClick={clearIFC}
                className="flex flex-col items-center gap-0.5 px-2 py-1 rounded text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors duration-200"
              >
                <XIcon size={14} weight="regular" />
                <span className="text-[9px] font-medium whitespace-nowrap">Limpiar</span>
              </button>
            )}

            <div className="w-px h-6 bg-gray-200 mx-0.5" />

            <div className="relative">
              <button
                onClick={() => setSearchOpen((prev) => !prev)}
                disabled={!ifcArrayBuffer}
                className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded transition-colors duration-200 ${
                  searchOpen
                    ? 'bg-[#0056b3] text-white'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-[#0056b3]'
                } ${!ifcArrayBuffer ? 'opacity-40 cursor-not-allowed' : ''}`}
                title="Buscar elemento por ID o GUID IFC"
              >
                <Search size={14} />
                <span className="text-[9px] font-medium whitespace-nowrap">Buscar ID</span>
              </button>

              {searchOpen && (
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-white rounded shadow-2xl border border-gray-200 p-3 w-56">
                  <p className="text-[11px] font-semibold text-slate-500 mb-1.5">Buscar por ID o GUID</p>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={searchId}
                      onChange={(e) => { setSearchId(e.target.value); setSearchError(null); }}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearchById()}
                      placeholder=" "
                      className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-[#0056b3] outline-none"
                      autoFocus
                    />
                    <button
                      onClick={handleSearchById}
                      className="px-3 py-1.5 bg-[#0056b3] text-white text-sm rounded hover:bg-[#004494] transition-colors"
                    >
                      Ir
                    </button>
                  </div>
                  {searchError && <p className="text-[11px] text-red-500 mt-1.5">{searchError}</p>}
                </div>
              )}
            </div>

            <div className="w-px h-6 bg-gray-200 mx-0.5" />

            <button
              onClick={() => alert('Sincronización con Revit: próximamente disponible.')}
              className="flex flex-col items-center gap-0.5 px-2 py-1 rounded text-gray-700 hover:bg-gray-100 hover:text-[#0056b3] transition-colors duration-200"
            >
              <RefreshCw size={14} />
              <span className="text-[9px] font-medium whitespace-nowrap">Sincronizar</span>
            </button>

            <div className="w-px h-6 bg-gray-200 mx-0.5" />

            <button
              onClick={() => alert('Descarga de datos: próximamente disponible.')}
              className="flex flex-col items-center gap-0.5 px-2 py-1 rounded text-gray-700 hover:bg-gray-100 hover:text-[#0056b3] transition-colors duration-200"
              title="Descargar datos"
            >
              <FileDown size={14} />
              <span className="text-[9px] font-medium whitespace-nowrap">Descargar</span>
            </button>
          </div>
        </div>
      </div>

      {pendingLocalFile && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[10200]">
          <div className="bg-white rounded w-[420px] shadow-2xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-start gap-3">
              <div className="w-10 h-10 rounded bg-blue-50 flex items-center justify-center flex-shrink-0">
                <FileText size={18} className="text-[#0056b3]" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{pendingLocalFile.name}</p>
                <p className="text-xs text-slate-500">{(pendingLocalFile.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            </div>

            <div className="p-5">
              <p className="text-sm text-slate-600 mb-4">¿Qué querés hacer con este archivo?</p>

              <div className="space-y-2">
                <button
                  onClick={handleChooseSoloGraficar}
                  className="w-full flex items-center gap-3 p-3.5 rounded border border-gray-200 hover:border-[#0056b3] hover:bg-blue-50/40 transition-colors text-left"
                >
                  <div className="w-9 h-9 rounded bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <Eye size={17} className="text-slate-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Solo graficar</p>
                    <p className="text-xs text-slate-500">Ver el modelo en el visor 3D, sin enviarlo al servidor.</p>
                  </div>
                </button>

                <button
                  onClick={handleChooseProcesar}
                  className="w-full flex items-center gap-3 p-3.5 rounded border border-gray-200 hover:border-[#0056b3] hover:bg-blue-50/40 transition-colors text-left"
                >
                  <div className="w-9 h-9 rounded bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <Cpu size={17} className="text-[#0056b3]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Procesar</p>
                    <p className="text-xs text-slate-500">Graficar y enviarlo al servidor para calcular metrados.</p>
                  </div>
                </button>
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-gray-100 bg-gray-50/70 flex justify-end">
              <button
                onClick={cancelPendingLocal}
                className="px-4 py-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {showLoadedModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[10200]">
          <div className="bg-white rounded w-[520px] max-h-[80vh] shadow-2xl border border-gray-200 overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <h3 className="text-sm font-bold text-slate-800">Archivos IFC del proyecto</h3>
              <button
                onClick={() => setShowLoadedModal(false)}
                className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-5 pt-4 flex-shrink-0">
              <div className="flex gap-2">
                <button
                  onClick={() => { setLoadedTab('procesados'); setSelectedLoadedFileId(null); }}
                  className={`px-3.5 py-1.5 rounded text-xs font-semibold border transition-colors ${
                    loadedTab === 'procesados'
                      ? 'bg-[#0056b3] text-white border-[#0056b3]'
                      : 'bg-white text-slate-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  Procesados
                </button>
                <button
                  onClick={() => { setLoadedTab('no_procesados'); setSelectedLoadedFileId(null); }}
                  className={`px-3.5 py-1.5 rounded text-xs font-semibold border transition-colors ${
                    loadedTab === 'no_procesados'
                      ? 'bg-[#0056b3] text-white border-[#0056b3]'
                      : 'bg-white text-slate-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  No procesados
                </button>
              </div>
            </div>

            <div className="px-5 pt-3 flex-shrink-0">
              <div className="flex items-center border border-gray-200 rounded px-3 py-2 gap-2 focus-within:ring-2 focus-within:ring-[#0056b3]">
                <Search size={14} className="text-slate-400" />
                <input
                  type="text"
                  value={loadedSearch}
                  onChange={(e) => setLoadedSearch(e.target.value)}
                  placeholder="Buscar por nombre de archivo..."
                  className="flex-1 text-sm outline-none bg-transparent"
                />
                <button
                  onClick={fetchLoadedFiles}
                  title="Actualizar"
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <RefreshCw size={14} className={loadedLoading ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3 space-y-2">
              {loadedLoading ? (
                <div className="text-center py-10 text-slate-400">
                  <RefreshCw size={20} className="animate-spin mx-auto mb-2" />
                  <p className="text-sm">Cargando archivos...</p>
                </div>
              ) : loadedError ? (
                <div className="text-center py-10 text-red-500">
                  <AlertTriangle size={20} className="mx-auto mb-2" />
                  <p className="text-sm">{loadedError}</p>
                </div>
              ) : filteredLoadedFiles.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <FileSearch size={22} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">
                    {loadedSearch.trim() ? 'No se encontraron archivos' : 'No hay archivos en esta categoría'}
                  </p>
                </div>
              ) : (
                filteredLoadedFiles.map((file) => (
                  <button
                    key={file.file_id}
                    onClick={() => setSelectedLoadedFileId(file.file_id)}
                    className={`w-full text-left p-3 rounded border transition-colors flex items-center gap-3 ${
                      selectedLoadedFileId === file.file_id
                        ? 'border-[#0056b3] bg-blue-50/50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="w-9 h-9 rounded bg-slate-100 flex items-center justify-center flex-shrink-0">
                      <FileText size={16} className="text-slate-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-700 truncate">{file.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {formatBytes(file.file_size)} · {new Date(file.uploaded_at).toLocaleDateString()}
                      </p>
                    </div>
                    <IfcStatusBadge status={file.ifc_status} />
                  </button>
                ))
              )}
            </div>

            <div className="px-5 py-3.5 border-t border-gray-100 bg-gray-50/70 flex justify-end gap-2 flex-shrink-0">
              <button
                onClick={() => setShowLoadedModal(false)}
                className="px-4 py-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleApplyLoadedSelection}
                disabled={!selectedLoadedFileId || applyingSelection}
                className={`px-5 py-1.5 rounded text-sm font-semibold transition-colors flex items-center gap-2 ${
                  selectedLoadedFileId && !applyingSelection
                    ? 'bg-[#0056b3] text-white hover:bg-[#004494]'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                {applyingSelection && <Loader2 size={14} className="animate-spin" />}
                Cargar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Visor3DTab;