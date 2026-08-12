import React, { useState, useRef } from 'react';
import { 
  Upload, FileText, X, Maximize2, Minimize2, FileSearch, Box,
  ChevronLeft, ChevronRight, Search, RefreshCw, FileDown
} from 'lucide-react';
import IFCViewer, { IFCViewerHandle } from '../IFCViewer/IFCViewer';
import { parseIfcHeader, IfcFileInfo } from '../IFCViewer/utils/parseIfcHeader';
import { UploadSimple, X as XIcon } from '@phosphor-icons/react';

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
    <p className="text-sm text-slate-700">{value || '—'}</p>
  </div>
);

const Visor3DTab: React.FC = () => {
  const [ifcFile, setIfcFile] = useState<File | null>(null);
  const [ifcArrayBuffer, setIfcArrayBuffer] = useState<ArrayBuffer | null>(null);
  const [ifcLoading, setIfcLoading] = useState(false);
  const [ifcInfo, setIfcInfo] = useState<IfcFileInfo | null>(null);
  const [activeModuleTab, setActiveModuleTab] = useState("Resumen");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchId, setSearchId] = useState('');
  const [searchError, setSearchError] = useState<string | null>(null);
  const viewerRef = useRef<IFCViewerHandle>(null);

  const PANEL_WIDTH = 'w-96';
  const PANEL_WIDTH_REM = '24rem';

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIfcLoading(true);
    setIfcFile(file);

    try {
      const buffer = await file.arrayBuffer();
      setIfcArrayBuffer(buffer);
      setIfcInfo(parseIfcHeader(buffer));
      console.log('Archivo IFC cargado:', file.name, `${(file.size / 1024 / 1024).toFixed(2)} MB`);
    } catch (err) {
      console.error('Error al leer el archivo IFC:', err);
    } finally {
      setIfcLoading(false);
    }
  };

  const clearIFC = () => {
    setIfcFile(null);
    setIfcArrayBuffer(null);
    setIfcInfo(null);
  };

  const handleSearchById = () => {
    const id = parseInt(searchId.trim(), 10);
    if (isNaN(id)) {
      setSearchError('Ingresá un número de ID válido');
      return;
    }
    setSearchError(null);
    viewerRef.current?.selectEntityById(id);
  };

  return (
    <div className="h-full">
      <div
        className={
          isFullscreen
            ? "fixed inset-0 z-[9999] bg-[#6B7280] flex flex-col overflow-hidden"
            : "w-full h-full bg-[#2D3B4E] flex flex-col overflow-hidden relative"
        }
      >
        <div className="flex-1 min-h-0 flex relative overflow-hidden">
          <button
            onClick={() => setIsFullscreen(prev => !prev)}
            className="absolute bottom-3 right-3 z-[10000] w-9 h-9 flex items-center justify-center bg-black/60 hover:bg-black/80 text-white rounded-lg transition-colors"
            title={isFullscreen ? 'Minimizar' : 'Ampliar'}
          >
            {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>

          <div className="flex-1 flex flex-col items-center justify-center text-gray-700 relative overflow-hidden bg-[#EEEEEE]">
            {ifcLoading ? (
              <div className="flex flex-col items-center justify-center h-full">
                <div className="text-center text-gray-700">
                  <div className="w-12 h-12 border-4 border-[#0056b3] border-t-transparent rounded-full animate-spin mx-auto"></div>
                  <p className="mt-4">Cargando archivo IFC...</p>
                  {ifcFile && (
                    <p className="text-sm text-gray-500 mt-2">
                      {ifcFile.name} ({(ifcFile.size / 1024 / 1024).toFixed(2)} MB)
                    </p>
                  )}
                </div>
              </div>
            ) : ifcArrayBuffer ? (
              <IFCViewer ref={viewerRef} fileBuffer={ifcArrayBuffer} />
            ) : (
              <div className="relative z-10 text-center flex flex-col items-center gap-4 px-6">
                <div className="w-16 h-16 rounded-2xl bg-slate-100/70 border border-slate-300/60 flex items-center justify-center">
                  <Box size={30} className="text-slate-500" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-slate-600">Aún no hay ningún modelo aquí</h3>
                  <p className="text-slate-500 text-sm mt-1.5 max-w-xs mx-auto">
                    Carga tu archivo IFC exportado desde Revit para empezar a explorar el modelo en 3D.
                  </p>
                </div>
                <label className="cursor-pointer flex items-center gap-2 px-5 py-2.5 bg-[#0056b3] text-white rounded-lg hover:bg-[#004494] transition-colors font-medium text-sm">
                  <Upload size={16} />
                  Cargar archivo IFC
                  <input type="file" accept=".ifc,.IFC" className="hidden" onChange={handleFileUpload} />
                </label>
                <p className="text-slate-400 text-xs">Formatos soportados: .ifc, .IFC</p>
              </div>
            )}
          </div>

          <button
            onClick={() => setPanelOpen((prev) => !prev)}
            className="absolute top-1/2 -translate-y-1/2 z-[9600] w-6 h-16 flex items-center justify-center bg-white/95 hover:bg-white text-slate-600 rounded-md shadow-lg border border-r-0 border-slate-300/60 transition-[right] duration-300 ease-in-out"
            style={{ right: panelOpen ? PANEL_WIDTH_REM : '0' }}
            title={panelOpen ? 'Ocultar panel' : 'Mostrar panel'}
          >
            {panelOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>

          <div
            className={`absolute top-14 bottom-3 right-0 ${PANEL_WIDTH} flex-shrink-0 flex flex-col p-5 text-slate-700 overflow-hidden bg-[#FFFFFF] shadow-2xl border-l border-slate-400/40 rounded-md transition-transform duration-300 ease-in-out z-[9500] ${
              panelOpen ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            <div className="flex-shrink-0">
              <div className="flex gap-2 overflow-x-auto pb-1 mb-6 scrollbar-hide">
                {["Resumen", "Arquitectura", "Estructuras", "Sanitarias", "Eléctricas", "Mecánicas", "Comunicaciones"].map((label) => (
                  <button
                    key={label}
                    onClick={() => setActiveModuleTab(label)}
                    className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      activeModuleTab === label
                        ? "bg-[#0056b3] text-white"
                        : "bg-slate-100/70 text-slate-500 hover:bg-slate-100"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex items-start gap-3 bg-slate-100/60 border border-slate-300/60 rounded-xl p-4 mb-5">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${ifcFile ? 'bg-green-100' : 'bg-slate-200'}`}>
                  <FileText size={18} className={ifcFile ? 'text-green-600' : 'text-slate-400'} />
                </div>
                <div className="min-w-0">
                  {ifcFile ? (
                    <>
                      <p className="text-sm font-semibold text-slate-700 truncate">{ifcFile.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {(ifcFile.size / 1024 / 1024).toFixed(2)} MB · Cargado
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Carga un archivo IFC exportado desde Revit para ver el visor 3D y los metadatos automáticos por disciplina.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
              {activeModuleTab === 'Resumen' && ifcInfo ? (
                <div className="space-y-3 py-2">
                  <InfoRow label="Proyecto" value={ifcInfo.projectName} />
                  <InfoRow label="Descripción" value={ifcInfo.projectDescription} />
                  <InfoRow label="Nombre largo" value={ifcInfo.projectLongName} />
                  <InfoRow label="Fecha de exportación" value={ifcInfo.timestamp} />
                  <InfoRow label="Autor" value={ifcInfo.author} />
                  <InfoRow label="Organización" value={ifcInfo.organization} />
                  <InfoRow label="Software de origen" value={ifcInfo.originatingSystem} />
                  <InfoRow label="Esquema IFC" value={ifcInfo.schema} />
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center gap-2 py-8">
                  <div className="w-12 h-12 rounded-full bg-slate-100/70 flex items-center justify-center">
                    <FileSearch size={22} className="text-slate-400" />
                  </div>
                  <p className="text-sm font-medium text-slate-500">
                    {activeModuleTab === 'Resumen'
                      ? 'Selecciona una disciplina para ver sus metadatos'
                      : `Metadatos de "${activeModuleTab}"`}
                  </p>
                  <p className="text-xs text-slate-400 max-w-[220px]">
                    {activeModuleTab === 'Resumen'
                      ? 'La información aparecerá aquí una vez cargues un modelo IFC.'
                      : 'Aún no disponible para esta disciplina.'}
                  </p>
                </div>
              )}
            </div>

            {ifcFile && (
              <button
                onClick={clearIFC}
                className="flex-shrink-0 mt-4 text-sm text-slate-500 hover:text-red-500 transition-colors text-left font-medium"
              >
                Eliminar archivo
              </button>
            )}
          </div>

          {/* --- BARRA FLOTANTE INFERIOR: todo unido en una sola barra continua, compacta --- */}
<div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[9700] flex items-center bg-white/95 backdrop-blur-md border border-gray-200 rounded-xl shadow-xl px-0.5 py-0.5">

  {/* Grupo 1: Cargar/Cambiar IFC + Limpiar — FUNCIONAL */}
  <label className="cursor-pointer flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-gray-700 hover:bg-gray-100 hover:text-[#0056b3] transition-colors duration-200">
    <UploadSimple size={14} weight="regular" />
    <span className="text-[9px] font-medium whitespace-nowrap">
      {ifcFile ? 'Cambiar IFC' : 'Cargar IFC'}
    </span>
    <input type="file" accept=".ifc,.IFC" className="hidden" onChange={handleFileUpload} />
  </label>

  {ifcFile && (
    <button
      onClick={clearIFC}
      className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors duration-200"
    >
      <XIcon size={14} weight="regular" />
      <span className="text-[9px] font-medium whitespace-nowrap">Limpiar</span>
    </button>
  )}

  <div className="w-px h-6 bg-gray-200 mx-0.5" />

  {/* Grupo 2: Buscador por ID — FUNCIONAL */}
  <div className="relative">
    <button
      onClick={() => setSearchOpen((prev) => !prev)}
      disabled={!ifcArrayBuffer}
      className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors duration-200 ${
        searchOpen
          ? 'bg-[#0056b3] text-white'
          : 'text-gray-700 hover:bg-gray-100 hover:text-[#0056b3]'
      } ${!ifcArrayBuffer ? 'opacity-40 cursor-not-allowed' : ''}`}
      title="Buscar elemento por ID IFC"
    >
      <Search size={14} />
      <span className="text-[9px] font-medium whitespace-nowrap">Buscar ID</span>
    </button>

    {searchOpen && (
      <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-white rounded-xl shadow-2xl border border-gray-200 p-3 w-56">
        <p className="text-[11px] font-semibold text-slate-500 mb-1.5">Buscar por ID IFC</p>
        <div className="flex gap-1.5">
          <input
            type="number"
            value={searchId}
            onChange={(e) => { setSearchId(e.target.value); setSearchError(null); }}
            onKeyDown={(e) => e.key === 'Enter' && handleSearchById()}
            placeholder="Ej: 3584"
            className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0056b3] outline-none"
            autoFocus
          />
          <button
            onClick={handleSearchById}
            className="px-3 py-1.5 bg-[#0056b3] text-white text-sm rounded-lg hover:bg-[#004494] transition-colors"
          >
            Ir
          </button>
        </div>
        {searchError && <p className="text-[11px] text-red-500 mt-1.5">{searchError}</p>}
      </div>
    )}
  </div>

  <div className="w-px h-6 bg-gray-200 mx-0.5" />

  {/* Grupo 3: Sincronizar con Revit — estático */}
  <button
    onClick={() => alert('Sincronización con Revit: próximamente disponible.')}
    className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-gray-700 hover:bg-gray-100 hover:text-[#0056b3] transition-colors duration-200"
  >
    <RefreshCw size={14} />
    <span className="text-[9px] font-medium whitespace-nowrap">Sincronizar</span>
  </button>

  <div className="w-px h-6 bg-gray-200 mx-0.5" />

  {/* Grupo 4: Descargar datos — estático */}
  <button
    onClick={() => alert('Descarga de datos: próximamente disponible.')}
    className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-gray-700 hover:bg-gray-100 hover:text-[#0056b3] transition-colors duration-200"
    title="Descargar datos"
  >
    <FileDown size={14} />
    <span className="text-[9px] font-medium whitespace-nowrap">Descargar</span>
  </button>
</div>
        </div>
      </div>
    </div>
  );
};

export default Visor3DTab;