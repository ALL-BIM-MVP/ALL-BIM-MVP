// casilla — ver docs/roadmap/almacen-bim-base-datos.md 1.4. Sin CRUD
// propio en esta fase (se generan solas con su estante, ver
// insertCasillasParaEstante más abajo, llamado desde
// estante.service.ts dentro de la misma transacción) — solo el rename
// explícito que pide el diseño ("nombre... editable, puede
// repetirse").
//
// Módulo hoja a propósito: NO importa nada de estante.service.ts (evita
// el ciclo estante→casilla→estante, ya que estante.service.ts sí
// importa de acá) — el chequeo de que el estante exista se hace acá
// mismo con una consulta liviana, no reusando getEstanteRowOrThrow.
import pool from "../../db/database.js";
import type { PoolClient } from "pg";
import { AppError } from "../../models/errors/app-error.js";
import { CASILLA_ERRORS } from "../../models/errors/almacen/casilla.errors.js";
// Importar el error de estante acá NO genera el ciclo que sí generaría
// importar services/almacen/estante.service.ts (ver comentario grande
// más arriba) — es solo la constante de error, no una llamada de
// servicio a servicio.
import { ESTANTE_ERRORS } from "../../models/errors/almacen/estante.errors.js";
import type { DecodedToken } from "../../models/auth.models.js";
import { assertModulePermission } from "../project-access.service.js";
import { ALMACEN_MODULE_CODE, getAlmacenRowOrThrow } from "./almacen.service.js";
import type { CasillaIdParam, UpdateCasillaBody } from "../../schemas/almacen/casilla.schema.js";
import type { CasillaRow } from "../../models/almacen/casilla.models.js";

// Bahía/nivel se muestran 1-based en `ubicacion` (más legible que
// empezar en 0), aunque se guarden 0-based en las columnas — mismo
// criterio de rótulo que ya usa el prototipo (nombreEstante + ' ·
// bahía ' + (bx+1) + ' · nivel ' + ...). `nombre` arranca igual a
// `ubicacion` pero es editable después (ver diseño 1.4) — acá recién
// creada, todavía no se editó.
export const construirCasillas = (
    nombreEstante: string, ancho: number, niveles: number, profundidad: number
): { bahia: number; nivel: number; cara: number; ubicacion: string; nombre: string }[] => {
    const filas: { bahia: number; nivel: number; cara: number; ubicacion: string; nombre: string }[] = [];
    const caras = profundidad === 2 ? [0, 1] : [0];

    for (let bahia = 0; bahia < ancho; bahia++) {
        for (let nivel = 0; nivel < niveles; nivel++) {
            for (const cara of caras) {
                const caraTxt = profundidad === 2 ? ` · cara ${cara === 0 ? "delantera" : "trasera"}` : "";
                const ubicacion = `${nombreEstante} · bahía ${bahia + 1} · nivel ${nivel + 1}${caraTxt}`;
                filas.push({ bahia, nivel, cara, ubicacion, nombre: ubicacion });
            }
        }
    }
    return filas;
};

// Llamado desde estante.service.ts (createEstanteService), dentro de
// la MISMA transacción que el INSERT del estante — por eso recibe el
// `client` de esa transacción en vez de usar el `pool` global.
export const insertCasillasParaEstante = async (
    client: PoolClient, estanteId: number, nombreEstante: string, ancho: number, niveles: number, profundidad: number
): Promise<void> => {
    const filas = construirCasillas(nombreEstante, ancho, niveles, profundidad);
    for (const f of filas) {
        await client.query(
            `INSERT INTO casilla (estante_id, bahia, nivel, cara, ubicacion, nombre)
            VALUES ($1,$2,$3,$4,$5,$6)`,
            [estanteId, f.bahia, f.nivel, f.cara, f.ubicacion, f.nombre]
        );
    }
};

// Llamado desde estante.service.ts (getEstanteByIdService) para armar
// la respuesta anidada de un estante con sus casillas.
export const listCasillasDeEstante = async (estanteId: number): Promise<CasillaRow[]> => {
    const { rows } = await pool.query<CasillaRow>(
        `SELECT * FROM casilla WHERE estante_id = $1 AND eliminado_en IS NULL ORDER BY cara, nivel, bahia`,
        [estanteId]
    );
    return rows;
};

export const updateCasillaService = async (
    user: DecodedToken, { projectId, almacenId, estanteId, casillaId }: CasillaIdParam, body: UpdateCasillaBody
): Promise<CasillaRow> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");
    await getAlmacenRowOrThrow(projectId, almacenId);

    // Chequeo liviano de que el estante exista y sea de este almacén —
    // a propósito no reusa getEstanteRowOrThrow (evita importar
    // estante.service.ts, ver comentario grande arriba).
    const { rowCount: estanteExiste } = await pool.query(
        `SELECT 1 FROM estante WHERE estante_id = $1 AND almacen_id = $2 AND eliminado_en IS NULL`,
        [estanteId, almacenId]
    );
    if (estanteExiste === 0) throw new AppError(ESTANTE_ERRORS.ESTANTE_NOT_FOUND);

    const { rows } = await pool.query<CasillaRow>(
        `UPDATE casilla SET nombre = $1, actualizado_en = NOW()
        WHERE casilla_id = $2 AND estante_id = $3 AND eliminado_en IS NULL
        RETURNING *`,
        [body.nombre, casillaId, estanteId]
    );
    const casilla = rows[0];
    if (!casilla) throw new AppError(CASILLA_ERRORS.CASILLA_NOT_FOUND);
    return casilla;
};
