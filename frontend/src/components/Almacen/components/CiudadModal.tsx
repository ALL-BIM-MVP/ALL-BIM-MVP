import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Building2, ChevronRight, Move, Pencil, Plus, RotateCw, Search, Tractor, Trash2, Warehouse, X } from 'lucide-react';
import { CityScene, DEFAULT_WAREHOUSE_SIZE, Footprint, WAREHOUSE_SIZES, WarehouseSizeKey } from '../utils/CityScene';
import { BayPreviewScene, GridPoint, isPalletName, WarehouseInteriorScene } from '../utils/WarehouseInteriorScene';
import { CUBE_SIZE, cubesToMeters, DEFAULT_GRID, directionToRotation, footprintCorners, footprintFromCorners, rotationToDirection } from '../utils/warehouseMapping';
import { Bin, Rack, Warehouse as WarehouseData, WarehouseInput, WarehouseStyle } from '../../../types/almacen.types';
import { warehouseStyleService } from '../../../services/almacen/warehouseStyle.service';
import { warehouseService } from '../../../services/almacen/warehouse.service';
import { rackService } from '../../../services/almacen/rack.service';

// Alto aprox. del chip de la etiqueta flotante (dos líneas): con -translate-y-full
// nunca puede quedar más arriba de esto, o se mete visualmente en la franja del header.
const LABEL_MIN_TOP = 72;

interface HouseInfo {
  styleId: number;
  nombre: string;
  footprint: Footprint;
}

interface RackInfo {
  name: string;
  levels: number;
  direction: 0 | 1;
}

interface CiudadModalProps {
  projectId: number;
  onClose: () => void;
  // Cuando el modal se abre desde un ítem del ingreso, en vez de uso libre
  // te lleva a elegir una casilla puntual y confirmarla como su ubicación —
  // el bin_id real es lo que de verdad importa, label es solo para mostrar.
  pickMode?: { itemLabel: string; itemModelPath?: string | null; onConfirm: (bin: { binId: number; label: string }) => void };
}

