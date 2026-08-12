-- ============================================================
-- RESET DE BASE DE DATOS — SOLO DESARROLLO/PRUEBAS LOCALES
-- ============================================================
-- Recrea la base `all_bim` desde cero: estructura + datos de sistema
-- + seed de prueba. BORRA todo lo que haya en la base actual.
--
-- Uso:  psql -U <usuario> -h localhost -d postgres -f database/reset.sql
--
-- No usar contra una base con datos reales — no hay confirmación.
-- ============================================================

DROP DATABASE IF EXISTS all_bim;

CREATE DATABASE all_bim;

\c all_bim

-- \ir (include relative) resuelve la ruta relativa a la ubicación de
-- ESTE archivo, sin importar desde qué directorio se llame a psql.
\ir schema.sql
\ir system-data.sql
\ir seed-test.sql
