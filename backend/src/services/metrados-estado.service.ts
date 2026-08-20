// metrados-estado.service.ts
//
// "Muestra de estado de cantidad de elementos" (prototipo) — ver el
// comentario de cabecera en models/metrados-estado.models.ts para la
// definición completa de "elemento conjunto" y qué se reporta.
import pool from "../db/database.js";
import type { DecodedToken } from "../models/auth.models.js";
import type { ProjectIdParam } from "../schemas/projects.schema.js";
import {
    construirEstadoElementos,
    type ElementoConjuntoRow, type EstadoElementosResult,
} from "../models/metrados-estado.models.js";
import { assertProjectAccess } from "./files.service.js";

export const getEstadoElementosService = async (
    user: DecodedToken, { projectId }: ProjectIdParam
): Promise<EstadoElementosResult> => {

    await assertProjectAccess(projectId, user.user_id);

    // A nivel de PROYECTO (todos los archivos IFC ya procesados, no
    // uno solo) — por diseño: si el mismo archivo se subió/procesó más
    // de una vez sin borrar la versión vieja, esto también lo saca a
    // la luz (cada elemento aparece "repetido" tantas veces como
    // versiones del archivo sigan vivas), que es justamente el tipo de
    // problema que esta consulta busca detectar.
    const { rows } = await pool.query<ElementoConjuntoRow>(
        `SELECT
            fl.name AS file_name,
            e.global_id,
            e.tag,
            mp.code AS partida_code
        FROM metrado_elements me
        JOIN metrado_partidas mp ON mp.partida_id = me.partida_id
        JOIN ifc_elements e ON e.element_id = me.element_id
        JOIN ifc_files ifl ON ifl.ifc_file_id = e.ifc_file_id
        JOIN files fl ON fl.file_id = ifl.ifc_file_id
        WHERE fl.project_id = $1`,
        [projectId]
    );

    return construirEstadoElementos(projectId, rows);
};