const CiudadModal: React.FC<CiudadModalProps> = ({ projectId, onClose, pickMode }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CityScene | null>(null);

  const [styles, setStyles] = useState<WarehouseStyle[]>([]);
  const getStyle = (styleId: number | undefined) => styles.find((s) => s.warehouse_style_id === styleId);

  const [houses, setHouses] = useState<Record<string, HouseInfo>>({});
  // Los callbacks que le paso a CityScene se cablean una sola vez (ver el
  // useEffect de más abajo) — sin esta ref quedarían con el "houses" de ese
  // primer render y no verían altas/renombres posteriores.
  const housesRef = useRef<Record<string, HouseInfo>>({});
  useEffect(() => {
    housesRef.current = houses;
  }, [houses]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placingStyleId, setPlacingStyleId] = useState<number | null>(null);
  // Tamaño elegido para el PRÓXIMO almacén a colocar — ref porque el callback onPlaced de CityScene
  // se cablea una sola vez y necesita leer el valor vigente en el momento del click, no el de cuando se creó.
  const [placingSize, setPlacingSize] = useState<WarehouseSizeKey>(DEFAULT_WAREHOUSE_SIZE);
  const placingSizeRef = useRef<WarehouseSizeKey>(DEFAULT_WAREHOUSE_SIZE);
  useEffect(() => {
    placingSizeRef.current = placingSize;
  }, [placingSize]);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [labelPositions, setLabelPositions] = useState<Array<{ id: string; x: number; y: number }>>([]);

  const [view, setView] = useState<'ciudad' | 'interior'>('ciudad');
  const [interiorHouseId, setInteriorHouseId] = useState<string | null>(null);
  const [interiorWarehouse, setInteriorWarehouse] = useState<WarehouseData | null>(null);
  const interiorCanvasRef = useRef<HTMLCanvasElement>(null);
  const interiorContainerRef = useRef<HTMLDivElement>(null);
  const interiorSceneRef = useRef<WarehouseInteriorScene | null>(null);

  const [racks, setRacks] = useState<Record<string, RackInfo>>({});
  const racksRef = useRef<Record<string, RackInfo>>({});
  useEffect(() => {
    racksRef.current = racks;
  }, [racks]);

  const [selectedBayId, setSelectedBayId] = useState<string | null>(null);
  const [editingBayId, setEditingBayId] = useState<string | null>(null);
  const [bayLabelPositions, setBayLabelPositions] = useState<Array<{ id: string; x: number; y: number; scale: number }>>([]);

  const [placingRack, setPlacingRack] = useState(false);
  const [draftFootprint, setDraftFootprint] = useState<{ corner1: GridPoint; corner2: GridPoint } | null>(null);
  const [draftLevels, setDraftLevels] = useState(1);
  const [draftIsPallet, setDraftIsPallet] = useState(false);
  const [draftDirection, setDraftDirection] = useState<0 | 1>(0);

  const [viewingBayId, setViewingBayId] = useState<string | null>(null);
  const [rackDetail, setRackDetail] = useState<Rack | null>(null);
  const [binFace, setBinFace] = useState<0 | 1>(0);
  const [selectedBin, setSelectedBin] = useState<Bin | null>(null);
  const [casillaTagPos, setCasillaTagPos] = useState<{ x: number; y: number } | null>(null);
  const [objectScale, setObjectScale] = useState(1);
  const [objectRotationDeg, setObjectRotationDeg] = useState(0);

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const previewSceneRef = useRef<BayPreviewScene | null>(null);

  const maxLevel = interiorWarehouse ? getStyle(interiorWarehouse.warehouse_style_id)?.max_level ?? 1 : 1;

  useEffect(() => {
    if (!viewingBayId || !previewCanvasRef.current || !previewContainerRef.current) return;
    const scene = new BayPreviewScene(previewCanvasRef.current, previewContainerRef.current, () => {
      setCasillaTagPos(previewSceneRef.current?.getSelectedCellScreenPos() ?? null);
    });
    previewSceneRef.current = scene;
    return () => {
      scene.dispose();
      previewSceneRef.current = null;
    };
  }, [viewingBayId]);

  // Al entrar a un estante puntual, trae sus casillas (bins) reales del backend.
  useEffect(() => {
    setRackDetail(null);
    setBinFace(0);
    setSelectedBin(null);
    setCasillaTagPos(null);
    setObjectScale(1);
    setObjectRotationDeg(0);
    if (!viewingBayId || !projectId || !interiorWarehouse) return;
    const rackId = Number(viewingBayId);
    if (!Number.isFinite(rackId)) return;
    rackService
      .getRackById(projectId, interiorWarehouse.warehouse_id, rackId)
      .then(setRackDetail)
      .catch(() => setRackDetail(null));
  }, [viewingBayId]);

  useEffect(() => {
    const scene = previewSceneRef.current;
    if (!scene || !rackDetail) return;
    scene.update(rackDetail.width, rackDetail.depth, rackDetail.levels, isPalletName(rackDetail.name));
    scene.setBins(rackDetail.bins ?? [], binFace);
    scene.renderStock(rackDetail.bins ?? []);
  }, [rackDetail, binFace]);

  // Elegir casilla (para guardar un ítem nuevo) solo tiene sentido si vinimos desde un ítem del
  // ingreso. En cualquier otro caso, mirando un estante puntual, clickear una casilla la selecciona
  // en modo solo-vista — para ver qué hay guardado ahí, sin tocar nada.
  useEffect(() => {
    const scene = previewSceneRef.current;
    if (!scene) return;
    scene.setProductModel(pickMode?.itemModelPath ?? null);
    scene.setSelectCellHandler(
      pickMode && viewingBayId
        ? (bin) => {
            setSelectedBin(bin);
            setObjectScale(1);
            setObjectRotationDeg(0);
          }
        : null
    );
    scene.setViewSelectHandler(!pickMode && viewingBayId ? (bin) => setSelectedBin(bin) : null);
  }, [viewingBayId, pickMode, rackDetail, binFace]);

  // Escala/rotación a mano del objeto ya puesto en la casilla elegida.
  useEffect(() => {
    if (selectedBin) previewSceneRef.current?.setObjectAdjustment(objectScale, objectRotationDeg);
  }, [selectedBin, objectScale, objectRotationDeg]);

  // Catálogo real de estilos (GET /api/warehouse-styles) — 3 fijos, de solo lectura.
  useEffect(() => {
    warehouseStyleService.getWarehouseStyles().then(setStyles).catch(() => setStyles([]));
  }, []);

  const buildWarehouseInput = (info: HouseInfo, transform: { x: number; z: number; rotationY: number }): WarehouseInput => ({
    name: info.nombre,
    warehouse_style_id: info.styleId,
    direction: rotationToDirection(transform.rotationY),
    grid_width: DEFAULT_GRID.width,
    grid_depth: DEFAULT_GRID.depth,
    ...footprintCorners(transform.x, transform.z, transform.rotationY, info.footprint),
  });

  // Estantes con los que nace todo almacén nuevo — contra la pared del fondo, en 3 tercios del
  // ancho de la grilla por defecto (28 cubos). El nombre exacto ("Arquitectura"/"Estructura"/
  // "Mecánica") es lo que le pone el cartel de color en WarehouseInteriorScene.buildNameplate; no
  // hay columna de categoría en el backend, así que si el usuario los renombra pierden el color.
  const DEFAULT_RACK_CATEGORIES: Array<{ name: string; gx1: number; gx2: number }> = [
    { name: 'Arquitectura', gx1: 1, gx2: 9 },
    { name: 'Estructura', gx1: 10, gx2: 18 },
    { name: 'Mecánica', gx1: 19, gx2: 27 },
  ];

  // Se llama justo después de crear el almacén — no bloquea si algún estante falla (por ejemplo,
  // si alguna vez la grilla por defecto cambiara de tamaño): el usuario igual puede agregarlos a mano.
  const createDefaultRacks = async (warehouseId: number, styleId: number) => {
    const levels = Math.min(3, getStyle(styleId)?.max_level ?? 3);
    const rack = (name: string, lv: number, gx1: number, gx2: number, gz1: number, gz2: number) => rackService.createRack(projectId, warehouseId, {
      name,
      levels: lv,
      direction: 0,
      corner1_x: cubesToMeters(gx1),
      corner1_z: cubesToMeters(gz1),
      corner2_x: cubesToMeters(gx2),
      corner2_z: cubesToMeters(gz2),
    });
    // Por categoría: el estante con la cabecera de color contra la pared del fondo, y delante 3
    // tarimas en fila (2 cubos de ancho, 1 de separación) — ver isPalletName en WarehouseInteriorScene.
    await Promise.allSettled(DEFAULT_RACK_CATEGORIES.flatMap((cat) => [
      rack(cat.name, levels, cat.gx1, cat.gx2, 1, 2),
      ...[0, 1, 2].map((i) => rack(`Tarima ${cat.name} ${i + 1}`, 1, cat.gx1 + i * 3, cat.gx1 + i * 3 + 2, 4, 5)),
    ]));
  };

  // Guarda posición/rotación/nombre actuales de un almacén YA creado contra el backend (PUT, reemplaza todo el registro).
  const persistHouseTransform = async (id: string) => {
    const numericId = Number(id);
    const info = housesRef.current[id];
    const transform = sceneRef.current?.getHouseTransform(id);
    if (!projectId || !info || !transform || !Number.isFinite(numericId)) return;
    try {
      await warehouseService.updateWarehouse(projectId, numericId, buildWarehouseInput(info, transform));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo actualizar el almacén.');
    }
  };

  // Recién colocado: ya está visible con un id temporal — lo crea contra el
  // backend y, si sale bien, le cambia el id temporal por el id real.
  const persistNewHouse = async (tempId: string, styleId: number) => {
    const transform = sceneRef.current?.getHouseTransform(tempId);
    if (!projectId || !transform) return;
    const info = housesRef.current[tempId] ?? { styleId, nombre: getStyle(styleId)?.name ?? 'Almacén', footprint: WAREHOUSE_SIZES[placingSizeRef.current] };
    try {
      const created = await warehouseService.createWarehouse(projectId, buildWarehouseInput(info, transform));
      await createDefaultRacks(created.warehouse_id, info.styleId);
      const realId = String(created.warehouse_id);
      sceneRef.current?.remapHouseId(tempId, realId);
      setHouses((prev) => {
        const next = { ...prev };
        delete next[tempId];
        next[realId] = { styleId, nombre: created.name, footprint: info.footprint };
        return next;
      });
      setSelectedId((prev) => (prev === tempId ? realId : prev));
    } catch (err) {
      sceneRef.current?.removeHouse(tempId);
      setHouses((prev) => {
        const next = { ...prev };
        delete next[tempId];
        return next;
      });
      setSelectedId((prev) => (prev === tempId ? null : prev));
      window.alert(err instanceof Error ? err.message : 'No se pudo crear el almacén.');
    }
  };

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current || styles.length === 0) return;
    const scene = new CityScene(canvasRef.current, containerRef.current, styles, {
      onSelectHouse: (id) => setSelectedId(id),
      onPlaced: (id, styleId) => {
        const footprint = WAREHOUSE_SIZES[placingSizeRef.current];
        setHouses((prev) => ({ ...prev, [id]: { styleId, nombre: getStyle(styleId)?.name ?? 'Almacén', footprint } }));
        setPlacingStyleId(null);
        setSelectedId(id);
        persistNewHouse(id, styleId);
      },
      onMoved: (id) => {
        setMovingId(null);
        persistHouseTransform(id);
      },
      onFrame: () => setLabelPositions(sceneRef.current?.getLabelPositions() ?? []),
    });
    sceneRef.current = scene;

    // Trae los almacenes reales del proyecto y los levanta en su posición guardada.
    if (projectId) {
      warehouseService
        .getWarehouses(projectId)
        .then((list) => {
          const nextHouses: Record<string, HouseInfo> = {};
          list.forEach((w) => {
            const id = String(w.warehouse_id);
            const x = (w.corner1_x + w.corner2_x) / 2;
            const z = (w.corner1_z + w.corner2_z) / 2;
            const rotationY = directionToRotation(w.direction);
            const footprint = footprintFromCorners(w.corner1_x, w.corner1_z, w.corner2_x, w.corner2_z, rotationY);
            scene.loadWarehouse(id, w.warehouse_style_id, x, z, rotationY, footprint);
            nextHouses[id] = { styleId: w.warehouse_style_id, nombre: w.name, footprint };
          });
          setHouses(nextHouses);
        })
        .catch(() => {});
    }

    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styles]);

  // Escena del interior: se crea/destruye al entrar y salir del almacén
  // seleccionado (la escena "Ciudad" de arriba sigue viva de fondo, oculta,
  // para no perder posiciones/rotaciones de los almacenes al volver).
  useEffect(() => {
    if (view !== 'interior' || !interiorWarehouse || !interiorCanvasRef.current || !interiorContainerRef.current) return;

    const scene = new WarehouseInteriorScene(interiorCanvasRef.current, interiorContainerRef.current, interiorWarehouse.grid_width, interiorWarehouse.grid_depth, {
      onSelectBay: (id) => setSelectedBayId(id),
      onFootprintReady: (c1, c2) => setDraftFootprint({ corner1: c1, corner2: c2 }),
      onFrame: () => setBayLabelPositions(interiorSceneRef.current?.getLabelPositions() ?? []),
    });
    interiorSceneRef.current = scene;

    if (projectId) {
      rackService
        .getRacks(projectId, interiorWarehouse.warehouse_id)
        .then((list) => {
          const next: Record<string, RackInfo> = {};
          list.forEach((r) => {
            const id = String(r.rack_id);
            scene.loadBay(
              id,
              { gx: r.corner1_x / CUBE_SIZE, gz: r.corner1_z / CUBE_SIZE },
              { gx: r.corner2_x / CUBE_SIZE, gz: r.corner2_z / CUBE_SIZE },
              r.levels,
              r.direction,
              r.name
            );
            next[id] = { name: r.name, levels: r.levels, direction: r.direction };
          });
          setRacks(next);

          // El listado no trae el contenido de las casillas (ver rack.service.ts) — para verlo de un
          // vistazo sin entrar a cada estante, se pide el detalle de cada rack aparte y se dibuja su stock.
          list.forEach((r) => {
            const id = String(r.rack_id);
            rackService
              .getRackById(projectId, interiorWarehouse.warehouse_id, r.rack_id)
              .then((full) => scene.renderBayStock(id, full.bins ?? []))
              .catch(() => {});
          });
        })
        .catch(() => {});
    }

    return () => {
      scene.dispose();
      interiorSceneRef.current = null;
    };
  }, [view, interiorWarehouse]);

  const enterInterior = async () => {
    if (!selectedId || !projectId) return;
    const numericId = Number(selectedId);
    if (!Number.isFinite(numericId)) return; // el almacén todavía se está creando contra el backend
    try {
      const wh = await warehouseService.getWarehouseById(projectId, numericId);
      setInteriorWarehouse(wh);
      setInteriorHouseId(selectedId);
      setSelectedBayId(null);
      setViewingBayId(null);
      setPlacingRack(false);
      setDraftFootprint(null);
      setView('interior');
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo abrir el almacén.');
    }
  };

  const backToCiudad = () => {
    setView('ciudad');
    setInteriorWarehouse(null);
    setSelectedBayId(null);
    setViewingBayId(null);
    setPlacingRack(false);
    setDraftFootprint(null);
  };

  // El tipo se elige ANTES de dibujar: las tarimas pueden ir pegadas y esa regla se valida al marcar las esquinas.
  const startPlacingRack = (isPallet = false) => {
    setSelectedBayId(null);
    setPlacingRack(true);
    setDraftFootprint(null);
    setDraftLevels(1);
    setDraftDirection(0);
    setDraftIsPallet(isPallet);
    interiorSceneRef.current?.startPlacingBay(isPallet);
  };

  const cancelPlacingRack = () => {
    setPlacingRack(false);
    setDraftFootprint(null);
    interiorSceneRef.current?.cancelPlacingBay();
  };

  const changeDraftLevels = (levels: number) => {
    const capped = Math.min(maxLevel, Math.max(1, levels));
    setDraftLevels(capped);
    interiorSceneRef.current?.updateDraftLevels(capped);
  };

  const changeDraftDirection = (direction: 0 | 1) => {
    setDraftDirection(direction);
    interiorSceneRef.current?.updateDraftDirection(direction);
  };

  const changeDraftType = (isPallet: boolean) => {
    setDraftIsPallet(isPallet);
    interiorSceneRef.current?.updateDraftType(isPallet);
  };

  const confirmNewRack = async () => {
    if (!draftFootprint || !interiorWarehouse || !projectId) return;
    const kind = draftIsPallet ? 'Tarima' : 'Estante';
    const sameKindCount = Object.values(racksRef.current).filter((r) => isPalletName(r.name) === draftIsPallet).length;
    const tempName = `${kind} ${sameKindCount + 1}`;
    const draft = interiorSceneRef.current?.confirmDraft(tempName);
    if (!draft) return;
    setPlacingRack(false);
    setDraftFootprint(null);
    setRacks((prev) => ({ ...prev, [draft.id]: { name: tempName, levels: draft.levels, direction: draft.direction } }));
    setSelectedBayId(draft.id);
    try {
      const created = await rackService.createRack(projectId, interiorWarehouse.warehouse_id, {
        name: tempName,
        levels: draft.levels,
        direction: draft.direction,
        corner1_x: cubesToMeters(draft.corner1.gx),
        corner1_z: cubesToMeters(draft.corner1.gz),
        corner2_x: cubesToMeters(draft.corner2.gx),
        corner2_z: cubesToMeters(draft.corner2.gz),
      });
      const realId = String(created.rack_id);
      interiorSceneRef.current?.remapBayId(draft.id, realId);
      setRacks((prev) => {
        const next = { ...prev };
        delete next[draft.id];
        next[realId] = { name: created.name, levels: created.levels, direction: created.direction };
        return next;
      });
      setSelectedBayId((prev) => (prev === draft.id ? realId : prev));
    } catch (err) {
      interiorSceneRef.current?.removeBay(draft.id);
      setRacks((prev) => {
        const next = { ...prev };
        delete next[draft.id];
        return next;
      });
      setSelectedBayId((prev) => (prev === draft.id ? null : prev));
      window.alert(err instanceof Error ? err.message : 'No se pudo crear el estante.');
    }
  };

  const removeSelectedBay = async () => {
    if (!selectedBayId || !interiorWarehouse || !projectId) return;
    if (!window.confirm('¿Quitar este estante?')) return;
    const rackId = Number(selectedBayId);
    try {
      if (Number.isFinite(rackId)) await rackService.deleteRack(projectId, interiorWarehouse.warehouse_id, rackId);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo eliminar el estante.');
      return;
    }
    interiorSceneRef.current?.removeBay(selectedBayId);
    setRacks((prev) => {
      const next = { ...prev };
      delete next[selectedBayId];
      return next;
    });
    setSelectedBayId(null);
  };

  const renameRack = (id: string, name: string) => {
    setRacks((prev) => ({ ...prev, [id]: { ...prev[id], name } }));
    interiorSceneRef.current?.setBayName(id, name);
  };

  const commitRackRename = async (id: string) => {
    setEditingBayId(null);
    const rackId = Number(id);
    if (!interiorWarehouse || !projectId || !Number.isFinite(rackId)) return;
    try {
      await rackService.renameRack(projectId, interiorWarehouse.warehouse_id, rackId, racksRef.current[id]?.name || 'Estante');
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo renombrar el estante.');
    }
  };

  const enterEstante = () => {
    if (selectedBayId) setViewingBayId(selectedBayId);
  };

  const backFromEstante = () => setViewingBayId(null);

  const focusBay = (id: string) => {
    setSelectedBayId(id);
    interiorSceneRef.current?.focusBay(id);
  };

  /** Cancela cualquier modo activo (ubicar/mover/seleccionado) y vuelve al panel con la lista de todos los almacenes. */
  const showAllHouses = () => {
    setPlacingStyleId(null);
    sceneRef.current?.cancelPlacing();
    setMovingId(null);
    sceneRef.current?.cancelMoving();
    setSelectedId(null);
  };

  const focusExistingHouse = (id: string) => {
    setSelectedId(id);
    sceneRef.current?.focusHouse(id);
  };

  const startPlacing = (styleId: number) => {
    setPlacingStyleId(styleId);
    sceneRef.current?.startPlacing(styleId, WAREHOUSE_SIZES[placingSize]);
  };

  const cancelPlacing = () => {
    setPlacingStyleId(null);
    sceneRef.current?.cancelPlacing();
  };

  const renameHouse = (id: string, nombre: string) => {
    setHouses((prev) => ({ ...prev, [id]: { ...prev[id], nombre } }));
  };

  const commitRename = (id: string) => {
    setEditingId(null);
    persistHouseTransform(id);
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
    if (!selectedId) return;
    sceneRef.current?.rotateHouse(selectedId);
    persistHouseTransform(selectedId);
  };

  const removeSelected = async () => {
    if (!selectedId) return;
    if (!window.confirm('¿Quitar este almacén?')) return;
    const numericId = Number(selectedId);
    try {
      if (projectId && Number.isFinite(numericId)) {
        await warehouseService.deleteWarehouse(projectId, numericId);
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo eliminar el almacén.');
      return;
    }
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
              className={`w-full h-full block ${placingStyleId !== null || movingId ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
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
                  <span className="bg-gray-800 text-white text-[8px] font-mono px-1.5 py-0.5 rounded-t-md">{getStyle(info.styleId)?.name ?? '···'}</span>
                  <span className="bg-white shadow-md rounded-b-md rounded-tr-md px-2 py-0.5 text-xs font-semibold text-gray-800 flex items-center gap-1 pointer-events-auto -mt-px">
                    {editingId === id ? (
                      <input
                        autoFocus
                        value={info.nombre}
                        onChange={(e) => renameHouse(id, e.target.value)}
                        onBlur={() => commitRename(id)}
                        onKeyDown={(e) => e.key === 'Enter' && commitRename(id)}
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
            <div ref={interiorContainerRef} className={`relative flex-1 min-w-0 ${viewingBayId ? 'hidden' : ''}`}>
              <canvas
                ref={interiorCanvasRef}
                className={`w-full h-full block ${placingRack ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
              />

              {bayLabelPositions.map(({ id, x, y, scale }) => (
                <div
                  key={id}
                  className="absolute z-10 flex flex-col items-center pointer-events-none"
                  style={{ left: x, top: Math.max(y, LABEL_MIN_TOP), transform: `translate(-50%, -100%) scale(${scale})`, transformOrigin: 'bottom center' }}
                >
                  <span className="bg-gray-800 text-white text-[6px] font-mono px-1 py-px rounded-t-sm">{id.toUpperCase()}</span>
                  <span className="bg-white shadow-md rounded-b-sm rounded-tr-sm px-1.5 py-px text-[10px] font-semibold text-gray-800 -mt-px">
                    {racks[id]?.name ?? 'Estante'}
                  </span>
                </div>
              ))}

              <span className="absolute bottom-3 left-3 text-[10px] font-mono text-gray-400 bg-white/70 rounded px-2 py-1">
                {placingRack && !draftFootprint
                  ? 'clickeá una esquina y despues la opuesta para dibujar el estante'
                  : placingRack
                  ? 'ajustá niveles/dirección en el panel y confirmá'
                  : 'arrastrar: orbitar · click derecho: mover · rueda: zoom'}
              </span>
            </div>
          )}

          {view === 'interior' && viewingBayId && (
            <div ref={previewContainerRef} className="relative flex-1 min-w-0">
              <canvas
                ref={previewCanvasRef}
                className={`w-full h-full block ${pickMode ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'}`}
              />
              {selectedBin && casillaTagPos && (
                <span
                  className="absolute z-10 -translate-x-1/2 -translate-y-full bg-[#0056b3] text-white text-xs font-semibold rounded-md px-2 py-1 pointer-events-none"
                  style={{ left: casillaTagPos.x, top: Math.max(casillaTagPos.y, LABEL_MIN_TOP) }}
                >
                  {selectedBin.location_label}
                </span>
              )}
              <span className="absolute bottom-3 left-3 text-[10px] font-mono text-gray-400 bg-white/70 rounded px-2 py-1">
                {pickMode ? 'arrastrar: orbitar · click: elegir casilla · rueda: zoom' : 'arrastrar: orbitar · click: ver casilla · rueda: zoom'}
              </span>
            </div>
          )}

          <div className="w-80 flex-shrink-0 border-l border-gray-100 p-4 overflow-y-auto">
            <button className="flex items-center gap-2 w-full justify-center border border-gray-200 rounded-lg py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors mb-4">
              <Tractor size={15} /> Ampliar terreno
            </button>

            {view === 'ciudad' && (placingStyleId !== null || movingId || selected) && (
              <button
                onClick={showAllHouses}
                className="flex items-center gap-2 w-full justify-center border border-gray-200 rounded-lg py-2 text-sm font-medium text-[#0056b3] hover:bg-blue-50/40 transition-colors mb-4"
              >
                <Building2 size={15} /> Ver todos mis almacenes
              </button>
            )}

            {view === 'interior' && viewingBayId && pickMode ? (
              <>
                <p className="text-sm font-semibold text-gray-800">Elegí la casilla</p>
                <p className="text-xs text-gray-400 mt-1 mb-3">Clickeá cualquier casilla del estante — es donde va a quedar guardado este ítem.</p>
                {rackDetail && rackDetail.depth === 2 && (
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <button
                      onClick={() => setBinFace(0)}
                      className={`border rounded-lg py-1.5 text-xs font-medium transition-colors ${binFace === 0 ? 'border-[#0056b3] bg-blue-50 text-[#0056b3]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                    >
                      Cara A
                    </button>
                    <button
                      onClick={() => setBinFace(1)}
                      className={`border rounded-lg py-1.5 text-xs font-medium transition-colors ${binFace === 1 ? 'border-[#0056b3] bg-blue-50 text-[#0056b3]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                    >
                      Cara B
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-2 bg-blue-50 text-[#0056b3] rounded-lg px-3 py-2.5 text-sm font-medium mb-2">
                  <Warehouse size={15} className="flex-shrink-0" />
                  {selectedBin?.location_label ?? '···'}
                </div>
                {!selectedBin && (
                  <p className="text-xs text-gray-400 mb-3">Todavía no elegiste ninguna casilla.</p>
                )}
                {selectedBin && (
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
                  disabled={!selectedBin}
                  onClick={() => {
                    if (!selectedBin || !interiorHouseId) return;
                    pickMode.onConfirm({
                      binId: selectedBin.bin_id,
                      label: `${houses[interiorHouseId]?.nombre ?? ''} · ${selectedBin.location_label}`,
                    });
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
                <p className="text-sm font-semibold text-gray-800">{racks[viewingBayId]?.name ?? 'Estante'}</p>
                <p className="text-xs text-gray-400 mt-1 mb-3">{rackDetail ? `${rackDetail.width} bahías × ${rackDetail.levels} niveles` : 'Cargando...'}</p>

                {selectedBin ? (
                  <div className="bg-gray-50 rounded-lg px-3 py-2.5 mb-3">
                    <p className="text-[11px] text-gray-400 uppercase tracking-wide">{selectedBin.location_label}</p>
                    {selectedBin.contents?.[0] ? (
                      <>
                        <p className="text-sm font-semibold text-gray-800 mt-0.5">
                          {selectedBin.contents[0].code} — {selectedBin.contents[0].name}
                        </p>
                        <p className="text-xs text-gray-500">Cantidad: {selectedBin.contents[0].quantity}</p>
                      </>
                    ) : (
                      <p className="text-sm text-gray-400 mt-0.5">Casilla vacía</p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 mb-3">Clickeá una casilla para ver qué tiene guardado.</p>
                )}

                <button
                  onClick={backFromEstante}
                  className="w-full border border-gray-200 rounded-lg py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  ← Volver
                </button>
              </>
            ) : view === 'interior' && interiorHouseId && selectedBayId ? (
              <>
                <p className="text-sm font-semibold text-gray-800 flex items-center gap-1">
                  {editingBayId === selectedBayId ? (
                    <input
                      autoFocus
                      value={racks[selectedBayId]?.name ?? ''}
                      onChange={(e) => renameRack(selectedBayId, e.target.value)}
                      onBlur={() => commitRackRename(selectedBayId)}
                      onKeyDown={(e) => e.key === 'Enter' && commitRackRename(selectedBayId)}
                      className="outline-none border-b border-gray-200 text-sm font-semibold flex-1"
                    />
                  ) : (
                    <>
                      {racks[selectedBayId]?.name ?? 'Estante'}
                      <Pencil size={12} className="text-gray-400 hover:text-[#0056b3] cursor-pointer" onClick={() => setEditingBayId(selectedBayId)} />
                    </>
                  )}
                </p>
                <p className="text-xs text-gray-400 mt-1 mb-3">
                  {racks[selectedBayId]?.levels ?? 1} nivel(es) · dirección {racks[selectedBayId]?.direction === 0 ? 'A' : 'B'}
                </p>
                <button
                  onClick={enterEstante}
                  className="w-full bg-[#0056b3] text-white rounded-lg py-2.5 font-semibold hover:bg-[#004494] transition-colors"
                >
                  Entrar al estante →
                </button>
                <button
                  onClick={removeSelectedBay}
                  className="w-full mt-2 flex items-center justify-center gap-1.5 border border-red-200 rounded-lg py-2.5 font-medium text-red-500 hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={14} /> Quitar estante
                </button>
              </>
            ) : view === 'interior' && placingRack && draftFootprint ? (
              <>
                <p className="text-sm font-semibold text-gray-800 mb-1">Configurar estante</p>
                <p className="text-xs text-gray-400 mb-3">Esquinas ya elegidas — definí el tipo, los niveles y qué lado queda accesible.</p>
                <span className="text-[11px] text-gray-400 uppercase tracking-wide">Tipo</span>
                <div className="grid grid-cols-2 gap-2 mt-1 mb-3">
                  {([false, true] as const).map((pallet) => (
                    <button
                      key={String(pallet)}
                      onClick={() => changeDraftType(pallet)}
                      className={`border rounded-lg py-2 text-sm font-medium transition-colors ${draftIsPallet === pallet ? 'border-[#0056b3] bg-blue-50 text-[#0056b3]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                    >
                      {pallet ? 'Tarima' : 'Estante'}
                    </button>
                  ))}
                </div>
                {!draftIsPallet && (
                  <label className="block mb-3">
                    <span className="text-[11px] text-gray-400 uppercase tracking-wide">Niveles (máx. {maxLevel})</span>
                    <input
                      type="number"
                      min={1}
                      max={maxLevel}
                      value={draftLevels}
                      onChange={(e) => changeDraftLevels(parseInt(e.target.value, 10) || 1)}
                      className="w-full mt-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
                    />
                  </label>
                )}
                <span className="text-[11px] text-gray-400 uppercase tracking-wide">Cara accesible</span>
                <div className="grid grid-cols-2 gap-2 mt-1 mb-4">
                  <button
                    onClick={() => changeDraftDirection(0)}
                    className={`border rounded-lg py-2 text-sm font-medium transition-colors ${draftDirection === 0 ? 'border-[#0056b3] bg-blue-50 text-[#0056b3]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                  >
                    Cara A
                  </button>
                  <button
                    onClick={() => changeDraftDirection(1)}
                    className={`border rounded-lg py-2 text-sm font-medium transition-colors ${draftDirection === 1 ? 'border-[#0056b3] bg-blue-50 text-[#0056b3]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                  >
                    Cara B
                  </button>
                </div>
                <button onClick={confirmNewRack} className="w-full bg-[#0056b3] text-white rounded-lg py-2.5 font-semibold hover:bg-[#004494] transition-colors">
                  Crear estante
                </button>
                <button
                  onClick={cancelPlacingRack}
                  className="w-full mt-2 border border-gray-200 rounded-lg py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Cancelar
                </button>
              </>
            ) : view === 'interior' && placingRack ? (
              <>
                <p className="text-sm font-semibold text-gray-800">Dibujando estante nuevo</p>
                <p className="text-xs text-gray-400 mt-1 mb-3">
                  Clickeá una esquina en el piso y después la opuesta — el rectángulo se pinta verde si es válido (ancho par de al menos 2 bahías, profundidad de 1 o 2 cubos, separado al menos 1 cubo de otros estantes).
                </p>
                <button
                  onClick={cancelPlacingRack}
                  className="w-full border border-gray-200 rounded-lg py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Cancelar
                </button>
              </>
            ) : view === 'interior' && interiorHouseId ? (
              <>
                <p className="text-sm font-semibold text-gray-800">{houses[interiorHouseId]?.nombre}</p>
                <p className="text-xs text-gray-400 mt-1 mb-3">Clickeá un estante para entrar o quitarlo.</p>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <button
                    onClick={() => startPlacingRack(false)}
                    className="flex items-center justify-center gap-1.5 border border-dashed border-gray-300 rounded-lg py-2 text-sm font-medium text-gray-600 hover:border-[#0056b3] hover:bg-blue-50/40 transition-colors"
                  >
                    <Plus size={14} /> Nuevo estante
                  </button>
                  <button
                    onClick={() => startPlacingRack(true)}
                    className="flex items-center justify-center gap-1.5 border border-dashed border-gray-300 rounded-lg py-2 text-sm font-medium text-gray-600 hover:border-[#0056b3] hover:bg-blue-50/40 transition-colors"
                  >
                    <Plus size={14} /> Nueva tarima
                  </button>
                </div>
                <div className="space-y-2">
                  {(interiorSceneRef.current?.getBayIds() ?? []).map((id) => {
                    const info = racks[id];
                    if (!info) return null;
                    return (
                      <button
                        key={id}
                        onClick={() => focusBay(id)}
                        className="w-full flex items-center gap-3 border border-gray-200 rounded-lg px-3 py-2.5 text-left transition-colors hover:border-[#0056b3] hover:bg-blue-50/40"
                      >
                        <span className="text-[10px] font-mono text-gray-400 w-6 flex-shrink-0">{id.toUpperCase()}</span>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{info.name}</p>
                          <p className="text-xs text-gray-400">{info.levels} nivel(es)</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : placingStyleId !== null ? (
              <>
                <p className="text-sm font-semibold text-gray-800">Ubicando {getStyle(placingStyleId)?.name ?? 'almacén'} ({WAREHOUSE_SIZES[placingSize].label})</p>
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
                <p className="text-sm font-semibold text-gray-800">{getStyle(selected.styleId)?.name ?? 'Almacén'} · {selected.nombre}</p>
                <p className="text-xs text-gray-400 mt-1">{selected.footprint.width.toFixed(1)} x {selected.footprint.depth.toFixed(1)}m</p>
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
                <p className="text-xs text-gray-400 mt-1 mb-3">Elige un tamaño y un estilo, y clickeá en el terreno para levantarlo.</p>
                <div className="grid grid-cols-3 gap-1.5 mb-3">
                  {(Object.entries(WAREHOUSE_SIZES) as Array<[WarehouseSizeKey, typeof WAREHOUSE_SIZES[WarehouseSizeKey]]>).map(([key, size]) => (
                    <button
                      key={key}
                      onClick={() => setPlacingSize(key)}
                      className={`flex flex-col items-center gap-0.5 rounded-lg py-2 text-xs font-medium border transition-colors ${
                        placingSize === key ? 'border-[#0056b3] bg-blue-50/60 text-[#0056b3]' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {size.label}
                      <span className="text-[10px] text-gray-400">{size.width.toFixed(1)}x{size.depth.toFixed(1)}m</span>
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5 bg-gray-50 rounded-lg px-2.5 py-1.5 mb-3">
                  <Search size={13} className="text-gray-400" />
                  <input placeholder="Buscar ubicación (ej. Sector 1, ARQ...)" className="bg-transparent text-xs outline-none flex-1 placeholder-gray-400" />
                </div>
                <div className="space-y-2">
                  {styles.map((style) => (
                    <button
                      key={style.warehouse_style_id}
                      onClick={() => startPlacing(style.warehouse_style_id)}
                      className="w-full flex items-center gap-3 border border-gray-200 rounded-lg px-3 py-2.5 hover:border-[#0056b3] hover:bg-blue-50/40 transition-colors text-left"
                    >
                      <span className="w-8 h-8 rounded-md flex-shrink-0" style={{ backgroundColor: style.roof_color }} />
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{style.name}</p>
                        <p className="text-xs text-gray-400">
                          hasta nivel {style.max_level} · {WAREHOUSE_SIZES[placingSize].bahias} bahías · {WAREHOUSE_SIZES[placingSize].width.toFixed(1)} x {WAREHOUSE_SIZES[placingSize].depth.toFixed(1)}m
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mt-5 mb-2">
                  {Object.keys(houses).length} almacén(es) levantado(s)
                </p>
                <div className="space-y-2">
                  {Object.entries(houses).map(([id, info]) => (
                    <button
                      key={id}
                      onClick={() => focusExistingHouse(id)}
                      className="w-full flex items-center gap-3 border border-gray-200 rounded-lg px-3 py-2 hover:border-[#0056b3] hover:bg-blue-50/40 transition-colors text-left"
                    >
                      <span className="w-6 h-6 rounded-md flex-shrink-0" style={{ backgroundColor: getStyle(info.styleId)?.roof_color ?? '#ccc' }} />
                      <p className="text-sm font-medium text-gray-800 truncate">{info.nombre}</p>
                    </button>
                  ))}
                </div>
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
