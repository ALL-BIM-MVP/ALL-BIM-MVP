import bcrypt from 'bcrypt';
import pool from "../db/database.js";
import type { Login, Tokens, AuthPayload } from '../models/auth.models.js';
import { generarAccessToken, generarRefreshToken } from '../utils/jwt.js';
import type { Usuario } from '../models/usuario.models.js';

export const loginService = async ({correo, contrasena} : Login) : Promise<Tokens | null> => {
    const result = await pool.query(
        `SELECT * FROM usuarios WHERE correo = $1`,
        [correo]
    );

    const usuario : Usuario | undefined = result.rows[0];
    if (!usuario) return null;

    const storedHash = usuario.contrasena_hash;

    // COMPARACION DIRECTA MIENTRAS PRUEBAS
    const esValido = storedHash.startsWith('$2')
        ? await bcrypt.compare(contrasena, storedHash)
        : storedHash === contrasena;

    if (!esValido) return null;

    const payload : AuthPayload = {
        usuario_id: usuario.usuario_id,
        correo: usuario.correo
    };

    return {
        access_token: generarAccessToken(payload),
        refresh_token: generarRefreshToken(payload)
    };
};
