// components/tabs/InicioTab.tsx
import React from 'react';
import {
  MapPin, CalendarBlank, PencilSimple, CheckCircle, WarningCircle, ClipboardText,
  Buildings, UserCircle, FileXls, CaretDown, Plus, Circle, ChartBar,
} from '@phosphor-icons/react';
import { Project } from '../../types/project.types';
import { MODULOS } from '../../constants/modulos';
import { formatDate } from '../../utils/dateUtils';

interface EditForm {
  name: string;
  location: string;
  start_date: string;
  end_date: string;
  description: string;
}

interface InicioTabProps {
  project: Project;
  fondoImage: string;
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
/* cliente/contratista, indicadores, verificación y estado de archivos.   */
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
  fondoImage,
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

  return (
    <div className="flex items-start justify-center min-h-[500px] relative py-2">
      <div className="w-full max-w-4xl">
        <div className="bg-white rounded-md border border-gray-200 shadow-sm overflow-hidden">

          {/* ---------- CABECERA: título + imagen (izq) / fechas (der) ---------- */}
          <div className="p-6 pb-0 flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              {isEditingInfo ? (
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => onEditChange('name', e.target.value)}
                  className="text-xl font-bold text-gray-800 border border-gray-300 rounded-[4px] px-2 py-1 outline-none focus:ring-2 focus:ring-[#0056b3]"
                />
              ) : (
                <h2 className="text-xl font-bold text-gray-800">{project.name}</h2>
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

            {canActuallyEdit && (
              <button
                onClick={isEditingInfo ? onCancelEditing : onStartEditing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-500 border border-gray-200 rounded-[4px] hover:border-gray-300 hover:text-gray-700 transition-colors"
              >
                <PencilSimple size={14} weight="bold" />
                {isEditingInfo ? 'Cancelar' : 'Editar'}
              </button>
            )}
          </div>

          <div className="p-6 grid grid-cols-1 md:grid-cols-[1.5fr_1fr] gap-6">

            {/* Columna izquierda: imagen + datos + descripción */}
            <div>
              <div className="rounded-[4px] overflow-hidden border border-gray-200 bg-slate-900">
                <img src={fondoImage} alt={project.name} className="w-full h-48 object-cover" />
              </div>
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

              {/* Datos */}
              {isEditingInfo ? (
                <div className="mt-5 space-y-3">
                  <div>
                    <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">
                      Ubicación
                    </label>
                    <input
                      type="text"
                      value={editForm.location}
                      onChange={(e) => onEditChange('location', e.target.value)}
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-[4px] focus:ring-2 focus:ring-[#0056b3] outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">
                        Inicio
                      </label>
                      <input
                        type="date"
                        value={editForm.start_date}
                        onChange={(e) => onEditChange('start_date', e.target.value)}
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-[4px] focus:ring-2 focus:ring-[#0056b3] outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">
                        Fin
                      </label>
                      <input
                        type="date"
                        value={editForm.end_date}
                        onChange={(e) => onEditChange('end_date', e.target.value)}
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-[4px] focus:ring-2 focus:ring-[#0056b3] outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">
                      Descripción
                    </label>
                    <textarea
                      value={editForm.description}
                      onChange={(e) => onEditChange('description', e.target.value)}
                      rows={3}
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-[4px] focus:ring-2 focus:ring-[#0056b3] outline-none resize-none"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={onSaveEditing}
                      disabled={savingInfo}
                      className="px-4 py-1.5 text-sm bg-[#0056b3] text-white rounded-[4px] hover:bg-[#004494] transition-colors disabled:opacity-50 font-semibold"
                    >
                      {savingInfo ? 'Guardando...' : 'Guardar cambios'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mt-5">
                    <SectionLabel icon={null}>Datos</SectionLabel>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <MapPin size={15} className="text-[#0056b3] flex-shrink-0" weight="duotone" />
                        {project.location || '—'}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <UserCircle size={15} className="text-[#0056b3] flex-shrink-0" weight="duotone" />
                        Cliente: <span className="text-gray-500">Gobierno Regional de Puno</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Buildings size={15} className="text-[#0056b3] flex-shrink-0" weight="duotone" />
                        Contratista: <span className="text-gray-500">Ingeniería Palomino S.A.C.</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                      <ClipboardText size={14} weight="duotone" />
                      Descripción
                    </p>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      {project.description}
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Columna derecha: Inicio / Fin / Progreso */}
            <div className="flex flex-col gap-3">
              <div className="border border-gray-200 rounded-[4px] p-3.5 flex items-center gap-3">
                <CalendarBlank size={16} className="text-[#0056b3] flex-shrink-0" weight="duotone" />
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Inicio</p>
                  <p className="text-sm font-bold text-gray-800">{formatDate(project.start_date)}</p>
                </div>
              </div>
              <div className="border border-gray-200 rounded-[4px] p-3.5 flex items-center gap-3">
                <CalendarBlank size={16} className="text-[#0056b3] flex-shrink-0" weight="duotone" />
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Fin</p>
                  <p className="text-sm font-bold text-gray-800">{formatDate(project.end_date)}</p>
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

          {/* ---------- Verificación ---------- */}
          <div className="mx-6 mt-4 border border-gray-200 rounded-[4px] p-5 overflow-hidden">
            <SectionLabel
              icon={<CheckCircle size={14} weight="bold" className="text-gray-400" />}
              action={
                <button className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0056b3] text-white text-xs font-semibold rounded-[4px] hover:bg-[#004494] transition-colors">
                  Especialidad
                  <CaretDown size={12} weight="bold" />
                </button>
              }
            >
              Verificación
            </SectionLabel>
            <p className="text-[11px] text-gray-400 -mt-2 mb-4">
              Datos extraídos del modelo IFC cargado
            </p>

            {/* Tarjetas de conteo */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {VERIFICACION_CONTEOS.map((c) => (
                <div key={c.label} className="rounded-[4px] border border-gray-200 overflow-hidden">
                  <div className="px-2.5 py-1.5 text-[10.5px] font-semibold text-gray-500 uppercase tracking-wide text-center leading-tight bg-gray-50 border-b border-gray-200">
                    {c.label}
                  </div>
                  <div className="px-2.5 py-2 text-center text-lg font-bold text-[#0056b3] bg-white">
                    {c.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Tabla de detalle */}
            <div className="overflow-x-auto rounded-[4px] border border-gray-200">
              <table className="w-full text-xs border-collapse min-w-[720px]">
                <thead>
                  <tr>
                    {VERIFICACION_COLS.map((col) => (
                      <th
                        key={col}
                        className="px-3 py-2 text-gray-600 font-semibold text-left uppercase tracking-wide text-[10.5px] border border-gray-200 bg-gray-50 whitespace-normal"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {VERIFICACION_FILAS.map((fila, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}>
                      <td className="px-3 py-2 border border-gray-200 text-gray-600 break-all">{fila.guid}</td>
                      <td className="px-3 py-2 border border-gray-200 text-gray-600 text-center">{fila.recuento}</td>
                      <td className="px-3 py-2 border border-gray-200 text-gray-600 text-center">{fila.coherencia}</td>
                      <td className="px-3 py-2 border border-gray-200 text-gray-600 text-center">{fila.variacion}</td>
                      <td className="px-3 py-2 border border-gray-200 text-gray-600">{fila.comentario || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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