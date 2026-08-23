import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom'
import {
  Upload, FileText, X, Maximize2, Minimize2, FileSearch, Box,
  ChevronLeft, ChevronRight, Search, RefreshCw, FileDown,
  HardDrive, CloudDownload, Eye, Cpu, CheckCircle2, AlertTriangle, Loader2, Info,
  FileStack, Layers, Settings, FileSpreadsheet,
} from 'lucide-react';
import IFCViewer, { IFCViewerHandle } from '../IFCViewer/IFCViewer';
import { parseIfcHeader, IfcFileInfo } from '../IFCViewer/utils/parseIfcHeader';
import { UploadSimple, X as XIcon } from '@phosphor-icons/react';
import PartidasTree from './PartidasTree';
import ClassificationConfigModal from './ClassificationConfigModal';
import {
  IfcFile,
  IfcStatus,
  IfcSpecialty,
  IfcDocument,
  IfcDocumentContext,
  ClassificationOverrideInput,
  listProjectIfcFiles,
  getFileContentArrayBuffer,
  uploadAndProcessIfcFile,
  processExistingIfcFile,
  pollIfcProcessStatus,
  listIfcSpecialties,
  listIfcDocuments,
  getClassificationConfig,
  exportToExcel,
} from '../../services/ifcfiles.service';
import { getMyModuleAccess } from '../../services/module.service';
import type { ModuleAccess } from '../../services/module.service';
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

const VersionBadge: React.FC<{ versionNumber: number | null; isCurrent: boolean | null }> = ({ versionNumber, isCurrent }) => {
  if (versionNumber === null) return null;
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-[10px] font-semibold text-slate-500">v{versionNumber}</span>
      {isCurrent === false && (
        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
          versión anterior
        </span>
      )}
    </span>
  );
};

