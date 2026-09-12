// Punto de entrada único del módulo Almacén BIM (Fase 2, ver
// docs/roadmap/almacen-bim.md) — junta los routers sueltos de cada
// entidad (un archivo por entidad, ver el resto de esta carpeta) en
// los 2 puntos de montaje reales de index.ts: `almacenEstiloRouter`
// (catálogo global, /api/almacen-estilos) y `projectAlmacenRouter`
// (todo lo que cuelga de /api/projects).
import { Router } from 'express';
import { almacenEstiloRouter } from './almacen-estilo.routes.js';
import { almacenRouter } from './almacen.routes.js';
import { estanteRouter } from './estante.routes.js';
import { casillaRouter } from './casilla.routes.js';
import { ubicacionBusquedaRouter } from './ubicacion-busqueda.routes.js';

export { almacenEstiloRouter };

export const projectAlmacenRouter = Router();
projectAlmacenRouter.use(ubicacionBusquedaRouter);
projectAlmacenRouter.use(almacenRouter);
projectAlmacenRouter.use(estanteRouter);
projectAlmacenRouter.use(casillaRouter);
