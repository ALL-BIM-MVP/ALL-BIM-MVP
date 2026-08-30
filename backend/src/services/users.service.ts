import pool from "../db/database.js";
import bcrypt from 'bcrypt';
import type { ProfilePictureInfo, UserLayout, UserResponse } from "../models/users.models.js";
import { toProfilePictureUrl } from "../models/users.models.js";
import type { RegisterRequest } from "../schemas/auth.schema.js";
import type { GetUsersQuery, SetUserActiveRequest, UpdateMeRequest, UserIdParam } from "../schemas/users.schema.js";
import { hashToken } from "../utils/hashing.js";
import type { AuthPayload, AuthResponse, DecodedToken } from "../models/auth.models.js";
import { createSession } from "./session.service.js";
import { ROLES } from "../constants/roles.js";
import type { PoolClient } from "pg";
import { INVITATION_ERRRORS } from "../models/errors/invitation.errors.js";
import { USER_ERRORS } from "../models/errors/user.errors.js";
import { COMMON_ERRORS } from "../models/errors/common.errors.js";
import { AppError } from "../models/errors/app-error.js";
import { saveProfilePicture, deleteProfilePicture } from "../utils/avatar.js";

// Bootstrap del primer usuario ADMINISTRADOR — hace falta porque
// role_id=1 (ADMINISTRADOR) tiene is_assignable=false A PROPÓSITO
// (nunca se puede otorgar por el flujo normal de invitación/registro
// — ver createInvitationService, que exige is_assignable=true). En
// una BD recién creada (instalación nueva, solo schema.sql +
// system-data.sql, sin seed-test.sql — ver docker-compose.yml) no
// existe NINGÚN usuario, y sin usuario no hay quien invite al primero:
// huevo y gallina real, no teórico (encontrado preparando la
// instalación en la máquina del cliente).
//
// Se llama una vez al arrancar el server (ver index.ts), después de
// recoverStaleProcessingRows. Solo actúa si la tabla users está
// COMPLETAMENTE VACÍA (nunca en un entorno que ya tiene usuarios, como
// el de desarrollo de todos los días — ahí este chequeo siempre
// corta acá y no hace nada) Y si las dos env vars vienen seteadas — si
// no, no hace nada. A propósito NO hay ninguna contraseña por defecto
// hardcodeada en ningún lado del código: sin las env vars, simplemente
// no se crea nadie, en vez de dejar una credencial conocida dando
// vueltas en el repo.
export const ensureBootstrapAdminService = async () : Promise<void> => {
    const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    if (!email || !password) return;

    const { rows } = await pool.query(`SELECT 1 FROM users LIMIT 1`);
    if (rows.length > 0) return; // ya hay al menos un usuario, no es una instalación nueva

    const passwordHash = await bcrypt.hash(password, 10);
    await pool.query(
        `INSERT INTO users (name, email, password_hash, role_id) VALUES ($1, $2, $3, $4)`,
        ["Admin", email, passwordHash, ROLES.ADMINISTRADOR]
    );
    console.log(`🔑 Usuario administrador inicial creado (${email}) — cambiá la contraseña cuanto antes.`);
};

