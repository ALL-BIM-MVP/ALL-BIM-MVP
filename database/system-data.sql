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
--
-- Cada builtin_field tiene que ser un campo que de verdad exista en la
-- respuesta de POST /ifc-files/:id/partidas/:partidaId/elements — si
-- no, una plantilla podría pedir una columna que el backend nunca
-- puede resolver. Por eso son exactamente los campos de
-- PartidaElementGroup (backend/src/models/metrado-partidas.models.ts):
-- level_name/space_name/tag + los 8 de metrado_elements (length,
-- run_length, width, height, quantity, area, volume, weight) +
-- sub_total/total (calculados, no columnas propias de ninguna tabla).
-- code/description/unit vienen de metrado_partidas.
--
-- length ("Largo") es la dimensión BRUTA de la caja envolvente — NO es
-- el metrado. run_length ("Longitud") sí es el metrado (prioridad
-- revit>geométrico, ver processing/ifc/metrados.py) — son conceptos
-- distintos a propósito: un elemento curvo (tubería, conducto, acero
-- doblado) puede medir más por su recorrido real que por su caja
-- envolvente en línea recta. quantity SÍ sigue siendo el único campo
-- para "Und." (el metrado de las partidas 'und'), no hace falta uno
-- aparte ahí.
INSERT INTO builtin_field_catalog
    (builtin_field, label_default, data_type, is_aggregate, applies_to_group, sort_order) VALUES
    ('code',        'ITEM',        'text',    FALSE, 'identificacion', 1),
    ('description', 'DESCRIPCIÓN', 'text',    FALSE, 'identificacion', 2),
    ('unit',        'UND',         'text',    FALSE, 'identificacion', 3),
    ('level_name',  'NIVEL',       'text',    FALSE, 'identificacion', 4),
    ('space_name',  'ESPACIO',     'text',    FALSE, 'identificacion', 5),
    ('tag',         'TAG',         'text',    FALSE, 'identificacion', 6),
    ('length',      'Largo',       'numeric', FALSE, 'dimensiones',    1),
    ('width',       'Ancho',       'numeric', FALSE, 'dimensiones',    2),
    ('height',      'Altura',      'numeric', FALSE, 'dimensiones',    3),
    ('run_length',  'Longitud',    'numeric', FALSE, 'metrado',        1),
    ('quantity',    'Cant.',       'numeric', FALSE, 'metrado',        2),
    ('area',        'Área',        'numeric', FALSE, 'metrado',        3),
    ('volume',      'Vol.',        'numeric', FALSE, 'metrado',        4),
    ('weight',      'Kg.',         'numeric', FALSE, 'metrado',        5),
    ('sub_total',   'Sub Total',   'numeric', TRUE,  'totales',        1),
    ('total',       'TOTAL',       'numeric', TRUE,  'totales',        2);


-- ------------------------------------------------------------
-- PLANTILLA DE METRADO "DEL SISTEMA" (metrado_templates.is_system)
-- ------------------------------------------------------------
-- Sin esto, GET /templates/{id} nunca encuentra una fila con
-- is_default=true en una base recién creada, y el frontend no tiene
-- qué auto-cargar al entrar a la sección de metrados. created_by=NULL
-- identifica que es del sistema, no de un usuario (coherente con
-- is_system=TRUE). Replica el layout "Detallado" del Excel de
-- referencia, con los builtin_field reales de arriba (no los _total
-- especulativos de una ronda de diseño anterior a que existiera el
-- schema real). Idempotente: si ya hay una default, no hace nada.
DO $$
DECLARE
    v_template_id BIGINT;
    v_set_identificacion BIGINT;
    v_set_dimensiones BIGINT;
    v_set_metrado BIGINT;
BEGIN
    IF EXISTS (SELECT 1 FROM metrado_templates WHERE is_default) THEN
        RETURN;
    END IF;

    INSERT INTO metrado_templates (name, description, is_system, is_default, created_by)
    VALUES ('Detallado (default)', 'Plantilla estándar del sistema, replica el layout del Excel de referencia.', TRUE, TRUE, NULL)
    RETURNING template_id INTO v_template_id;

    INSERT INTO metrado_template_sets (template_id, name, sort_order)
    VALUES (v_template_id, 'IDENTIFICACION', 1) RETURNING template_set_id INTO v_set_identificacion;

    INSERT INTO metrado_template_sets (template_id, name, sort_order)
    VALUES (v_template_id, 'DIMENSIONES', 2) RETURNING template_set_id INTO v_set_dimensiones;

    INSERT INTO metrado_template_sets (template_id, name, sort_order)
    VALUES (v_template_id, 'METRADO', 3) RETURNING template_set_id INTO v_set_metrado;

    INSERT INTO metrado_template_columns (template_set_id, name, source_type, builtin_field, column_order) VALUES
        (v_set_identificacion, 'ITEM',        'builtin', 'code',        1),
        (v_set_identificacion, 'DESCRIPCIÓN', 'builtin', 'description', 2),
        (v_set_identificacion, 'UND',         'builtin', 'unit',        3);

    INSERT INTO metrado_template_columns (template_set_id, name, source_type, builtin_field, column_order) VALUES
        (v_set_dimensiones, 'Largo',  'builtin', 'length', 1),
        (v_set_dimensiones, 'Ancho',  'builtin', 'width',  2),
        (v_set_dimensiones, 'Altura', 'builtin', 'height', 3);

    INSERT INTO metrado_template_columns (template_set_id, name, source_type, builtin_field, column_order) VALUES
        (v_set_metrado, 'Longitud',  'builtin', 'run_length', 1),
        (v_set_metrado, 'Cant.',     'builtin', 'quantity',   2),
        (v_set_metrado, 'Área',      'builtin', 'area',       3),
        (v_set_metrado, 'Vol.',      'builtin', 'volume',     4),
        (v_set_metrado, 'Kg.',       'builtin', 'weight',     5),
        (v_set_metrado, 'Sub Total', 'builtin', 'sub_total',  6),
        (v_set_metrado, 'TOTAL',     'builtin', 'total',      7);
END $$;
