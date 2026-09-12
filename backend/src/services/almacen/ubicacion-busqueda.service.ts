// Buscar ubicación por nombre — almacén, estante o casilla. No importa
// nada de almacen.service.ts/estante.service.ts/casilla.service.ts más
// que la constante del módulo — hace sus propios JOINs de una, no
// reusa las queries de detalle de cada entidad.
import pool from "../../db/database.js";
import { assertModulePermission } from "../project-access.service.js";
import { ALMACEN_MODULE_CODE } from "./almacen.service.js";
import type { DecodedToken } from "../../models/auth.models.js";
import type { ProjectIdParam } from "../../schemas/projects.schema.js";
import type { BuscarUbicacionQuery } from "../../schemas/almacen/ubicacion-busqueda.schema.js";
import type { UbicacionBusquedaResultado } from "../../models/almacen/ubicacion-busqueda.models.js";

export const buscarUbicacionService = async (
    user: DecodedToken, { projectId }: ProjectIdParam, { q }: BuscarUbicacionQuery
): Promise<UbicacionBusquedaResultado[]> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "view");

    const like = `%${q}%`;
    const { rows } = await pool.query<UbicacionBusquedaResultado>(
        `(SELECT 'almacen' AS tipo, a.almacen_id, NULL::bigint AS estante_id, NULL::bigint AS casilla_id,
            a.nombre, a.nombre AS path
        FROM almacen a
        WHERE a.project_id = $1 AND a.eliminado_en IS NULL AND a.nombre ILIKE $2)
        UNION ALL
        (SELECT 'estante', a.almacen_id, e.estante_id, NULL,
            e.nombre, a.nombre || ' · ' || e.nombre
        FROM estante e
        INNER JOIN almacen a USING(almacen_id)
        WHERE a.project_id = $1 AND a.eliminado_en IS NULL AND e.eliminado_en IS NULL AND e.nombre ILIKE $2)
        UNION ALL
        (SELECT 'casilla', a.almacen_id, e.estante_id, c.casilla_id,
            c.nombre, a.nombre || ' · ' || e.nombre || ' · ' || c.nombre
        FROM casilla c
        INNER JOIN estante e USING(estante_id)
        INNER JOIN almacen a USING(almacen_id)
        WHERE a.project_id = $1 AND a.eliminado_en IS NULL AND e.eliminado_en IS NULL AND c.eliminado_en IS NULL
            AND (c.nombre ILIKE $2 OR c.ubicacion ILIKE $2))
        ORDER BY path
        LIMIT 50`,
        [projectId, like]
    );
    return rows;
};
