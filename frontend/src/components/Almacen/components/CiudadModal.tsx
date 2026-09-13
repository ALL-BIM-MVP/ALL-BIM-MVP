import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Building2, ChevronRight, Move, Pencil, Plus, RotateCw, Search, Tractor, Trash2, Warehouse, X } from 'lucide-react';
import { CityScene, HOUSE_TYPE_CONFIG, HouseType } from '../utils/CityScene';
import { BayPreviewScene, DEFAULT_ESTANTE_TIPO_ID, ESTANTE_TIPOS, EstanteTipo, WarehouseInteriorScene } from '../utils/WarehouseInteriorScene';

const TYPE_ORDER: HouseType[] = ['chico', 'mediano', 'grande'];
const TYPE_COLORS: Record<HouseType, string> = { chico: '#b3402c', mediano: '#2b5fa8', grande: '#2f8a5b' };
// Alto aprox. del chip de la etiqueta flotante (dos líneas): con -translate-y-full
// nunca puede quedar más arriba de esto, o se mete visualmente en la franja del header.
const LABEL_MIN_TOP = 72;

const GRID_MAX_ROWS = 5;
const GRID_MAX_COLS = 8;

interface HouseInfo {
  type: HouseType;
  nombre: string;
}

interface CiudadModalProps {
  onClose: () => void;
  // Cuando el modal se abre desde un ítem del ingreso, en vez de uso libre
  // te lleva a elegir una casilla puntual y confirmarla como su ubicación.
  pickMode?: { itemLabel: string; itemGlbFile?: File | null; onConfirm: (ubicacion: string) => void };
}

