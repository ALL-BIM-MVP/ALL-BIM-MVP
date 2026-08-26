// components/tabs/InicioTab.tsx
import React, { useRef, useState, useEffect } from 'react';
import {
  MapPin, Calendar, Pencil, CheckCircle, ClipboardList,
  Building2, FileSpreadsheet, BarChart3, Camera,
  FileText, FileImage, File as FileIcon,
  Handshake, HardHat, ShieldCheck, ChevronDown, ChevronUp, Settings,
} from 'lucide-react';
import { Project } from '../../types/project.types';
import { MODULOS } from '../../constants/modulos';
import { formatDate } from '../../utils/dateUtils';
import { resolveMediaUrl } from '../../utils/media';
import { projectService } from '../../services/project.service';
import { getMyModuleAccess } from '../../services/module.service';
import type { ModuleAccess } from '../../services/module.service';
import ElementoConjuntoConfigModal from './ElementoConjuntoConfigModal';

interface EditForm {
  name: string;
  location: string;
  start_date: string;
  end_date: string;
  description: string;
  client: string;
  contractor: string;
}

interface ElementoConjuntoResultado {
  elemento_conjunto: string;
 
  repetidos: number | null;
  faltantes?: string[];
}

interface EstadoElementosData {
  campos_clave: string[];
  resultados: ElementoConjuntoResultado[];
}

interface InicioTabProps {
  project: Project;
  canActuallyEdit: boolean;
  isEditingInfo: boolean;
  savingInfo: boolean;
  editForm: EditForm;
  confirmedModuloId: string | null;
  onStartEditing: () => void;
  onCancelEditing: () => void;
  onEditChange: (field: keyof EditForm, value: string) => void;
  onSaveEditing: () => void;
  onChangeModulo: () => void;

  onToggleSpecialty?: (specialtyCode: string) => void;
  // Resultado de GET /projects/:id/metrados/estado-elementos.
  // null/undefined mientras carga o si el proyecto no tiene metrados aún.
  estadoElementos?: EstadoElementosData | null;

  onConfigSaved?: () => void;
}

const FILE_TYPE_META: Record<string, { label: string; icon: React.ComponentType<any> }> = {
  ifc: { label: 'Modelos IFC', icon: Building2 },
  excel: { label: 'Archivos Excel', icon: FileSpreadsheet },
  pdf: { label: 'Documentos PDF', icon: FileText },
  txt: { label: 'Archivos de texto', icon: FileText },
  image: { label: 'Imágenes', icon: FileImage },
  other: { label: 'Otros archivos', icon: FileIcon },
};
function fileTypeMeta(fileType: string) {
  return FILE_TYPE_META[fileType] ?? { label: fileType, icon: FileIcon };
}

// Catálogo completo de especialidades del proyecto. Las que estén presentes
// en project.specialties_summary se muestran activas (azul); el resto en
// gris. Ajustar esta lista si el catálogo real vive en el backend.
const ESPECIALIDADES_CATALOGO = [
  { code: 'arquitectura', name: 'Arquitectura' },
  { code: 'estructuras', name: 'Estructuras' },
  { code: 'mecanicas', name: 'Mecánicas' },
  { code: 'sanitarias', name: 'Sanitarias' },
  { code: 'comunicaciones', name: 'Comunicaciones' },
  { code: 'electricas', name: 'Eléctricas' },
  { code: 'equipamiento', name: 'Equipamiento' },
  { code: 'federado', name: 'Federado' },
];

const SectionLabel: React.FC<{ icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }> = ({
  icon, children, action,
}) => (
  <div className="flex items-center justify-between mb-3">
    <p className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
      {icon}
      {children}
    </p>
    {action}
  </div>
);

