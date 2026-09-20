import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom'
import {
  Upload, FileText, X, Maximize2, Minimize2, FileSearch, Box,
  ChevronLeft, ChevronRight, Search, RefreshCw, FileDown,
  HardDrive, CloudDownload, Eye, Cpu, CheckCircle2, AlertTriangle, Loader2, Info,
  FileStack, Layers, Settings, FileSpreadsheet, Building2, FlaskConical, RotateCcw, Lock
} from 'lucide-react';
import IFCViewer, { IFCViewerHandle } from '../IFCViewer/IFCViewer';
import { parseIfcHeader, IfcFileInfo } from '../IFCViewer/utils/parseIfcHeader';
import { convertIfcToFragmentsClientSide } from '../IFCViewer/workers/fragmentsImportWorkerClient';
import { UploadSimple, X as XIcon } from '@phosphor-icons/react';
import PartidasTree from './Metrados/PartidasTree';
import ClassificationConfigModal from './Metrados/ClassificationConfigModal';
import {
  IfcFile,
  IfcStatus,
  IfcSpecialty,
  IfcDocument,
  IfcDocumentContext,
  ClassificationOverrideInput,
  listProjectIfcFiles,
  getFileContentArrayBuffer,
  getIfcProcessStatus,
  uploadAndProcessIfcFile,
  processExistingIfcFile,
  pollIfcProcessStatus,
  listIfcSpecialties,
  listIfcDocuments,
  getClassificationConfig,
  exportToExcel,
  getPartidasTree,
  classificationDryRun,
  getElementMetrado,
} from '../../services/ifcfiles.service';
import type { PartidaNode, ClassificationDryRunResult } from '../../services/ifcfiles.service';
import { projectService } from '../../services/project.service';
import { getMyModuleAccess } from '../../services/module.service';
import type { ModuleAccess } from '../../services/module.service';
import { BASE_URL } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