export const registerService = async ({name, last_name, password, token} : RegisterRequest) : Promise< AuthResponse >=> {

    const client : PoolClient = await pool.connect();
    try {
        await client.query("BEGIN");

        const tokenHashed = hashToken(token);
        const invitationQuery = await client.query(
            `SELECT role_id, email FROM user_invitations
                WHERE token_hash = $1 AND expires_at > NOW() AND used = false
                LIMIT 1 `,
            [tokenHashed]
        );

        if (invitationQuery.rowCount === 0) throw new AppError(INVITATION_ERRRORS.INVITATION_INVALID);
        const { role_id, email } = invitationQuery.rows[0];

        // El email puede pertenecer a una cuenta ACTIVA (bloquea, como
        // siempre) o a una ELIMINADA (is_deleted=true) — en ese caso no
        // hay choque real: esa fila se retoma más abajo en vez de
        // insertar una nueva (ver createInvitationService, que ya deja
        // pasar la invitación en este segundo caso).
        const userQuery = await client.query<{ user_id : number; is_deleted : boolean }>(
            `SELECT user_id, is_deleted FROM users WHERE email = $1`,
            [email]
        );
        const existing = userQuery.rows[0];

        if (existing && !existing.is_deleted) throw new AppError(USER_ERRORS.USER_ALREADY_EXISTS);

        const passwordHash = await bcrypt.hash(password, 10);

        // Retoma la cuenta eliminada: mismo user_id de siempre, así que
        // conserva su historial (proyectos, archivos subidos) — pero
        // contraseña y rol quedan totalmente nuevos, no se reutiliza
        // nada de la cuenta vieja más que la fila en sí.
        const newUser = existing
            ? await client.query(
                `UPDATE users SET
                    name = $1, last_name = $2, password_hash = $3, role_id = $4,
                    is_deleted = false, deleted_by = NULL, deleted_at = NULL,
                    active = true, deactivated_by = NULL, deactivated_at = NULL
                WHERE user_id = $5
                RETURNING *`,
                [name, last_name ?? null, passwordHash, role_id, existing.user_id]
            )
            : await client.query(
                `INSERT INTO users(name, last_name, email, password_hash, role_id)
                    VALUES ($1, $2, $3, $4, $5)
                    RETURNING *`,
                [name, last_name ?? null, email, passwordHash, role_id]
            );
        const user = newUser.rows[0];

        await client.query(
            `UPDATE user_invitations SET used = true WHERE token_hash = $1`,
            [tokenHashed]
        );

        const payload : AuthPayload = {
            role_id: user.role_id,
            user_id: user.user_id,
            email: user.email
        };
        const tokens = await createSession(payload, client);
        await client.query("COMMIT");
        return {
            ...tokens,
            rol_id: user.role_id,
            user: {
                id: user.user_id,
                name: user.name,
                last_name: user.last_name,
                correo: user.email,
                // Siempre null acá — recién creada la cuenta, todavía
                // no hay foto que subir (RETURNING * ya trae la
                // columna real de todos modos, no se hardcodea).
                profile_picture_url: toProfilePictureUrl(user.profile_picture_path),
            }
        }
    } catch (error) {
        await client.query("ROLLBACK");
        if (error instanceof AppError) throw error;

        throw new AppError(COMMON_ERRORS.INTERNAL_SERVER_ERROR);
    } finally {
        client.release();
    }
};

export const getMeService = async (userId : number) : Promise<UserLayout> => {
    const result = await pool.query(
        `SELECT u.user_id, r.name AS role_name, u.name, u.last_name, u.email,
            u.profile_picture_path, u.created_at
            FROM users AS u
            INNER JOIN roles AS r USING(role_id)
            WHERE u.user_id = $1 LIMIT 1`,
        [userId]
    );

    const userInfo = result.rows[0];

    if (!userInfo) {
        throw new AppError(USER_ERRORS.USER_NOT_FOUND);
    }

    const { profile_picture_path, ...rest } = userInfo;
    return { ...rest, profile_picture_url: toProfilePictureUrl(profile_picture_path) };
}


export const getAllUsersService = async ( {sort, active, order, include_deleted} : GetUsersQuery) : Promise<UserResponse[]> => {

    const queryParams: any[] = [ROLES.ADMINISTRADOR];
    let activeFilter = "";
    if (active !== undefined) {
        queryParams.push(active);
        activeFilter = `AND u.active = $${queryParams.length}`;
    }
    const deletedFilter = include_deleted ? "" : "AND u.is_deleted = false";

    const usersQuery = await pool.query(
        `SELECT u.user_id, r.role_id, r.name AS role_name, u.name, u.last_name, u.email,
            u.profile_picture_path, u.active, u.is_deleted, u.created_at
            FROM users AS u
            INNER JOIN roles AS r USING(role_id)
            WHERE r.role_id != $1 ${activeFilter} ${deletedFilter}
            ORDER BY u.${sort} ${order}`,
        queryParams
    );

    return usersQuery.rows.map(({ profile_picture_path, ...rest }) => ({
        ...rest, profile_picture_url: toProfilePictureUrl(profile_picture_path),
    }));
};

