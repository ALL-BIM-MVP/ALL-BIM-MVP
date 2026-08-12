-- ============================================================
-- SEED DE PRUEBA (solo para desarrollo local — NO producción)
-- ============================================================
-- Datos descartables para poder levantar la app y probar login sin
-- tener que pasar por el flujo de invitación completo. Nada de acá
-- es necesario para que el sistema funcione (a diferencia de
-- system-data.sql) — se puede borrar, cambiar o dejar vacío sin que
-- se rompa nada. El seed real de producción (org inicial, admin real,
-- etc.) es un proceso aparte, todavía no definido.
-- ============================================================

-- Usuario admin de prueba.
-- Credenciales para login local: ismael@email.com / Test1234!
-- (hash bcrypt, cost 10 — regenerar con `node -e "require('bcrypt').hash('...', 10).then(console.log)"` si se quiere otra clave)
INSERT INTO users (
    name, email, password_hash, role_id
)
VALUES (
    'Ismael', 'ismael@email.com', '$2b$10$SoqjQOp4mvsgfGlKGJoNguMUdf93pcXhPAyib1/TESmeNO2kgsX66', 1
);

-- Invitación de prueba pendiente, para probar el flujo de aceptación.
-- PARA EL UUID : 621a7eaf-4d18-46eb-8fcb-9b3935f292a3
INSERT INTO user_invitations(
    email, token_hash, role_id
)
VALUES (
    'ismaelsalvadorpachacutecllanos@gmail.com',
    'a6957c03a48a92d4a510ec6d67943c90399009a49e741759e1869ae6e2537a5f',
    1
);
