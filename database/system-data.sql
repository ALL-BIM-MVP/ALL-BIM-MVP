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
-- MÓDULOS + ROLES/PERMISOS POR MÓDULO (Fase 2 — reemplaza
-- project_roles, ver docs/roadmap-modulos-y-permisos.md)
-- ------------------------------------------------------------
-- Los 6 módulos reales de la app — solo METRADOS BIM tiene
-- funcionalidad hoy (is_active=true), el resto son slots reservados.
INSERT INTO modules (code, name, is_active) VALUES
    ('metrados',  'METRADOS BIM',   true),
    ('ssomma',    'SSOMMA BIM',     false),
    ('calidad',   'CALIDAD BIM',    false),
    ('logistica', 'LOGISTICA BIM',  false),
    ('costos',    'COSTOS BIM',     false),
    ('planos',    'PLANOS BIM',     false);

-- Vocabulario ÚNICO de permisos, reusado entre TODOS los módulos (no
-- un catálogo por módulo) — export/configure quedan reservados para
-- las Fases 4/5 (exportar Excel, configuración CSRT), ya sembrados acá
-- para no migrar de nuevo cuando lleguen, aunque hoy ningún rol los
-- otorgue de verdad salvo Administrador.
INSERT INTO module_permissions (code, label_default) VALUES
    ('view',      'Ver'),
    ('upload',    'Subir'),
    ('process',   'Procesar'),
    ('delete',    'Eliminar'),
    ('export',    'Exportar'),
    ('configure', 'Configurar');

-- Roles del módulo METRADOS — los únicos con funcionalidad real hoy.
-- Administrador = techo (todos los permisos, incluso los reservados a
-- futuro). Visualizador = piso (solo ver). Editor = todo lo operativo
-- de hoy (ver/subir/procesar/eliminar) sin lo reservado a futuro — así
-- quedan los dos extremos fáciles de probar más uno intermedio.
DO $$
DECLARE
    v_module_id INT;
    v_role_admin INT;
    v_role_editor INT;
    v_role_viewer INT;
BEGIN
    SELECT module_id INTO v_module_id FROM modules WHERE code = 'metrados';

    INSERT INTO module_roles (module_id, name, description) VALUES
        (v_module_id, 'Administrador', 'Acceso completo: ver, subir, procesar, eliminar y configurar el módulo.')
        RETURNING module_role_id INTO v_role_admin;
    INSERT INTO module_roles (module_id, name, description) VALUES
        (v_module_id, 'Editor', 'Puede ver, subir, procesar y eliminar archivos, pero no configurar el módulo.')
        RETURNING module_role_id INTO v_role_editor;
    INSERT INTO module_roles (module_id, name, description) VALUES
        (v_module_id, 'Visualizador', 'Solo puede ver — no puede subir, procesar ni eliminar nada.')
        RETURNING module_role_id INTO v_role_viewer;

    INSERT INTO module_role_permissions (module_role_id, module_permission_id)
    SELECT v_role_admin, module_permission_id FROM module_permissions; -- Administrador: TODOS

    INSERT INTO module_role_permissions (module_role_id, module_permission_id)
    SELECT v_role_editor, module_permission_id FROM module_permissions
        WHERE code IN ('view', 'upload', 'process', 'delete');

    INSERT INTO module_role_permissions (module_role_id, module_permission_id)
    SELECT v_role_viewer, module_permission_id FROM module_permissions
        WHERE code = 'view';
END $$;


