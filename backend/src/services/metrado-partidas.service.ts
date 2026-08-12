import pool from "../db/database.js";
import { AppError } from "../models/errors/app-error.js";
import { IFC_METRADOS_ERRORS } from "../models/errors/ifc-metrados.errors.js";
import type { DecodedToken } from "../models/auth.models.js";
import type { IfcFileIdParam, PartidaElementsBody, PartidaIdParam } from "../schemas/ifc-metrados.schema.js";
import { GROUP_BY_FIELDS } from "../schemas/ifc-metrados.schema.js";
import {
    buildPartidaTree, groupPartidaElements,
    type PartidaElementRow, type PartidaElementsDetail, type PartidaTreeNode, type PartidaTreeRow
} from "../models/metrado-partidas.models.js";
import { assertIfcFileAccess } from "./ifc-metrados.service.js";

export const getPartidasTreeService = async (
    user : DecodedToken, { ifcFileId } : IfcFileIdParam
) : Promise<PartidaTreeNode[]> => {

    await assertIfcFileAccess(ifcFileId, user.user_id);

    const result = await pool.query<PartidaTreeRow>(
        `SELECT p.partida_id, p.parent_id, p.code, p.description, p.unit, p.sort_order,
            COALESCE(t.element_count, 0) AS element_count, t.total
        FROM metrado_partidas p
        LEFT JOIN metrado_partida_totals t ON t.partida_id = p.partida_id
        WHERE p.ifc_file_id = $1
        ORDER BY p.sort_order`,
        [ifcFileId]
    );

    return buildPartidaTree(result.rows);
};

export const getPartidaElementsService = async (
    user : DecodedToken, { ifcFileId, partidaId } : PartidaIdParam, { group_by : groupBy } : PartidaElementsBody
) : Promise<PartidaElementsDetail> => {

    await assertIfcFileAccess(ifcFileId, user.user_id);

    const partidaResult = await pool.query<{ unit : string | null }>(
        `SELECT unit FROM metrado_partidas WHERE partida_id = $1 AND ifc_file_id = $2`,
        [partidaId, ifcFileId]
    );

    const partida = partidaResult.rows[0];

    if (!partida) throw new AppError(IFC_METRADOS_ERRORS.PARTIDA_NOT_FOUND);

    const result = await pool.query<PartidaElementRow>(
        `SELECT e.element_id, e.express_id, e.name, e.level_name, e.space_name, e.tag,
            me.length, me.run_length, me.width, me.height, me.quantity, me.area, me.volume, me.weight
        FROM metrado_elements me
        JOIN ifc_elements e ON e.element_id = me.element_id
        WHERE me.partida_id = $1
        ORDER BY e.level_name, e.space_name, e.tag, e.element_id`,
        [partidaId]
    );

    const groups = groupPartidaElements(
        result.rows, groupBy && groupBy.length > 0 ? groupBy : GROUP_BY_FIELDS, partida.unit
    );

    const total = groups.reduce((acc, g) => acc + g.sub_total, 0);

    return { partida_id: partidaId, unit: partida.unit, total, groups };
};