const CiudadModal: React.FC<CiudadModalProps> = ({ onClose, pickMode }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CityScene | null>(null);

  const [houses, setHouses] = useState<Record<string, HouseInfo>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placingType, setPlacingType] = useState<HouseType | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [labelPositions, setLabelPositions] = useState<Array<{ id: string; x: number; y: number }>>([]);

  const [view, setView] = useState<'ciudad' | 'interior'>('ciudad');
  const [interiorHouseId, setInteriorHouseId] = useState<string | null>(null);
  const interiorCanvasRef = useRef<HTMLCanvasElement>(null);
  const interiorContainerRef = useRef<HTMLDivElement>(null);
  const interiorSceneRef = useRef<WarehouseInteriorScene | null>(null);
  const [selectedBayId, setSelectedBayId] = useState<string | null>(null);
  const [viewingBayId, setViewingBayId] = useState<string | null>(null);
  const [selectedCasilla, setSelectedCasilla] = useState<{ code: string; row: number; col: number } | null>(null);
  const [casillaTagPos, setCasillaTagPos] = useState<{ x: number; y: number } | null>(null);
  const [objectScale, setObjectScale] = useState(1);
  const [objectRotationDeg, setObjectRotationDeg] = useState(0);
  const [bayLabelPositions, setBayLabelPositions] = useState<Array<{ id: string; x: number; y: number; scale: number }>>([]);
  const [bayTipos, setBayTipos] = useState<Record<string, string>>({});
  const [changingTipoFor, setChangingTipoFor] = useState<string | null>(null);
  const [customTipos, setCustomTipos] = useState<EstanteTipo[]>([]);
  const [addingNewBay, setAddingNewBay] = useState(false);
  const [placingBayType, setPlacingBayType] = useState<string | null>(null);

  const [buildingTipo, setBuildingTipo] = useState(false);
  const [newTipoNombre, setNewTipoNombre] = useState('');
  const [newTipoMontaje, setNewTipoMontaje] = useState<'pared' | 'piso'>('pared');
  const [newTipoRows, setNewTipoRows] = useState(3);
  const [newTipoCols, setNewTipoCols] = useState(5);
  const [newTipoAncho, setNewTipoAncho] = useState('1.4');
  const [newTipoAlto, setNewTipoAlto] = useState('1.2');
  const [newTipoColor, setNewTipoColor] = useState('#e3bd8d');
  const [gridPreview, setGridPreview] = useState<{ row: number; col: number } | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const previewSceneRef = useRef<BayPreviewScene | null>(null);

  const allTipos = [...ESTANTE_TIPOS, ...customTipos];
  const getEstanteTipo = (tipoId: string | undefined) => allTipos.find((t) => t.id === tipoId) ?? ESTANTE_TIPOS[0];

  // Filas/columnas efectivas: mientras se pasa el mouse por la grilla, el
  // preview (y el "N x M" de abajo) muestran ese tamaño en vez del guardado.
  const previewRows = gridPreview ? gridPreview.row + 1 : newTipoRows;
  const previewCols = gridPreview ? gridPreview.col + 1 : newTipoCols;
  const previewTipo: EstanteTipo = {
    id: 'preview',
    nombre: newTipoNombre,
    rows: previewRows,
    cols: previewCols,
    montaje: newTipoMontaje,
    color: newTipoColor,
    anchoCasilla: parseFloat(newTipoAncho) || undefined,
    altoCasilla: parseFloat(newTipoAlto) || undefined,
  };

  // Misma escena aislada para dos casos: armar/editar un tipo en el
  // constructor, o "Entrar al estante" a mirar uno ya puesto — en los dos
  // se muestra solo el mueble, flotando, sin la sala alrededor.
  const showingPreview = buildingTipo || !!viewingBayId;
  const viewingTipo = viewingBayId ? getEstanteTipo(bayTipos[viewingBayId]) : null;

  useEffect(() => {
    if (!showingPreview || !previewCanvasRef.current || !previewContainerRef.current) return;
    const scene = new BayPreviewScene(previewCanvasRef.current, previewContainerRef.current, () => {
      setCasillaTagPos(previewSceneRef.current?.getSelectedCellScreenPos() ?? null);
    });
    previewSceneRef.current = scene;
    return () => {
      scene.dispose();
      previewSceneRef.current = null;
    };
  }, [showingPreview]);

  // Elegir casilla solo tiene sentido si vinimos desde un ítem del ingreso Y
  // estamos mirando un estante puntual — en cualquier otro caso, clickear el
  // mueble no debería hacer nada.
  useEffect(() => {
    const scene = previewSceneRef.current;
    setSelectedCasilla(null);
    setCasillaTagPos(null);
    setObjectScale(1);
    setObjectRotationDeg(0);
    if (!scene) return;
    scene.setCustomObjectSource(pickMode?.itemGlbFile ?? null);
    scene.setSelectCellHandler(
      pickMode && viewingBayId
        ? (cell) => {
            setSelectedCasilla(cell);
            setObjectScale(1);
            setObjectRotationDeg(0);
          }
        : null
    );
  }, [showingPreview, viewingBayId, pickMode]);

  // Escala/rotación a mano del objeto ya puesto en la casilla elegida.
  useEffect(() => {
    if (selectedCasilla) previewSceneRef.current?.setObjectAdjustment(objectScale, objectRotationDeg);
  }, [selectedCasilla, objectScale, objectRotationDeg]);

  useEffect(() => {
    if (buildingTipo) previewSceneRef.current?.update(previewTipo);
    else if (viewingTipo) previewSceneRef.current?.update(viewingTipo);
    // previewTipo/viewingTipo se recalculan cada render; listar sus campos
    // evita reconstruir la geometría 60 veces por segundo (el resto del
    // modal re-renderiza todo el tiempo por la escena de fondo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildingTipo, newTipoNombre, newTipoMontaje, previewRows, previewCols, newTipoAncho, newTipoAlto, newTipoColor, viewingTipo]);

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;
    const scene = new CityScene(canvasRef.current, containerRef.current, {
      onSelectHouse: (id) => setSelectedId(id),
      onPlaced: (id, type) => {
        setHouses((prev) => ({ ...prev, [id]: { type, nombre: HOUSE_TYPE_CONFIG[type].nombre } }));
        setPlacingType(null);
        setSelectedId(id);
      },
      onMoved: () => setMovingId(null),
      onFrame: () => setLabelPositions(sceneRef.current?.getLabelPositions() ?? []),
    });
    sceneRef.current = scene;

    // Semilla del almacén inicial que la escena ya levanta al arrancar.
    setHouses(
      Object.fromEntries(
        scene.getHouses().map(({ id, type }) => [id, { type, nombre: HOUSE_TYPE_CONFIG[type].nombre }])
      )
    );

    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  // Escena del interior: se crea/destruye al entrar y salir del almacén
  // seleccionado (la escena "Ciudad" de arriba sigue viva de fondo, oculta,
  // para no perder posiciones/rotaciones de los almacenes al volver).
  useEffect(() => {
    if (view !== 'interior' || !interiorHouseId) return;
    const houseType = houses[interiorHouseId]?.type;
    if (!houseType || !interiorCanvasRef.current || !interiorContainerRef.current) return;

    const scene = new WarehouseInteriorScene(interiorCanvasRef.current, interiorContainerRef.current, houseType, {
      onSelectBay: (id) => {
        setSelectedBayId(id);
        if (!id) setChangingTipoFor(null);
      },
      onBayPlaced: (id, tipoId) => {
        setBayTipos((prev) => ({ ...prev, [id]: tipoId }));
        setPlacingBayType(null);
        setSelectedBayId(id);
      },
      onFrame: () => setBayLabelPositions(interiorSceneRef.current?.getLabelPositions() ?? []),
    });
    interiorSceneRef.current = scene;

    // Semilla del tipo de cada estante — por ahora todos arrancan con el mismo tipo.
    setBayTipos(
      Object.fromEntries(scene.getBayIds().map((id) => [id, scene.getBayTipoId(id) ?? DEFAULT_ESTANTE_TIPO_ID]))
    );

    return () => {
      scene.dispose();
      interiorSceneRef.current = null;
    };
  }, [view, interiorHouseId]);

  const enterInterior = () => {
    if (!selectedId) return;
    setInteriorHouseId(selectedId);
    setSelectedBayId(null);
    setChangingTipoFor(null);
    setBuildingTipo(false);
    setViewingBayId(null);
    setAddingNewBay(false);
    setPlacingBayType(null);
    setView('interior');
  };

  const backToCiudad = () => {
    setView('ciudad');
    setSelectedBayId(null);
    setChangingTipoFor(null);
    setBuildingTipo(false);
    setViewingBayId(null);
    setAddingNewBay(false);
    setPlacingBayType(null);
  };

  const pickNewBayType = (tipoId: string) => {
    setAddingNewBay(false);
    setPlacingBayType(tipoId);
    interiorSceneRef.current?.startPlacingNewBay(tipoId, allTipos);
  };

  const cancelPlacingBay = () => {
    setPlacingBayType(null);
    interiorSceneRef.current?.cancelPlacingNewBay();
  };

  const changeBayTipo = (bayId: string, tipoId: string) => {
    interiorSceneRef.current?.setBayTipo(bayId, tipoId, allTipos);
    setBayTipos((prev) => ({ ...prev, [bayId]: tipoId }));
    setChangingTipoFor(null);
  };

  const removeSelectedBay = () => {
    if (!selectedBayId) return;
    if (!window.confirm('¿Quitar este estante?')) return;
    interiorSceneRef.current?.removeBay(selectedBayId);
    setBayTipos((prev) => {
      const next = { ...prev };
      delete next[selectedBayId];
      return next;
    });
    setSelectedBayId(null);
  };

  const enterEstante = () => {
    if (selectedBayId) setViewingBayId(selectedBayId);
  };

  const backFromEstante = () => setViewingBayId(null);

  const openTipoBuilder = () => {
    setNewTipoNombre('');
    setNewTipoMontaje('pared');
    setNewTipoRows(3);
    setNewTipoCols(5);
    setNewTipoAncho('1.4');
    setNewTipoAlto('1.2');
    setNewTipoColor('#e3bd8d');
    setGridPreview(null);
    setBuildingTipo(true);
  };

  const saveTipoBuilder = () => {
    const nuevoTipo: EstanteTipo = {
      id: `custom-${Date.now()}`,
      nombre: newTipoNombre.trim() || 'Estante personalizado',
      rows: newTipoRows,
      cols: newTipoCols,
      color: newTipoColor,
      montaje: newTipoMontaje,
      anchoCasilla: parseFloat(newTipoAncho) || undefined,
      altoCasilla: parseFloat(newTipoAlto) || undefined,
    };
    setCustomTipos((prev) => [...prev, nuevoTipo]);
    setBuildingTipo(false);
    if (changingTipoFor) {
      interiorSceneRef.current?.setBayTipo(changingTipoFor, nuevoTipo.id, [...allTipos, nuevoTipo]);
      setBayTipos((prev) => ({ ...prev, [changingTipoFor]: nuevoTipo.id }));
      setChangingTipoFor(null);
    }
  };

  const focusBay = (id: string) => {
    setSelectedBayId(id);
    interiorSceneRef.current?.focusBay(id);
  };

  const startPlacing = (type: HouseType) => {
    setPlacingType(type);
    sceneRef.current?.startPlacing(type);
  };

  const cancelPlacing = () => {
    setPlacingType(null);
    sceneRef.current?.cancelPlacing();
  };

  const renameHouse = (id: string, nombre: string) => {
    setHouses((prev) => ({ ...prev, [id]: { ...prev[id], nombre } }));
  };

  const moveSelected = () => {
    if (!selectedId) return;
    setMovingId(selectedId);
    sceneRef.current?.startMoving(selectedId);
  };

  const cancelMoving = () => {
    setMovingId(null);
    sceneRef.current?.cancelMoving();
  };

  const rotateSelected = () => {
    if (selectedId) sceneRef.current?.rotateHouse(selectedId);
  };

  const removeSelected = () => {
    if (!selectedId) return;
    if (!window.confirm('¿Quitar este almacén?')) return;
    sceneRef.current?.removeHouse(selectedId);
    setHouses((prev) => {
      const next = { ...prev };
      delete next[selectedId];
      return next;
    });
    setSelectedId(null);
  };

  const selected = selectedId ? houses[selectedId] : null;

  // Portal a document.body: la página que abre este modal tiene un ancestro
  // con "@container" (container queries), y eso crea un containing block
  // nuevo para position:fixed — sin el portal, "fixed inset-0" queda encerrado
  // dentro del área de contenido en vez de tapar toda la pantalla (header
  // global incluido).
  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 pt-16">
      <div className="w-full h-full max-w-7xl max-h-[calc(100vh-5rem)] bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div className="flex items-center gap-1.5">
            {view === 'interior' ? (
              <button
                onClick={backToCiudad}
                className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700 text-sm font-semibold rounded-full px-3.5 py-1.5 hover:bg-gray-50"
              >
                <Building2 size={15} /> Ciudad
              </button>
            ) : (
              <span className="flex items-center gap-1.5 bg-blue-50 text-[#0056b3] text-sm font-semibold rounded-full px-3.5 py-1.5">
                <Building2 size={15} /> Ciudad
              </span>
            )}
            {view === 'interior' && interiorHouseId && (
              <>
                <ChevronRight size={14} className="text-gray-300" />
                <span className="flex items-center gap-1.5 bg-blue-50 text-[#0056b3] text-sm font-semibold rounded-full px-3.5 py-1.5">
                  <Warehouse size={15} /> {houses[interiorHouseId]?.nombre}
                </span>
              </>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-full p-1.5">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 flex min-h-0">
          <div ref={containerRef} className={`relative flex-1 min-w-0 ${view === 'interior' ? 'hidden' : ''}`}>
            <canvas
              ref={canvasRef}
              className={`w-full h-full block ${placingType || movingId ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
            />

            {labelPositions.map(({ id, x, y }) => {
              const info = houses[id];
              if (!info) return null;
              return (
                <div
                  key={id}
                  className="absolute z-10 -translate-x-1/2 -translate-y-full flex flex-col items-center pointer-events-none"
                  style={{ left: x, top: Math.max(y, LABEL_MIN_TOP) }}
                >
                  <span className="bg-gray-800 text-white text-[8px] font-mono px-1.5 py-0.5 rounded-t-md">{info.type}</span>
                  <span className="bg-white shadow-md rounded-b-md rounded-tr-md px-2 py-0.5 text-xs font-semibold text-gray-800 flex items-center gap-1 pointer-events-auto -mt-px">
                    {editingId === id ? (
                      <input
                        autoFocus
                        value={info.nombre}
                        onChange={(e) => renameHouse(id, e.target.value)}
                        onBlur={() => setEditingId(null)}
                        onKeyDown={(e) => e.key === 'Enter' && setEditingId(null)}
                        className="outline-none text-xs font-semibold w-28"
                      />
                    ) : (
                      <>
                        {info.nombre}
                        <Pencil
                          size={10}
                          className="text-gray-400 hover:text-[#0056b3] cursor-pointer"
                          onClick={() => setEditingId(id)}
                        />
                      </>
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          {view === 'interior' && (
            <div ref={interiorContainerRef} className={`relative flex-1 min-w-0 ${showingPreview ? 'hidden' : ''}`}>
              <canvas
                ref={interiorCanvasRef}
                className={`w-full h-full block ${placingBayType ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
              />

              {bayLabelPositions.map(({ id, x, y, scale }) => (
                <div
                  key={id}
                  className="absolute z-10 flex flex-col items-center pointer-events-none"
                  style={{ left: x, top: Math.max(y, LABEL_MIN_TOP), transform: `translate(-50%, -100%) scale(${scale})`, transformOrigin: 'bottom center' }}
                >
                  <span className="bg-gray-800 text-white text-[6px] font-mono px-1 py-px rounded-t-sm">{id.toUpperCase()}</span>
                  <span className="bg-white shadow-md rounded-b-sm rounded-tr-sm px-1.5 py-px text-[10px] font-semibold text-gray-800 -mt-px">
                    {getEstanteTipo(bayTipos[id]).nombre}
                  </span>
                </div>
              ))}

              <span className="absolute bottom-3 left-3 text-[10px] font-mono text-gray-400 bg-white/70 rounded px-2 py-1">
                {placingBayType ? 'movete y clickeá para plantar · se engancha/apila si se pone verde' : 'arrastrar: orbitar · click derecho: mover · rueda: zoom'}
              </span>
            </div>
          )}

          {view === 'interior' && showingPreview && (
            <div ref={previewContainerRef} className="relative flex-1 min-w-0">
              <canvas
                ref={previewCanvasRef}
                className={`w-full h-full block ${pickMode && viewingBayId ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'}`}
              />
              {selectedCasilla && casillaTagPos && (
                <span
                  className="absolute z-10 -translate-x-1/2 -translate-y-full bg-[#0056b3] text-white text-xs font-semibold rounded-md px-2 py-1 pointer-events-none"
                  style={{ left: casillaTagPos.x, top: Math.max(casillaTagPos.y, LABEL_MIN_TOP) }}
                >
                  {selectedCasilla.code}
                </span>
              )}
              <span className="absolute bottom-3 left-3 text-[10px] font-mono text-gray-400 bg-white/70 rounded px-2 py-1">
                {pickMode && viewingBayId ? 'arrastrar: orbitar · click: elegir casilla · rueda: zoom' : 'arrastrar: orbitar · rueda: zoom'}
              </span>
            </div>
          )}

          <div className="w-80 flex-shrink-0 border-l border-gray-100 p-4 overflow-y-auto">
            <button className="flex items-center gap-2 w-full justify-center border border-gray-200 rounded-lg py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors mb-4">
              <Tractor size={15} /> Ampliar terreno
            </button>

            {view === 'interior' && viewingBayId && pickMode ? (
              <>
                <p className="text-sm font-semibold text-gray-800">Elegí la casilla</p>
                <p className="text-xs text-gray-400 mt-1 mb-3">Clickeá cualquier casilla del estante — es donde va a quedar guardado este ítem.</p>
                <div className="flex items-center gap-2 bg-blue-50 text-[#0056b3] rounded-lg px-3 py-2.5 text-sm font-medium mb-2">
                  <Warehouse size={15} className="flex-shrink-0" />
                  {houses[interiorHouseId ?? '']?.nombre} · {viewingBayId.toUpperCase()} — {selectedCasilla?.code ?? '···'}
                </div>
                {!selectedCasilla && (
                  <p className="text-xs text-gray-400 mb-3">Todavía no elegiste ninguna casilla.</p>
                )}
                {selectedCasilla && (
                  <div className="space-y-3 mb-3">
                    <label className="block">
                      <div className="flex items-center justify-between text-[11px] text-gray-400 uppercase tracking-wide">
                        <span>Escala</span>
                        <span className="font-mono text-gray-600">{objectScale.toFixed(2)}x</span>
                      </div>
                      <input
                        type="range"
                        min={0.3}
                        max={2}
                        step={0.05}
                        value={objectScale}
                        onChange={(e) => setObjectScale(parseFloat(e.target.value))}
                        className="w-full accent-[#0056b3]"
                      />
                    </label>
                    <label className="block">
                      <div className="flex items-center justify-between text-[11px] text-gray-400 uppercase tracking-wide">
                        <span>Rotación</span>
                        <span className="font-mono text-gray-600">{objectRotationDeg}°</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={355}
                        step={5}
                        value={objectRotationDeg}
                        onChange={(e) => setObjectRotationDeg(parseInt(e.target.value, 10))}
                        className="w-full accent-[#0056b3]"
                      />
                    </label>
                  </div>
                )}
                <button
                  disabled={!selectedCasilla}
                  onClick={() => {
                    if (!selectedCasilla || !interiorHouseId) return;
                    pickMode.onConfirm(`${houses[interiorHouseId]?.nombre} · ${viewingBayId.toUpperCase()} — ${selectedCasilla.code}`);
                    onClose();
                  }}
                  className="w-full bg-[#0056b3] text-white rounded-lg py-2.5 font-semibold hover:bg-[#004494] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Confirmar esta ubicación
                </button>
                <button
                  onClick={backFromEstante}
                  className="w-full mt-2 border border-gray-200 rounded-lg py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  ← Volver
                </button>
              </>
            ) : view === 'interior' && viewingBayId ? (
              <>
                <p className="text-sm font-semibold text-gray-800">{viewingBayId.toUpperCase()} · {getEstanteTipo(bayTipos[viewingBayId]).nombre}</p>
                <p className="text-xs text-gray-400 mt-1 mb-3">
                  {getEstanteTipo(bayTipos[viewingBayId]).rows * getEstanteTipo(bayTipos[viewingBayId]).cols} casillas
                </p>
                <button
                  onClick={backFromEstante}
                  className="w-full border border-gray-200 rounded-lg py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  ← Volver
                </button>
              </>
            ) : view === 'interior' && buildingTipo ? (
              <>
                <p className="text-sm font-semibold text-gray-800">Construir estante nuevo</p>
                <label className="block mt-4">
                  <span className="text-[11px] text-gray-400 uppercase tracking-wide">Nombre del estante</span>
                  <input
                    value={newTipoNombre}
                    onChange={(e) => setNewTipoNombre(e.target.value)}
                    placeholder="Ej. Estante de bolsas grandes"
                    className="w-full mt-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
                  />
                </label>

                <div className="grid grid-cols-2 gap-2 mt-4">
                  <button
                    onClick={() => setNewTipoMontaje('pared')}
                    className={`border rounded-lg py-2 text-sm font-medium transition-colors ${
                      newTipoMontaje === 'pared' ? 'border-[#0056b3] bg-blue-50 text-[#0056b3]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Estante (pared)
                  </button>
                  <button
                    onClick={() => setNewTipoMontaje('piso')}
                    className={`border rounded-lg py-2 text-sm font-medium transition-colors ${
                      newTipoMontaje === 'piso' ? 'border-[#0056b3] bg-blue-50 text-[#0056b3]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Pallets (piso)
                  </button>
                </div>

                <label className="flex items-center justify-between mt-4">
                  <span className="text-[11px] text-gray-400 uppercase tracking-wide">Color del estante</span>
                  <input
                    type="color"
                    value={newTipoColor}
                    onChange={(e) => setNewTipoColor(e.target.value)}
                    className="w-9 h-7 rounded border border-gray-200 cursor-pointer bg-transparent p-0.5"
                  />
                </label>

                <p className="text-[11px] text-gray-400 uppercase tracking-wide mt-4">Filas x columnas</p>
                <div
                  className="grid gap-1 mt-1.5"
                  style={{ gridTemplateColumns: `repeat(${GRID_MAX_COLS}, minmax(0, 1fr))` }}
                  onMouseLeave={() => setGridPreview(null)}
                >
                  {Array.from({ length: GRID_MAX_ROWS }).map((_, r) =>
                    Array.from({ length: GRID_MAX_COLS }).map((_, c) => {
                      const activeRows = gridPreview ? gridPreview.row + 1 : newTipoRows;
                      const activeCols = gridPreview ? gridPreview.col + 1 : newTipoCols;
                      const on = r < activeRows && c < activeCols;
                      return (
                        <button
                          key={`${r}-${c}`}
                          onMouseEnter={() => setGridPreview({ row: r, col: c })}
                          onClick={() => { setNewTipoRows(r + 1); setNewTipoCols(c + 1); setGridPreview(null); }}
                          className={`aspect-square rounded-sm border ${on ? 'bg-blue-100 border-[#0056b3]' : 'bg-gray-50 border-gray-200'}`}
                        />
                      );
                    })
                  )}
                </div>
                <p className="text-center text-sm font-mono text-[#0056b3] mt-2">{newTipoRows} x {newTipoCols}</p>

                <div className="grid grid-cols-2 gap-3 mt-4">
                  <label className="block">
                    <span className="text-[11px] text-gray-400 uppercase tracking-wide">Ancho casilla (m)</span>
                    <input
                      value={newTipoAncho}
                      onChange={(e) => setNewTipoAncho(e.target.value)}
                      className="w-full mt-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] text-gray-400 uppercase tracking-wide">Alto / prof. (m)</span>
                    <input
                      value={newTipoAlto}
                      onChange={(e) => setNewTipoAlto(e.target.value)}
                      className="w-full mt-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
                    />
                  </label>
                </div>

                <button onClick={saveTipoBuilder} className="w-full mt-4 bg-[#0056b3] text-white rounded-lg py-2.5 font-semibold hover:bg-[#004494] transition-colors">
                  Guardar plantilla
                </button>
                <button
                  onClick={() => setBuildingTipo(false)}
                  className="w-full mt-2 border border-gray-200 rounded-lg py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Cancelar
                </button>
              </>
            ) : view === 'interior' && changingTipoFor ? (
              <>
                <p className="text-sm font-semibold text-gray-800 mb-3">Elegí el tipo de estante</p>
                <div className="space-y-2">
                  {allTipos.map((tipo) => (
                    <button
                      key={tipo.id}
                      onClick={() => changeBayTipo(changingTipoFor, tipo.id)}
                      className={`w-full flex items-center gap-3 border rounded-lg px-3 py-2.5 text-left transition-colors ${
                        bayTipos[changingTipoFor] === tipo.id ? 'border-[#0056b3] bg-blue-50/40' : 'border-gray-200 hover:border-[#0056b3] hover:bg-blue-50/40'
                      }`}
                    >
                      <span className="w-8 h-8 rounded-md flex-shrink-0" style={{ backgroundColor: tipo.color }} />
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{tipo.nombre}</p>
                        <p className="text-xs text-gray-400">{tipo.rows * tipo.cols} casillas</p>
                      </div>
                    </button>
                  ))}
                  <button
                    onClick={openTipoBuilder}
                    className="w-full flex items-center gap-3 border border-dashed border-gray-300 rounded-lg px-3 py-2.5 text-left hover:border-[#0056b3] hover:bg-blue-50/40 transition-colors"
                  >
                    <span className="w-8 h-8 rounded-md bg-blue-50 text-[#0056b3] flex items-center justify-center flex-shrink-0">
                      <Plus size={16} />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Nuevo tipo de estante</p>
                      <p className="text-xs text-gray-400 font-mono">construir desde cero</p>
                    </div>
                  </button>
                </div>
                <button
                  onClick={() => setChangingTipoFor(null)}
                  className="w-full mt-3 border border-gray-200 rounded-lg py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Cancelar
                </button>
              </>
            ) : view === 'interior' && interiorHouseId && selectedBayId ? (
              <>
                <p className="text-sm font-semibold text-gray-800">{selectedBayId.toUpperCase()} · {getEstanteTipo(bayTipos[selectedBayId]).nombre}</p>
                <p className="text-xs text-gray-400 mt-1 mb-3">
                  {getEstanteTipo(bayTipos[selectedBayId]).rows * getEstanteTipo(bayTipos[selectedBayId]).cols} casillas
                </p>
                <button
                  onClick={enterEstante}
                  className="w-full bg-[#0056b3] text-white rounded-lg py-2.5 font-semibold hover:bg-[#004494] transition-colors"
                >
                  Entrar al estante →
                </button>
                <button
                  onClick={() => setChangingTipoFor(selectedBayId)}
                  className="w-full mt-2 border border-gray-200 rounded-lg py-2.5 font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cambiar tipo de estante
                </button>
                <button
                  onClick={removeSelectedBay}
                  className="w-full mt-2 flex items-center justify-center gap-1.5 border border-red-200 rounded-lg py-2.5 font-medium text-red-500 hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={14} /> Quitar estante
                </button>
              </>
            ) : view === 'interior' && addingNewBay ? (
              <>
                <p className="text-sm font-semibold text-gray-800 mb-1">Elegí el tipo de estante nuevo</p>
                <p className="text-xs text-gray-400 mb-3">Después lo ubicás vos en el piso, donde quieras.</p>
                <div className="space-y-2">
                  {allTipos.map((tipo) => (
                    <button
                      key={tipo.id}
                      onClick={() => pickNewBayType(tipo.id)}
                      className="w-full flex items-center gap-3 border border-gray-200 rounded-lg px-3 py-2.5 text-left hover:border-[#0056b3] hover:bg-blue-50/40 transition-colors"
                    >
                      <span className="w-8 h-8 rounded-md flex-shrink-0" style={{ backgroundColor: tipo.color }} />
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{tipo.nombre}</p>
                        <p className="text-xs text-gray-400">{tipo.rows * tipo.cols} casillas</p>
                      </div>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setAddingNewBay(false)}
                  className="w-full mt-3 border border-gray-200 rounded-lg py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Cancelar
                </button>
              </>
            ) : view === 'interior' && placingBayType ? (
              <>
                <p className="text-sm font-semibold text-gray-800">Ubicando {getEstanteTipo(placingBayType).nombre}</p>
                <p className="text-xs text-gray-400 mt-1 mb-3">
                  Moví el mouse por el piso y clickeá para plantarlo — si te acercás a otro estante se engancha al costado o se apila arriba (se pone verde cuando va a hacerlo).
                </p>
                <button
                  onClick={cancelPlacingBay}
                  className="w-full border border-gray-200 rounded-lg py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Cancelar
                </button>
              </>
            ) : view === 'interior' && interiorHouseId ? (
              <>
                <p className="text-sm font-semibold text-gray-800">{houses[interiorHouseId]?.nombre}</p>
                <p className="text-xs text-gray-400 mt-1 mb-3">Cantidad fija de bahías — clickeá una para entrar a su estante o cambiarle el tipo.</p>
                <button
                  onClick={() => setAddingNewBay(true)}
                  className="w-full flex items-center justify-center gap-1.5 border border-dashed border-gray-300 rounded-lg py-2 text-sm font-medium text-gray-600 hover:border-[#0056b3] hover:bg-blue-50/40 transition-colors mb-3"
                >
                  <Plus size={14} /> Nueva estante
                </button>
                <div className="space-y-2">
                  {(interiorSceneRef.current?.getBayIds() ?? []).map((id) => {
                    const tipo = getEstanteTipo(bayTipos[id]);
                    return (
                      <button
                        key={id}
                        onClick={() => focusBay(id)}
                        className="w-full flex items-center gap-3 border border-gray-200 rounded-lg px-3 py-2.5 text-left transition-colors hover:border-[#0056b3] hover:bg-blue-50/40"
                      >
                        <span className="text-[10px] font-mono text-gray-400 w-6 flex-shrink-0">{id.toUpperCase()}</span>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{tipo.nombre}</p>
                          <p className="text-xs text-gray-400">{tipo.rows * tipo.cols} casillas</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : placingType ? (
              <>
                <p className="text-sm font-semibold text-gray-800">Ubicando {HOUSE_TYPE_CONFIG[placingType].nombre}</p>
                <p className="text-xs text-gray-400 mt-1 mb-3">Moví el mouse sobre el terreno y clickeá donde quieras levantarlo.</p>
                <button
                  onClick={cancelPlacing}
                  className="w-full border border-gray-200 rounded-lg py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Cancelar
                </button>
              </>
            ) : movingId ? (
              <>
                <p className="text-sm font-semibold text-gray-800">Moviendo {houses[movingId]?.nombre}</p>
                <p className="text-xs text-gray-400 mt-1 mb-3">Moví el mouse sobre el terreno y clickeá para soltarlo ahí.</p>
                <button
                  onClick={cancelMoving}
                  className="w-full border border-gray-200 rounded-lg py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Cancelar
                </button>
              </>
            ) : selected ? (
              <>
                <p className="text-sm font-semibold text-gray-800">{HOUSE_TYPE_CONFIG[selected.type].nombre} · {selected.nombre}</p>
                <p className="text-xs text-gray-400 mt-1">Estantes (bahías) {HOUSE_TYPE_CONFIG[selected.type].bahias}</p>
                <button onClick={enterInterior} className="w-full mt-4 bg-[#0056b3] text-white rounded-lg py-2.5 font-semibold hover:bg-[#004494] transition-colors">
                  Entrar al almacén →
                </button>
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <button onClick={moveSelected} className="flex flex-col items-center gap-1 border border-gray-200 rounded-lg py-2 text-xs font-medium text-gray-600 hover:bg-gray-50">
                    <Move size={14} /> Mover
                  </button>
                  <button onClick={rotateSelected} className="flex flex-col items-center gap-1 border border-gray-200 rounded-lg py-2 text-xs font-medium text-gray-600 hover:bg-gray-50">
                    <RotateCw size={14} /> Rotar
                  </button>
                  <button onClick={removeSelected} className="flex flex-col items-center gap-1 border border-red-200 rounded-lg py-2 text-xs font-medium text-red-500 hover:bg-red-50">
                    <Trash2 size={14} /> Quitar
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-gray-800">Almacenes disponibles</p>
                <p className="text-xs text-gray-400 mt-1 mb-3">Elegí un tipo de almacén y clickeá en el terreno para levantarlo.</p>
                <div className="flex items-center gap-1.5 bg-gray-50 rounded-lg px-2.5 py-1.5 mb-3">
                  <Search size={13} className="text-gray-400" />
                  <input placeholder="Buscar ubicación (ej. Sector 1, ARQ...)" className="bg-transparent text-xs outline-none flex-1 placeholder-gray-400" />
                </div>
                <div className="space-y-2">
                  {TYPE_ORDER.map((t) => {
                    const cfg = HOUSE_TYPE_CONFIG[t];
                    return (
                      <button
                        key={t}
                        onClick={() => startPlacing(t)}
                        className="w-full flex items-center gap-3 border border-gray-200 rounded-lg px-3 py-2.5 hover:border-[#0056b3] hover:bg-blue-50/40 transition-colors text-left"
                      >
                        <span className="w-8 h-8 rounded-md flex-shrink-0" style={{ backgroundColor: TYPE_COLORS[t] }} />
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{cfg.nombre}</p>
                          <p className="text-xs text-gray-400">{cfg.bahias} bahías · {cfg.width.toFixed(1)} x {cfg.depth.toFixed(1)}m</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-400 mt-4">{Object.keys(houses).length} almacén(es) levantado(s)</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default CiudadModal;