// Deriva los conteos y filas de la tabla de "elemento conjunto" a partir
// de la respuesta cruda del endpoint. Todo lo que se calcula acá sale de
// campos que sí existen hoy en la API (elemento_conjunto, faltantes,
// campos_clave). Lo que todavía no está confirmado (variación vs. semana
// anterior, coherencia con valorización) se deja fuera a propósito.
function useVerificacionElementos(data: EstadoElementosData | null | undefined) {
  return React.useMemo(() => {
    if (!data) return null;

    // "repetidos" ya viene calculado por el backend por fila — acá solo
    // contamos cuántas filas tienen más de una repetición.
    const repetidos = data.resultados.filter((r) => (r.repetidos ?? 0) > 1).length;

    const observacion = data.resultados.filter((r) => (r.faltantes?.length ?? 0) > 0).length;

    return {
      campos_clave: data.campos_clave,
      filas: data.resultados,
      repetidos,
      observacion,
    };
  }, [data]);
}

const InicioTab: React.FC<InicioTabProps> = ({
  project,
  canActuallyEdit,
  isEditingInfo,
  savingInfo,
  editForm,
  confirmedModuloId,
  onStartEditing,
  onCancelEditing,
  onEditChange,
  onSaveEditing,
  onChangeModulo,
  onToggleSpecialty,
  estadoElementos,
  onConfigSaved,
}) => {
  const projectProgress = (() => {
    if (!project.start_date || !project.end_date) return null;
    const start = new Date(project.start_date).getTime();
    const end = new Date(project.end_date).getTime();
    if (isNaN(start) || isNaN(end) || end <= start) return null;
    const now = Date.now();
    return Math.round(Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100)));
  })();

  const indicadoresPct = 74; // PLACEHOLDER

  // La tabla de "elemento conjunto" puede tener cientos de filas —
  // se muestran las primeras 3 siempre, y el resto se despliega hacia
  // abajo cuando el usuario lo pide.
  const FILAS_VISIBLES_COLAPSADO = 3;
  const [verificacionExpandida, setVerificacionExpandida] = useState(false);

  // Auto-scroll: cuando el mouse se acerca al borde superior o inferior
  // del contenedor de la tabla (dentro de la franja "EDGE_ZONE_PX"), la
  // tabla se desplaza sola en esa dirección — sin necesidad de agarrar
  // la barra de scroll manualmente.
  const verificacionScrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRafRef = useRef<number | null>(null);
  const EDGE_ZONE_PX = 32;
  const MAX_SCROLL_SPEED = 6;

  const stopAutoScroll = () => {
    if (autoScrollRafRef.current !== null) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
  };

  const handleVerificacionMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const container = verificacionScrollRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;

    let speed = 0;
    if (offsetY < EDGE_ZONE_PX) {
      // Cerca del borde superior: scroll hacia arriba, más rápido cuanto
      // más pegado esté el mouse al borde.
      speed = -MAX_SCROLL_SPEED * (1 - offsetY / EDGE_ZONE_PX);
    } else if (offsetY > rect.height - EDGE_ZONE_PX) {
      // Cerca del borde inferior: scroll hacia abajo.
      const dist = rect.height - offsetY;
      speed = MAX_SCROLL_SPEED * (1 - dist / EDGE_ZONE_PX);
    }

    stopAutoScroll();
    if (speed !== 0) {
      const step = () => {
        if (!verificacionScrollRef.current) return;
        verificacionScrollRef.current.scrollTop += speed;
        autoScrollRafRef.current = requestAnimationFrame(step);
      };
      autoScrollRafRef.current = requestAnimationFrame(step);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [localCoverImage, setLocalCoverImage] = useState(project.cover_image);

  useEffect(() => {
    setLocalCoverImage(project.cover_image);
    setCoverError(null);
  }, [project.project_id, project.cover_image]);

  const handlePickCover = () => {
    if (uploadingCover || !canActuallyEdit) return;
    fileInputRef.current?.click();
  };

  const handleCoverSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploadingCover(true);
    setCoverError(null);
    try {
      const newCoverImage = await projectService.setCoverImage(project.project_id, file);
      setLocalCoverImage(newCoverImage);
    } catch (err: any) {
      setCoverError(err.message || 'No se pudo actualizar la portada.');
    } finally {
      setUploadingCover(false);
    }
  };

  const activeSpecialtyCodes = new Set(
    (project.specialties_summary ?? []).map((esp) => esp.specialty_code)
  );
  // code -> cantidad de elementos de esa especialidad, para el numerito
  // en la esquina de cada chip activo.
  const specialtyCounts = new Map(
    (project.specialties_summary ?? []).map((esp) => [esp.specialty_code, esp.count])
  );

  const verificacion = useVerificacionElementos(estadoElementos);

  // Config de qué campos componen la clave de "elemento conjunto" —
  // requiere permiso 'configure' del módulo Metrados (mismo criterio
  // que ClassificationConfigModal en Visor3DTab). Se pide solo, acá,
  // sin depender de nada que ya haya cargado el padre.
  const [metradosAccess, setMetradosAccess] = useState<ModuleAccess | null>(null);
  useEffect(() => {
    let cancelled = false;
    getMyModuleAccess(project.project_id, 'metrados')
      .then((access) => { if (!cancelled) setMetradosAccess(access); })
      .catch(() => { if (!cancelled) setMetradosAccess(null); });
    return () => { cancelled = true; };
  }, [project.project_id]);
  const canConfigureClave = metradosAccess?.permissions.configure ?? false;
  const [showConjuntoConfigModal, setShowConjuntoConfigModal] = useState(false);

  return (
    <div className="flex items-start justify-center min-h-[600px] relative py-2">
      <div className="w-full max-w-5xl">
        <div className="bg-white rounded-md border border-gray-200 shadow-sm overflow-hidden">

          {/* ---------- CABECERA: eyebrow + insignia + barra de acento (igual patrón que Archivos/Colaboradores) ---------- */}
          <div className="p-6 pb-0 flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3.5 border-l-[3px] border-[#0056b3] pl-4 min-w-0">
              <div className="w-10 h-10 rounded-md bg-[#0056b3] flex items-center justify-center flex-shrink-0 mt-0.5">
                <Building2 size={18} className="text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-[#0056b3] uppercase tracking-wider mb-0.5">
                  Resumen del proyecto
                </p>
                {isEditingInfo ? (
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => onEditChange('name', e.target.value)}
                    className="text-xl font-bold text-gray-800 border border-gray-300 rounded-md px-2 py-1 outline-none focus:ring-2 focus:ring-[#0056b3]"
                  />
                ) : (
                  <h2 className="text-xl font-bold text-gray-800 leading-tight truncate">{project.name}</h2>
                )}

              </div>
            </div>

            {canActuallyEdit && (
              <div className="flex items-center gap-2 flex-shrink-0">
                {isEditingInfo && (
                  <button
                    onClick={onSaveEditing}
                    disabled={savingInfo}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-[#0056b3] rounded-md hover:bg-[#004494] transition-colors disabled:opacity-50"
                  >
                    {savingInfo ? 'Guardando...' : 'Guardar cambios'}
                  </button>
                )}
                <button
                  onClick={isEditingInfo ? onCancelEditing : onStartEditing}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-500 border border-gray-200 rounded-md hover:border-gray-300 hover:text-gray-700 transition-colors"
                >
                  <Pencil size={14} />
                  {isEditingInfo ? 'Cancelar' : 'Editar'}
                </button>
              </div>
            )}
          </div>

          <div className="p-6 grid grid-cols-1 md:grid-cols-[1.5fr_1fr] gap-6">

            {/* Columna izquierda: imagen + datos + descripción */}
            <div>
              <div
                onClick={handlePickCover}
                className={`relative group rounded-md overflow-hidden border border-gray-200 bg-slate-900 w-120 h-60 ${
                  canActuallyEdit ? 'cursor-pointer' : ''
                }`}
              >
                <img
                  src={resolveMediaUrl(localCoverImage.url)}
                  alt={project.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                {canActuallyEdit && (
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 text-white text-xs font-semibold px-2.5 py-1.5 bg-black/50 rounded-md">
                      <Camera size={14} />
                      {uploadingCover ? 'Subiendo...' : 'Cambiar imagen'}
                    </span>
                  </div>
                )}
                {uploadingCover && (
                  <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                    <span className="text-xs font-semibold text-gray-600">Subiendo...</span>
                  </div>
                )}
              </div>
              {canActuallyEdit && (
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleCoverSelected}
                  className="hidden"
                />
              )}
              {coverError && (
                <p className="text-[11px] text-red-600 mt-1">{coverError}</p>
              )}
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-2">
                {project.name}
              </p>

              {/* Indicadores */}
              <div className="mt-5">
                <SectionLabel icon={<BarChart3 size={14} className="text-gray-400" />}>
                  Indicadores
                </SectionLabel>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#0056b3] rounded-full transition-all duration-500"
                      style={{ width: `${indicadoresPct}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-[#0056b3] w-9 text-right">{indicadoresPct}%</span>
                </div>
              </div>

              {/* Datos: mismo layout siempre, cada valor se vuelve input en su propio lugar al editar */}
              <div className="mt-5">
                <SectionLabel icon={null}>Datos</SectionLabel>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <MapPin size={15} className="text-[#0056b3] flex-shrink-0" />
                    {isEditingInfo ? (
                      <input
                        type="text"
                        value={editForm.location}
                        onChange={(e) => onEditChange('location', e.target.value)}
                        placeholder="Ubicación"
                        className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-[#0056b3] outline-none"
                      />
                    ) : (
                      <span>{project.location || '—'}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Handshake size={15} className="text-[#0056b3] flex-shrink-0" />
                    <span className="flex-shrink-0">Cliente:</span>
                    {isEditingInfo ? (
                      <input
                        type="text"
                        value={editForm.client}
                        onChange={(e) => onEditChange('client', e.target.value)}
                        placeholder="Cliente"
                        className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-[#0056b3] outline-none"
                      />
                    ) : (
                      <span className="text-gray-500">{project.client || '—'}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <HardHat size={15} className="text-[#0056b3] flex-shrink-0" />
                    <span className="flex-shrink-0">Contratista:</span>
                    {isEditingInfo ? (
                      <input
                        type="text"
                        value={editForm.contractor}
                        onChange={(e) => onEditChange('contractor', e.target.value)}
                        placeholder="Contratista"
                        className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-[#0056b3] outline-none"
                      />
                    ) : (
                      <span className="text-gray-500">{project.contractor || '—'}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <ClipboardList size={14} />
                  Descripción
                </p>
                {isEditingInfo ? (
                  <textarea
                    value={editForm.description}
                    onChange={(e) => onEditChange('description', e.target.value)}
                    rows={3}
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-[#0056b3] outline-none resize-none"
                  />
                ) : (
                  <p className="text-sm text-gray-600 leading-relaxed">
                    {project.description}
                  </p>
                )}
              </div>
            </div>

            {/* Columna derecha: Inicio / Fin / Progreso — mismo lugar, editable en el mismo lugar */}
            <div className="flex flex-col gap-3">
              <div className="border border-gray-200 rounded-md p-3.5 flex items-center gap-3">
                <Calendar size={16} className="text-[#0056b3] flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Inicio</p>
                  {isEditingInfo ? (
                    <input
                      type="date"
                      value={editForm.start_date}
                      onChange={(e) => onEditChange('start_date', e.target.value)}
                      className="w-full mt-0.5 px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-[#0056b3] outline-none"
                    />
                  ) : (
                    <p className="text-sm font-bold text-gray-800">{formatDate(project.start_date)}</p>
                  )}
                </div>
              </div>
              <div className="border border-gray-200 rounded-md p-3.5 flex items-center gap-3">
                <Calendar size={16} className="text-[#0056b3] flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Fin</p>
                  {isEditingInfo ? (
                    <input
                      type="date"
                      value={editForm.end_date}
                      onChange={(e) => onEditChange('end_date', e.target.value)}
                      className="w-full mt-0.5 px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-[#0056b3] outline-none"
                    />
                  ) : (
                    <p className="text-sm font-bold text-gray-800">{formatDate(project.end_date)}</p>
                  )}
                </div>
              </div>
              <div className="border border-gray-200 rounded-md p-3.5">
                <div className="flex items-center gap-3 mb-2">
                  <CheckCircle size={16} className="text-[#0056b3] flex-shrink-0" />
                  <div>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Progreso</p>
                    <p className="text-sm font-bold text-gray-800">
                      {projectProgress !== null ? `${projectProgress}%` : '—'}
                    </p>
                  </div>
                </div>
                {projectProgress !== null && (
                  <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#0056b3] rounded-full transition-all duration-500"
                      style={{ width: `${projectProgress}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ---------- Resumen ---------- */}
          <div className="mx-6 border border-gray-200 rounded-md p-5">
            <SectionLabel icon={null}>Resumen</SectionLabel>
            <div className="space-y-3">
              {!project.files_summary || project.files_summary.length === 0 ? (
                <p className="text-sm text-gray-400">Todavía no hay archivos en este proyecto.</p>
              ) : (
                project.files_summary.map(({ file_type, count }) => {
                  const { label, icon: Icon } = fileTypeMeta(file_type);
                  return (
                    <div key={file_type} className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 text-sm text-gray-700 font-medium">
                        <Icon size={16} className="text-gray-400" />
                        {label}
                      </div>
                      <span className="text-xs text-gray-500 font-semibold bg-gray-100 px-2.5 py-1 rounded-md">
                        {count} archivo{count !== 1 ? 's' : ''}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* ---------- Verificación de elemento conjunto ----------
              Fuente: GET /projects/:id/metrados/estado-elementos.
              Solo se pinta lo que el endpoint confirma hoy:
                - campos_clave (etiquetas dinámicas de la clave)
                - elemento_conjunto por fila
                - recuento por elemento_conjunto repetido (calculado acá)
                - observación = faltantes.length > 0 (calculado acá)
              "Coherencia de datos...", "Verificación de variación con
              semana anterior" y los contadores de Variaciones/Nuevos
              Elemento NO tienen endpoint confirmado todavía — quedan
              como placeholder "—" hasta que se defina esa fuente.

              Líneas verticales entre columnas: SE MANTIENEN (border-r).
              Contorno exterior: gris más grueso (border border-gray-300)
              para que la caja se note más, sin tocar las líneas internas. */}
          {verificacion && (
            <div className="mx-6 mt-4 border border-gray-300 rounded-lg overflow-hidden text-[10px] shadow-sm">
              <div className="p-2 flex items-center justify-between gap-2 flex-wrap">
                <SectionLabel icon={<ShieldCheck size={12} className="text-gray-400" />}>
                  Verificación de elementos
                </SectionLabel>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowConjuntoConfigModal(true)}
                    title={canConfigureClave ? 'Configurar qué campos forman la clave' : 'Ver cómo está armada la clave (solo lectura)'}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-semibold text-gray-500 border border-gray-200 hover:text-[#0056b3] hover:border-[#0056b3]/40 hover:bg-blue-50 transition-colors"
                  >
                    <Settings size={12} />
                    Configuración
                  </button>
                  <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-semibold text-[#0056b3] bg-blue-50 border border-blue-100 rounded">
                    Verificación
                  </span>
                </div>
              </div>

              {/* Contadores — tabla con el MISMO colgroup que la tabla de abajo,
                  para que las líneas verticales coincidan exactamente y
                  quede unida sin espacio (misma grilla continua). Contorno
                  exterior grueso (border-2 gray-300); líneas internas
                  (border-r) se mantienen finas en gray-200. */}
              <table className="w-full table-fixed text-[10px] border border-gray-300 mx-2 mb-2 rounded-lg border-separate border-spacing-0 overflow-hidden" style={{ width: 'calc(100% - 1rem)' }}>
                <colgroup>
                  <col className="w-[32%]" />
                  <col className="w-[13%]" />
                  <col className="w-[18%]" />
                  <col className="w-[18%]" />
                  <col className="w-[19%]" />
                </colgroup>
                <tbody>
                  <tr>
                    <td className="border-r border-gray-200" />
                    <td className="p-0 border-r border-gray-200 align-top">
                      <div className="bg-gray-100 text-gray-800 text-[9px] font-bold px-1.5 py-1 text-center">
                        Recuento de Repetidos
                      </div>
                      <div className="text-center text-[11px] font-bold text-gray-800 py-0.5 bg-white">
                        {verificacion.repetidos}
                      </div>
                    </td>
                    <td className="p-0 border-r border-gray-200 align-top">
                      <div className="bg-gray-100 text-gray-800 text-[9px] font-bold px-1.5 py-1 text-center">
                        Recuento de observación
                      </div>
                      <div className="text-center text-[11px] font-bold text-gray-800 py-0.5 bg-white">
                        {verificacion.observacion}
                      </div>
                    </td>
                    <td className="p-0 border-r border-gray-200 align-top">
                      <div className="bg-gray-100 text-gray-800 text-[9px] font-bold px-1.5 py-1 text-center">
                        Recuento de Variaciones
                      </div>
                      <div className="text-center text-[11px] font-bold text-gray-400 py-0.5 bg-white">
                        —
                      </div>
                    </td>
                    <td className="p-0 align-top">
                      <div className="bg-gray-100 text-gray-800 text-[9px] font-bold px-1.5 py-1 text-center">
                        Recuento de Nuevos Elemento
                      </div>
                      <div className="text-center text-[11px] font-bold text-gray-400 py-0.5 bg-white">
                        —
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>

          
              <div
                ref={verificacionScrollRef}
                onMouseMove={handleVerificacionMouseMove}
                onMouseLeave={stopAutoScroll}
                className="overflow-x-auto overflow-y-auto max-h-[320px] mx-2 mb-2 border border-gray-300 rounded-lg"
              >
                <table className="w-full table-fixed text-[10px]">
                  <colgroup>
                    <col className="w-[32%]" />
                    <col className="w-[13%]" />
                    <col className="w-[18%]" />
                    <col className="w-[18%]" />
                    <col className="w-[19%]" />
                  </colgroup>
                  <thead>
                    <tr className="bg-gray-100 text-gray-800 sticky top-0 z-10">
                      <th className="px-1.5 py-1 text-left font-semibold break-words border-r border-gray-200">
                        {verificacion.campos_clave.join('_')}
                      </th>
                      <th className="px-1.5 py-1 text-center font-semibold break-words border-r border-gray-200">
                        Recuento de {verificacion.campos_clave.join('_')}
                      </th>
                      <th className="px-1.5 py-1 text-center font-semibold break-words border-r border-gray-200">
                        Coherencia de datos en parametros de seguimiento de obra y valorización
                      </th>
                      <th className="px-1.5 py-1 text-center font-semibold break-words border-r border-gray-200">
                        Verificación de variación con semana anterior
                      </th>
                      <th className="px-1.5 py-1 text-left font-semibold break-words">
                        Comentario / Sustento
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(verificacionExpandida
                      ? verificacion.filas
                      : verificacion.filas.slice(0, FILAS_VISIBLES_COLAPSADO)
                    ).map((fila, idx) => (
                      <tr
                        key={`${fila.elemento_conjunto}-${idx}`}
                        className="border-t border-gray-200 bg-white hover:bg-blue-50/40 transition-colors"
                      >
                        <td className="px-1.5 py-1 text-gray-700 break-words border-r border-gray-200">
                          {fila.elemento_conjunto}
                          {!!fila.faltantes?.length && (
                            <span className="ml-1 inline-flex items-center px-1 py-0.5 rounded text-[8px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                              Falta: {fila.faltantes.join(', ')}
                            </span>
                          )}
                        </td>
                        <td className="px-1.5 py-1 text-center text-gray-700 border-r border-gray-200">
                          {fila.repetidos ?? 1}
                        </td>
                        <td className="px-1.5 py-1 text-center text-gray-400 border-r border-gray-200">N/A</td>
                        <td className="px-1.5 py-1 text-center text-gray-400 border-r border-gray-200">—</td>
                        <td className="px-1.5 py-1 text-gray-400">—</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* "Ver más" — solo aparece si hay más de 3 filas */}
              {verificacion.filas.length > FILAS_VISIBLES_COLAPSADO && (
                <button
                  type="button"
                  onClick={() => setVerificacionExpandida((v) => !v)}
                  className="w-full flex items-center justify-center gap-1 py-1.5 text-[10px] font-semibold text-[#0056b3] bg-gray-50 border-t border-gray-200 hover:bg-gray-100 transition-colors"
                >
                  {verificacionExpandida ? (
                    <>Ver menos <ChevronUp size={12} /></>
                  ) : (
                    <>Ver {verificacion.filas.length - FILAS_VISIBLES_COLAPSADO} más <ChevronDown size={12} /></>
                  )}
                </button>
              )}
            </div>
          )}

          {/* ---------- Especialidades (barra inferior completa) ---------- */}
          <div className="mt-4 border-t border-gray-200 px-6 py-4 bg-gray-50">
            <SectionLabel icon={null}>Especialidades</SectionLabel>
            <div className="flex items-center gap-2 flex-wrap">
              {ESPECIALIDADES_CATALOGO.map((esp) => {
                const isActive = activeSpecialtyCodes.has(esp.code);
                const count = specialtyCounts.get(esp.code);
                const isClickable = canActuallyEdit && !!onToggleSpecialty;
                return (
                  <div key={esp.code} className="relative">
                    <button
                      type="button"
                      disabled={!isClickable}
                      onClick={isClickable ? () => onToggleSpecialty(esp.code) : undefined}
                      className={`px-3.5 py-2 rounded-md text-sm font-semibold border transition-colors ${
                        isActive
                          ? 'bg-[#0056b3] text-white border-[#0056b3]'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                      } ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
                    >
                      {esp.name}
                    </button>
                    {isActive && !!count && (
                      <span
                        title={`${count} elemento(s) de ${esp.name}`}
                        className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-white text-[#0056b3] text-[10px] font-bold border border-[#0056b3] flex items-center justify-center leading-none pointer-events-none"
                      >
                        {count}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ---------- Módulo activo (fuera del reporte, sin cambios funcionales) ---------- */}
        <div className="mt-4 bg-white rounded-md border border-gray-200 shadow-sm p-5 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">Estás trabajando en:</span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-sm font-semibold bg-blue-50 text-[#0056b3] border border-blue-100">
              {MODULOS.find(m => m.id === confirmedModuloId)?.label || 'Metrados BIM'}
            </span>
          </div>
          <button
            onClick={onChangeModulo}
            className="text-sm font-semibold text-[#0056b3] hover:underline"
          >
            Cambiar de módulo
          </button>
        </div>
      </div>

      {showConjuntoConfigModal && (
        <ElementoConjuntoConfigModal
          projectId={project.project_id}
          readOnly={!canConfigureClave}
          onClose={() => setShowConjuntoConfigModal(false)}
          onSaved={() => {
            setShowConjuntoConfigModal(false);
            onConfigSaved?.();
          }}
        />
      )}
    </div>
  );
};

export default InicioTab;