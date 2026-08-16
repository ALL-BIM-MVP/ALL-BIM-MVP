// components/tabs/InicioTab.tsx
import React, { useRef, useState, useEffect } from 'react';
import {
  MapPin, CalendarBlank, PencilSimple, CheckCircle, WarningCircle, ClipboardText,
  Buildings, UserCircle, FileXls, CaretDown, Plus, Circle, ChartBar, Camera,
} from '@phosphor-icons/react';
import { Project } from '../../types/project.types';
import { MODULOS } from '../../constants/modulos';
import { formatDate } from '../../utils/dateUtils';
import { resolveMediaUrl } from '../../utils/media';
import { projectService } from '../../services/project.service';

interface EditForm {
  name: string;
  location: string;
  start_date: string;
  end_date: string;
  description: string;
  client: string;
  contractor: string;
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
}

/* ---------------------------------------------------------------------- */
/* PLACEHOLDER — datos de ejemplo. Reemplazar cuando el backend exponga   */
/* indicadores, verificación y estado de archivos.                        */
/* client/contractor ya vienen del backend (project.client /              */
/* project.contractor) — reemplazados abajo, ya no son placeholder.       */
/* ---------------------------------------------------------------------- */
const ESPECIALIDADES = [
  'Arquitectura', 'Estructuras', 'Mecánicas', 'Comunicaciones', 'Eléctricas', 'Equipamiento',
];

// PLACEHOLDER — estos conteos y filas se calculan a partir de las entidades
// del modelo IFC cargado (IfcElement / GUID / propiedades), no de un Excel.
// Reemplazar cuando se conecte el parser real de entidades del IFCViewer.
const VERIFICACION_CONTEOS = [
  { label: 'Recuento de Repetidos', value: 0 },
  { label: 'Recuento de observación', value: 0 },
  { label: 'Recuento de Variaciones', value: 0 },
  { label: 'Recuento de Nuevos Elemento', value: 208 },
];

const VERIFICACION_COLS = [
  'Modelo_GUID_Element ID_Partida',
  'Recuento de GUID_Element ID_Partida',
  'Coherencia de datos en parámetros de seguimiento de obra y valorización',
  'Verificación de variación con semana anterior',
  'Comentario / Sustento',
];

const VERIFICACION_FILAS = [
  {
    guid: 'CUS ET2 ST1 EST BIM ST ZZZ 1003-154Jd7qe11sg5sLqUUxyWA-6271036-C410-0022',
    recuento: 1,
    coherencia: 'N/A',
    variacion: 'Nuevo elemento',
    comentario: '',
  },
  {
    guid: 'CUS ET2 ST1 EST BIM ST ZZZ 1003-154Jd7qe11sg5sLqUUxyWA-6271036-C410-0022',
    recuento: 1,
    coherencia: 'N/A',
    variacion: 'Nuevo elemento',
    comentario: '',
  },
];

const RESUMEN_ARCHIVOS = [
  { label: 'Modelos IFC', icon: Buildings, cargado: true, generado: true, detalle: '3 archivos' },
  { label: 'Archivos Excel', icon: FileXls, cargado: true, generado: false, detalle: '2 archivos' },
];