// PATCH /users/me — autogestión, name/last_name propios.
export const updateMeService = async (userId : number, input : UpdateMeRequest) : Promise<UserLayout> => {
    const fields : string[] = [];
    const values : any[] = [];

    if (input.name !== undefined) {
        values.push(input.name);
        fields.push(`name = $${values.length}`);
    }
    if (input.last_name !== undefined) {
        values.push(input.last_name);
        fields.push(`last_name = $${values.length}`);
    }

    values.push(userId);
    const result = await pool.query(
        `UPDATE users SET ${fields.join(", ")} WHERE user_id = $${values.length} AND is_deleted = false
        RETURNING user_id`,
        values
    );
    if (result.rowCount === 0) throw new AppError(USER_ERRORS.USER_NOT_FOUND);

    return getMeService(userId);
};

// PUT /users/me/photo — autogestión. saveProfilePicture ya escribe
// SIEMPRE el mismo path determinístico (avatars/<userId>.jpg, ver
// utils/avatar.ts) — no hace falta borrar "la anterior", se
// sobreescribe sola.
export const uploadProfilePictureService = async (userId : number, buffer : Buffer) : Promise<ProfilePictureInfo> => {
    let finalPath : string;
    try {
        finalPath = await saveProfilePicture(buffer, userId);
    } catch {
        throw new AppError(USER_ERRORS.INVALID_IMAGE_FILE);
    }

    const result = await pool.query(
        `UPDATE users SET profile_picture_path = $1 WHERE user_id = $2 AND is_deleted = false RETURNING user_id`,
        [finalPath, userId]
    );
    if (result.rowCount === 0) {
        await deleteProfilePicture(finalPath);
        throw new AppError(USER_ERRORS.USER_NOT_FOUND);
    }

    return { profile_picture_url: toProfilePictureUrl(finalPath) };
};

// DELETE /users/me/photo — autogestión.
export const deleteProfilePictureService = async (userId : number) : Promise<ProfilePictureInfo> => {
    const result = await pool.query<{ profile_picture_path : string | null }>(
        `UPDATE users SET profile_picture_path = NULL
        WHERE user_id = $1 AND is_deleted = false
        RETURNING (SELECT profile_picture_path FROM users WHERE user_id = $1) AS profile_picture_path`,
        [userId]
    );
    const row = result.rows[0];
    if (!row) throw new AppError(USER_ERRORS.USER_NOT_FOUND);
    if (!row.profile_picture_path) throw new AppError(USER_ERRORS.NO_PROFILE_PICTURE);

    await deleteProfilePicture(row.profile_picture_path);
    return { profile_picture_url: null };
};

// Todas las sesiones activas de un usuario dejan de servir — se usa al
// desactivar (active=false) y al eliminar (is_deleted=true) una
// cuenta, en los dos casos por el mismo motivo: no tiene sentido que
// un refresh token ya emitido siga funcionando para una cuenta que
// acaba de perder acceso.
const revokeAllSessions = async (client : PoolClient, userId : number) : Promise<void> => {
    await client.query(
        `UPDATE refresh_tokens SET active = false WHERE user_id = $1 AND active = true`,
        [userId]
    );
};

