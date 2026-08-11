-- ============================================================
-- DATOS DE SISTEMA (no es seed de prueba)
-- ============================================================
-- Todo lo que va acá es parte del PRODUCTO en sí, no de un entorno
-- ni de una organización en particular: la app no arranca / no tiene
-- sentido sin estas filas. Se aplica en TODOS los entornos (local,
-- staging, producción) exactamente igual, siempre en este orden.
--
-- Qué NO va acá: usuarios, proyectos, o cualquier dato "de ejemplo"
-- para poder probar la app — eso vive en seed-test.sql y es
-- descartable. La diferencia clave: si mañana una organización nueva
-- usa el sistema, necesita ESTOS datos tal cual (o su propia
-- plantilla de metrados basada en el mismo catálogo), pero NO
-- necesita ningún usuario ni proyecto de acá.
-- ============================================================

-- ------------------------------------------------------------
-- ROLES DEL SISTEMA
-- ------------------------------------------------------------
-- El orden importa: backend/src/constants/roles.ts asume estos IDs
-- exactos (ADMINISTRADOR=1, SUPERVISOR=2, MODERADOR=3, USUARIO=4).
-- Si se agrega un rol nuevo, se agrega al final — nunca reordenar ni
-- borrar uno existente sin actualizar roles.ts en el mismo cambio.
INSERT INTO roles(name, is_assignable)
VALUES
    ('ADMINISTRADOR', false),
    ('SUPERVISOR', true),
    ('MODERADOR', true),
    ('USUARIO', true);


-- ------------------------------------------------------------
-- CATALOGO DE COLUMNAS BUILTIN PARA PLANTILLAS DE METRADO
-- ------------------------------------------------------------
-- Catálogo fijo de campos "de fábrica" que cualquier plantilla de
-- metrado puede usar como columna (ver metrado_template_columns).
-- No depende de ningún IFC procesado ni de ningún proyecto.
INSERT INTO builtin_field_catalog
    (builtin_field, label_default, data_type, is_aggregate, applies_to_group, sort_order) VALUES
    ('code',             'ITEM',        'text',    FALSE, 'identificacion', 1),
    ('description',      'DESCRIPCIÓN', 'text',    FALSE, 'identificacion', 2),
    ('unit',             'UND',         'text',    FALSE, 'identificacion', 3),
    ('level_name',       'NIVEL',       'text',    FALSE, 'identificacion', 4),
    ('space_name',       'ESPACIO',     'text',    FALSE, 'identificacion', 5),
    ('tag',              'TAG',         'text',    FALSE, 'identificacion', 6),
    ('length',           'Largo',       'numeric', FALSE, 'dimensiones',    1),
    ('width',            'Ancho',       'numeric', FALSE, 'dimensiones',    2),
    ('height',           'Altura',      'numeric', FALSE, 'dimensiones',    3),
    ('quantity',         'Cant.',       'numeric', FALSE, 'metrado',        1),
    ('length_total',     'Lon.',        'numeric', FALSE, 'metrado',        2),
    ('area_total',       'Área',        'numeric', FALSE, 'metrado',        3),
    ('volume_total',     'Vol.',        'numeric', FALSE, 'metrado',        4),
    ('weight_total',     'Kg.',         'numeric', FALSE, 'metrado',        5),
    ('unit_count_total', 'Und.',        'numeric', FALSE, 'metrado',        6),
    ('sub_total',        'Sub Total',   'numeric', TRUE,  'totales',        1),
    ('total',            'TOTAL',       'numeric', TRUE,  'totales',        2);


-- ------------------------------------------------------------
-- PLANTILLA DE METRADO "DEL SISTEMA" (metrado_templates.is_system)
-- ------------------------------------------------------------
-- Acá va, a futuro, el INSERT de la plantilla base que trae el
-- producto de fábrica (is_system=true, is_default=true) con sus
-- metrado_template_sets / metrado_template_columns. Es un ejemplo
-- exacto de lo que menciona el header de este archivo: cambia según
-- la organización (pueden crear las suyas), pero la base la define el
-- sistema — no es dato de prueba descartable como seed-test.sql.
--
-- Todavía no se agrega acá porque no está definida la norma/plantilla
-- base real (eso depende de norma.json, ver processing/). Cuando
-- exista, va en este archivo, no en seed-test.sql.
