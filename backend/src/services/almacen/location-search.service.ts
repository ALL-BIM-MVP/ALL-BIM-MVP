// Buscar ubicación por nombre — warehouse, rack o bin. No importa nada
// de warehouse.service.ts/rack.service.ts/bin.service.ts más que la
// constante del módulo — hace sus propios JOINs de una, no reusa las
// queries de detalle de cada entidad.
import pool from "../../db/database.js";
import { assertModulePermission } from "../project-access.service.js";
import { ALMACEN_MODULE_CODE } from "./warehouse.service.js";
import type { DecodedToken } from "../../models/auth.models.js";
import type { ProjectIdParam } from "../../schemas/projects.schema.js";
import type { SearchLocationQuery } from "../../schemas/almacen/location-search.schema.js";
import type { LocationSearchResult } from "../../models/almacen/location-search.models.js";

export const searchLocationService = async (
    user: DecodedToken, { projectId }: ProjectIdParam, { q }: SearchLocationQuery
): Promise<LocationSearchResult[]> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "view");

    const like = `%${q}%`;
    const { rows } = await pool.query<LocationSearchResult>(
        `(SELECT 'warehouse' AS type, w.warehouse_id, NULL::bigint AS rack_id, NULL::bigint AS bin_id,
            w.name, w.name AS path
        FROM warehouses w
        WHERE w.project_id = $1 AND w.deleted_at IS NULL AND w.name ILIKE $2)
        UNION ALL
        (SELECT 'rack', w.warehouse_id, r.rack_id, NULL,
            r.name, w.name || ' · ' || r.name
        FROM racks r
        INNER JOIN warehouses w USING(warehouse_id)
        WHERE w.project_id = $1 AND w.deleted_at IS NULL AND r.deleted_at IS NULL AND r.name ILIKE $2)
        UNION ALL
        (SELECT 'bin', w.warehouse_id, r.rack_id, b.bin_id,
            b.name, w.name || ' · ' || r.name || ' · ' || b.name
        FROM bins b
        INNER JOIN racks r USING(rack_id)
        INNER JOIN warehouses w USING(warehouse_id)
        WHERE w.project_id = $1 AND w.deleted_at IS NULL AND r.deleted_at IS NULL AND b.deleted_at IS NULL
            AND (b.name ILIKE $2 OR b.location_label ILIKE $2))
        ORDER BY path
        LIMIT 50`,
        [projectId, like]
    );
    return rows;
};
