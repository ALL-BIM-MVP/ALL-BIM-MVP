import React, { forwardRef, useImperativeHandle, useState, useEffect } from 'react';
import { AlertCircle, Footprints, Camera, Moon, Sun, Ruler, X as XIcon, Diamond, Triangle, Square, Circle, Scissors, EyeOff, Eye, Focus, Search, Crosshair, Paintbrush, Layers, Download, FolderOpen, RefreshCw, SeparatorHorizontal } from 'lucide-react';
import { useIfcModel } from './hooks/useIfcModel';
import { ViewPreset } from './types';
import PropertiesPanel from "./PropertiesPanel/PropertiesPanel";
import ViewCube3D from './Viewcube3d';
import CategoryFilterPanel from './CategoryFilterPanel';
import { projectService } from '../../services/project.service';

interface IFCViewerProps {
  fileBuffer: ArrayBuffer | null;
  projectId?: number;
  onFileUploaded?: () => void;
  // Cuánto restarle a la posición horizontal del ViewCube, en píxeles —
  // pasar el ancho del panel lateral superpuesto (ej. Metrados) para que
  // el cubo no quede tapado y se deslice junto con el panel al abrirlo,
  // cerrarlo, o cambiar su ancho. 0 (default) si no hay panel superpuesto.
  viewCubeRightOffset?: number;
}

export interface IFCViewerHandle {
  selectEntityById: (expressId: number) => void;
  selectByIdOrGuid: (value: string) => Promise<boolean>;
  isolateElementsByIds: (expressIds: number[]) => void;
  selectGroupInViewer: (expressIds: number[]) => void;
  clearIsolation: () => void;
}

const InfoRow: React.FC<{ label: string; value: string; multiline?: boolean }> = ({ label, value, multiline }) => (
  <div className="flex justify-between gap-3">
    <span className="text-gray-400 flex-shrink-0">{label}</span>
    <span className={`text-cyan-300 text-right ${multiline ? 'break-all' : 'truncate'}`}>{value || '—'}</span>
  </div>
);

const DistanceLabel: React.FC<{ x: number; y: number; distance: number }> = ({ x, y, distance }) => (
  <div
    className="absolute z-30 -translate-x-1/2 -translate-y-full pointer-events-none"
    style={{ left: x, top: y - 10 }}
  >
    <div className="bg-[#0056b3] text-white text-xs font-semibold px-2 py-1 rounded-md shadow-lg whitespace-nowrap">
      {distance.toFixed(3)} m
    </div>
  </div>
);

