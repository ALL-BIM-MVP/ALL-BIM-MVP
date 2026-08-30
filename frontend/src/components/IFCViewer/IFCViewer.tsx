import React, { forwardRef, useImperativeHandle, useState, useEffect, useCallback, useRef } from 'react';
import { AlertCircle, Footprints, Camera, Moon, Sun, Ruler, X as XIcon, Diamond, Triangle, Square, Circle, Scissors, EyeOff, Eye, Focus, Search, Crosshair, Paintbrush, Layers, Download, FolderOpen, RefreshCw, SeparatorHorizontal, Table2 } from 'lucide-react';
import { useIfcModel } from './hooks/useIfcModel';
import { crossLabelPos } from './hooks/useCrossTool';
import { ViewPreset } from './types';
import PropertiesPanel from "./PropertiesPanel/PropertiesPanel";
import ViewCube3D from './Viewcube3d';
import CategoryFilterPanel from './CategoryFilterPanel';
import { projectService } from '../../services/project.service';

interface IFCViewerProps {
  fileBuffer: ArrayBuffer | null;

  fragmentsBuffer?: ArrayBuffer | null;
  projectId?: number;
  viewCubeVisible?: boolean;
  onFileUploaded?: () => void;

  viewCubeRightOffset?: number;

  isActive?: boolean;

  onViewElementInMetrados?: (expressId: number) => void;
}

export interface IFCViewerHandle {
  selectEntityById: (expressId: number) => void;
  selectByIdOrGuid: (value: string) => Promise<boolean>;
  isolateElementsByIds: (expressIds: number[]) => void;
  selectGroupInViewer: (expressIds: number[]) => void;
  clearIsolation: () => void;
  clearSelection: () => void; 
}

const InfoRow: React.FC<{ label: string; value: string; multiline?: boolean }> = ({ label, value, multiline }) => (
  <div className="flex justify-between gap-3">
    <span className="text-gray-400 flex-shrink-0">{label}</span>
    <span className={`text-cyan-300 text-right ${multiline ? 'break-all' : 'truncate'}`}>{value || '—'}</span>
  </div>
);


const DistanceLabel: React.FC<{ x: number; y: number; distance: number; color?: string }> = ({ x, y, distance, color = '#0056b3' }) => (
  <div
    className="absolute z-50 -translate-x-1/2 -translate-y-full pointer-events-none"
    style={{ left: x, top: y - 10 }}
  >
    <div
      className="text-white text-[9px] font-semibold px-1 py-0.5 rounded shadow-lg whitespace-nowrap"
      style={{ backgroundColor: `${color}cc` }}
    >
      {distance.toFixed(3)} m
    </div>
  </div>
);

const DistanceLabelWithDelete: React.FC<{ x: number; y: number; distance: number; onDelete: () => void }> = ({ x, y, distance, onDelete }) => (
  <div
    className="absolute z-30 -translate-x-1/2 -translate-y-1/2"
    style={{ left: x, top: y }}
  >
    <div className="relative bg-[#0056b3]/80 text-white text-[9px] font-semibold px-1 py-0.5 rounded shadow-lg whitespace-nowrap">
      {distance.toFixed(3)} m
      <button
        onClick={onDelete}
        className="absolute -top-2 -right-2 w-4 h-4 flex items-center justify-center rounded-full bg-red-500 hover:bg-red-600 text-white shadow-md"
        title="Borrar"
      >
        <XIcon size={9} />
      </button>
    </div>
  </div>
);


const CenterDeleteHandle: React.FC<{ x: number; y: number; onDelete: () => void }> = ({ x, y, onDelete }) => (
  <button
    onClick={onDelete}
    className="absolute z-40 w-4 h-4 flex items-center justify-center rounded-full bg-red-500/70 hover:bg-red-500/90 text-white shadow-md transition-colors"
    style={{ left: x + 9, top: y - 17 }}
    title="Borrar cruz"
  >
    <XIcon size={9} />
  </button>
);


// crossLabelPos ahora vive en useCrossTool.ts (se importa arriba) —
// reprojectOnFrame también lo necesita para escribir la posición de las
// etiquetas directo al DOM.

const SnapIcon: React.FC<{ x: number; y: number; snapType: string }> = ({ x, y, snapType }) => {
  const config = {
    vertex: { Icon: Square, color: '#22c55e' },
    edge: { Icon: Diamond, color: '#3b82f6' },
    face: { Icon: Triangle, color: '#eab308' },
    face_center: { Icon: Triangle, color: '#eab308' },
    none: { Icon: Circle, color: '#94a3b8' },
  }[snapType] ?? { Icon: Circle, color: '#94a3b8' };

  const { Icon, color } = config;

  return (
    <div
      className="absolute z-30 -translate-x-1/2 -translate-y-1/2 pointer-events-none drop-shadow-md"
      style={{ left: x, top: y }}
    >
      <Icon size={20} color={color} strokeWidth={2.5} fill={color} fillOpacity={0.25} />
    </div>
  );
};


const MeasureRingCursor: React.FC<{ x: number; y: number; snapType: string; color?: string }> = ({ x, y, snapType, color = '#0056b3' }) => {
 
  const isDragTurquoise = color === '#2dd4bf';
  const ringOpacity = isDragTurquoise ? 0.85 : 0.75;
  const fillAlpha = isDragTurquoise ? '30' : '26';
  return (
    <div
      className="absolute z-30 -translate-x-1/2 -translate-y-1/2 pointer-events-none drop-shadow-md"
      style={{ left: x, top: y }}
    >
      {snapType === 'vertex' && (
        <div
          className="absolute rounded-full border-[3px]"
          style={{ left: -8, top: -8, width: 32, height: 32, borderColor: '#eab308', opacity: 0.6 }}
        />
      )}
      <div
        className="rounded-full border-[3px]"
        style={{ width: 16, height: 16, borderColor: color, backgroundColor: `${color}${fillAlpha}`, opacity: ringOpacity }}
      />
    </div>
  );
};