// PATCH /users/:userId/active — SOLO administrador (rol de cuenta),
// nunca sobre sí mismo (ver CANNOT_TARGET_SELF). Reversible: se puede
// volver a togglear en cualquier sentido.
export const setUserActiveService = async (
    admin : DecodedToken, { userId } : UserIdParam, { active } : SetUserActiveRequest
) : Promise<UserResponse> => {

    if (admin.user_id === userId) throw new AppError(USER_ERRORS.CANNOT_TARGET_SELF);

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const result = await client.query(
            `UPDATE users SET active = $1, deactivated_by = $2, deactivated_at = NOW()
            WHERE user_id = $3 AND is_deleted = false
            RETURNING 1`,
            [active, admin.user_id, userId]
        );
        if (result.rowCount === 0) throw new AppError(USER_ERRORS.USER_NOT_FOUND);

        if (!active) await revokeAllSessions(client, userId);

        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }

    return (await getUserByIdForAdminService(userId))!;
};

// Fila completa (shape de UserResponse) de un usuario puntual — usada
// por setUserActiveService/deleteUser*Service para devolver el estado
// final sin duplicar el SELECT de getAllUsersService.
const getUserByIdForAdminService = async (userId : number) : Promise<UserResponse | null> => {
    const result = await pool.query(
        `SELECT u.user_id, r.role_id, r.name AS role_name, u.name, u.last_name, u.email,
            u.profile_picture_path, u.active, u.is_deleted, u.created_at
            FROM users AS u
            INNER JOIN roles AS r USING(role_id)
            WHERE u.user_id = $1`,
        [userId]
    );
    const row = result.rows[0];
    if (!row) return null;
    const { profile_picture_path, ...rest } = row;
    return { ...rest, profile_picture_url: toProfilePictureUrl(profile_picture_path) };
};

// Núcleo compartido de la baja de cuenta (self o admin) — is_deleted
// NO se expone para revertir desde la API (ver comentario en
// database/schema.sql), a diferencia de active. Borra la foto de
// perfil físicamente (si había) y revoca toda sesión activa; el resto
// de los datos del usuario (archivos subidos, membresías, invitaciones)
// se deja intacto a propósito.
const deleteUserCore = async (targetUserId : number, deletedBy : number) : Promise<void> => {
    // La cuenta ADMINISTRADOR nunca se borra — ver CANNOT_DELETE_ADMINISTRATOR.
    // Chequeo explícito ANTES de la transacción: un mensaje claro acá,
    // no el error crudo del CHECK de la BD (esa es la red de
    // seguridad de verdad, esto es la experiencia normal).
    const roleCheck = await pool.query<{ role_id : number }>(
        `SELECT role_id FROM users WHERE user_id = $1`, [targetUserId]
    );
    if (roleCheck.rows[0]?.role_id === ROLES.ADMINISTRADOR) {
        throw new AppError(USER_ERRORS.CANNOT_DELETE_ADMINISTRATOR);
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const result = await client.query<{ profile_picture_path : string | null }>(
            `UPDATE users SET is_deleted = true, deleted_by = $1, deleted_at = NOW()
            WHERE user_id = $2 AND is_deleted = false
            RETURNING profile_picture_path`,
            [deletedBy, targetUserId]
        );
        if (result.rowCount === 0) throw new AppError(USER_ERRORS.USER_NOT_FOUND);

        await revokeAllSessions(client, targetUserId);
        await client.query("COMMIT");

        const picturePath = result.rows[0]!.profile_picture_path;
        if (picturePath) await deleteProfilePicture(picturePath);
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};

// DELETE /users/me — autogestión, directa (sin estado de suspensión
// previo por ahora — queda anotado como posible mejora futura, ver
// docs/roadmap-modulos-y-permisos.md).
export const deleteSelfService = async (userId : number) : Promise<void> => {
    await deleteUserCore(userId, userId);
};

// DELETE /users/:userId — SOLO administrador, nunca sobre sí mismo
// (para eso está deleteSelfService, sin pasar por la ruta de admin).
export const deleteUserByAdminService = async (admin : DecodedToken, { userId } : UserIdParam) : Promise<void> => {
    if (admin.user_id === userId) throw new AppError(USER_ERRORS.CANNOT_TARGET_SELF);
    await deleteUserCore(userId, admin.user_id);
};