const DistanceLabelWithDelete: React.FC<{ x: number; y: number; distance: number; onDelete: () => void }> = ({ x, y, distance, onDelete }) => (
  <div
    className="absolute z-30 -translate-x-1/2 -translate-y-full"
    style={{ left: x, top: y - 10 }}
  >
    <div className="relative bg-[#0056b3] text-white text-xs font-semibold px-2 py-1 rounded-md shadow-lg whitespace-nowrap">
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

const SNAP_COLORS: Record<string, { fill: string; stroke: string }> = {
  vertex: { fill: '#facc15', stroke: '#ca8a04' },
  edge: { fill: '#22d3ee', stroke: '#0891b2' },
  face: { fill: '#94a3b8', stroke: '#64748b' },
  face_center: { fill: '#94a3b8', stroke: '#64748b' },
  none: { fill: 'none', stroke: '#94a3b8' },
};

const SnapMarker: React.FC<{ x: number; y: number; snapType?: string }> = ({ x, y, snapType }) => {
  const type = snapType ?? 'none';
  const colors = SNAP_COLORS[type] ?? SNAP_COLORS.none;

  if (type === 'vertex') {
    const s = 6;
    return (
      <rect
        x={x - s} y={y - s} width={s * 2} height={s * 2}
        fill={colors.fill} stroke={colors.stroke} strokeWidth={1.5}
        opacity={0.95}
      />
    );
  }

  if (type === 'edge') {
    const s = 6;
    return (
      <rect
        x={x - s} y={y - s} width={s * 2} height={s * 2}
        fill={colors.fill} stroke={colors.stroke} strokeWidth={1.5}
        opacity={0.95}
        transform={`rotate(45 ${x} ${y})`}
      />
    );
  }

  return (
    <circle
      cx={x} cy={y}
      r={type === 'none' ? 5 : 7}
      fill={colors.fill} stroke={colors.stroke} strokeWidth={2}
      opacity={0.85}
    />
  );
};

const PAINT_COLORS = ['#ff3b30', '#34c759', '#0056b3', '#ffcc00', '#ffffff'];

const IFCViewer = forwardRef<IFCViewerHandle, IFCViewerProps>(({ fileBuffer, projectId, onFileUploaded, viewCubeRightOffset = 0 }, ref) => {
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
    crossMode,
    enableAndArm,
    exitCrossMode,
    crosses,
    clearCross,
    removeCross,
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

    hiddenTypes,
    hiddenElementIds,
    isolatedType,
    toggleHideType,
    toggleIsolateType,
    clearIsolation,
    clearAll,
  } = useIfcModel(fileBuffer);

  useImperativeHandle(ref, () => ({
    selectEntityById: (expressId: number) => selectEntityById(expressId),
    selectByIdOrGuid: (value: string) => selectByIdOrGuid(value),
    isolateElementsByIds: (expressIds: number[]) => isolateElementsByIds(expressIds),
    selectGroupInViewer: (expressIds: number[]) => selectGroupInViewer(expressIds),
    clearIsolation: () => clearIsolation(),
  }));

  const [panelOpen, setPanelOpen] = useState(false);
  const [categoryPanelOpen, setCategoryPanelOpen] = useState(false);
  // Antes solo abría el panel al seleccionar un elemento, pero nunca lo
  // cerraba al deseleccionar (ej. al tocar la X del popup flotante
  // Ocultar/Aislar/Cortar) — el panel se quedaba abierto y, sin
  // elemento, caía en su modo "sin selección" = buscador general
  // ("Buscar en el modelo"), apareciendo sin que nadie lo pidiera.
  useEffect(() => {
    setPanelOpen(!!selectedEntity);
    setCategoryPanelOpen(false);
  }, [selectedEntity]);

  const [rulerMenuOpen, setRulerMenuOpen] = useState(false);

  const [savingScreenshot, setSavingScreenshot] = useState(false);
  const [saveScreenshotError, setSaveScreenshotError] = useState<string | null>(null);

  const handleSelectMeasure = () => {
    if (crossMode) exitCrossMode();
    if (paintMode) exitPaintMode();
    enableAndArmMeasure();
    setRulerMenuOpen(false);
  };

  const handleSelectCross = () => {
    if (measureMode) exitMeasureMode();
    if (paintMode) exitPaintMode();
    enableAndArm();
    setRulerMenuOpen(false);
  };

  const handleTogglePaint = () => {
    if (paintMode) {
      exitPaintMode();
      return;
    }
    if (measureMode) exitMeasureMode();
    if (crossMode) exitCrossMode();
    togglePaintMode();
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

  // Cubre TANTO aislamiento (ver solo X) COMO ocultamiento puntual (ver
  // todo MENOS X) — antes solo miraba aislamiento, así que si ocultabas
  // un elemento con "Ocultar" no había forma de volver a mostrarlo: el
  // botón "Mostrar todo" ni aparecía.
  const hasAnyIsolation =
    isolatedElementId !== null ||
    isolatedType !== null ||
    (isolatedElementIds !== null && isolatedElementIds.size > 0) ||
    selectedTypes.size > 0 ||
    hiddenElementIds.size > 0 ||
    hiddenTypes.size > 0;

  return (
    <div className="flex h-full w-full">
      <div
        ref={containerRef}
        className="bg-[#EEEEEE] flex-1 relative"
        style={{ minHeight: '400px' }}
      >
        {ready && (
          <>
            <ViewCube3D onSelect={setPresetView} anchorRef={containerRef} rightOffset={viewCubeRightOffset} />

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
  title="Filtrar por categoría"
>
  <Layers size={16} />
</button>
              <button
                onClick={toggleSectionEnabled}
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

              <div className="relative">
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

              {hasAnyIsolation && (
                <button
                  onClick={clearAll}
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
                  entity={selectedEntity}
                  onSelectResult={(id) => selectEntityById(id)}
                  onDeselect={clearSelection}
                />
              </div>
            )}

              {categoryPanelOpen && (
  <div className="absolute top-14 left-8 z-50">
    <CategoryFilterPanel
      isOpen={categoryPanelOpen}
      onClose={() => setCategoryPanelOpen(false)}
      typeGroups={typeGroups}
      selectedTypes={selectedTypes}
      toggleSelectType={toggleSelectType}
      clearSelectedTypes={clearSelectedTypes}
    />
  </div>
)}

            {isWalkMode && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-black/70 text-white text-xs px-4 py-2 rounded-lg">
                Modo caminar: <span className="font-semibold">W A S D</span> para moverte · arrastrá el mouse para mirar
              </div>
            )}

            {measureMode && (
              <>
                <svg
                  className="absolute inset-0 z-20 pointer-events-none"
                  style={{ width: '100%', height: '100%' }}
                >
                  {measurements.map((m) => {
                    const p1 = m.points[0];
                    const p2 = m.points[1];
                    const hasLine = p2 && p1?.screen && p2?.screen;
                    const tickAngle = hasLine
                      ? Math.atan2(p2!.screen!.y - p1!.screen!.y, p2!.screen!.x - p1!.screen!.x) + Math.PI / 2
                      : 0;
                    const tickLen = 6;
                    const tickDx = Math.cos(tickAngle) * tickLen;
                    const tickDy = Math.sin(tickAngle) * tickLen;

                    return (
                      <g key={m.id}>
                        {hasLine && (
                          <>
                            <line
                              x1={p1!.screen!.x} y1={p1!.screen!.y}
                              x2={p2!.screen!.x} y2={p2!.screen!.y}
                              stroke="#0056b3" strokeWidth={2}
                            />
                            <line
                              x1={p1!.screen!.x - tickDx} y1={p1!.screen!.y - tickDy}
                              x2={p1!.screen!.x + tickDx} y2={p1!.screen!.y + tickDy}
                              stroke="#0056b3" strokeWidth={2}
                            />
                            <line
                              x1={p2!.screen!.x - tickDx} y1={p2!.screen!.y - tickDy}
                              x2={p2!.screen!.x + tickDx} y2={p2!.screen!.y + tickDy}
                              stroke="#0056b3" strokeWidth={2}
                            />
                          </>
                        )}
                        {m.points.map((pt, i) =>
                          pt.screen ? <SnapMarker key={i} x={pt.screen.x} y={pt.screen.y} snapType={pt.snapType} /> : null
                        )}
                      </g>
                    );
                  })}

                  {hoverEdge && (
                    <line
                      x1={hoverEdge.a.x} y1={hoverEdge.a.y}
                      x2={hoverEdge.b.x} y2={hoverEdge.b.y}
                      stroke="#3b82f6"
                      strokeWidth={3}
                      opacity={0.7}
                    />
                  )}
                  {measureHoverPoint?.screen && (
                    <SnapIcon x={measureHoverPoint.screen.x} y={measureHoverPoint.screen.y} snapType={measureHoverPoint.snapType ?? 'none'} />
                  )}
                </svg>

                {measurements.map((m) => {
                  const p1 = m.points[0];
                  const p2 = m.points[1];
                  if (!p2 || !p1?.screen || !p2.screen || m.distance === null) return null;
                  const midX = (p1.screen.x + p2.screen.x) / 2;
                  const midY = (p1.screen.y + p2.screen.y) / 2;
                  return (
                    <DistanceLabelWithDelete
                      key={m.id}
                      x={midX}
                      y={midY}
                      distance={m.distance}
                      onDelete={() => removeMeasurement(m.id)}
                    />
                  );
                })}

                {measurements.length > 0 && (
  <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 bg-black/85 text-white text-sm px-4 py-2 rounded-lg flex items-center gap-3 shadow-xl">
    <Ruler size={14} className="text-blue-300" />
    <button
      onClick={() => { clearMeasurement(); exitMeasureMode(); }}
      className="text-[11px] text-blue-300 hover:text-blue-200 font-medium"
    >
      Eliminar medida
    </button>
  </div>
)}
              </>
            )}

            {crossMode && (
              <>
                <svg
                  className="absolute inset-0 z-20 pointer-events-none"
                  style={{ width: '100%', height: '100%' }}
                >
                  {crosses.map((c) => {
                    const ready = c.centerScreen && c.uPosScreen && c.uNegScreen && c.vPosScreen && c.vNegScreen;
                    if (!ready) return null;
                    return (
                      <g key={c.id}>
                        <line
                          x1={c.uNegScreen!.x} y1={c.uNegScreen!.y}
                          x2={c.uPosScreen!.x} y2={c.uPosScreen!.y}
                          stroke="#22c55e" strokeWidth={2}
                        />
                        <line
                          x1={c.vNegScreen!.x} y1={c.vNegScreen!.y}
                          x2={c.vPosScreen!.x} y2={c.vPosScreen!.y}
                          stroke="#eab308" strokeWidth={2}
                        />
                        {[c.uPosScreen!, c.uNegScreen!, c.vPosScreen!, c.vNegScreen!].map((p, i) => (
                          <circle key={i} cx={p.x} cy={p.y} r={4} fill="#fff" stroke="#0056b3" strokeWidth={1.5} />
                        ))}
                        {c.depthPosScreen && (
                          <>
                            <line
                              x1={c.centerScreen!.x} y1={c.centerScreen!.y}
                              x2={c.depthPosScreen.x} y2={c.depthPosScreen.y}
                              stroke="#ef4444" strokeWidth={2} strokeDasharray="4 3"
                            />
                            <circle cx={c.depthPosScreen.x} cy={c.depthPosScreen.y} r={4} fill="#fff" stroke="#ef4444" strokeWidth={1.5} />
                          </>
                        )}
                        <circle cx={c.centerScreen!.x} cy={c.centerScreen!.y} r={7} fill="#0056b3" stroke="#fff" strokeWidth={2} />
                      </g>
                    );
                  })}
                </svg>

                {crosses.map((c) => {
                  if (!c.centerScreen) return null;
                  return (
                    <React.Fragment key={c.id}>
                      {c.uPosScreen && (
                        <DistanceLabelWithDelete
                          x={(c.uPosScreen.x + c.centerScreen.x) / 2}
                          y={(c.uPosScreen.y + c.centerScreen.y) / 2}
                          distance={c.lengthU}
                          onDelete={() => removeCross(c.id)}
                        />
                      )}
                      {c.vPosScreen && (
                        <DistanceLabel
                          x={(c.vPosScreen.x + c.centerScreen.x) / 2}
                          y={(c.vPosScreen.y + c.centerScreen.y) / 2}
                          distance={c.lengthV}
                        />
                      )}
                      {c.depthPosScreen && c.lengthDepth !== null && (
                        <DistanceLabel
                          x={(c.depthPosScreen.x + c.centerScreen.x) / 2}
                          y={(c.depthPosScreen.y + c.centerScreen.y) / 2}
                          distance={c.lengthDepth}
                        />
                      )}
                    </React.Fragment>
                  );
                })}

                {crosses.length > 0 && (
  <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 bg-black/85 text-white text-sm px-4 py-2 rounded-lg flex items-center gap-3 shadow-xl">
    <Crosshair size={14} className="text-yellow-300" />
    <button
      onClick={() => { clearCross(); exitCrossMode(); }}
      className="text-[11px] text-blue-300 hover:text-blue-200 font-medium"
    >
      Eliminar medida
    </button>
  </div>
)}
              </>
            )}

            {paintMode && (
              <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 bg-black/85 text-white text-sm px-4 py-2 rounded-lg flex items-center gap-3 shadow-xl">
                <Paintbrush size={14} />
                <div className="flex items-center gap-1.5">
                  {PAINT_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setPaintColor(c)}
                      className="w-5 h-5 rounded-full border-2 transition-colors"
                      style={{ backgroundColor: c, borderColor: paintColor === c ? '#ffffff' : 'transparent' }}
                      title={c}
                    />
                  ))}
                </div>
                {strokes.length > 0 && (
                  <button
                    onClick={clearStrokes}
                    className="text-[11px] text-blue-300 hover:text-blue-200 font-medium"
                  >
                    Borrar todo
                  </button>
                )}
                <button
                  onClick={exitPaintMode}
                  className="text-gray-400 hover:text-white"
                  title="Salir de pintar"
                >
                  <XIcon size={14} />
                </button>
              </div>
            )}

            {sectionEnabled && (
              <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 bg-black/85 text-white text-sm px-4 py-3 rounded-lg shadow-xl flex flex-col gap-2 min-w-[320px]">
                <div className="flex items-center gap-3">
                  <Scissors size={14} className="text-blue-300" />

                  <div className="flex gap-1">
                    {(['down', 'front', 'side'] as const).map((axis) => (
                      <button
                        key={axis}
                        onClick={() => setSectionAxis(axis)}
                        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                          sectionAxis === axis
                            ? 'bg-[#0056b3] text-white'
                            : 'bg-white/10 text-gray-300 hover:bg-white/20'
                        }`}
                      >
                        {axis === 'down' ? 'Horizontal' : axis === 'front' ? 'Frontal' : 'Lateral'}
                      </button>
                    ))}
                  </div>

                  <div className="w-px h-4 bg-white/20" />

                  <button
                    onClick={toggleSectionFlipped}
                    className={`text-xs font-medium px-2 py-1 rounded transition-colors ${
                      sectionFlipped ? 'bg-[#0056b3] text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'
                    }`}
                    title="Invertir lado del corte"
                  >
                    Invertir
                  </button>

                  <div className="w-px h-4 bg-white/20" />

                  <button
                    onClick={resetSection}
                    className="text-[11px] text-blue-300 hover:text-blue-200 font-medium"
                  >
                    Reiniciar
                  </button>

                  <button
                    onClick={toggleSectionEnabled}
                    className="text-gray-400 hover:text-white ml-1"
                    title="Salir de corte"
                  >
                    <XIcon size={14} />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400 w-8">0%</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={0.5}
                    value={sectionPosition}
                    onChange={(e) => setSectionPosition(Number(e.target.value))}
                    className="flex-1 accent-[#0056b3]"
                  />
                  <span className="text-[10px] text-gray-400 w-8 text-right">100%</span>
                </div>
              </div>
            )}

            {selectedEntity && popupVisible && popupScreenPos && (
              <div
                className="absolute z-40 -translate-x-1/2 -translate-y-full"
                style={{ left: popupScreenPos.x, top: popupScreenPos.y - 10 }}
              >
                <div className="bg-white rounded-xl shadow-2xl px-2 py-2 relative">
                  <button
                    onClick={clearSelection}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-white rounded-full shadow flex items-center justify-center text-gray-500 hover:text-gray-800"
                  >
                    <XIcon size={9} />
                  </button>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => { hideElementById(selectedEntity.expressId); clearSelection(); }}
                      className="flex flex-col items-center gap-0.5 text-gray-600 hover:text-[#0056b3]"
                    >
                      <EyeOff size={14} />
                      <span className="text-[10px] font-medium">Ocultar</span>
                    </button>

                    <button
                      onClick={() => isolateElementById(selectedEntity.expressId)}
                      className={`flex flex-col items-center gap-0.5 ${
                        isolatedElementId === selectedEntity.expressId ? 'text-[#0056b3]' : 'text-gray-600 hover:text-[#0056b3]'
                      }`}
                    >
                      <Focus size={14} />
                      <span className="text-[10px] font-medium">Aislar</span>
                    </button>

                    <button
                      onClick={toggleSectionEnabled}
                      className="flex flex-col items-center gap-0.5 text-gray-600 hover:text-[#0056b3]"
                    >
                      <Scissors size={14} />
                      <span className="text-[10px] font-medium">Cortar</span>
                    </button>
                  </div>
                </div>
                <div className="w-2 h-2 bg-white rotate-45 mx-auto -mt-1 shadow-sm" />
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