const MEASURE_POINT_COLORS = ['#0056b3', '#dc2626'];
const MeasurePointMarker: React.FC<{ x: number; y: number; index: number }> = ({ x, y, index }) => {
  const color = MEASURE_POINT_COLORS[index] ?? MEASURE_POINT_COLORS[0];
 
  return (
    <>
      <circle cx={x} cy={y} r={7} fill={color} fillOpacity={0.15} stroke={color} strokeWidth={3} strokeOpacity={0.7} />
     
      <circle cx={x} cy={y} r={2} fill={color} />
    </>
  );
};

const PAINT_COLORS = ['#ff3b30', '#34c759', '#0056b3', '#ffcc00', '#ffffff'];
const IFCViewer = forwardRef<IFCViewerHandle, IFCViewerProps>(({ fileBuffer, fragmentsBuffer = null, projectId, onFileUploaded, viewCubeRightOffset = 0, viewCubeVisible = true, isActive = true, onViewElementInMetrados }, ref) => {
  const {
    canvasRef,
    containerRef,
    loading,
    error,
    progress,
    debugInfo,
    ready,
    setPresetView,
    isWalkMode,
    toggleWalkMode,
    takeScreenshot,
    pendingScreenshot,
    discardScreenshot,
    downloadScreenshot,
    isDarkBackground,
    toggleBackground,
    edgesVisible,
    toggleEdges,

    measureMode,
    enableAndArmMeasure,
    exitMeasureMode,
    measurements,
    clearMeasurement,
    removeMeasurement,
    measureHoverPoint,
    hoverEdge,
    registerMeasureLabelEl,
    fragmentsMeasureMode,
    enableAndArmFragmentsMeasure,
    exitFragmentsMeasureMode,
    fragmentsMeasurements,
    fragmentsMeasureHoverPoint,
    fragmentsMeasureHoverColor,
    fragmentsHoverEdge,
    fragmentsDraggingPoint,
    clearFragmentsMeasurement,
    removeFragmentsMeasurement,
    registerFragmentsMeasureLabelEl,
    crossMode,
    enableAndArm,
    exitCrossMode,
    crosses,
    clearCross,
    removeCross,
    draggingId: draggingCrossId,
    registerCrossPosEl,
    fragmentsCrossMode,
    enableAndArmFragmentsCross,
    exitFragmentsCrossMode,
    fragmentsCrosses,
    clearFragmentsCross,
    removeFragmentsCross,
    draggingFragmentsCrossId,
    registerFragmentsCrossPosEl,
    paintMode,
    togglePaintMode,
    exitPaintMode,
    paintColor,
    setPaintColor,
    strokes,
    clearStrokes,
    removeStroke,
    sectionAxis,
    sectionPosition,
    sectionEnabled,
    sectionFlipped,
    toggleSectionEnabled,
    setSectionAxis,
    setSectionPosition,
    toggleSectionFlipped,
    resetSection,
    selectedEntity,
    clearSelection,
    fragmentsSelectedEntity,
    clearFragmentsSelection,
    fragmentsPopupVisible,
    fragmentsPopupScreenPos,
    dismissFragmentsPopup,
    hideElementById,
    isolateElementById,
    isolatedElementId,
    isolateElementsByIds,
    isolatedElementIds,
    popupVisible,
    popupScreenPos,
    selectEntityById,
    selectGroupInViewer,
    selectByIdOrGuid,
    paramIndex,
    typeGroups,
    selectedTypes,
    toggleSelectType,
    clearSelectedTypes,
    levelGroups,
    selectedLevels,
    toggleSelectLevel,
    clearSelectedLevels,
    fragmentsTypeGroups,
    fragmentsSelectedTypes,
    toggleFragmentsSelectType,
    clearFragmentsSelectedTypes,
    fragmentsLevelGroups,
    fragmentsSelectedLevels,
    toggleFragmentsSelectLevel,
    clearFragmentsSelectedLevels,
    isolatedFragmentsElementId,
    isolatedFragmentsElementIds,
    hiddenFragmentsElementIds,
    isolateFragmentsElementById,
    hideFragmentsElementById,
    clearFragmentsAll,
    isolationPaused,
    toggleIsolationPause,

    hiddenTypes,
    hiddenElementIds,
    isolatedType,
    toggleHideType,
    toggleIsolateType,
    clearIsolation,
    clearAll,
        
    // --- Corte orientado a elemento (tijera, tipo Dalux) ---
    cutArmed,
    cutDragging,
    scissorsScreen,
    armCutAt,
    exitCut,
    dismissPopup,
    handleCutMouseDown,
    selectFragmentsByIdOrGuid,
    isolateFragmentsElementsByIds,
    selectFragmentsGroupInViewer,
} = useIfcModel(fileBuffer, viewCubeRightOffset, isActive, fragmentsBuffer);
  // Mismo criterio que usingFragmentsFilter más abajo (categorías/
  // niveles) — si el camino viejo no detectó nada, es porque el
  // archivo cargó por Fragments.
  const usingFragmentsSelection = typeGroups.length === 0 && fragmentsTypeGroups.length > 0;
  useImperativeHandle(ref, () => ({
    selectEntityById: (expressId: number) => selectEntityById(expressId),
    selectByIdOrGuid: (value: string) =>
      usingFragmentsSelection ? selectFragmentsByIdOrGuid(value) : selectByIdOrGuid(value),
    isolateElementsByIds: (expressIds: number[]) =>
      usingFragmentsSelection ? isolateFragmentsElementsByIds(expressIds) : isolateElementsByIds(expressIds),
    selectGroupInViewer: (expressIds: number[]) =>
      usingFragmentsSelection ? selectFragmentsGroupInViewer(expressIds) : selectGroupInViewer(expressIds),
    clearIsolation: () => clearIsolation(),
    clearSelection: () =>
      usingFragmentsSelection ? clearFragmentsSelection() : clearSelection(),
  }));


  const activeEntity = selectedEntity ?? fragmentsSelectedEntity;
  const handleDeselectEntity = useCallback(() => {
    if (selectedEntity) clearSelection();
    else if (fragmentsSelectedEntity) clearFragmentsSelection();
  }, [selectedEntity, clearSelection, fragmentsSelectedEntity, clearFragmentsSelection]);

  
  const handleHideActiveEntity = useCallback(() => {
    if (!activeEntity) return;
    if (selectedEntity) hideElementById(activeEntity.expressId);
    else hideFragmentsElementById(activeEntity.expressId);
    handleDeselectEntity();
  }, [activeEntity, selectedEntity, hideElementById, hideFragmentsElementById, handleDeselectEntity]);

  const handleIsolateActiveEntity = useCallback(() => {
    if (!activeEntity) return;
    if (selectedEntity) isolateElementById(activeEntity.expressId);
    else isolateFragmentsElementById(activeEntity.expressId);
  }, [activeEntity, selectedEntity, isolateElementById, isolateFragmentsElementById]);

  
  const handleViewElementInMetrados = useCallback(() => {
    if (!activeEntity) return;
    onViewElementInMetrados?.(activeEntity.expressId);
  }, [activeEntity, onViewElementInMetrados]);

  const isActiveEntityIsolated = selectedEntity
    ? isolatedElementId === activeEntity?.expressId
    : isolatedFragmentsElementId === activeEntity?.expressId;

  const displayPopupVisible = selectedEntity ? popupVisible : fragmentsPopupVisible;
  const displayPopupScreenPos = selectedEntity ? popupScreenPos : fragmentsPopupScreenPos;
  const handleDismissPopup = useCallback(() => {
    if (selectedEntity) dismissPopup();
    else dismissFragmentsPopup();
  }, [selectedEntity, dismissPopup, dismissFragmentsPopup]);

  const displayMeasurements = measurements.length > 0 ? measurements : fragmentsMeasurements;
  const handleRegisterMeasureLabelEl = useCallback((id: string, el: HTMLDivElement | null) => {
    registerMeasureLabelEl(id, el);
    registerFragmentsMeasureLabelEl(id, el);
  }, [registerMeasureLabelEl, registerFragmentsMeasureLabelEl]);

  const handleRemoveMeasurement = useCallback((id: string) => {
    removeMeasurement(id);
    removeFragmentsMeasurement(id);
    exitMeasureMode();
    exitFragmentsMeasureMode();
  }, [removeMeasurement, removeFragmentsMeasurement, exitMeasureMode, exitFragmentsMeasureMode]);

  // Mismo punto de mezcla que medición/selección — solo uno de los dos
  // sistemas llega a tener cruces puestas.
  const displayCrosses = crosses.length > 0 ? crosses : fragmentsCrosses;
  const displayDraggingCrossId = draggingCrossId ?? draggingFragmentsCrossId;
  const handleRegisterCrossPosEl = useCallback((key: string, el: HTMLElement | null) => {
    registerCrossPosEl(key, el);
    registerFragmentsCrossPosEl(key, el);
  }, [registerCrossPosEl, registerFragmentsCrossPosEl]);
  const handleRemoveCross = useCallback((id: string) => {
    removeCross(id);
    removeFragmentsCross(id);
  }, [removeCross, removeFragmentsCross]);

  const usingFragmentsFilter = usingFragmentsSelection;
  const displayTypeGroups = usingFragmentsFilter ? fragmentsTypeGroups : typeGroups;
  const displaySelectedTypes = usingFragmentsFilter ? fragmentsSelectedTypes : selectedTypes;
  const handleToggleSelectType = usingFragmentsFilter ? toggleFragmentsSelectType : toggleSelectType;
  const handleClearSelectedTypes = usingFragmentsFilter ? clearFragmentsSelectedTypes : clearSelectedTypes;
  const displayLevelGroups = usingFragmentsFilter ? fragmentsLevelGroups : levelGroups;
  const displaySelectedLevels = usingFragmentsFilter ? fragmentsSelectedLevels : selectedLevels;
  const handleToggleSelectLevel = usingFragmentsFilter ? toggleFragmentsSelectLevel : toggleSelectLevel;
  const handleClearSelectedLevels = usingFragmentsFilter ? clearFragmentsSelectedLevels : clearSelectedLevels;

  const [panelOpen, setPanelOpen] = useState(false);
  const [categoryPanelOpen, setCategoryPanelOpen] = useState(false);

  useEffect(() => {
    setPanelOpen(!!activeEntity);
    setCategoryPanelOpen(false);
  }, [activeEntity]);

  const [rulerMenuOpen, setRulerMenuOpen] = useState(false);
  const rulerMenuRef = useRef<HTMLDivElement>(null);

  
  useEffect(() => {
    if (!rulerMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (rulerMenuRef.current && !rulerMenuRef.current.contains(event.target as Node)) {
        setRulerMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [rulerMenuOpen]);

  const [savingScreenshot, setSavingScreenshot] = useState(false);
  const [saveScreenshotError, setSaveScreenshotError] = useState<string | null>(null);

  const handleSelectMeasure = () => {
    if (crossMode) exitCrossMode();
    if (fragmentsCrossMode) exitFragmentsCrossMode();
    if (paintMode) exitPaintMode();
    if (sectionEnabled) toggleSectionEnabled();
    // Arma los dos sistemas — el que no aplica (según si el modelo activo
    // es web-ifc o Fragments) no encuentra nada bajo el click y no hace
    // nada, mismo criterio que useFragmentsSelection.ts.
    enableAndArmMeasure();
    enableAndArmFragmentsMeasure();
    setRulerMenuOpen(false);
  };

  const handleSelectCross = () => {
    if (measureMode) exitMeasureMode();
    if (fragmentsMeasureMode) exitFragmentsMeasureMode();
    if (paintMode) exitPaintMode();
    if (sectionEnabled) toggleSectionEnabled();
    enableAndArm();
    enableAndArmFragmentsCross();
    setRulerMenuOpen(false);
  };

  const handleTogglePaint = () => {
    if (paintMode) {
      exitPaintMode();
      return;
    }
    if (measureMode) exitMeasureMode();
    if (fragmentsMeasureMode) exitFragmentsMeasureMode();
    if (crossMode) exitCrossMode();
    if (fragmentsCrossMode) exitFragmentsCrossMode();
    if (sectionEnabled) toggleSectionEnabled();
    togglePaintMode();
  };

  
  const handleToggleSection = () => {
    if (sectionEnabled) {
      toggleSectionEnabled();
      return;
    }
    if (measureMode) exitMeasureMode();
    if (fragmentsMeasureMode) exitFragmentsMeasureMode();
    if (crossMode) exitCrossMode();
    if (fragmentsCrossMode) exitFragmentsCrossMode();
    if (paintMode) exitPaintMode();
    toggleSectionEnabled();
  };

  const handleSaveScreenshotToProject = async () => {
    if (!pendingScreenshot || !projectId) return;
    setSavingScreenshot(true);
    setSaveScreenshotError(null);
    try {
      const file = new File([pendingScreenshot.blob], `captura-visor-${Date.now()}.png`, { type: 'image/png' });
      await projectService.uploadFile(projectId, file);
      discardScreenshot();
      onFileUploaded?.();
    } catch (err: any) {
      setSaveScreenshotError(err.message || 'No se pudo guardar la captura en el proyecto.');
    } finally {
      setSavingScreenshot(false);
    }
  };

  const handleCloseScreenshotModal = () => {
    if (savingScreenshot) return;
    setSaveScreenshotError(null);
    discardScreenshot();
  };


  const hasAnyIsolation =
    isolatedElementId !== null ||
    isolatedType !== null ||
    (isolatedElementIds !== null && isolatedElementIds.size > 0) ||
    selectedTypes.size > 0 ||
    hiddenElementIds.size > 0 ||
    hiddenTypes.size > 0 ||
    isolatedFragmentsElementId !== null ||
    (isolatedFragmentsElementIds !== null && isolatedFragmentsElementIds.size > 0) ||
    fragmentsSelectedTypes.size > 0 ||
    fragmentsSelectedLevels.size > 0 ||
    hiddenFragmentsElementIds.size > 0;

  
  const hasAnyFragmentsDimming =
    isolatedFragmentsElementId !== null ||
    (isolatedFragmentsElementIds !== null && isolatedFragmentsElementIds.size > 0) ||
    fragmentsSelectedTypes.size > 0 ||
    fragmentsSelectedLevels.size > 0;

  const handleClearAllIsolation = useCallback(() => {
    clearAll();
    clearFragmentsAll();
  }, [clearAll, clearFragmentsAll]);

  return (
    <div className="flex h-full w-full">
      <div
        ref={containerRef}
        className="bg-[#EEEEEE] flex-1 relative"
        style={{ minHeight: '400px' }}
      >
        {ready && (
          <>
            <ViewCube3D onSelect={setPresetView} 
            anchorRef={containerRef} 
            rightOffset={viewCubeRightOffset} 
            visible={viewCubeVisible}
            />
              
            <div className="absolute top-2 left-24 z-20 flex flex-row gap-1.5">
              <button
                onClick={() => { setPanelOpen((p) => !p); setCategoryPanelOpen(false); }}
                className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
                  panelOpen ? 'bg-[#0056b3] text-white' : 'bg-black/70 hover:bg-black/90 text-white'
                }`}
                title="Buscar / propiedades"
              >
                <Search size={16} />
              </button>
                <button
  onClick={() => { setCategoryPanelOpen((p) => !p); setPanelOpen(false); }}
  className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
    categoryPanelOpen ? 'bg-[#0056b3] text-white' : 'bg-black/70 hover:bg-black/90 text-white'
  }`}
  title="Filtrar por categoría o nivel"
>
  <Layers size={16} />
</button>
              <button
                onClick={handleToggleSection}
                className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
                  sectionEnabled ? 'bg-[#0056b3] text-white' : 'bg-black/70 hover:bg-black/90 text-white'
                }`}
                title={sectionEnabled ? 'Desactivar corte' : 'Sección / corte'}
              >
                <Scissors size={16} />
              </button>

              <button
                onClick={toggleWalkMode}
                className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
                  isWalkMode ? 'bg-[#0056b3] text-white' : 'bg-black/70 hover:bg-black/90 text-white'
                }`}
                title={isWalkMode ? 'Salir del modo caminar' : 'Modo caminar (WASD + arrastrar para mirar)'}
              >
                <Footprints size={16} />
              </button>

              <div className="relative" ref={rulerMenuRef}>
                <button
                  onClick={() => setRulerMenuOpen((prev) => !prev)}
                  className="w-9 h-9 flex items-center justify-center rounded-lg bg-black/70 hover:bg-black/90 text-white transition-colors"
                  title="Herramientas de medición"
                >
                  <Ruler size={16} />
                </button>

                {rulerMenuOpen && (
                  <div className="absolute top-11 left-0 z-30 flex flex-col bg-white rounded-xl py-1.5 shadow-2xl min-w-[170px]">
                    <button
                      onClick={handleSelectMeasure}
                      className={`flex items-center gap-2.5 px-3.5 py-2 text-sm text-left transition-colors ${
                        measureMode ? 'text-[#0056b3] font-medium bg-blue-50' : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <Ruler size={16} />
                      Medición
                    </button>
                    <button
                      onClick={handleSelectCross}
                      className={`flex items-center gap-2.5 px-3.5 py-2 text-sm text-left transition-colors ${
                        crossMode ? 'text-[#0056b3] font-medium bg-blue-50' : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <Crosshair size={16} />
                      Cruz de ejes
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={handleTogglePaint}
                className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
                  paintMode ? 'bg-[#0056b3] text-white' : 'bg-black/70 hover:bg-black/90 text-white'
                }`}
                title={paintMode ? 'Salir de pintar' : 'Pintar sobre el modelo'}
              >
                <Paintbrush size={16} />
              </button>

              <button
                onClick={toggleBackground}
                className="w-9 h-9 flex items-center justify-center rounded-lg bg-black/70 hover:bg-black/90 text-white transition-colors"
                title={isDarkBackground ? 'Fondo claro' : 'Fondo oscuro'}
              >
                {isDarkBackground ? <Sun size={16} /> : <Moon size={16} />}
              </button>

              <button
                onClick={toggleEdges}
                className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
                  edgesVisible ? 'bg-[#0056b3] text-white' : 'bg-black/70 hover:bg-black/90 text-white'
                }`}
                title={edgesVisible ? 'Ocultar líneas de contorno' : 'Mostrar líneas de contorno'}
              >
                <SeparatorHorizontal size={16} />
              </button>

              <button
                onClick={takeScreenshot}
                className="w-9 h-9 flex items-center justify-center rounded-lg bg-black/70 hover:bg-black/90 text-white transition-colors"
                title="Capturar imagen del visor"
              >
                <Camera size={16} />
              </button>

              {hasAnyFragmentsDimming && (
                <button
                  onClick={toggleIsolationPause}
                  className={`flex flex-col items-center justify-center gap-0.5 px-1.5 h-9 rounded-lg bg-white shadow transition-colors ${
                    isolationPaused ? 'text-[#0056b3]' : 'text-gray-600 hover:text-[#0056b3]'
                  }`}
                  title={
                    isolationPaused
                      ? 'Mostrar de nuevo lo atenuado (mismo aislamiento de antes)'
                      : 'Ocultar del todo lo atenuado (sin perder qué está aislado)'
                  }
                >
                  {isolationPaused ? <EyeOff size={14} /> : <Eye size={14} />}
                  <span className="text-[9px] font-medium leading-none">
                    {isolationPaused ? 'Mostrar' : 'Ocultar'}
                  </span>
                </button>
              )}

              {hasAnyIsolation && (
                <button
                  onClick={handleClearAllIsolation}
                  className="w-9 h-9 flex items-center justify-center rounded-lg bg-[#0056b3] hover:bg-[#004494] text-white transition-colors"
                  title="Mostrar todo el modelo (deshacer aislamiento y elementos ocultos)"
                >
                  <Eye size={16} />
                </button>
              )}

            </div>

            {panelOpen && (
              <div className="absolute top-14 left-2 z-50">
                <PropertiesPanel
                  isOpen={panelOpen}
                  onClose={() => setPanelOpen(false)}
                  paramIndex={paramIndex}
                  entity={activeEntity}
                  onSelectResult={(id) => selectEntityById(id)}
                  onDeselect={handleDeselectEntity}
                />
              </div>
            )}

              {categoryPanelOpen && (
  <div className="absolute top-14 left-8 z-50">
    <CategoryFilterPanel
      isOpen={categoryPanelOpen}
      onClose={() => setCategoryPanelOpen(false)}
      typeGroups={displayTypeGroups}
      selectedTypes={displaySelectedTypes}
      toggleSelectType={handleToggleSelectType}
      clearSelectedTypes={handleClearSelectedTypes}
      levelGroups={displayLevelGroups}
      selectedLevels={displaySelectedLevels}
      toggleSelectLevel={handleToggleSelectLevel}
      clearSelectedLevels={handleClearSelectedLevels}
    />
  </div>
)}

         {isWalkMode && (
  <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 bg-white text-slate-700 text-[11px] px-3 py-1.5 rounded-lg shadow-lg">
    Modo caminar: <span className="font-semibold">W A S D</span> para moverte · arrastrá el mouse para mirar
  </div>
)}
            {(measureMode || fragmentsMeasureMode) && (
              <>
                <svg
                  className="absolute inset-0 z-20 pointer-events-none"
                  style={{ width: '100%', height: '100%' }}
                >
                  {displayMeasurements.map((m) => {
                    const p1 = m.points[0];
                    const p2 = m.points[1];
                    const hasLine = p2 && p1?.screen && p2?.screen;

                    return (
                      <g key={m.id}>
                        {hasLine && (
                        
                          <line
                            x1={p1!.screen!.x} y1={p1!.screen!.y}
                            x2={p2!.screen!.x} y2={p2!.screen!.y}
                            stroke="#0056b3" strokeWidth={2} strokeOpacity={0.6}
                          />
                        )}
                        {m.points.map((pt, i) => {
                         
                          const isBeingDragged = fragmentsDraggingPoint?.id === m.id && fragmentsDraggingPoint?.pointIndex === i;
                          if (isBeingDragged || !pt.screen) return null;
                          return <MeasurePointMarker key={i} x={pt.screen.x} y={pt.screen.y} index={i} />;
                        })}
                      </g>
                    );
                  })}

                  {hoverEdge && (
                    <line
                      x1={hoverEdge.a.x} y1={hoverEdge.a.y}
                      x2={hoverEdge.b.x} y2={hoverEdge.b.y}
                      stroke="#3b82f6"
                      strokeWidth={4}
                      strokeLinecap="round"
                      opacity={0.7}
                    />
                  )}
                  {fragmentsHoverEdge && (
                    <line
                      x1={fragmentsHoverEdge.a.x} y1={fragmentsHoverEdge.a.y}
                      x2={fragmentsHoverEdge.b.x} y2={fragmentsHoverEdge.b.y}
                      stroke="#2dd4bf"
                      strokeWidth={4}
                      strokeLinecap="round"
                      opacity={0.85}
                    />
                  )}
                  {(() => {
            
                    const pending = displayMeasurements.find((m) => m.points.length === 1);
                    const hover = measurements.length > 0 ? measureHoverPoint : fragmentsMeasureHoverPoint;
                    if (!pending?.points[0]?.screen || !hover?.screen) return null;
                    return (
                      <line
                        x1={pending.points[0].screen.x} y1={pending.points[0].screen.y}
                        x2={hover.screen.x} y2={hover.screen.y}
                        stroke="#0056b3" strokeWidth={2} strokeDasharray="6 4" opacity={0.8}
                      />
                    );
                  })()}
                </svg>

              
                {measureHoverPoint?.screen && (
                  <SnapIcon x={measureHoverPoint.screen.x} y={measureHoverPoint.screen.y} snapType={measureHoverPoint.snapType ?? 'none'} />
                )}
                {fragmentsMeasureHoverPoint?.screen && (
                  <MeasureRingCursor x={fragmentsMeasureHoverPoint.screen.x} y={fragmentsMeasureHoverPoint.screen.y} snapType={fragmentsMeasureHoverPoint.snapType ?? 'none'} color={fragmentsMeasureHoverColor} />
                )}

                {displayMeasurements.map((m) => {
                  const p1 = m.points[0];
                  const p2 = m.points[1];
                  if (!p2 || !p1?.screen || !p2.screen || m.distance === null) return null;
                  const midX = (p1.screen.x + p2.screen.x) / 2;
                  const midY = (p1.screen.y + p2.screen.y) / 2;
                 
                  return (
                    <div
                      key={m.id}
                      ref={(el) => handleRegisterMeasureLabelEl(m.id, el)}
                      className="absolute left-0 top-0 z-30"
                      style={{ transform: `translate(${midX}px, ${midY}px)`, willChange: 'transform' }}
                    >
                      <DistanceLabelWithDelete
                        x={0}
                        y={0}
                        distance={m.distance}
                        onDelete={() => handleRemoveMeasurement(m.id)}
                      />
                    </div>
                  );
                })}

                {displayMeasurements.length > 0 && (
  <div className="absolute top-10 left-1/2 -translate-x-1/2 z-30 bg-white/95 backdrop-blur-md border border-gray-200 text-gray-700 text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-2.5 shadow-xl">
    <Ruler size={13} className="text-[#0056b3] flex-shrink-0" />
    <button
      onClick={() => { clearMeasurement(); exitMeasureMode(); clearFragmentsMeasurement(); exitFragmentsMeasureMode(); }}
      className="text-[11px] text-[#0056b3] hover:text-[#004494] font-medium"
    >
      Eliminar medida
    </button>
  </div>
)}
              </>
            )}

            {(crossMode || fragmentsCrossMode) && (
              <>
               
                <svg
                  className="absolute inset-0 z-40 pointer-events-none"
                  style={{ width: '100%', height: '100%' }}
                >
                  {displayCrosses.map((c) => {
                    
                    if (!c.centerScreen) return null;
                    return (
                      <g key={c.id}>
                        {c.uNegScreen && c.uPosScreen && (
                          <line
                            x1={c.uNegScreen.x} y1={c.uNegScreen.y}
                            x2={c.uPosScreen.x} y2={c.uPosScreen.y}
                            stroke="#22c55e" strokeWidth={3} strokeOpacity={0.9}
                          />
                        )}
                        {c.vNegScreen && c.vPosScreen && (
                          <line
                            x1={c.vNegScreen.x} y1={c.vNegScreen.y}
                            x2={c.vPosScreen.x} y2={c.vPosScreen.y}
                            stroke="#0056b3" strokeWidth={3} strokeOpacity={0.9}
                          />
                        )}
                        {[c.uPosScreen, c.uNegScreen, c.vPosScreen, c.vNegScreen].map((p, i) => (
                          p && <circle key={i} cx={p.x} cy={p.y} r={4} fill="#fff" stroke="#0056b3" strokeWidth={1.5} />
                        ))}
                        {c.depthPosScreen && (
                          <>
                            <line
                              x1={c.centerScreen.x} y1={c.centerScreen.y}
                              x2={c.depthPosScreen.x} y2={c.depthPosScreen.y}
                              stroke="#ef4444" strokeWidth={3} strokeOpacity={0.9}
                            />
                            <circle cx={c.depthPosScreen.x} cy={c.depthPosScreen.y} r={4} fill="#fff" stroke="#ef4444" strokeWidth={1.5} />
                          </>
                        )}
                        <circle
                          cx={c.centerScreen.x} cy={c.centerScreen.y} r={7}
                          fill={displayDraggingCrossId === c.id ? '#f97316' : '#0056b3'}
                          stroke="#fff" strokeWidth={2}
                        />
                      </g>
                    );
                  })}
                </svg>

                {displayCrosses.map((c) => {
                  if (!c.centerScreen) return null;
         
                  return (
                    <React.Fragment key={c.id}>
                      <div
                        ref={(el) => handleRegisterCrossPosEl(`${c.id}:center`, el)}
                        className="absolute left-0 top-0"
                        style={{ transform: `translate(${c.centerScreen.x}px, ${c.centerScreen.y}px)`, willChange: 'transform' }}
                      >
                        <CenterDeleteHandle x={0} y={0} onDelete={() => handleRemoveCross(c.id)} />
                      </div>
                      {(c.uPosScreen || c.uNegScreen) && (() => {
                        const pos = crossLabelPos(c.centerScreen!, c.uPosScreen, c.uNegScreen);
                        if (!pos) return null;
                        return (
                          <div
                            ref={(el) => handleRegisterCrossPosEl(`${c.id}:u`, el)}
                            className="absolute left-0 top-0 z-50"
                            style={{ transform: `translate(${pos.x}px, ${pos.y}px)`, willChange: 'transform' }}
                          >
                            <DistanceLabel x={0} y={0} distance={c.lengthU} color="#22c55e" />
                          </div>
                        );
                      })()}
                      {(c.vPosScreen || c.vNegScreen) && (() => {
                        const pos = crossLabelPos(c.centerScreen!, c.vPosScreen, c.vNegScreen);
                        if (!pos) return null;
                        return (
                          <div
                            ref={(el) => handleRegisterCrossPosEl(`${c.id}:v`, el)}
                            className="absolute left-0 top-0 z-50"
                            style={{ transform: `translate(${pos.x}px, ${pos.y}px)`, willChange: 'transform' }}
                          >
                            <DistanceLabel x={0} y={0} distance={c.lengthV} color="#0056b3" />
                          </div>
                        );
                      })()}
                      {c.depthPosScreen && c.lengthDepth !== null && (() => {
                        const pos = crossLabelPos(c.centerScreen!, c.depthPosScreen, null);
                        if (!pos) return null;
                        return (
                          <div
                            ref={(el) => handleRegisterCrossPosEl(`${c.id}:depth`, el)}
                            className="absolute left-0 top-0 z-50"
                            style={{ transform: `translate(${pos.x}px, ${pos.y}px)`, willChange: 'transform' }}
                          >
                            <DistanceLabel x={0} y={0} distance={c.lengthDepth!} color="#ef4444" />
                          </div>
                        );
                      })()}
                    </React.Fragment>
                  );
                })}

                {displayCrosses.length > 0 && (
  <div className="absolute top-10 left-1/2 -translate-x-1/2 z-30 bg-white/95 backdrop-blur-md border border-gray-200 text-gray-700 text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-2.5 shadow-xl">
    <Crosshair size={13} className="text-[#0056b3] flex-shrink-0" />
    <button
      onClick={() => { clearCross(); exitCrossMode(); clearFragmentsCross(); exitFragmentsCrossMode(); }}
      className="text-[11px] text-[#0056b3] hover:text-[#004494] font-medium"
    >
      Eliminar medida
    </button>
  </div>
)}
              </>
            )}

            {paintMode && (
              <div className="absolute top-10 left-1/2 -translate-x-1/2 z-30 bg-white/95 backdrop-blur-md border border-gray-200 text-gray-700 text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-2.5 shadow-xl">
                <Paintbrush size={13} className="text-[#0056b3] flex-shrink-0" />
                <div className="flex items-center gap-1.5">
                  {PAINT_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setPaintColor(c)}
                      className="w-4 h-4 rounded-full border-2 transition-colors"
                      style={{ backgroundColor: c, borderColor: paintColor === c ? '#0056b3' : 'transparent' }}
                      title={c}
                    />
                  ))}
                </div>
                {strokes.length > 0 && (
                  <button
                    onClick={clearStrokes}
                    className="text-[11px] text-[#0056b3] hover:text-[#004494] font-medium"
                  >
                    Borrar todo
                  </button>
                )}
                <button
                  onClick={exitPaintMode}
                  className="text-gray-400 hover:text-gray-700 ml-auto"
                  title="Salir de pintar"
                >
                  <XIcon size={13} />
                </button>
              </div>
            )}

            {sectionEnabled && (
              <div className="absolute top-10 left-1/2 -translate-x-1/2 z-30 bg-white/95 backdrop-blur-md border border-gray-200 text-gray-700 text-xs px-2.5 py-1.5 rounded-lg shadow-xl flex flex-col gap-1.5 min-w-[230px]">
                <div className="flex items-center gap-2">
                  <Scissors size={12} className="text-[#0056b3] flex-shrink-0" />

                  <div className="flex gap-1">
                    {(['down', 'front', 'side'] as const).map((axis) => (
                      <button
                        key={axis}
                        onClick={() => setSectionAxis(axis)}
                        className={`px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
                          sectionAxis === axis
                            ? 'bg-[#0056b3] text-white'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {axis === 'down' ? 'Horizontal' : axis === 'front' ? 'Frontal' : 'Lateral'}
                      </button>
                    ))}
                  </div>

                  <div className="w-px h-3.5 bg-gray-200" />

                  <button
                    onClick={toggleSectionFlipped}
                    className={`text-[11px] font-medium px-1.5 py-0.5 rounded transition-colors ${
                      sectionFlipped ? 'bg-[#0056b3] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                    title="Invertir lado del corte"
                  >
                    Invertir
                  </button>

                  <div className="w-px h-3.5 bg-gray-200" />

                  <button
                    onClick={resetSection}
                    className="text-[11px] text-[#0056b3] hover:text-[#004494] font-medium"
                  >
                    Reiniciar
                  </button>

                  <button
                    onClick={toggleSectionEnabled}
                    className="text-gray-400 hover:text-gray-700 ml-auto"
                    title="Salir de corte"
                  >
                    <XIcon size={13} />
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] text-gray-400 w-6">0%</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={0.5}
                    value={sectionPosition}
                    onChange={(e) => setSectionPosition(Number(e.target.value))}
                    className="flex-1 accent-[#0056b3]"
                  />
                  <span className="text-[9px] text-gray-400 w-8 text-right">100%</span>
                </div>
              </div>
            )}

            {activeEntity && displayPopupVisible && displayPopupScreenPos && (
              <div
                className="absolute z-40 -translate-x-1/2 -translate-y-full"
                style={{ left: displayPopupScreenPos.x, top: displayPopupScreenPos.y - 10 }}
              >
                <div className="bg-white rounded-xl shadow-2xl px-2 py-2 relative">
                  <button
                    onClick={handleDeselectEntity}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-white rounded-full shadow flex items-center justify-center text-gray-500 hover:text-gray-800"
                  >
                    <XIcon size={9} />
                  </button>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleHideActiveEntity}
                      className="flex flex-col items-center gap-0.5 text-gray-600 hover:text-[#0056b3]"
                    >
                      <EyeOff size={14} />
                      <span className="text-[10px] font-medium">Ocultar</span>
                    </button>

                    <button
                      onClick={handleIsolateActiveEntity}
                      className={`flex flex-col items-center gap-0.5 ${
                        isActiveEntityIsolated ? 'text-[#0056b3]' : 'text-gray-600 hover:text-[#0056b3]'
                      }`}
                    >
                      <Focus size={14} />
                      <span className="text-[10px] font-medium">Aislar</span>
                    </button>

                                  <button
  onClick={() => {
    if (displayPopupScreenPos) armCutAt(displayPopupScreenPos.x, displayPopupScreenPos.y);
    handleDismissPopup(); // saca el popup Ocultar/Aislar/Cortar al empezar a cortar
  }}
  className={`flex flex-col items-center gap-0.5 ${
    cutArmed ? 'text-[#0056b3]' : 'text-gray-600 hover:text-[#0056b3]'
  }`}
>
                      <Scissors size={14} />
                      <span className="text-[10px] font-medium">Cortar</span>
                    </button>

                    {onViewElementInMetrados && (
                      <button
                        onClick={handleViewElementInMetrados}
                        className="flex flex-col items-center gap-0.5 text-gray-600 hover:text-[#0056b3]"
                      >
                        <Table2 size={14} />
                        <span className="text-[10px] font-medium">Partida</span>
                      </button>
                    )}
                  </div>
                </div>
                <div className="w-2 h-2 bg-white rotate-45 mx-auto -mt-1 shadow-sm" />
              </div>
            )}

            {cutArmed && scissorsScreen && (
  <div
    className="absolute z-40 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
    style={{ left: scissorsScreen.x, top: scissorsScreen.y }}
  >
    <div
      className={`w-9 h-9 rounded-full flex items-center justify-center shadow-lg border-2 border-white transition-colors ${
        cutDragging ? 'bg-[#004494] cursor-grabbing' : 'bg-[#0056b3] cursor-grab'
      }`}
      title="Arrastrá para definir el corte"
    >
      <Scissors size={16} className="text-white" />
    </div>
    <button
      onClick={exitCut}
      className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-white rounded-full shadow flex items-center justify-center text-gray-500 hover:text-gray-800 pointer-events-auto"
      title="Salir del corte"
    >
      <XIcon size={9} />
    </button>
  </div>
)}
          </>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="text-center text-gray-700">
              <div className="w-12 h-12 border-4 border-[#0056b3] border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="mt-4">Procesando modelo...</p>
              <p className="text-sm text-gray-500 mt-2">{Math.round(progress)}%</p>
              <p className="text-xs text-gray-400 mt-1">{debugInfo}</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-red-500/90 text-white p-6 rounded-xl text-center z-10 max-w-lg w-full">
            <AlertCircle className="inline-block mr-2 mb-2" size={24} />
            <p className="font-bold">Error al cargar el modelo</p>
            <p className="text-sm mt-2">{error}</p>
            <p className="text-xs opacity-75 mt-2">Revisa la consola (F12)</p>
          </div>
        )}

        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />

        {pendingScreenshot && (
          <div
            className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-6"
            onClick={handleCloseScreenshotModal}
          >
            <div
              className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative bg-gray-100">
                <img
                  src={pendingScreenshot.previewUrl}
                  alt="Captura del visor"
                  className="w-full max-h-64 object-contain"
                />
                <button
                  onClick={handleCloseScreenshotModal}
                  disabled={savingScreenshot}
                  className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-white/90 text-gray-600 hover:bg-white disabled:opacity-50"
                  title="Cancelar"
                >
                  <XIcon size={14} />
                </button>
              </div>

              <div className="p-4">
                <p className="text-sm font-semibold text-gray-800 mb-1">Captura lista</p>
                <p className="text-xs text-gray-500 mb-4">¿Qué quieres hacer con esta imagen?</p>

                {saveScreenshotError && (
                  <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-2.5 py-2 mb-3">
                    <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                    <span>{saveScreenshotError}</span>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <button
                    onClick={handleSaveScreenshotToProject}
                    disabled={!projectId || savingScreenshot}
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-md bg-[#0056b3] text-white text-sm font-semibold hover:bg-[#004494] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title={!projectId ? 'No se pudo identificar el proyecto para guardar el archivo' : undefined}
                  >
                    {savingScreenshot ? (
                      <>
                        <RefreshCw size={15} className="animate-spin" />
                        Guardando...
                      </>
                    ) : (
                      <>
                        <FolderOpen size={15} />
                        Guardar en el proyecto
                      </>
                    )}
                  </button>

                  <button
                    onClick={downloadScreenshot}
                    disabled={savingScreenshot}
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-md bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200 disabled:opacity-50 transition-colors"
                  >
                    <Download size={15} />
                    Descargar al PC
                  </button>
                </div>

                {!projectId && (
                  <p className="text-[11px] text-gray-400 mt-3 text-center">
                    Guardar en el proyecto no está disponible en esta vista.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export default IFCViewer;