const StatusPill: React.FC<{ ok: boolean; yes: string; no: string }> = ({ ok, yes, no }) => (
  <span
    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] text-[11px] font-semibold border ${
      ok
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : 'bg-slate-100 text-slate-500 border-slate-200'
    }`}
  >
    <Circle size={6} weight="fill" className={ok ? 'text-emerald-500' : 'text-slate-400'} />
    {ok ? yes : no}
  </span>
);

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

  return (
    <div className="flex items-start justify-center min-h-[600px] relative py-2">
      <div className="w-full max-w-5xl">
        <div className="bg-white rounded-md border border-gray-200 shadow-sm overflow-hidden">

          {/* ---------- CABECERA: eyebrow + insignia + barra de acento (igual patrón que Archivos/Colaboradores) ---------- */}
          <div className="p-6 pb-0 flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3.5 border-l-[3px] border-[#0056b3] pl-4 min-w-0">
              <div className="w-10 h-10 rounded-md bg-[#0056b3] flex items-center justify-center flex-shrink-0 mt-0.5">
                <Buildings size={18} weight="fill" className="text-white" />
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
                    className="text-xl font-bold text-gray-800 border border-gray-300 rounded-[4px] px-2 py-1 outline-none focus:ring-2 focus:ring-[#0056b3]"
                  />
                ) : (
                  <h2 className="text-xl font-bold text-gray-800 leading-tight truncate">{project.name}</h2>
                )}
                <span className={`inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-[4px] text-[11px] font-semibold border ${
                  project.hasIFC
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  {project.hasIFC ? <CheckCircle size={13} weight="fill" /> : <WarningCircle size={13} weight="fill" />}
                  {project.hasIFC ? 'IFC Cargado' : 'Sin IFC'}
                </span>
              </div>
            </div>

            {canActuallyEdit && (
              <div className="flex items-center gap-2 flex-shrink-0">
                {isEditingInfo && (
                  <button
                    onClick={onSaveEditing}
                    disabled={savingInfo}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-[#0056b3] rounded-[4px] hover:bg-[#004494] transition-colors disabled:opacity-50"
                  >
                    {savingInfo ? 'Guardando...' : 'Guardar cambios'}
                  </button>
                )}
                <button
                  onClick={isEditingInfo ? onCancelEditing : onStartEditing}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-500 border border-gray-200 rounded-[4px] hover:border-gray-300 hover:text-gray-700 transition-colors"
                >
                  <PencilSimple size={14} weight="bold" />
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
                className={`relative group rounded-[4px] overflow-hidden border border-gray-200 bg-slate-900 w-120 h-60 ${
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
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 text-white text-xs font-semibold px-2.5 py-1.5 bg-black/50 rounded-[4px]">
                      <Camera size={14} weight="bold" />
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
                <SectionLabel icon={<ChartBar size={14} weight="bold" className="text-gray-400" />}>
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
                    <MapPin size={15} className="text-[#0056b3] flex-shrink-0" weight="duotone" />
                    {isEditingInfo ? (
                      <input
                        type="text"
                        value={editForm.location}
                        onChange={(e) => onEditChange('location', e.target.value)}
                        placeholder="Ubicación"
                        className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded-[4px] focus:ring-2 focus:ring-[#0056b3] outline-none"
                      />
                    ) : (
                      <span>{project.location || '—'}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <UserCircle size={15} className="text-[#0056b3] flex-shrink-0" weight="duotone" />
                    <span className="flex-shrink-0">Cliente:</span>
                    {isEditingInfo ? (
                      <input
                        type="text"
                        value={editForm.client}
                        onChange={(e) => onEditChange('client', e.target.value)}
                        placeholder="Cliente"
                        className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded-[4px] focus:ring-2 focus:ring-[#0056b3] outline-none"
                      />
                    ) : (
                      <span className="text-gray-500">{project.client || '—'}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Buildings size={15} className="text-[#0056b3] flex-shrink-0" weight="duotone" />
                    <span className="flex-shrink-0">Contratista:</span>
                    {isEditingInfo ? (
                      <input
                        type="text"
                        value={editForm.contractor}
                        onChange={(e) => onEditChange('contractor', e.target.value)}
                        placeholder="Contratista"
                        className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded-[4px] focus:ring-2 focus:ring-[#0056b3] outline-none"
                      />
                    ) : (
                      <span className="text-gray-500">{project.contractor || '—'}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <ClipboardText size={14} weight="duotone" />
                  Descripción
                </p>
                {isEditingInfo ? (
                  <textarea
                    value={editForm.description}
                    onChange={(e) => onEditChange('description', e.target.value)}
                    rows={3}
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-[4px] focus:ring-2 focus:ring-[#0056b3] outline-none resize-none"
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
              <div className="border border-gray-200 rounded-[4px] p-3.5 flex items-center gap-3">
                <CalendarBlank size={16} className="text-[#0056b3] flex-shrink-0" weight="duotone" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Inicio</p>
                  {isEditingInfo ? (
                    <input
                      type="date"
                      value={editForm.start_date}
                      onChange={(e) => onEditChange('start_date', e.target.value)}
                      className="w-full mt-0.5 px-2 py-1 text-sm border border-gray-300 rounded-[4px] focus:ring-2 focus:ring-[#0056b3] outline-none"
                    />
                  ) : (
                    <p className="text-sm font-bold text-gray-800">{formatDate(project.start_date)}</p>
                  )}
                </div>
              </div>
              <div className="border border-gray-200 rounded-[4px] p-3.5 flex items-center gap-3">
                <CalendarBlank size={16} className="text-[#0056b3] flex-shrink-0" weight="duotone" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Fin</p>
                  {isEditingInfo ? (
                    <input
                      type="date"
                      value={editForm.end_date}
                      onChange={(e) => onEditChange('end_date', e.target.value)}
                      className="w-full mt-0.5 px-2 py-1 text-sm border border-gray-300 rounded-[4px] focus:ring-2 focus:ring-[#0056b3] outline-none"
                    />
                  ) : (
                    <p className="text-sm font-bold text-gray-800">{formatDate(project.end_date)}</p>
                  )}
                </div>
              </div>
              <div className="border border-gray-200 rounded-[4px] p-3.5">
                <div className="flex items-center gap-3 mb-2">
                  <CheckCircle size={16} className="text-[#0056b3] flex-shrink-0" weight="duotone" />
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
          <div className="mx-6 border border-gray-200 rounded-[4px] p-5">
            <SectionLabel icon={null}>Resumen</SectionLabel>
            <div className="space-y-3">
              {RESUMEN_ARCHIVOS.map(({ label, icon: Icon, cargado, generado, detalle }) => (
                <div key={label} className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 text-sm text-gray-700 font-medium">
                    <Icon size={16} className="text-gray-400" weight="duotone" />
                    {label}
                    <span className="text-xs text-gray-400 font-normal">{detalle}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <StatusPill ok={cargado} yes="Cargado" no="No cargado" />
                    <StatusPill ok={generado} yes="Generado" no="No generado" />
                  </div>
                </div>
              ))}
            </div>
          </div>


          {/* ---------- Especialidades / Federado (barra inferior completa) ---------- */}
          <div className="mt-4 border-t border-gray-200 px-6 py-4 bg-gray-50 flex items-center gap-2 flex-wrap">
            {ESPECIALIDADES.map((esp, i) => (
              <button
                key={esp}
                className={`px-3.5 py-2 rounded-[4px] text-sm font-semibold border transition-colors ${
                  i === 0
                    ? 'bg-[#0056b3] text-white border-[#0056b3]'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                {esp}
              </button>
            ))}
            <button className="px-3.5 py-2 rounded-[4px] text-sm font-semibold border border-dashed border-gray-300 text-gray-400 hover:text-[#0056b3] hover:border-[#0056b3] transition-colors flex items-center gap-1.5">
              <Plus size={14} weight="bold" />
              Especialidad
            </button>
            <span className="ml-auto px-3.5 py-2 rounded-[4px] text-sm font-semibold bg-gray-200 text-gray-600 border border-gray-300">
              Federado
            </span>
          </div>
        </div>

        {/* ---------- Módulo activo (fuera del reporte, sin cambios funcionales) ---------- */}
        <div className="mt-4 bg-white rounded-md border border-gray-200 shadow-sm p-5 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">Estás trabajando en:</span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-[4px] text-sm font-semibold bg-blue-50 text-[#0056b3] border border-blue-100">
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
    </div>
  );
};

export default InicioTab;