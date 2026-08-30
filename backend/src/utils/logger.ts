import pino from "pino";

// mejoras-backend-post-auditoria.md, punto 3 — logging estructurado.
// Antes de esto, todo el logging era console.log/console.error suelto:
// funcionaba para desarrollo local (terminal a mano), pero ahora que
// la app corre en la máquina del cliente sin que nadie mire una
// terminal todo el día, `docker compose logs backend` es el
// mecanismo real de acceso — y eso necesita salida estructurada
// (JSON, con nivel) para poder filtrar/diagnosticar algo a distancia,
// no texto libre.
//
// No se migran los 100+ console.log/error existentes de una — eso es
// un cambio grande sin beneficio proporcional. Se usa este logger a
// partir de ahora en los puntos donde más importa (el pipeline de
// IFC/Fragments, y cualquier error no atrapado que llegue al
// errorHandler) — el resto se migra con el tiempo si hace falta.
//
// Nivel: LOG_LEVEL en .env, default 'debug' en desarrollo e 'info' en
// producción (NODE_ENV=production, ver docker-compose.yml) — 'debug'
// en local para no perderse nada mientras se desarrolla, 'info' en la
// máquina del cliente para no generar ruido de más.
const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
    level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
    // pino-pretty NO se instala (es una devDependency más, formatea
    // lindo para humano) — la salida siempre es JSON, incluso en
    // desarrollo, para que sea el mismo formato que se va a ver en
    // `docker compose logs backend` — evita el clásico "en mi máquina
    // se ve distinto".
    timestamp: pino.stdTimeFunctions.isoTime,
});