const Visor3DTab: React.FC<Visor3DTabProps> = ({ projectId }) => {
  const { user } = useAuth();

  const [metradosAccess, setMetradosAccess] = useState<ModuleAccess | null>(null);
  useEffect(() => {
    let cancelled = false;
    getMyModuleAccess(projectId, 'metrados')
      .then((access) => { if (!cancelled) setMetradosAccess(access); })
      .catch((err) => console.error('Error al obtener permisos de Metrados:', err));
    return () => { cancelled = true; };
  }, [projectId]);
  const canUpload = metradosAccess?.permissions.upload ?? false;
  const canProcess = metradosAccess?.permissions.process ?? false;
  const canConfigure = metradosAccess?.permissions.configure ?? false;
  const canExport = metradosAccess?.permissions.export ?? false;

  // Fase 5 — exportación a Excel
  const [exportingExcel, setExportingExcel] = useState(false);

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

  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [fileAwaitingContext, setFileAwaitingContext] = useState<File | null>(null);
  const [documentMode, setDocumentMode] = useState<'new' | 'version'>('new');
  const [specialties, setSpecialties] = useState<IfcSpecialty[]>([]);
  const [specialtiesLoading, setSpecialtiesLoading] = useState(false);
  const [selectedSpecialtyId, setSelectedSpecialtyId] = useState<number | null>(null);
  const [newDocumentName, setNewDocumentName] = useState('');
  const [documents, setDocuments] = useState<IfcDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentSearch, setDocumentSearch] = useState('');
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);

  // Fase 4 — overrides de clasificación en el modal de subida
  const [projectConfig, setProjectConfig] = useState<Awaited<ReturnType<typeof getClassificationConfig>> | null>(null);
  const [overrideMode, setOverrideMode] = useState<'project' | 'manual'>('project');
  const [overrideManualFields, setOverrideManualFields] = useState({
    code_property_set: '',
    code_property_name: '',
    description_property_set: '',
    description_property_name: '',
    unit_property_set: '',
    unit_property_name: '',
  });
  const [overridePrefixMode, setOverridePrefixMode] = useState<'project' | 'custom'>('project');
  const [overridePrefix, setOverridePrefix] = useState('');

  // Fase 4 — modal de configuración
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [partidasRefreshKey, setPartidasRefreshKey] = useState(0);

  useEffect(() => {
    if (!showDocumentModal) return;
    let cancelled = false;
    setSpecialtiesLoading(true);
    setDocumentsLoading(true);
    listIfcSpecialties()
      .then((list) => { if (!cancelled) setSpecialties(list); })
      .catch((err) => console.error('Error al cargar especialidades:', err))
      .finally(() => { if (!cancelled) setSpecialtiesLoading(false); });
    listIfcDocuments(projectId)
      .then((list) => { if (!cancelled) setDocuments(list); })
      .catch((err) => console.error('Error al cargar documentos IFC:', err))
      .finally(() => { if (!cancelled) setDocumentsLoading(false); });
    getClassificationConfig(projectId)
      .then((config) => { if (!cancelled) setProjectConfig(config); })
      .catch((err) => console.error('Error al cargar config de clasificación:', err));
    return () => { cancelled = true; };
  }, [showDocumentModal, projectId]);

  const filteredDocuments = documents.filter((d) =>
    d.name.toLowerCase().includes(documentSearch.trim().toLowerCase())
  );

  const closeDocumentModal = () => {
    setShowDocumentModal(false);
    setFileAwaitingContext(null);
    setDocumentMode('new');
    setSelectedSpecialtyId(null);
    setNewDocumentName('');
    setDocumentSearch('');
    setSelectedDocumentId(null);
    setOverrideMode('project');
    setOverrideManualFields({
      code_property_set: '',
      code_property_name: '',
      description_property_set: '',
      description_property_name: '',
      unit_property_set: '',
      unit_property_name: '',
    });
    setOverridePrefixMode('project');
    setOverridePrefix('');
    setProjectConfig(null);
  };

  const isDocumentContextReady =
    documentMode === 'new' ? selectedSpecialtyId !== null : selectedDocumentId !== null;

  const [showLoadedModal, setShowLoadedModal] = useState(false);
  const [loadedTab, setLoadedTab] = useState<'procesados' | 'no_procesados'>('procesados');
  const [loadedFiles, setLoadedFiles] = useState<IfcFile[]>([]);
  const [loadedLoading, setLoadedLoading] = useState(false);
  const [loadedError, setLoadedError] = useState<string | null>(null);
  const [loadedSearch, setLoadedSearch] = useState('');
  const [selectedLoadedFileId, setSelectedLoadedFileId] = useState<string | null>(null);
  const [applyingSelection, setApplyingSelection] = useState(false);
  const [onlyCurrentVersions, setOnlyCurrentVersions] = useState(true);

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
    async ({
      file,
      existingFileId,
      documentContext,
      classificationOverride,
    }: {
      file: File | null;
      existingFileId: string | null;
      documentContext?: IfcDocumentContext;
      classificationOverride?: ClassificationOverrideInput;
    }) => {
      setPanelStatus('processing');
      setPanelErrorMessage(null);
      try {
        let ifcFileId: string;
        if (existingFileId) {
          const initial = await processExistingIfcFile(projectId, existingFileId);
          ifcFileId = String(initial.ifc_file_id ?? existingFileId);
        } else if (file && documentContext) {
          const initial = await uploadAndProcessIfcFile(projectId, file, documentContext, classificationOverride);
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

  // Fase 5 — descargar archivo
  const handleDownloadFile = async (fileId: string, fileName: string) => {
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`http://localhost:4000/api/files/${fileId}/content?download=true`, {
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
      });
      if (!res.ok) {
        throw new Error(`Error al descargar (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert(err.message || 'Error al descargar el archivo');
    }
  };

  // Fase 5 — exportar a Excel y descargar automáticamente
  const handleExportExcel = async () => {
    if (!currentFileId) return;
    setExportingExcel(true);
    try {
      const result = await exportToExcel(currentFileId);
      await handleDownloadFile(result.file_id, result.name);
    } catch (err: any) {
      alert(err.message || 'Error al generar el Excel');
    } finally {
      setExportingExcel(false);
    }
  };

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

  const handleChooseProcesar = () => {
    if (!pendingLocalFile || !pendingLocalBuffer) return;

    loadBufferIntoViewer(pendingLocalBuffer, pendingLocalFile);
    setActivePanelTab('metrados');

    setFileAwaitingContext(pendingLocalFile);
    setPendingLocalFile(null);
    setPendingLocalBuffer(null);

    setShowDocumentModal(true);
  };

  const handleConfirmDocumentContext = async () => {
    if (!fileAwaitingContext || !isDocumentContextReady) return;

    const documentContext: IfcDocumentContext =
      documentMode === 'new'
        ? { specialtyId: selectedSpecialtyId!, documentName: newDocumentName.trim() || undefined }
        : { replacesIfcDocumentId: selectedDocumentId! };

    let classificationOverride: ClassificationOverrideInput | undefined;
    
    if (overrideMode === 'manual') {
      classificationOverride = {
        mode: 'manual',
        code_property_set: overrideManualFields.code_property_set || undefined,
        code_property_name: overrideManualFields.code_property_name,
        description_property_set: overrideManualFields.description_property_set || undefined,
        description_property_name: overrideManualFields.description_property_name || undefined,
        unit_property_set: overrideManualFields.unit_property_set || undefined,
        unit_property_name: overrideManualFields.unit_property_name || undefined,
      };
    }
    
    if (overridePrefixMode === 'custom') {
      if (!classificationOverride) classificationOverride = {};
      classificationOverride.property_prefix = overridePrefix;
    }

    const fileToProcess = fileAwaitingContext;
    closeDocumentModal();

    await runProcessing({ 
      file: fileToProcess, 
      existingFileId: null, 
      documentContext,
      classificationOverride,
    });
  };

  const cancelPendingLocal = () => {
    setPendingLocalFile(null);
    setPendingLocalBuffer(null);
  };

  const handleProcesarDesdeMetrados = () => {
    if (currentFileId) {
      runProcessing({ file: null, existingFileId: currentFileId });
    } else if (ifcFile) {
      setFileAwaitingContext(ifcFile);
      setShowDocumentModal(true);
    }
  };

  const fetchLoadedFiles = useCallback(async () => {
    setLoadedLoading(true);
    setLoadedError(null);
    try {
      const processed = loadedTab === 'procesados';
      const files = await listProjectIfcFiles(projectId, processed, onlyCurrentVersions);
      setLoadedFiles(files);
    } catch (err: any) {
      setLoadedError(err.message || 'Error al cargar los archivos del proyecto');
    } finally {
      setLoadedLoading(false);
    }
  }, [projectId, loadedTab, onlyCurrentVersions]);

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
                <div className="ml-auto flex items-center gap-1.5">
                  {/* BOTÓN EXPORTAR EXCEL */}
                  {panelStatus === 'done' && canExport && (
                    <button
                      onClick={handleExportExcel}
                      disabled={exportingExcel}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Exportar a Excel"
                    >
                      {exportingExcel ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <FileSpreadsheet size={13} />
                      )}
                      Excel
                    </button>
                  )}
                  {/* BOTÓN CONFIGURACIÓN */}
                  {canConfigure && (
                    <button
                      onClick={() => setShowConfigModal(true)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-[#0056b3] hover:bg-blue-50 transition-colors"
                      title="Configuración de clasificación"
                    >
                      <Settings size={16} />
                    </button>
                  )}
                </div>
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
                  {canProcess ? (
                    <button
                      onClick={handleProcesarDesdeMetrados}
                      className="px-4 py-2 bg-[#0056b3] text-white rounded text-xs font-bold hover:bg-[#004494] transition-colors"
                    >
                      Procesar archivo
                    </button>
                  ) : (
                    <p className="text-xs text-slate-500 italic">
                      No tenés permiso para procesar archivos en este proyecto
                    </p>
                  )}
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
                  {canProcess && (
                    <button
                      onClick={handleProcesarDesdeMetrados}
                      className="px-4 py-2 bg-[#0056b3] text-white rounded text-xs font-bold hover:bg-[#004494] transition-colors"
                    >
                      Reintentar
                    </button>
                  )}
                </div>
              ) : (
                <div className="h-full min-h-0">
                  {currentFileId && (
                    <PartidasTree
                      key={`${currentFileId}-${partidasRefreshKey}`}
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

      {/* Modal de configuración de clasificación */}
      {showConfigModal && (
        <ClassificationConfigModal
          projectId={projectId}
          onClose={() => setShowConfigModal(false)}
          onSaved={() => {
            setShowConfigModal(false);
            setPartidasRefreshKey(prev => prev + 1);
          }}
        />
      )}

      {pendingLocalFile && createPortal(
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

                {canUpload && canProcess && (
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
                )}
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
        </div>,
        document.body
      )}

      {showDocumentModal && fileAwaitingContext &&createPortal (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[10300] p-6">
          <div className="bg-white rounded-lg w-[520px] max-h-[85vh] shadow-2xl border border-gray-200 overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-gray-100 flex items-start gap-3 flex-shrink-0">
              <div className="w-10 h-10 rounded bg-blue-50 flex items-center justify-center flex-shrink-0">
                <FileStack size={18} className="text-[#0056b3]" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800">¿Qué es este archivo?</p>
                <p className="text-xs text-slate-500 truncate">{fileAwaitingContext.name}</p>
              </div>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {/* Paso 1: Documento nuevo vs versión */}
              <label
                className={`block rounded border p-3.5 cursor-pointer transition-colors ${
                  documentMode === 'new' ? 'border-[#0056b3] bg-blue-50/40' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2.5 mb-1">
                  <input
                    type="radio"
                    checked={documentMode === 'new'}
                    onChange={() => setDocumentMode('new')}
                    className="text-[#0056b3] focus:ring-[#0056b3]"
                  />
                  <span className="text-sm font-semibold text-slate-800">Documento nuevo</span>
                </div>

                {documentMode === 'new' && (
                  <div className="mt-3 space-y-3 pl-6">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                        Especialidad <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={selectedSpecialtyId ?? ''}
                        onChange={(e) => setSelectedSpecialtyId(e.target.value ? Number(e.target.value) : null)}
                        disabled={specialtiesLoading}
                        className="w-full px-3 py-2 border border-gray-200 rounded text-sm outline-none focus:ring-2 focus:ring-[#0056b3] bg-white"
                      >
                        <option value="">{specialtiesLoading ? 'Cargando...' : 'Seleccionar especialidad'}</option>
                        {specialties.map((s) => (
                          <option key={s.ifc_specialty_id} value={s.ifc_specialty_id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                        Nombre del documento (opcional)
                      </label>
                      <input
                        type="text"
                        value={newDocumentName}
                        onChange={(e) => setNewDocumentName(e.target.value)}
                        placeholder={fileAwaitingContext.name}
                        className="w-full px-3 py-2 border border-gray-200 rounded text-sm outline-none focus:ring-2 focus:ring-[#0056b3]"
                      />
                    </div>
                  </div>
                )}
              </label>

              <label
                className={`block rounded border p-3.5 cursor-pointer transition-colors ${
                  documentMode === 'version' ? 'border-[#0056b3] bg-blue-50/40' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2.5 mb-1">
                  <input
                    type="radio"
                    checked={documentMode === 'version'}
                    onChange={() => setDocumentMode('version')}
                    className="text-[#0056b3] focus:ring-[#0056b3]"
                  />
                  <span className="text-sm font-semibold text-slate-800">Nueva versión de un documento existente</span>
                </div>

                {documentMode === 'version' && (
                  <div className="mt-3 pl-6 space-y-2">
                    <div className="flex items-center border border-gray-200 rounded px-2.5 py-1.5 gap-2 focus-within:ring-2 focus-within:ring-[#0056b3]">
                      <Search size={13} className="text-slate-400 flex-shrink-0" />
                      <input
                        type="text"
                        value={documentSearch}
                        onChange={(e) => setDocumentSearch(e.target.value)}
                        placeholder="Buscar documento..."
                        className="flex-1 text-sm outline-none bg-transparent min-w-0"
                      />
                    </div>

                    <div className="max-h-48 overflow-y-auto border border-gray-100 rounded divide-y divide-gray-100">
                      {documentsLoading ? (
                        <p className="text-xs text-slate-400 text-center py-4">Cargando documentos...</p>
                      ) : filteredDocuments.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-4">
                          {documentSearch.trim() ? 'Sin resultados' : 'No hay documentos IFC en este proyecto todavía'}
                        </p>
                      ) : (
                        filteredDocuments.map((doc) => {
                          const current = doc.versions.find((v) => v.is_current);
                          return (
                            <button
                              key={doc.ifc_document_id}
                              onClick={() => setSelectedDocumentId(doc.ifc_document_id)}
                              className={`w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors flex items-center gap-2.5 ${
                                selectedDocumentId === doc.ifc_document_id ? 'bg-blue-50/70' : ''
                              }`}
                            >
                              <Layers size={14} className="text-slate-400 flex-shrink-0" />
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium text-slate-700 truncate">{doc.name}</p>
                                <p className="text-[10px] text-slate-400">
                                  {doc.specialty_name ?? 'Sin especialidad'}
                                  {current && ` · v${current.version_number} vigente`}
                                </p>
                              </div>
                              {selectedDocumentId === doc.ifc_document_id && (
                                <CheckCircle2 size={15} className="text-[#0056b3] flex-shrink-0" />
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </label>

              {/* Fase 4 — Paso 2: Override de clasificación */}
              <div className="border-t border-gray-200 pt-4 space-y-4">
                <p className="text-sm font-semibold text-slate-800">Clasificación (opcional)</p>

                {/* Override de modo */}
                <div className={`rounded border p-3 ${projectConfig?.mode_locked ? 'bg-gray-50 opacity-60' : 'bg-white'}`}>
                  <div className="flex items-center gap-2.5 mb-2">
                    <input
                      type="radio"
                      checked={overrideMode === 'project'}
                      onChange={() => setOverrideMode('project')}
                      disabled={projectConfig?.mode_locked}
                      className="text-[#0056b3] focus:ring-[#0056b3] disabled:opacity-50"
                    />
                    <span className="text-sm text-slate-700">
                      Usar la del proyecto ({projectConfig?.mode === 'manual' ? 'Manual' : 'Norma técnica'})
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <input
                      type="radio"
                      checked={overrideMode === 'manual'}
                      onChange={() => setOverrideMode('manual')}
                      disabled={projectConfig?.mode_locked}
                      className="text-[#0056b3] focus:ring-[#0056b3] disabled:opacity-50"
                    />
                    <span className="text-sm text-slate-700">Manual, solo para esta subida</span>
                  </div>

                  {overrideMode === 'manual' && (
                    <div className="mt-3 pl-6 space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={overrideManualFields.code_property_set}
                          onChange={(e) => setOverrideManualFields(prev => ({ ...prev, code_property_set: e.target.value }))}
                          placeholder="Grupo (opcional)"
                          className="w-1/3 px-3 py-1.5 border border-gray-200 rounded text-sm outline-none focus:ring-2 focus:ring-[#0056b3]"
                        />
                        <input
                          type="text"
                          value={overrideManualFields.code_property_name}
                          onChange={(e) => setOverrideManualFields(prev => ({ ...prev, code_property_name: e.target.value }))}
                          placeholder="Propiedad de código *"
                          className="flex-1 px-3 py-1.5 border border-gray-200 rounded text-sm outline-none focus:ring-2 focus:ring-[#0056b3]"
                        />
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={overrideManualFields.description_property_set}
                          onChange={(e) => setOverrideManualFields(prev => ({ ...prev, description_property_set: e.target.value }))}
                          placeholder="Grupo (opcional)"
                          className="w-1/3 px-3 py-1.5 border border-gray-200 rounded text-sm outline-none focus:ring-2 focus:ring-[#0056b3]"
                        />
                        <input
                          type="text"
                          value={overrideManualFields.description_property_name}
                          onChange={(e) => setOverrideManualFields(prev => ({ ...prev, description_property_name: e.target.value }))}
                          placeholder="Propiedad de descripción"
                          className="flex-1 px-3 py-1.5 border border-gray-200 rounded text-sm outline-none focus:ring-2 focus:ring-[#0056b3]"
                        />
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={overrideManualFields.unit_property_set}
                          onChange={(e) => setOverrideManualFields(prev => ({ ...prev, unit_property_set: e.target.value }))}
                          placeholder="Grupo (opcional)"
                          className="w-1/3 px-3 py-1.5 border border-gray-200 rounded text-sm outline-none focus:ring-2 focus:ring-[#0056b3]"
                        />
                        <input
                          type="text"
                          value={overrideManualFields.unit_property_name}
                          onChange={(e) => setOverrideManualFields(prev => ({ ...prev, unit_property_name: e.target.value }))}
                          placeholder="Propiedad de unidad"
                          className="flex-1 px-3 py-1.5 border border-gray-200 rounded text-sm outline-none focus:ring-2 focus:ring-[#0056b3]"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Override de prefijo */}
                <div className={`rounded border p-3 ${projectConfig?.property_prefix_locked ? 'bg-gray-50 opacity-60' : 'bg-white'}`}>
                  <div className="flex items-center gap-2.5 mb-2">
                    <input
                      type="radio"
                      checked={overridePrefixMode === 'project'}
                      onChange={() => setOverridePrefixMode('project')}
                      disabled={projectConfig?.property_prefix_locked}
                      className="text-[#0056b3] focus:ring-[#0056b3] disabled:opacity-50"
                    />
                    <span className="text-sm text-slate-700">
                      Usar el del proyecto ({projectConfig?.property_prefix || 'Sin prefijo'})
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <input
                      type="radio"
                      checked={overridePrefixMode === 'custom'}
                      onChange={() => setOverridePrefixMode('custom')}
                      disabled={projectConfig?.property_prefix_locked}
                      className="text-[#0056b3] focus:ring-[#0056b3] disabled:opacity-50"
                    />
                    <span className="text-sm text-slate-700">Otro, solo para esta subida</span>
                  </div>

                  {overridePrefixMode === 'custom' && (
                    <div className="mt-3 pl-6">
                      <input
                        type="text"
                        value={overridePrefix}
                        onChange={(e) => setOverridePrefix(e.target.value)}
                        placeholder="p.ej. CSRT-"
                        className="w-full px-3 py-1.5 border border-gray-200 rounded text-sm outline-none focus:ring-2 focus:ring-[#0056b3]"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-gray-100 bg-gray-50/70 flex justify-end gap-2 flex-shrink-0">
              <button
                onClick={closeDocumentModal}
                className="px-4 py-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDocumentContext}
                disabled={!isDocumentContextReady || (overrideMode === 'manual' && !overrideManualFields.code_property_name)}
                className={`px-5 py-1.5 rounded text-sm font-semibold transition-colors ${
                  isDocumentContextReady && !(overrideMode === 'manual' && !overrideManualFields.code_property_name)
                    ? 'bg-[#0056b3] text-white hover:bg-[#004494]'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                Continuar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showLoadedModal &&createPortal (
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
              <div className="flex items-center justify-between">
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

                <label className="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer select-none">
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
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium text-slate-700 truncate">{file.name}</p>
                        <VersionBadge versionNumber={file.version_number} isCurrent={file.is_current} />
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {formatBytes(file.file_size)} · {new Date(file.uploaded_at).toLocaleDateString()}
                        {file.specialty_name && ` · ${file.specialty_name}`}
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
        </div>,
        document.body 
      )}
    </div>
  );
};

export default Visor3DTab;