interface Visor3DTabProps {
  projectId: number;
  isActive?: boolean; 
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

// Mensaje más claro para códigos de error puntuales del backend — sin
// esto, IFC_INVALID_CONTENT (subiste algo que no es un IFC de verdad)
// se mostraba con el mensaje genérico de un 500/422 cualquiera. Para
// cualquier otro código (o si no vino ninguno), se cae al mensaje que
// mandó el backend, como siempre.
function friendlyIfcErrorMessage(err: any): string {
  if (err?.code === 'IFC_INVALID_CONTENT') {
    return 'El archivo subido no es un IFC válido (no tiene el encabezado ISO-10303-21 esperado). Verificá que sea el archivo correcto.';
  }
  return err?.message || 'Error al subir/procesar el archivo.';
}

// Aplana el árbol de partidas para la vista previa del Excel — mismos
// datos que arma la hoja "Resumido" del backend (escribirResumen en
// ifc-excel-export.service.ts: ITEM/DESCRIPCIÓN/UND/TOTAL, indentado
// por profundidad), solo que acá se renderiza como tabla HTML en vez
// de escribirse a un .xlsx.
function flattenPartidaTree(nodes: PartidaNode[], depth = 0): { node: PartidaNode; depth: number }[] {
  const out: { node: PartidaNode; depth: number }[] = [];
  for (const node of nodes) {
    out.push({ node, depth });
    out.push(...flattenPartidaTree(node.children, depth + 1));
  }
  return out;
}

function formatTotal(value: number | null): string {
  if (value === null || value === undefined) return '';
  return value.toLocaleString('es-PE', { maximumFractionDigits: 2 });
}

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
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

const Visor3DTab: React.FC<Visor3DTabProps> = ({ projectId, isActive = true }) => {
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

  // Fase 5 — exportación a Excel: en vez de descargar directo, se genera
  // (el backend ya lo guarda como archivo del proyecto de una, no hay
  // endpoint separado para "generar sin guardar") y se muestra una vista
  // previa con los mismos datos de la hoja "Resumido" del Excel (mismo
  // árbol que ya usa PartidasTree), con 3 opciones: Guardar (dejarlo
  // como está — ya está guardado), Descargar, o Cancelar (borra el
  // archivo recién creado, usando el mismo endpoint de eliminar archivo
  // que ya usa ArchivosTab — no hace falta nada nuevo del backend).
  const [exportingExcel, setExportingExcel] = useState(false);
  const [excelPreview, setExcelPreview] = useState<{
    fileId: string;
    fileName: string;
    tree: PartidaNode[];
  } | null>(null);
  const [cancelingExcelPreview, setCancelingExcelPreview] = useState(false);

  const [ifcFile, setIfcFile] = useState<File | null>(null);
  const [ifcArrayBuffer, setIfcArrayBuffer] = useState<ArrayBuffer | null>(null);
  // Fragments como camino principal: se descarga/genera un .frag y se
  // le pasa a IFCViewer aparte de ifcArrayBuffer (ver fragmentsBuffer
  // en IFCViewer.tsx), que lo prefiere en cuanto está disponible — ver
  // loadBufferIntoViewer más abajo para las dos formas de conseguirlo
  // (ya generado en el servidor, o convertido acá mismo en el
  // navegador) y loadTokenRef para no dejar que la conversión de un
  // archivo viejo pise al que se cargó después.
  const [fragmentsArrayBuffer, setFragmentsArrayBuffer] = useState<ArrayBuffer | null>(null);
  const loadTokenRef = useRef(0);
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

  // Cronómetro del cartel "Procesando archivo..." — el backend no manda
  // ningún porcentaje de avance (agregarlo tocaría todo el pipeline de
  // procesamiento), así que en vez de prometer una duración que no se
  // cumple para archivos grandes, se muestra cuánto tiempo real lleva.
  const [processingElapsed, setProcessingElapsed] = useState(0);
  useEffect(() => {
    if (panelStatus !== 'processing') {
      setProcessingElapsed(0);
      return;
    }
    const startedAt = Date.now();
    const id = setInterval(() => {
      setProcessingElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [panelStatus]);

  // "Reanudar": recuerda (por proyecto, en este navegador) cuál fue el
  // último archivo que quedó cargado, y lo vuelve a cargar solo la
  // próxima vez que se entra a esta pestaña — sin esto, cada vez había
  // que ir a buscarlo de nuevo aunque fuera el mismo de siempre. Se
  // guarda recién cuando terminó bien (panelStatus 'done'), no en
  // cualquier estado intermedio.
  useEffect(() => {
    if (!currentFileId || panelStatus !== 'done') return;
    try {
      localStorage.setItem(`lastIfcFile:${projectId}`, currentFileId);
    } catch {
      // localStorage puede fallar (modo privado, cuota llena) — no es
      // crítico, simplemente no se podrá reanudar la próxima vez.
    }
  }, [currentFileId, panelStatus, projectId]);

  const [showEntryPopover, setShowEntryPopover] = useState<'center' | 'floating' | null>(null);
  const entryPopoverRef = useRef<HTMLDivElement>(null);
  const localInputRef = useRef<HTMLInputElement>(null);

  const [pendingLocalFile, setPendingLocalFile] = useState<File | null>(null);
  const [pendingLocalBuffer, setPendingLocalBuffer] = useState<ArrayBuffer | null>(null);

  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [fileAwaitingContext, setFileAwaitingContext] = useState<File | null>(null);
  const [documentMode, setDocumentMode] = useState<'new' | 'version'>('new');
  // "Reprocesar" (force=true) reusa este mismo modal — pero solo el
  // paso de clasificación (abajo), sin el paso de "documento nuevo vs
  // versión" (no aplica: el service ignora esos campos en un reproceso,
  // ver ProcessIfcMetradosBodySchema). Así la persona puede elegir la
  // configuración antes de reprocesar, respetando los candados del
  // proyecto (mode_locked/property_prefix_locked) igual que al subir.
  const [isReprocessFlow, setIsReprocessFlow] = useState(false);
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
  // "Usar la del proyecto (Manual)" no decía QUÉ propiedades usa eso —
  // antes había que cerrar este modal e ir a "Configuración de
  // clasificación" aparte para saberlo. En vez de mostrarlo siempre
  // (agranda el formulario para el caso común, que es 'norma'), queda
  // oculto detrás de este toggle — cero espacio de más hasta que se pide.
  const [showProjectManualDetail, setShowProjectManualDetail] = useState(false);
  // 'norma' — antes no existía esta opción: si el proyecto por defecto
  // era 'manual', no había forma de pisarlo hacia la norma técnica del
  // sistema para una subida/reproceso puntual (bug real, encontrado
  // con uso — ver ClassificationOverrideInput en ifcfiles.service.ts).
  const [overrideMode, setOverrideMode] = useState<'project' | 'norma' | 'manual'>('project');
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

  // Consolidación punto 5 — "Probar" (dry-run) el override manual antes
  // de confirmar la subida. Corre contra fileAwaitingContext (el File
  // local, todavía NO subido al servidor) — por eso classificationDryRun
  // lo manda como multipart, no por file_id. Se resetea cada vez que se
  // cambia algún campo del override para no mostrar un resultado viejo.
  const [dryRunRunning, setDryRunRunning] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<ClassificationDryRunResult | null>(null);
  const [dryRunError, setDryRunError] = useState<string | null>(null);

  const handleDryRun = async () => {
    if (!fileAwaitingContext || !overrideManualFields.code_property_name) return;
    setDryRunRunning(true);
    setDryRunError(null);
    setDryRunResult(null);
    try {
      const result = await classificationDryRun(projectId, fileAwaitingContext, {
        property_prefix: overridePrefixMode === 'custom' ? (overridePrefix || undefined) : (projectConfig?.property_prefix ?? undefined),
        code_property_set: overrideManualFields.code_property_set || undefined,
        code_property_name: overrideManualFields.code_property_name,
        description_property_set: overrideManualFields.description_property_set || undefined,
        description_property_name: overrideManualFields.description_property_name || undefined,
        unit_property_set: overrideManualFields.unit_property_set || undefined,
        unit_property_name: overrideManualFields.unit_property_name || undefined,
      });
      setDryRunResult(result);
    } catch (err: any) {
      setDryRunError(err.message || 'Error al probar la configuración.');
    } finally {
      setDryRunRunning(false);
    }
  };

  // Cualquier cambio en los campos manuales o el prefijo deja el último
  // resultado de "Probar" desactualizado.
  useEffect(() => {
    setDryRunResult(null);
    setDryRunError(null);
  }, [overrideManualFields, overridePrefixMode, overridePrefix]);

  // Fase 4 — modal de configuración
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [partidasRefreshKey, setPartidasRefreshKey] = useState(0);

  useEffect(() => {
    if (!showDocumentModal) return;
    let cancelled = false;
    // Reprocesar no usa el paso "documento nuevo vs versión" (ver
    // isReprocessFlow más arriba) — no hace falta gastar estos dos
    // requests en ese caso.
    if (!isReprocessFlow) {
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
    }
    getClassificationConfig(projectId)
      .then((config) => { if (!cancelled) setProjectConfig(config); })
      .catch((err) => console.error('Error al cargar config de clasificación:', err));
    return () => { cancelled = true; };
  }, [showDocumentModal, projectId, isReprocessFlow]);

  const filteredDocuments = documents.filter((d) =>
    d.name.toLowerCase().includes(documentSearch.trim().toLowerCase())
  );

  const closeDocumentModal = () => {
    setShowDocumentModal(false);
    setFileAwaitingContext(null);
    setIsReprocessFlow(false);
    setShowProjectManualDetail(false);
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
    setDryRunResult(null);
    setDryRunError(null);
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
 const handleClearSelectionInViewer = useCallback(() => {
  viewerRef.current?.clearSelection?.();
}, []);

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

  const loadBufferIntoViewer = (buffer: ArrayBuffer, sourceFile: File | null, ifcFileId?: string) => {
    // Copia ANTES de hacer cualquier otra cosa con `buffer` — más abajo
    // se guarda el ORIGINAL para el eventual respaldo web-ifc (si
    // Fragments termina fallando del todo) y esta copia es la que se
    // transfiere a la conversión/worker, para no arriesgar que ambos
    // caminos terminen peleándose por el mismo buffer.
    const bufferForFragments = buffer.slice(0);

    setIfcInfo(parseIfcHeader(buffer));
    setIfcFile(sourceFile);

    // A propósito NO se llama setIfcArrayBuffer(buffer) acá — Fragments
    // es el camino principal ahora: mientras se resuelve (bajar el
    // .frag ya generado, o convertir en el navegador si hace falta), no
    // se muestra nada por web-ifc para después tener que tirarlo y
    // recargar todo de nuevo por Fragments (esto además fue la causa
    // real de la carrera de "efecto que corre dos veces con el mismo
    // buffer ya transferido" que arreglé antes en useModelLoader.ts).
    // ifcArrayBuffer solo se termina seteando si Fragments falla de
    // verdad (ver el catch más abajo) — ahí sí, como último recurso.
    setIfcArrayBuffer(null);

    // Token de esta carga puntual — si el usuario cambia de archivo
    // mientras la conversión/descarga de abajo todavía está en vuelo
    // (puede tardar bastante, sobre todo la conversión en el
    // navegador), el resultado tardío no debe pisar el archivo nuevo
    // que ya está en pantalla.
    const myToken = ++loadTokenRef.current;
    setFragmentsArrayBuffer(null);

    // Cubre TODO el tiempo de espera hasta que hay algo para mostrar —
    // antes este spinner solo tapaba la lectura del archivo local
    // (rápida), no la descarga/conversión a Fragments de acá abajo
    // (la parte que de verdad tarda); sin esto, después de elegir
    // "Solo graficar"/"Procesar" parecía que no pasaba nada.
    setIfcLoading(true);
    const stopLoadingIfCurrent = () => { if (loadTokenRef.current === myToken) setIfcLoading(false); };

    (async () => {
      // Camino rápido: si este archivo ya pasó por el backend y tiene
      // un .frag generado ahí (ifcFileId conocido), usar ESE — es
      // trabajo de conversión que ya está hecho, no tiene sentido
      // repetirlo en el navegador.
      if (ifcFileId) {
        try {
          const status = await getIfcProcessStatus(ifcFileId);
          if (status.fragments_file_id) {
            const fragBuffer = await getFileContentArrayBuffer(status.fragments_file_id);
            if (loadTokenRef.current === myToken) setFragmentsArrayBuffer(fragBuffer);
            stopLoadingIfCurrent();
            return;
          }
        } catch (err) {
          console.warn('[Fragments] no se pudo traer el .frag ya generado, se intenta convertir en el navegador:', err);
        }
      }

      // Camino de conversión en el navegador — para "Solo graficar"
      // (el archivo nunca se sube, así que nunca va a tener un
      // ifcFileId/.frag del servidor) y también como respaldo si el
      // camino rápido de arriba falló o el backend todavía no terminó
      // de generar el suyo. Corre en un Worker aparte (ver
      // fragmentsImportWorker.ts) para no trabar la UI durante los
      // ~15-25s reales que mide esta conversión en el backend.
      try {
        const fragBuffer = await convertIfcToFragmentsClientSide(bufferForFragments);
        if (loadTokenRef.current === myToken) setFragmentsArrayBuffer(fragBuffer);
      } catch (err) {
        console.warn('[Fragments] no se pudo convertir a Fragments en el navegador, se cae al camino de siempre (web-ifc):', err);
        // Último recurso — recién ACÁ se muestra algo por web-ifc, y
        // solo porque Fragments genuinamente no se pudo armar (no como
        // paso intermedio de todos los casos).
        if (loadTokenRef.current === myToken) setIfcArrayBuffer(buffer);
      } finally {
        stopLoadingIfCurrent();
      }
    })();
  };

  // Intenta reanudar el último archivo recordado para este proyecto —
  // corre una sola vez por proyecto (esta pestaña se monta una sola vez
  // y queda montada, ver el comentario en DashboardProjects.tsx). Si el
  // archivo recordado ya no existe, no es la versión vigente, o
  // cualquier otra cosa falla, simplemente no reanuda nada — se cae al
  // selector de siempre, sin mostrar ningún error (reanudar es una
  // comodidad, no algo de lo que dependa poder usar el visor).
  const resumedForProjectRef = useRef<number | null>(null);
  useEffect(() => {
    if (resumedForProjectRef.current === projectId) return;
    resumedForProjectRef.current = projectId;

    let lastId: string | null;
    try {
      lastId = localStorage.getItem(`lastIfcFile:${projectId}`);
    } catch {
      return;
    }
    if (!lastId) return;

    (async () => {
      try {
        const files = await listProjectIfcFiles(projectId, true, true);
        const match = files.find((f) => f.file_id === lastId);
        if (!match) {
          localStorage.removeItem(`lastIfcFile:${projectId}`);
          return;
        }

        const buffer = await getFileContentArrayBuffer(match.file_id);
        loadBufferIntoViewer(buffer, new File([buffer], match.name, { type: match.mime_type }), match.file_id);
        setCurrentFileId(match.file_id);
        setPanelStatus(ifcStatusToPanelStatus(match.ifc_status));
        setPanelErrorMessage(match.ifc_error_message ?? null);
      } catch {
        // ver comentario de arriba: fallar acá no es un error visible.
      }
    })();
  }, [projectId]);

  const runProcessing = useCallback(
    async ({
      file,
      existingFileId,
      documentContext,
      classificationOverride,
      force,
    }: {
      file: File | null;
      existingFileId: string | null;
      documentContext?: IfcDocumentContext;
      classificationOverride?: ClassificationOverrideInput;
      force?: boolean;
    }) => {
      setPanelStatus('processing');
      setPanelErrorMessage(null);
      try {
        let ifcFileId: string;
        if (existingFileId) {
          const initial = await processExistingIfcFile(projectId, existingFileId, force, classificationOverride);
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
        // Reprocesar (force=true) mantiene el mismo ifcFileId de
        // siempre — el key de PartidasTree (más abajo) no cambia solo,
        // así que sin esto el árbol se quedaría mostrando las partidas
        // viejas hasta salir y volver a entrar.
        if (final.status === 'done' && force) {
          setPartidasRefreshKey(prev => prev + 1);
        }
      } catch (err: any) {
        console.error('Error al procesar el archivo IFC:', err);
        setPanelStatus('error');
        setPanelErrorMessage(friendlyIfcErrorMessage(err));
      }
    },
    [projectId]
  );

  // Fase 5 — descargar archivo
  const handleDownloadFile = async (fileId: string, fileName: string) => {
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${BASE_URL}/api/files/${fileId}/content?download=true`, {
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

  // Fase 5 — generar el Excel (el backend lo guarda como archivo del
  // proyecto, igual que siempre) y mostrar una vista previa en vez de
  // descargarlo automático — la descarga queda como acción explícita
  // desde el modal de vista previa (ver excelPreview).
  const handleExportExcel = async () => {
    if (!currentFileId) return;
    setExportingExcel(true);
    try {
      const result = await exportToExcel(currentFileId);
      const tree = await getPartidasTree(currentFileId);
      setExcelPreview({ fileId: result.file_id, fileName: result.name, tree });
    } catch (err: any) {
      alert(err.message || 'Error al generar el Excel');
    } finally {
      setExportingExcel(false);
    }
  };

  // "Guardar": no hay nada que hacer — el backend ya lo guardó al
  // generarlo — así que solo cierra la vista previa.
  const handleSaveExcelPreview = () => {
    setExcelPreview(null);
  };

  // "Cancelar" (y también la X / click afuera): como el backend no tiene
  // un modo "generar sin guardar", cancelar significa borrar el archivo
  // que se acaba de crear — mismo endpoint que ya usa ArchivosTab para
  // eliminar cualquier archivo del proyecto.
  const handleCancelExcelPreview = async () => {
    if (!excelPreview) return;
    setCancelingExcelPreview(true);
    try {
      await projectService.deleteProjectFile(projectId, excelPreview.fileId);
      setExcelPreview(null);
    } catch (err: any) {
      alert(err.message || 'No se pudo cancelar/eliminar el Excel generado.');
    } finally {
      setCancelingExcelPreview(false);
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

  // Compartido entre el flujo de subida (handleConfirmDocumentContext)
  // y el de reprocesar (handleConfirmReprocess) — las dos partes del
  // override son independientes entre sí (ver el comentario largo en
  // ifc-classification.schema.ts, backend).
  const buildClassificationOverride = (): ClassificationOverrideInput | undefined => {
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
    } else if (overrideMode === 'norma') {
      // No necesita ningún campo de propiedad — el backend lo resuelve
      // solo con el mode.
      classificationOverride = { mode: 'norma' };
    }

    if (overridePrefixMode === 'custom') {
      if (!classificationOverride) classificationOverride = {};
      classificationOverride.property_prefix = overridePrefix;
    }

    return classificationOverride;
  };

  const handleConfirmDocumentContext = async () => {
    if (!fileAwaitingContext || !isDocumentContextReady) return;

    const documentContext: IfcDocumentContext =
      documentMode === 'new'
        ? { specialtyId: selectedSpecialtyId!, documentName: newDocumentName.trim() || undefined }
        : { replacesIfcDocumentId: selectedDocumentId! };

    const classificationOverride = buildClassificationOverride();
    const fileToProcess = fileAwaitingContext;
    closeDocumentModal();

    await runProcessing({
      file: fileToProcess,
      existingFileId: null,
      documentContext,
      classificationOverride,
    });
  };

  // "Reprocesar" — a diferencia de handleConfirmDocumentContext, no
  // manda documentContext: el service lo ignora en un reproceso (el
  // ifc_files/ifc_documents ya existe, ver ProcessIfcMetradosBodySchema
  // en el backend), la única parte que de verdad aplica es el override
  // de clasificación.
  const handleConfirmReprocess = async () => {
    if (!currentFileId) return;
    const classificationOverride = buildClassificationOverride();
    closeDocumentModal();
    await runProcessing({ file: null, existingFileId: currentFileId, force: true, classificationOverride });
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

  // "Reprocesar" (force=true) — el service ya lo soportaba, faltaba el
  // control en la UI. A diferencia de "Procesar archivo"/"Reintentar"
  // (que solo aplican si todavía no está en 'done'), esto vuelve a
  // correr el pipeline entero sobre un archivo ya procesado — por eso
  // abre el mismo modal de clasificación que usa la subida (en modo
  // reproceso, sin el paso de documento nuevo/versión), así se puede
  // ajustar la configuración antes de reprocesar en vez de repetir a
  // ciegas la de la última vez. El propio botón "Reprocesar" del modal
  // ya funciona como confirmación — no hace falta un window.confirm
  // encima.
  const handleReprocesar = () => {
    if (!currentFileId) return;
    if (!ifcFile) {
      // No debería pasar (ifcFile se completa al cargar cualquier
      // archivo, ver loadBufferIntoViewer) — por las dudas, reprocesa
      // con la config del proyecto tal cual, sin mostrar el modal.
      const confirmed = window.confirm(
        '¿Volver a procesar este archivo con la configuración del proyecto? Puede tardar varios minutos.'
      );
      if (!confirmed) return;
      runProcessing({ file: null, existingFileId: currentFileId, force: true });
      return;
    }
    setFileAwaitingContext(ifcFile);
    setIsReprocessFlow(true);
    setShowDocumentModal(true);
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
      loadBufferIntoViewer(buffer, selected ? new File([buffer], selected.name, { type: selected.mime_type }) : null, selectedLoadedFileId);

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
    setFragmentsArrayBuffer(null);
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

  const handleSelectAllInViewer = useCallback((expressIds: number[], globalIds?: (string | null)[]) => {
    viewerRef.current?.isolateElementsByIds(expressIds, globalIds);
  }, []);

  const handleSelectGroupInViewer = useCallback((expressIds: number[], globalIds?: (string | null)[]) => {
    viewerRef.current?.selectGroupInViewer(expressIds, globalIds);
  }, []);

  // Botón "Partida" del popup Ocultar/Aislar/Cortar (IFCViewer.tsx) —
  // búsqueda inversa por elemento: a qué partida pertenece, si
  // pertenece a alguna. focusPartida dispara el salto directo a esa
  // pantalla de detalle dentro de PartidasTree (ver ese componente);
  // onFocusPartidaHandled lo vuelve a null para que un segundo click en
  // el MISMO elemento (mismo partida_id) dispare el efecto de nuevo.
  const [focusPartida, setFocusPartida] = useState<{
    partida_id: number; code: string; description: string; unit: string | null; expressId: number;
  } | null>(null);

  const handleViewElementInMetrados = useCallback(async (expressId: number) => {
    if (!currentFileId) return;
    try {
      const result = await getElementMetrado(currentFileId, expressId);
      if (!result.partida) {
        alert('Este elemento no está clasificado en ninguna partida.');
        return;
      }
      setPanelOpen(true);
      setFocusPartida({ ...result.partida, expressId });
    } catch (err: any) {
      alert(err.message || 'No se pudo buscar la partida de este elemento.');
    }
  }, [currentFileId]);

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
        nuevo archivo
      </button>
      <button
        onClick={openLoadedModal}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors text-left"
      >
        <CloudDownload size={16} className="text-[#0056b3]" />
        mis archivos
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
        <div className="flex-1 min-h-0 flex relative overflow-hidden @container">

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
            ) : (ifcArrayBuffer || fragmentsArrayBuffer) ? (
              <IFCViewer
                ref={viewerRef}
                fileBuffer={ifcArrayBuffer}
                fragmentsBuffer={fragmentsArrayBuffer}
                projectId={projectId}
                viewCubeRightOffset={panelOpen ? panelWidth : 0}
                viewCubeVisible={isActive}
                isActive={isActive}
                onViewElementInMetrados={handleViewElementInMetrados}
                fileName={ifcFile?.name}
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
                    onClick={() => {
                      if (panelStatus === 'processing') return;
                      setShowEntryPopover(showEntryPopover === 'center' ? null : 'center');
                    }}
                    disabled={panelStatus === 'processing'}
                    title={panelStatus === 'processing' ? 'Esperá a que termine de procesar el archivo actual' : undefined}
                    className="cursor-pointer flex items-center gap-2 px-5 py-2.5 bg-[#0056b3] text-white rounded hover:bg-[#004494] transition-colors font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed"
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
            className={`absolute top-0 bottom-3 right-0 flex-shrink-0 flex flex-col p-5 text-slate-700 overflow-hidden bg-[#FFFFFF] shadow-2xl border-l border-slate-400/40 rounded z-[9500] max-w-[90cqw] ${
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
              <div className="flex items-center flex-wrap gap-2.5 mb-3">
                <h2 className="text-lg font-bold text-[#0056b3] tracking-tight flex-shrink-0">Metrados</h2>
                {panelStatus === 'done' && (
                  <div
                    className="flex items-center justify-center w-4 h-4 rounded-full bg-emerald-50 border border-emerald-200 flex-shrink-0"
                    title="Metrados listos"
                  >
                    <CheckCircle2 size={10} className="text-emerald-600" />
                  </div>
                )}
                <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
                  {/* BOTÓN REPROCESAR — vuelve a correr el pipeline sobre
                      el mismo archivo (force=true), útil si cambió la
                      configuración de clasificación después de procesarlo. */}
                  {panelStatus === 'done' && canProcess && (
                    <button
                      onClick={handleReprocesar}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-600 text-xs font-semibold hover:border-[#0056b3] hover:text-[#0056b3] hover:bg-blue-50 transition-colors flex-shrink-0 whitespace-nowrap"
                      title="Volver a procesar este archivo"
                    >
                      <RotateCcw size={13} />
                      Reprocesar
                    </button>
                  )}
                  {/* BOTÓN EXPORTAR EXCEL */}
                  {panelStatus === 'done' && canExport && (
                    <button
                      onClick={handleExportExcel}
                      disabled={exportingExcel}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 whitespace-nowrap"
                      title="Exportar a Excel"
                    >
                      {exportingExcel ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <FileSpreadsheet size={13} />
                      )}
                      Generar Excel 
                    </button>
                  )}
                  {/* BOTÓN CONFIGURACIÓN — antes solo lo veía quien tenía
                      permiso de "configure" (quedaba escondido del resto).
                      Ahora es visible para cualquiera con acceso al módulo;
                      quien no sea admin/owner del proyecto (ni tenga rol de
                      Administrador en Metrados) igual puede abrirlo, solo
                      que el modal se abre en modo lectura (ver
                      ClassificationConfigModal readOnly). */}
                  <button
                    onClick={() => setShowConfigModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-600 text-xs font-semibold hover:border-[#0056b3] hover:text-[#0056b3] hover:bg-blue-50 transition-colors flex-shrink-0 whitespace-nowrap"
                    title={canConfigure ? 'Configuración de clasificación' : 'Ver configuración de clasificación (solo lectura)'}
                  >
                    <Settings size={13} />
                    Configuración
                    {!canConfigure && <Eye size={12} className="text-slate-400" />}
                  </button>
                </div>
              </div>

              <div className="relative flex items-center gap-2 bg-slate-100/60 border border-slate-300/60 rounded px-2 py-1.5 mb-2.5">
                <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${ifcFile ? 'bg-blue-100' : 'bg-slate-200'}`}>
  <Building2 size={11} className={ifcFile ? 'text-blue-600' : 'text-slate-400'} />
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
                      <p className="text-xs font-bold text-slate-700">Información del IFC</p>
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
              {!ifcArrayBuffer && !fragmentsArrayBuffer ? (
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
                  <p className="text-sm font-mono tabular-nums bg-white border border-slate-300 rounded px-2 py-0.5">
                    {formatElapsed(processingElapsed)}
                  </p>
                  <p className="text-xs text-slate-600">
                    Puede tardar varios minutos en archivos grandes — no
                    hace falta cerrar ni recargar la pestaña.
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
                      onClearSelectionInViewer={handleClearSelectionInViewer}
                      focusPartida={focusPartida}
                      onFocusPartidaHandled={() => setFocusPartida(null)}
                    />
                  )}
                </div>
              )}
            </div>

          </div>

          {/* Centrada en el área VISIBLE del visor, no en el ancho total del
              contenedor: el panel de metrados es absolute con right:0 y no
              achica el visor por flex, así que sin este cálculo la barra
              queda corrida hacia la derecha cuando el panel está abierto o
              se agranda. Mismo criterio que viewCubeRightOffset (línea de
              arriba, IFCViewer) para el ViewCube. */}
          <div
            className={`absolute bottom-6 z-[9700] flex items-center bg-white/95 backdrop-blur-md border border-gray-200 rounded shadow-xl px-0.5 py-0.5 ${
              isResizing ? '' : 'transition-[left] duration-300 ease-in-out'
            }`}
            style={{
              left: panelOpen ? `calc(50% - ${panelWidth / 2}px)` : '50%',
              transform: 'translateX(-50%)',
            }}
          >

            <div className="relative">
              <button
                onClick={() => {
                  if (panelStatus === 'processing') return;
                  setShowEntryPopover(showEntryPopover === 'floating' ? null : 'floating');
                }}
                disabled={panelStatus === 'processing'}
                title={panelStatus === 'processing' ? 'Esperá a que termine de procesar el archivo actual' : undefined}
                className="flex flex-col items-center gap-0.5 px-2 py-1 rounded text-gray-700 hover:bg-gray-100 hover:text-[#0056b3] transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-700"
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
                disabled={!ifcArrayBuffer && !fragmentsArrayBuffer}
                className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded transition-colors duration-200 ${
                  searchOpen
                    ? 'bg-[#0056b3] text-white'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-[#0056b3]'
                } ${!ifcArrayBuffer && !fragmentsArrayBuffer ? 'opacity-40 cursor-not-allowed' : ''}`}
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
          readOnly={!canConfigure}
          canManageLocks={metradosAccess?.is_owner || metradosAccess?.is_admin || false}
          onClose={() => setShowConfigModal(false)}
          onSaved={() => {
            setShowConfigModal(false);
            setPartidasRefreshKey(prev => prev + 1);
          }}
        />
      )}

      {/* Vista previa del Excel recién generado — el archivo ya quedó
          guardado en Archivos del proyecto apenas se generó (el backend
          no tiene un modo "generar sin guardar"), así que la X y el click
          afuera se comportan igual que "Cancelar": si no elegiste
          explícitamente Guardar, se borra el archivo recién creado en vez
          de dejarlo huérfano guardado sin que el usuario lo haya pedido. */}
      {excelPreview && createPortal(
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10300] p-6"
          onClick={handleCancelExcelPreview}
        >
          <div
            className="bg-white rounded-lg w-full max-w-2xl max-h-[85vh] shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3 flex-shrink-0">
              <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                <FileSpreadsheet size={18} className="text-emerald-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800 truncate">{excelPreview.fileName}</p>
                <p className="text-xs text-slate-400 mt-0.5">Vista previa · hoja "Resumido"</p>
              </div>
              <button
                onClick={handleCancelExcelPreview}
                disabled={cancelingExcelPreview}
                aria-label="Cancelar (descarta el Excel generado)"
                title="Cancelar"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors flex-shrink-0 disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-auto">
              {excelPreview.tree.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center py-16 px-4">
                  <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center mb-2">
                    <FileSpreadsheet size={16} className="text-gray-300" />
                  </div>
                  <p className="text-sm text-slate-400">No hay partidas para mostrar.</p>
                </div>
              ) : (
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr className="divide-x divide-white/15 shadow-sm">
                      <th className="text-left font-semibold text-white bg-[#C00000] px-3 py-2.5 rounded-tl-lg">ITEM</th>
                      <th className="text-left font-semibold text-white bg-[#C00000] px-3 py-2.5">DESCRIPCIÓN</th>
                      <th className="text-left font-semibold text-white bg-[#C00000] px-3 py-2.5 w-16">UND</th>
                      <th className="text-right font-semibold text-white bg-[#C00000] px-3 py-2.5 w-24 rounded-tr-lg">TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flattenPartidaTree(excelPreview.tree).map(({ node, depth }, i) => (
                      <tr
                        key={node.partida_id}
                        className={`border-b border-slate-100 last:border-0 transition-colors hover:bg-blue-50/40 ${
                          i % 2 === 1 ? 'bg-slate-50/60' : 'bg-white'
                        }`}
                      >
                        <td className="px-3 py-1.5 text-slate-500 font-mono whitespace-nowrap">{node.code}</td>
                        <td
                          className={`px-3 py-1.5 text-slate-700 ${depth === 0 ? 'font-semibold' : ''}`}
                          style={{ paddingLeft: `${12 + depth * 16}px` }}
                        >
                          {node.description}
                        </td>
                        <td className="px-3 py-1.5 text-slate-400">{node.unit ?? '—'}</td>
                        <td className="px-3 py-1.5 text-slate-700 text-right font-medium tabular-nums">
                          {formatTotal(node.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-end gap-2 flex-shrink-0 bg-slate-50">
              <button
                onClick={() => handleDownloadFile(excelPreview.fileId, excelPreview.fileName)}
                disabled={cancelingExcelPreview}
                className="whitespace-nowrap flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-slate-600 hover:bg-[#0056b3] hover:text-white hover:border-[#0056b3] transition-colors disabled:opacity-50"
              >
                <FileDown size={14} />
                Descargar
              </button>
              <button
                onClick={handleSaveExcelPreview}
                disabled={cancelingExcelPreview}
                className="whitespace-nowrap flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-slate-600 hover:bg-[#0056b3] hover:text-white hover:border-[#0056b3] transition-colors disabled:opacity-50"
              >
                <CheckCircle2 size={14} />
                Guardar en el proyecto
              </button>
            </div>
          </div>
        </div>,
        document.body
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
                {isReprocessFlow ? (
                  <RotateCcw size={18} className="text-[#0056b3]" />
                ) : (
                  <FileStack size={18} className="text-[#0056b3]" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800">
                  {isReprocessFlow ? 'Reprocesar archivo' : '¿Qué es este archivo?'}
                </p>
                <p className="text-xs text-slate-500 truncate">{fileAwaitingContext.name}</p>
              </div>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {isReprocessFlow && (
                <p className="text-xs text-slate-500">
                  Se va a volver a generar todo — metrados, partidas y
                  elementos — con la clasificación que elijas abajo.
                </p>
              )}

              {/* Paso 1: Documento nuevo vs versión — no aplica al
                  reprocesar un archivo que ya existe. */}
              {!isReprocessFlow && (
              <>
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
                  <span className="text-sm font-semibold text-slate-800">Archivo nuevo</span>
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
                  <span className="text-sm font-semibold text-slate-800">Nueva versión de un archivo existente</span>
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
              </>
              )}

              {/* Fase 4 — Paso 2: Override de clasificación — mismos
                  textos de ayuda que ya tiene ClassificationConfigModal.tsx
                  (punto 5 de pendientes-sin-definir-frontend.md), copiados
                  tal cual: es la misma configuración vista desde acá. */}
              <div className={isReprocessFlow ? 'space-y-4' : 'border-t border-gray-200 pt-4 space-y-4'}>
                <div>
                  <p className="text-sm font-semibold text-slate-800">Clasificación (opcional)</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Define cómo el sistema identifica a qué partida pertenece cada elemento al subir un IFC.
                  </p>
                </div>

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
                    <span className="text-sm text-slate-700 flex items-center gap-1.5 flex-wrap">
                      Usar la del proyecto ({projectConfig?.mode === 'manual' ? 'Manual' : 'Norma técnica'})
                      {projectConfig?.mode === 'manual' && (
                        <button
                          type="button"
                          onClick={() => setShowProjectManualDetail((v) => !v)}
                          className="text-[11px] text-[#0056b3] hover:underline font-medium"
                        >
                          {showProjectManualDetail ? 'ocultar' : 'ver qué usa'}
                        </button>
                      )}
                    </span>
                  </div>
                  {/* Antes esta opción no existía — si el proyecto por
                      defecto era Manual, no había forma de procesar UN
                      archivo puntual con la norma técnica del sistema
                      (bug real, encontrado con uso). Solo se muestra
                      cuando de verdad agrega algo — si el proyecto ya
                      es Norma técnica, "Usar la del proyecto" de arriba
                      ya cubre este caso. */}
                  {projectConfig?.mode === 'manual' && (
                    <div className="flex items-center gap-2.5">
                      <input
                        type="radio"
                        checked={overrideMode === 'norma'}
                        onChange={() => setOverrideMode('norma')}
                        disabled={projectConfig?.mode_locked}
                        className="text-[#0056b3] focus:ring-[#0056b3] disabled:opacity-50"
                      />
                      <span className="text-sm text-slate-700">Norma técnica, solo para esta subida</span>
                    </div>
                  )}
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

                  {/* "Ver qué usa" — antes, para saber qué propiedades
                      busca "la del proyecto" en modo Manual, había que
                      cerrar este modal e ir a Configuración de
                      clasificación aparte. Colapsado por defecto para
                      no agrandar el formulario en el caso común (mode
                      'norma', esto ni siquiera se renderiza). */}
                  {projectConfig?.mode === 'manual' && showProjectManualDetail && (
                    <div className="mt-2 ml-6 space-y-0.5 text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded px-2.5 py-1.5">
                      {projectConfig.fields[0] ? (
                        <>
                          <p>
                            <span className="text-slate-400">Código:</span>{' '}
                            {[projectConfig.fields[0].code_property_set, projectConfig.fields[0].code_property_name].filter(Boolean).join(' — ')}
                          </p>
                          {projectConfig.fields[0].description_property_name && (
                            <p>
                              <span className="text-slate-400">Descripción:</span>{' '}
                              {[projectConfig.fields[0].description_property_set, projectConfig.fields[0].description_property_name].filter(Boolean).join(' — ')}
                            </p>
                          )}
                          {projectConfig.fields[0].unit_property_name && (
                            <p>
                              <span className="text-slate-400">Unidad:</span>{' '}
                              {[projectConfig.fields[0].unit_property_set, projectConfig.fields[0].unit_property_name].filter(Boolean).join(' — ')}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="italic">Sin propiedades configuradas todavía.</p>
                      )}
                    </div>
                  )}

                  {projectConfig?.mode_locked && (
                    <p className="mt-2 text-xs text-slate-400 flex items-center gap-1.5">
                      <Lock size={11} className="flex-shrink-0" />
                      Bloqueado por el dueño o los administradores del proyecto.
                    </p>
                  )}

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

                      {/* "Probar" (dry-run) — corre el mapeo contra ESTE
                          mismo archivo que se está por subir, sin
                          guardarlo ni comprometerse a procesarlo. */}
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={handleDryRun}
                          disabled={dryRunRunning || !overrideManualFields.code_property_name || !fileAwaitingContext}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                            dryRunRunning || !overrideManualFields.code_property_name || !fileAwaitingContext
                              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                              : 'bg-white text-[#0056b3] border border-[#0056b3]/40 hover:bg-blue-50'
                          }`}
                        >
                          {dryRunRunning ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <FlaskConical size={13} />
                          )}
                          {dryRunRunning ? 'Probando...' : 'Probar'}
                        </button>

                        {dryRunError && (
                          <p className="mt-2 text-xs text-red-600">{dryRunError}</p>
                        )}

                        {dryRunResult && (
                          <div className="mt-2.5 bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                            <p className="text-xs text-slate-700">
                              <span className="font-semibold text-slate-800">
                                {dryRunResult.elementos_con_codigo}
                              </span>{' '}
                              de <span className="font-semibold text-slate-800">{dryRunResult.elementos_totales}</span>{' '}
                              elementos encontraron código con esta configuración
                              {dryRunResult.elementos_sin_codigo > 0 && (
                                <span className="text-amber-600">
                                  {' '}
                                  ({dryRunResult.elementos_sin_codigo} sin código)
                                </span>
                              )}
                              .
                            </p>
                            {dryRunResult.ejemplos.length > 0 && (
                              <div className="space-y-1">
                                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                                  Ejemplos
                                </p>
                                <ul className="text-[11px] text-slate-600 space-y-0.5">
                                  {dryRunResult.ejemplos.slice(0, 5).map((ej, i) => (
                                    <li key={i} className="truncate">
                                      <span className="font-mono text-slate-700">{ej.codigo}</span>
                                      {ej.descripcion ? ` — ${ej.descripcion}` : ''}
                                      {ej.unidad ? ` (${ej.unidad})` : ''}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
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

                  {projectConfig?.property_prefix_locked && (
                    <p className="mt-2 text-xs text-slate-400 flex items-center gap-1.5">
                      <Lock size={11} className="flex-shrink-0" />
                      Bloqueado por el dueño o los administradores del proyecto.
                    </p>
                  )}

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
                <p className="text-xs text-slate-500 -mt-2">
                  Sirve para diferenciar las propiedades que alguien completó a mano en el IFC de las
                  que Revit genera automáticamente. Se aplica sin importar qué opción elegiste arriba.
                </p>
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
                onClick={isReprocessFlow ? handleConfirmReprocess : handleConfirmDocumentContext}
                disabled={(!isReprocessFlow && !isDocumentContextReady) || (overrideMode === 'manual' && !overrideManualFields.code_property_name)}
                className={`px-5 py-1.5 rounded text-sm font-semibold transition-colors ${
                  (isReprocessFlow || isDocumentContextReady) && !(overrideMode === 'manual' && !overrideManualFields.code_property_name)
                    ? 'bg-[#0056b3] text-white hover:bg-[#004494]'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                {isReprocessFlow ? 'Reprocesar' : 'Continuar'}
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