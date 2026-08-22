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
import { assertModulePermission } from "./project-access.service.js";

export const getEstadoElementosService = async (
    user: DecodedToken, { projectId }: ProjectIdParam
): Promise<EstadoElementosResult> => {

    // Es un reporte del módulo METRADOS BIM puntualmente (ver
    // comentario de cabecera) — mismo criterio que el resto de
    // ifc-metrados.service.ts.
    await assertModulePermission(projectId, user.user_id, "metrados", "view");

    // A nivel de PROYECTO (todos los archivos IFC ya procesados, no
    // uno solo) — por diseño: si el mismo elemento aparece en más de un
    // documento IFC (dos archivos DISTINTOS con el mismo elemento), esto
    // lo saca a la luz, que es justamente el tipo de problema que esta
    // consulta busca detectar.
    //
    // ifl.is_current = true (Fase 3, ver
    // docs/roadmap-modulos-y-permisos.md) — con versionado, subir una
    // versión nueva de un documento ya NO deja a la vieja como "archivo
    // vivo" con datos cargados (el tombstone le borra los derivados, ver
    // insertarResultado en ifc-processing-runner.ts), así que este
    // filtro es en la práctica un no-op salvo por el rato entre que una
    // versión nueva termina de procesar y la vieja se apaga — se deja
    // explícito igual, no depender del efecto secundario del borrado.
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
        WHERE fl.project_id = $1 AND ifl.is_current = true`,
        [projectId]
    );

    return construirEstadoElementos(projectId, rows);
};
