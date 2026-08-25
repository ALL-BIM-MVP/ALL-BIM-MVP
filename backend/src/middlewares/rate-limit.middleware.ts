import rateLimit from "express-rate-limit";
import { AUTH_ERRORS } from "../models/errors/auth.errors.js";

// Solo /auth/login por ahora — es el único endpoint público sin
// requireAuth que además valida un secreto (password). /refresh
// requiere ya tener un refresh_token válido (mucho más caro de
// adivinar que una contraseña), así que no se limita acá.
//
// 10 intentos / 15 min por IP: generoso para un usuario real que se
// equivoca de contraseña un par de veces, agresivo para fuerza bruta
// (a ese ritmo, probar un diccionario chico ya tarda días). Cuenta
// SOLO los intentos fallidos (skipSuccessfulRequests) — un usuario
// que efectivamente inicia sesión varias veces seguidas (varias
// pestañas, reintentos de red) no se queda bloqueado por eso.
export const loginRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    handler: (_req, res) => {
        res.status(AUTH_ERRORS.TOO_MANY_LOGIN_ATTEMPTS.statusCode).json(AUTH_ERRORS.TOO_MANY_LOGIN_ATTEMPTS.response);
    },
});