-- ------------------------------------------------------------
-- ESPECIALIDADES DE IFC (Fase 3 — ver
-- docs/roadmap-modulos-y-permisos.md)
-- ------------------------------------------------------------
-- Catálogo inicial pedido por el cliente. Se pueden agregar más
-- después sin migración (INSERT nuevo, is_active=true) — nada del
-- backend depende de un code fijo salvo Zod validando "existe y está
-- activa", igual que con modules.
INSERT INTO ifc_specialties (code, name, is_active) VALUES
    ('arquitectura', 'Arquitectura', true),
    ('estructuras',  'Estructuras',  true),
    ('sanitarias',   'Sanitarias',   true);


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
-- level_name/space_name/tag/element_count + los 9 de metrado_elements
-- (length, run_length, width, height, diameter, quantity, area,
-- volume, weight) + sub_total (calculado, no es columna propia de
-- ninguna tabla). code/description/unit vienen de metrado_partidas.
--
-- *** NO hay un builtin_field "total" (existió, se sacó) *** — esa
-- respuesta nunca tuvo un total propio a nivel de partida (eso vive en
-- PartidaTreeNode.total, del árbol — GET /ifc-files/:id/partidas, ver
-- 3.1 en la doc), y por un tiempo el catálogo/la plantilla default sí
-- ofrecían una columna "TOTAL"->total que en la práctica no resolvía a
-- nada real (quedó ahí de una ronda de diseño anterior). Se confirmó
-- con el reporte real del cliente: mostrar el total de TODA la partida
-- repetido en cada fila del detalle confundía al usuario — la columna
-- se sacó de la respuesta primero, y de acá (el catálogo) y de la
-- plantilla "Detallado (default)" más abajo después, para no dejar una
-- columna fantasma que un usuario pudiera agregar a su propia
-- plantilla y nunca reciba valor.
--
-- length ("Largo") es la dimensión BRUTA de la caja envolvente — NO es
-- el metrado. run_length ("Longitud") sí es el metrado (prioridad
-- revit>geométrico, ver processing/ifc/metrados.py) — son conceptos
-- distintos a propósito: un elemento curvo (tubería, conducto, acero
-- doblado) puede medir más por su recorrido real que por su caja
-- envolvente en línea recta. diameter es NULL para todo lo que no sea
-- perfil circular (tubos) — ver comentario en database/schema.sql,
-- metrado_elements.
--
-- *** quantity vs element_count — NO son lo mismo, este catálogo antes
-- los confundía (quantity estaba etiquetado 'Cant.', y no existía una
-- fila aparte para element_count) ***. Replicando el Excel de
-- referencia (processing/proceso-metrados-base/outputs/metrados_reales.xlsx,
-- hoja "Detallado"): la fila de encabezados tiene un grupo METRADO con
-- 5 sub-columnas (Lon./Área/Vol./Kg./Und.) y, APARTE, una columna
-- "Cant." propia entre DIMENSIONES y METRADO, sin sub-columnas — dos
-- conceptos distintos, no una columna con dos nombres:
--   - quantity ("Und.", grupo 'metrado') = el metrado real de una
--     partida 'und' — viene de extraer_metrados_revit_completo (la
--     IfcQuantityCount que Revit ya trae, o 1.0 de fallback). Es el
--     valor que corresponde multiplicar por element_count al armar
--     sub_total, igual que run_length/area/volume/weight para las
--     otras unidades — NUNCA se muestra solo, junto a los otros 4.
--   - element_count ("Cant.", grupo nuevo 'cantidad') = cuántos
--     elementos físicos idénticos (mismo tag+dimensiones) se agruparon
--     en esta fila — ver groupPartidaElements en
--     metrado-partidas.models.ts. Es SIEMPRE un conteo de filas
--     agrupadas, sin importar la unidad de la partida (aplica igual a
--     'm', 'm2', 'kg', 'und', lo que sea) — por eso es su propio grupo
--     de columna, no parte de METRADO. is_aggregate=TRUE porque, igual
--     que sub_total, no es un campo propio de ninguna fila de
--     metrado_elements — se calcula contando cuántas filas cayeron en
--     el mismo grupo.
-- 'name' (Fase 5, ver docs/roadmap-modulos-y-permisos.md): el Name
-- crudo del IFC — se agrega al catálogo (disponible para quien arme
-- una plantilla propia) pero NUNCA va en la plantilla del sistema —
-- se repite entre elementos de un mismo tipo/familia, no identifica
-- nada (confirmado con el cliente). "DESCRIPCIÓN" en la plantilla
-- default usa 'tag' en su lugar, ver más abajo — mismo criterio que ya
-- usa la agrupación (groupPartidaElements agrupa por tag, no por name).
INSERT INTO builtin_field_catalog
    (builtin_field, label_default, data_type, is_aggregate, applies_to_group, sort_order) VALUES
    ('code',           'ITEM',        'text',    FALSE, 'identificacion', 1),
    ('description',    'DESCRIPCIÓN', 'text',    FALSE, 'identificacion', 2),
    ('unit',           'UND',         'text',    FALSE, 'identificacion', 3),
    ('level_name',     'NIVEL',       'text',    FALSE, 'identificacion', 4),
    ('space_name',     'ESPACIO',     'text',    FALSE, 'identificacion', 5),
    ('tag',            'TAG',         'text',    FALSE, 'identificacion', 6),
    ('name',           'Nombre',      'text',    FALSE, 'identificacion', 7),
    ('length',         'Largo',       'numeric', FALSE, 'dimensiones',    1),
    ('width',          'Ancho',       'numeric', FALSE, 'dimensiones',    2),
    ('height',         'Altura',      'numeric', FALSE, 'dimensiones',    3),
    ('diameter',       'Diámetro',    'numeric', FALSE, 'dimensiones',    4),
    ('element_count',  'Cant.',       'integer', TRUE,  'cantidad',       1),
    ('run_length',     'Longitud',    'numeric', FALSE, 'metrado',        1),
    ('area',           'Área',        'numeric', FALSE, 'metrado',        2),
    ('volume',         'Vol.',        'numeric', FALSE, 'metrado',        3),
    ('weight',         'Kg.',         'numeric', FALSE, 'metrado',        4),
    ('quantity',       'Und.',        'numeric', FALSE, 'metrado',        5),
    ('origen_metrado', 'Origen',      'text',    FALSE, 'metrado',        6),
    ('sub_total',      'Sub Total',   'numeric', TRUE,  'totales',        1);


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
    v_set_cantidad BIGINT;
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

    -- "Cant." (element_count) es su propio set de una sola columna,
    -- sin sub-encabezado — en el Excel de referencia ("3.0 METRADOS DE
    -- ARQUITECTURA.xlsx", Fase 5) sale ANTES de DIMENSIONES, no es una
    -- de las 5 sub-columnas de METRADO (esas son Lon./Área/Vol./Kg./Und.
    -- — ver comentario en el INSERT de builtin_field_catalog más
    -- arriba, quantity/"Und." SÍ va adentro de METRADO).
    INSERT INTO metrado_template_sets (template_id, name, sort_order)
    VALUES (v_template_id, 'CANT.', 2) RETURNING template_set_id INTO v_set_cantidad;

    INSERT INTO metrado_template_sets (template_id, name, sort_order)
    VALUES (v_template_id, 'DIMENSIONES', 3) RETURNING template_set_id INTO v_set_dimensiones;

    INSERT INTO metrado_template_sets (template_id, name, sort_order)
    VALUES (v_template_id, 'METRADO', 4) RETURNING template_set_id INTO v_set_metrado;

    -- DESCRIPCIÓN acá usa 'tag', NO 'description' — esta plantilla
    -- describe columnas de fila de ELEMENTO/GRUPO (una por tag, ver
    -- groupPartidaElements), no de partida — mostrar el texto de la
    -- partida repetido en cada fila de elemento es tan inútil como
    -- mostrar el "name" del IFC (se repite entre elementos del mismo
    -- tipo, no identifica nada) — el tag SÍ es lo que distingue una
    -- fila de otra, es literalmente la clave por la que se agrupa. La
    -- ETIQUETA de la columna sigue siendo "DESCRIPCIÓN" en todos lados
    -- (nunca "TAG" — un ingeniero no tiene por qué conocer esa
    -- palabra), solo cambia de dónde sale el dato.
    INSERT INTO metrado_template_columns (template_set_id, name, source_type, builtin_field, column_order) VALUES
        (v_set_identificacion, 'ITEM',        'builtin', 'code', 1),
        (v_set_identificacion, 'DESCRIPCIÓN', 'builtin', 'tag',  2),
        (v_set_identificacion, 'UND',         'builtin', 'unit', 3);

    INSERT INTO metrado_template_columns (template_set_id, name, source_type, builtin_field, column_order) VALUES
        (v_set_dimensiones, 'Largo',  'builtin', 'length', 1),
        (v_set_dimensiones, 'Ancho',  'builtin', 'width',  2),
        (v_set_dimensiones, 'Altura', 'builtin', 'height', 3);

    INSERT INTO metrado_template_columns (template_set_id, name, source_type, builtin_field, column_order) VALUES
        (v_set_cantidad, 'Cant.', 'builtin', 'element_count', 1);

    INSERT INTO metrado_template_columns (template_set_id, name, source_type, builtin_field, column_order) VALUES
        (v_set_metrado, 'Longitud',  'builtin', 'run_length', 1),
        (v_set_metrado, 'Área',      'builtin', 'area',       2),
        (v_set_metrado, 'Vol.',      'builtin', 'volume',     3),
        (v_set_metrado, 'Kg.',       'builtin', 'weight',     4),
        (v_set_metrado, 'Und.',      'builtin', 'quantity',   5),
        (v_set_metrado, 'Sub Total', 'builtin', 'sub_total',  6);
END $$;
