
-----------------------------------------------------------
---  USUARIOS / ROLES / PROYECTOS
------------------------------------------------------------

CREATE TABLE modules(
    module_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- Clave estable para rutas/referencias ("metrados", no "METRADOS
    -- BIM") — mismo criterio code/label_default que builtin_field_catalog.
    code VARCHAR(40) UNIQUE NOT NULL,
    name VARCHAR(80) NOT NULL,
    is_active BOOLEAN NOT NULL
);

CREATE TABLE roles (
    role_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(40) UNIQUE NOT NULL,
    is_assignable BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE users (
    user_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(60) NOT NULL CHECK (LENGTH(TRIM(name)) > 0),
    -- Nullable a propósito: cuentas ya registradas antes de este campo
    -- no tienen con qué llenarlo, y el registro no lo exige todavía.
    last_name VARCHAR(80),
    email VARCHAR(256) UNIQUE NOT NULL,
    password_hash VARCHAR(256) NOT NULL,
    -- Solo se llena si el usuario subió una foto propia — NULL = sin
    -- foto, el frontend decide cómo mostrarlo (iniciales, ícono
    -- genérico, etc.), no se genera ninguna imagen de reemplazo acá
    -- (a diferencia de la portada de proyecto, que sí tiene un
    -- default real porque una tarjeta de proyecto necesita mostrar
    -- SIEMPRE alguna imagen).
    profile_picture_path TEXT,

    -- active: inhabilitar cuenta — REVERSIBLE, lo usa un administrador
    -- ante sospecha de abuso (ej. demasiadas subidas, actividad rara).
    -- No es lo mismo que is_deleted, ver abajo.
    active BOOLEAN DEFAULT TRUE,
    deactivated_by INT REFERENCES users(user_id),
    deactivated_at TIMESTAMPTZ,

    -- is_deleted: baja de cuenta — soft-delete real, NO reversible
    -- desde la API (aunque el dato técnicamente sigue en la fila). La
    -- razón de tener las dos banderas separadas es justamente esa:
    -- active sirve para suspender sin perder la posibilidad de
    -- reactivar, is_deleted es la baja definitiva. Puede activarla el
    -- propio usuario (autogestión) o un administrador. Deliberadamente
    -- NO se borra la fila ni se tocan sus datos relacionados (archivos
    -- subidos, membresías de proyecto, invitaciones enviadas/recibidas
    -- siguen intactos, con sus FK apuntando a este mismo user_id) — la
    -- única excepción es la foto de perfil, que si se borra de verdad
    -- (archivo físico + esta misma columna a NULL).
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_by INT REFERENCES users(user_id),
    deleted_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    role_id INT NOT NULL REFERENCES roles(role_id)
);

CREATE TABLE user_invitations (
    invitation_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email VARCHAR(256) NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 days',
    used BOOLEAN NOT NULL DEFAULT FALSE,
    role_id INT NOT NULL REFERENCES roles(role_id)
);

CREATE TABLE refresh_tokens (
    refresh_token_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE projects (
    project_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL CHECK (LENGTH(TRIM(name)) > 0),
    description TEXT,
    location VARCHAR(120),
    client VARCHAR(150),
    contractor VARCHAR(150),
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    owner_id INT NOT NULL REFERENCES users(user_id),
    created_by INT NOT NULL REFERENCES users(user_id)
);

-- ------------------------------------------------------------
-- MÓDULOS + ROLES/PERMISOS POR MÓDULO (Fase 2, ver
-- docs/roadmap-modulos-y-permisos.md) — reemplaza project_roles
-- (rol de proyecto con nombre libre, sin tabla de permisos detrás).
-- Dos niveles, no uno: administración del proyecto (owner implícito +
-- project_members.is_admin, ambos con acceso total, SIN pasar por
-- estas tablas — ver comentario en project_members más abajo) y
-- trabajo dentro de un módulo puntual (esto de acá, granular, solo
-- aplica a quien no es owner ni admin).
-- ------------------------------------------------------------

CREATE TABLE module_permissions (
    module_permission_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- Vocabulario ÚNICO, reusado entre TODOS los módulos (no un
    -- catálogo distinto por módulo) — view/upload/process/delete son
    -- reales hoy (Metrados), export/configure quedan reservados para
    -- las Fases 4/5 pero ya con su código sembrado, para no tener que
    -- migrar de nuevo cuando lleguen.
    code VARCHAR(40) UNIQUE NOT NULL,
    label_default VARCHAR(60) NOT NULL
);

CREATE TABLE module_roles (
    module_role_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    module_id INT NOT NULL REFERENCES modules(module_id) ON DELETE CASCADE,
    name VARCHAR(60) NOT NULL,
    -- Frase corta para el tooltip "¿qué significa este rol?" del
    -- frontend — dato de catálogo, no texto fijo del lado cliente
    -- (así nunca queda desactualizada si cambian los permisos reales).
    description TEXT,
    UNIQUE(module_id, name)
);

CREATE TABLE module_role_permissions (
    module_role_id INT NOT NULL REFERENCES module_roles(module_role_id) ON DELETE CASCADE,
    module_permission_id INT NOT NULL REFERENCES module_permissions(module_permission_id) ON DELETE CASCADE,
    PRIMARY KEY (module_role_id, module_permission_id)
);

CREATE TABLE project_members(
    project_member_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id INT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(user_id),
    -- is_admin = acceso TOTAL a todos los módulos del proyecto, sin
    -- necesidad de fila en project_member_module_roles — es un bypass
    -- de código (ver services/project-access.service.ts), no una
    -- asignación implícita del rol "Administrador" en cada módulo:
    -- así un permiso nuevo que se agregue el día de mañana lo tiene
    -- automático, sin tener que acordarse de sembrarlo para este rol
    -- en los 6 módulos. El owner (projects.owner_id) tiene el mismo
    -- acceso total sin necesitar siquiera una fila acá.
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id,user_id)
);

-- Rol de módulo de un miembro que NO es owner ni admin — si un
-- miembro no tiene fila acá para un módulo dado, el mínimo por
-- defecto es "puede ver, sin cambiar nada" en TODOS los módulos (ver
-- resolveModuleAccess) — nunca "sin acceso a nada", esa restricción
-- más dura queda para el futuro (ver roadmap, Fase 2).
CREATE TABLE project_member_module_roles (
    project_member_module_role_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_member_id INT NOT NULL REFERENCES project_members(project_member_id) ON DELETE CASCADE,
    module_id INT NOT NULL REFERENCES modules(module_id) ON DELETE CASCADE,
    module_role_id INT NOT NULL REFERENCES module_roles(module_role_id),
    UNIQUE(project_member_id, module_id)
);

CREATE TABLE project_invitations(
    invitation_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email VARCHAR(256) NOT NULL,
    status VARCHAR(20) DEFAULT 'pendiente' NOT NULL CHECK(status IN ('pendiente', 'aceptado', 'rechazado', 'cancelado')),
    responded_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '3 days',
    project_id INT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    -- Mismo criterio que project_members.is_admin — si es admin, no
    -- hace falta ninguna fila en project_invitation_module_roles.
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    invited_by INT NOT NULL REFERENCES users(user_id)
);

-- Espejo de project_member_module_roles, pero sobre la invitación
-- (todavía no existe el project_member) — se copia 1:1 a
-- project_member_module_roles recién cuando se acepta (ver
-- updateStatusInvitationService).
CREATE TABLE project_invitation_module_roles (
    invitation_id INT NOT NULL REFERENCES project_invitations(invitation_id) ON DELETE CASCADE,
    module_id INT NOT NULL REFERENCES modules(module_id) ON DELETE CASCADE,
    module_role_id INT NOT NULL REFERENCES module_roles(module_role_id),
    PRIMARY KEY (invitation_id, module_id)
);


------------------------
 --- ARCHIVOS 
------------------------

CREATE TABLE files (
    file_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id INT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    file_type VARCHAR(20) NOT NULL CHECK (file_type IN ('ifc','excel','pdf','txt','image','other')),
    name VARCHAR(150) NOT NULL,
    file_path TEXT NOT NULL,
    file_size BIGINT,
    checksum TEXT,
    mime_type VARCHAR(255),
    -- Solo se llena para file_type='image' cuando se pudo generar la
    -- miniatura al subir (ver utils/thumbnail.ts, backend). NULL =
    -- no disponible (no es imagen, o sharp no pudo procesarla) — nunca
    -- se expone tal cual al cliente, GET /files/:id/thumbnail y el
    -- has_thumbnail de la API son lo único público derivado de esto.
    thumbnail_path TEXT,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    uploaded_by INT NOT NULL REFERENCES users(user_id)
);

-- ------------------------------------------------------------
-- ESPECIALIDADES Y VERSIONADO DE IFC (Fase 3, ver
-- docs/roadmap-modulos-y-permisos.md)
-- ------------------------------------------------------------

-- Catálogo en BD, mismo patrón que "modules" (code estable para
-- referencias/Zod, name para mostrar). is_active permite desactivar
-- una especialidad sin borrar el historial de documentos que ya la
-- usan (specialty_id no se toca al desactivar).
CREATE TABLE ifc_specialties (
    ifc_specialty_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code VARCHAR(40) UNIQUE NOT NULL,
    name VARCHAR(80) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- Identidad ESTABLE de "un IFC" a través de sus versiones (ej. "Modelo
-- de Estructuras" — v1, v2, v3...). Las subidas concretas (cada .ifc
-- físico, con su propia fila en files/ifc_files) cuelgan de acá vía
-- ifc_files.ifc_document_id, ver abajo. specialty_id es nullable
-- porque los documentos del backfill (IFCs subidos antes de esta
-- fase) no tienen especialidad asignada — los documentos nuevos SÍ la
-- piden por Zod al crearse (backend, no acá).
CREATE TABLE ifc_documents (
    ifc_document_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id INT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    specialty_id INT REFERENCES ifc_specialties(ifc_specialty_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by INT NOT NULL REFERENCES users(user_id)
);

CREATE TABLE ifc_files (
    ifc_file_id BIGINT PRIMARY KEY REFERENCES files(file_id) ON DELETE CASCADE,
    ifc_document_id BIGINT NOT NULL REFERENCES ifc_documents(ifc_document_id) ON DELETE CASCADE,
    -- version_number SIEMPRE lo calcula el backend (MAX actual + 1
    -- dentro de una transacción con lock, ver ifc-documents.service.ts)
    -- nunca lo manda el cliente — así no hace falta (ni tiene sentido)
    -- una restricción de "no saltar números": el backend físicamente
    -- no puede generar un hueco.
    version_number INT NOT NULL,
    -- Solo una versión "vigente" por documento a la vez — la única que
    -- tiene datos derivados cargados (ifc_elements/ifc_properties/
    -- metrado_partidas/...). Cuando una versión nueva pasa a vigente,
    -- la vieja queda como "tombstone": su fila ifc_files (y la de
    -- files) persiste como registro histórico (quién subió, cuándo, el
    -- .ifc físico sigue descargable) pero sus datos derivados se
    -- borran — ver insertarResultado en ifc-processing-runner.ts. Por
    -- eso ifc_elements/metrado_partidas de una versión is_current=false
    -- nunca deberían existir en la práctica (invariante de aplicación,
    -- reforzada por ese mismo flujo, no hay forma limpia de expresarlo
    -- como CHECK entre tablas en Postgres).
    is_current BOOLEAN NOT NULL DEFAULT TRUE,
    schema_version VARCHAR(10),
    status VARCHAR(20) NOT NULL DEFAULT 'processing'
        CHECK (status IN ('processing','done','error')),
    processed_at TIMESTAMPTZ,
    error_message TEXT,

    -- Fase 4 (clasificación manual, ver docs/roadmap-modulos-y-permisos.md):
    -- snapshot de CON QUÉ config se clasificó esta versión puntual —
    -- copia de la fila de ifc_classification_configs/_fields vigente en
    -- el momento de procesar, no una referencia viva. Si el admin
    -- cambia la config del proyecto después, esta versión ya procesada
    -- sigue mostrando fielmente con qué se hizo (mismo espíritu que el
    -- tombstone de versiones: nunca reinterpretar en silencio algo ya
    -- procesado). NULL para todo lo procesado en modo 'norma' (no hay
    -- nada que snapshotear, el comportamiento no varía por proyecto).
    classification_config_used JSONB,

    UNIQUE (ifc_document_id, version_number)
);
-- Como mucho una versión vigente por documento — ídem
-- idx_un_project_cover/idx_un_template_default más abajo.
CREATE UNIQUE INDEX idx_un_ifc_document_current ON ifc_files (ifc_document_id) WHERE is_current = true;

-- Excel generado a partir de un IFC procesado (Fase 5, ver
-- docs/roadmap-modulos-y-permisos.md) — ALTER acá (no en el CREATE
-- TABLE de "files" más arriba) porque "ifc_files" recién se define en
-- este punto del archivo, no antes. NULL para todo archivo que no sea
-- un Excel generado (subidas normales, incluidos Excel sueltos sin
-- relación a ningún IFC). ON DELETE CASCADE: si la versión de origen
-- se borra DE VERDAD (no un reemplazo de versión tipo tombstone, que
-- nunca borra la fila — ver Fase 3), los Excel generados desde ella se
-- borran con ella. Apunta a la VERSIÓN puntual (no al documento) — un
-- Excel siempre refleja el metrado de un momento específico; con un
-- JOIN a ifc_files se resuelve también a qué documento pertenece esa
-- versión, sin duplicar la columna.
ALTER TABLE files ADD COLUMN generated_from_ifc_file_id BIGINT REFERENCES ifc_files(ifc_file_id) ON DELETE CASCADE;


-- ------------------------------------------------------------
-- CLASIFICACIÓN ALTERNATIVA POR PROPIEDADES (Fase 4, ver
-- docs/roadmap-modulos-y-permisos.md)
-- ------------------------------------------------------------

-- Config activa de clasificación por proyecto — una sola fila por
-- proyecto (no hay "varias configs guardadas", a diferencia de
-- metrado_templates). mode='norma' (default) es el comportamiento de
-- siempre (clasifica contra norma_completa.json); mode='manual' lee
-- directo de propiedades que el usuario escribió a mano en cada
-- elemento IFC, identificadas por property_prefix (ver
-- ifc_classification_config_fields) — NUNCA por Pset_WallCommon ni
-- ningún otro Pset "técnico" que exporte Revit solo.
CREATE TABLE ifc_classification_configs (
    project_id INT PRIMARY KEY REFERENCES projects(project_id) ON DELETE CASCADE,
    -- Cómo se AGRUPAN los elementos en partidas — 'norma' (default,
    -- contra norma_completa.json) o 'manual' (propiedades exactas, ver
    -- ifc_classification_config_fields). Independiente de
    -- property_prefix de abajo — un proyecto puede clasificar contra
    -- la norma Y filtrar sus propiedades capturadas por prefijo al
    -- mismo tiempo, son dos preguntas distintas.
    mode VARCHAR(20) NOT NULL DEFAULT 'norma' CHECK (mode IN ('norma','manual')),
    mode_locked BOOLEAN NOT NULL DEFAULT FALSE,
    -- Prefijo de nombre de propiedad (ej. "CSRT-") que distingue lo que
    -- el usuario escribió a mano de lo que Revit exporta solo — filtra
    -- la captura general de propiedades de ese archivo
    -- (ifc_properties/columnas de plantilla) Y decide la prioridad de
    -- metrado (texto-prefijado > geométrico > tipado si hay prefijo;
    -- tipado > geométrico > texto si no) — en CUALQUIER mode, no solo
    -- 'manual'. NULL/"" = sin filtro, comportamiento de siempre.
    property_prefix VARCHAR(60),
    property_prefix_locked BOOLEAN NOT NULL DEFAULT FALSE,
    -- mode_locked/property_prefix_locked son locks INDEPENDIENTES a
    -- propósito (no un solo "locked" grupal) — se puede bloquear cómo
    -- se clasifica sin bloquear el prefijo, o viceversa. Un "bloquear
    -- todo" en la UI es responsabilidad del frontend (mandar los dos
    -- PUT), no un concepto del backend. Solo owner/admin los tocan
    -- (permiso 'configure' del módulo metrados).
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by INT REFERENCES users(user_id)
);

-- Los 3 campos (código/descripción/unidad) que arma cada "partida" en
-- modo manual — normalizado en tabla aparte (no 3 pares de columnas
-- fijas en ifc_classification_configs) a propósito: el día que haga
-- falta soportar que un mismo elemento pertenezca a varias partidas
-- simultáneas (confirmado con datos reales: ~21% de los elementos de
-- un IFC de prueba real tenían 2+ códigos a la vez, ver roadmap) es
-- agregar filas con otro `slot`, no migrar el schema. v1 usa
-- ÚNICAMENTE slot=1 — el resto queda modular, no implementado todavía.
CREATE TABLE ifc_classification_config_fields (
    ifc_classification_config_field_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id INT NOT NULL REFERENCES ifc_classification_configs(project_id) ON DELETE CASCADE,
    slot INT NOT NULL DEFAULT 1,
    -- Nombre EXACTO de la propiedad tal cual el usuario la ve en su
    -- IFC (ej. property_name="CSRT-Partida1") — nunca se reconstruye
    -- concatenando property_prefix + un patrón fijo, cada cliente
    -- puede nombrar sus propiedades distinto.
    -- property_set es OPCIONAL (nullable) a propósito: si no se manda,
    -- el pipeline busca la propiedad en CUALQUIER Pset del elemento
    -- (ver extraction.extraer_valor_propiedad) — solo code_property_name
    -- es obligatorio, sin nombre no hay con qué buscar nada.
    code_property_set VARCHAR(255),
    code_property_name VARCHAR(255) NOT NULL,
    -- Opcionales — si faltan, el pipeline cae al mismo fallback que ya
    -- existe (nombre del elemento IFC / inferir_unidad(dims)).
    description_property_set VARCHAR(255),
    description_property_name VARCHAR(255),
    unit_property_set VARCHAR(255),
    unit_property_name VARCHAR(255),

    UNIQUE (project_id, slot)
);

-- "files" es el archivo físico (metadata + ruta en disco); esta tabla
-- es el ROL que cumple ese archivo para un proyecto — hoy solo se usa
-- 'cover' (la portada, una sola por proyecto, ver el índice único de
-- abajo), 'gallery' queda armado desde ya para cuando haga falta una
-- galería de varias imágenes, pero todavía no tiene endpoint propio.
-- Si el proyecto no tiene fila 'cover' acá, el backend sirve una
-- imagen por defecto (uploads/default/) — ver project-images.service.ts.
CREATE TABLE project_images (
    project_image_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id INT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    file_id BIGINT NOT NULL UNIQUE REFERENCES files(file_id) ON DELETE CASCADE,
    image_type VARCHAR(30) NOT NULL DEFAULT 'gallery'
        CHECK (image_type IN ('cover', 'gallery')),
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_un_project_cover ON project_images (project_id) WHERE image_type = 'cover';


-- ------------------------------------------------------------
-- ELEMENTOS Y PARTIDAS
-- ------------------------------------------------------------

CREATE TABLE ifc_elements (
    element_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ifc_file_id BIGINT NOT NULL REFERENCES ifc_files(ifc_file_id) ON DELETE CASCADE,
    express_id BIGINT NOT NULL,
    global_id VARCHAR(64),
    tag VARCHAR(255),                 -- agrupador adicional (ver queries.sql)
    ifc_type VARCHAR(100),
    name VARCHAR(255),
    level_name VARCHAR(120),
    space_name VARCHAR(120),

    UNIQUE (ifc_file_id, express_id)
);
CREATE INDEX idx_ifc_elements_grouping
    ON ifc_elements (ifc_file_id, level_name, space_name, tag);

CREATE TABLE metrado_partidas (
    partida_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ifc_file_id BIGINT NOT NULL REFERENCES ifc_files(ifc_file_id) ON DELETE CASCADE,
    parent_id BIGINT REFERENCES metrado_partidas(partida_id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    unit VARCHAR(20),
    sort_order INT NOT NULL DEFAULT 0,

    UNIQUE (ifc_file_id, code)
);
CREATE INDEX idx_metrado_partidas_parent ON metrado_partidas (parent_id);

CREATE TABLE metrado_elements (
    metrado_element_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    partida_id BIGINT NOT NULL REFERENCES metrado_partidas(partida_id) ON DELETE CASCADE,
    element_id BIGINT NOT NULL REFERENCES ifc_elements(element_id) ON DELETE CASCADE,

    -- Dimensiones brutas de la caja envolvente (Largo/Ancho/Alto),
    -- directo de la geometría, sin prioridad revit. Informativas, NO
    -- son el metrado — un elemento curvo (tubería, conducto, acero
    -- doblado) puede tener un run_length mayor que su length en línea
    -- recta.
    length NUMERIC(18,6),
    width NUMERIC(18,6),
    height NUMERIC(18,6),

    -- run_length = "Longitud", el metrado lineal real (prioridad revit
    -- > geométrico como fallback — ver processing/ifc/metrados.py). Es
    -- el valor que se usa cuando la partida es de unidad 'm', distinto
    -- de "length" de arriba.
    run_length NUMERIC(18,6),

    -- Solo para elementos de perfil circular (tubos — ver
    -- processing/ifc/geometria_proyeccion.py, extraer_dimensiones_circulares).
    -- NULL para todo lo demás. width/height quedan NULL a propósito en
    -- esos elementos: una sección circular no tiene un ancho/alto
    -- distinto del diámetro.
    diameter NUMERIC(18,6),

    quantity NUMERIC(18,6),

    area NUMERIC(18,6),
    volume NUMERIC(18,6),
    weight NUMERIC(18,6),

    UNIQUE (partida_id, element_id)
);
CREATE INDEX idx_metrado_elements_partida ON metrado_elements (partida_id);


-- ------------------------------------------------------------
-- TOTALES PRECALCULADOS POR PARTIDA
-- ------------------------------------------------------------
-- Solo existe fila para partidas HOJA (unit IS NOT NULL en
-- metrado_partidas) — las carpetas/categorías no tienen fila acá, no
-- se precalcula ningún rollup hacia arriba (eso, si hace falta, se
-- resuelve con una query aparte más adelante, no guardado).
--
-- No hay columna sub_total: la única noción de "subtotal" real del
-- dominio es la de un GRUPO de elementos con el mismo tag/dimensiones
-- (metrado de un elemento × cantidad de repeticiones), que es un
-- concepto de la vista de detalle (agrupar metrado_elements por tag),
-- no de esta tabla — no se puede precalcular acá sin la lógica de
-- agrupamiento por tag, que todavía no existe.
CREATE TABLE metrado_partida_totals (
    partida_id BIGINT PRIMARY KEY REFERENCES metrado_partidas(partida_id) ON DELETE CASCADE,
    element_count INT NOT NULL DEFAULT 0,
    total NUMERIC(18,6),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- PROPIEDADES DE LOS ELEMENTOS
-- ------------------------------------------------------------

CREATE TABLE ifc_properties (
    property_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ifc_file_id BIGINT NOT NULL REFERENCES ifc_files(ifc_file_id) ON DELETE CASCADE,
    property_set TEXT NOT NULL,
    property_name TEXT NOT NULL,
    data_type VARCHAR(50),

    UNIQUE (ifc_file_id, property_set, property_name)
);

CREATE TABLE ifc_property_values (
    value_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    property_id BIGINT NOT NULL REFERENCES ifc_properties(property_id) ON DELETE CASCADE,
    value TEXT NOT NULL,

    UNIQUE (property_id, value),
    UNIQUE (value_id, property_id)
);

CREATE TABLE ifc_element_property_values (
    element_id BIGINT NOT NULL REFERENCES ifc_elements(element_id) ON DELETE CASCADE,
    property_id BIGINT NOT NULL,
    value_id BIGINT NOT NULL,

    PRIMARY KEY (element_id, property_id),
    FOREIGN KEY (value_id, property_id) REFERENCES ifc_property_values(value_id, property_id) ON DELETE CASCADE
);
-- Sin esto, cualquier DELETE que cascadee desde ifc_property_values
-- (borrar un ifc_properties, o el ifc_files entero — pasa en CADA
-- force=true, cada reemplazo de versión de Fase 3, y cada borrado de
-- archivo) tiene que hacer un seq scan de ESTA tabla por cada fila que
-- borra allá — el PK de acá es (element_id, property_id), no sirve
-- para buscar por value_id. Encontrado en vivo probando Fase 4 con un
-- archivo real de 26k elementos: un DELETE que debería ser instantáneo
-- tardó ~2m30s sin este índice.
CREATE INDEX idx_ifc_element_property_values_value_property
    ON ifc_element_property_values (value_id, property_id);


-- ------------------------------------------------------------
-- CATALOGO DE COLUMNAS PREDEFINIDAS
-- ------------------------------------------------------------

CREATE TABLE builtin_field_catalog (
    builtin_field    VARCHAR(30) PRIMARY KEY,
    label_default    VARCHAR(100) NOT NULL,
    data_type        VARCHAR(20) NOT NULL CHECK (data_type IN ('text','numeric','integer')),
    is_aggregate     BOOLEAN NOT NULL DEFAULT FALSE,
    applies_to_group VARCHAR(20) NOT NULL CHECK (
        applies_to_group IN ('identificacion','dimensiones','cantidad','metrado','totales')
    ),
    sort_order       INT NOT NULL DEFAULT 0
);


-- ------------------------------------------------------------
-- PLANTILLAS
-- ------------------------------------------------------------

CREATE TABLE metrado_templates (
    template_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,  -- la que se auto-selecciona al abrir un IFC procesado, si el usuario no eligió otra antes
    created_by INT REFERENCES users(user_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (name, created_by)
);
CREATE UNIQUE INDEX idx_un_template_default ON metrado_templates (is_default) WHERE is_default;

CREATE TABLE metrado_template_sets (
    template_set_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    template_id BIGINT NOT NULL REFERENCES metrado_templates(template_id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    sort_order INT NOT NULL,
    UNIQUE (template_id, name),
    UNIQUE (template_id, sort_order)
);

CREATE TABLE metrado_template_columns (
    template_column_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    template_set_id BIGINT NOT NULL REFERENCES metrado_template_sets(template_set_id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    source_type VARCHAR(30) NOT NULL CHECK ( source_type IN ('builtin', 'ifc_property')),
    builtin_field VARCHAR(30) REFERENCES builtin_field_catalog(builtin_field),
    property_set_name VARCHAR(150),
    property_name VARCHAR(150),
    column_order INT NOT NULL,
    is_visible BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (template_set_id, column_order),

    CHECK (
        (
            source_type = 'builtin'
            AND builtin_field IS NOT NULL
            AND property_set_name IS NULL
            AND property_name IS NULL
        )
        OR
        (
            source_type = 'ifc_property'
            AND builtin_field IS NULL
            AND property_set_name IS NOT NULL
            AND property_name IS NOT NULL
        )
    )
);
