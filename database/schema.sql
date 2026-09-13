
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
    role_id INT NOT NULL REFERENCES roles(role_id),

    -- Segunda barrera (la primera es el chequeo explícito en
    -- users.service.ts, deleteUserCore): a nivel de BD, ninguna fila
    -- con role_id=1 (ADMINISTRADOR, ver system-data.sql) puede quedar
    -- con is_deleted=true, sin importar por qué camino se intente
    -- (autogestión, otro administrador, un script suelto). Es la única
    -- cuenta que puede asignar el resto de los roles
    -- (is_assignable=false) — perderla deja la plataforma sin forma de
    -- administrarse.
    CONSTRAINT chk_users_administrador_no_deletable
        CHECK (NOT (is_deleted AND role_id = 1))
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
-- Postgres no indexa automático las columnas de FK (solo el lado
-- referenciado) — GET /projects (scope mine/member) filtra por esto
-- en cada login/carga del dashboard, importa más a medida que crece la
-- cantidad de USUARIOS, no de proyectos (ver
-- docs/roadmap/mejoras-backend-post-auditoria.md, punto 2).
CREATE INDEX idx_projects_owner_id ON projects(owner_id);

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
-- "¿a qué proyectos pertenece este usuario?" — usado en el scope
-- mine/member de GET /projects, misma justificación que
-- idx_projects_owner_id de arriba (ver
-- docs/roadmap/mejoras-backend-post-auditoria.md, punto 2).
CREATE INDEX idx_project_members_user_id ON project_members(user_id);

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
-- getListInvitationsOfProjectService filtra por esto en cada listado
-- de invitaciones de un proyecto (ver
-- docs/roadmap/mejoras-backend-post-auditoria.md, punto 2).
CREATE INDEX idx_project_invitations_project_id ON project_invitations(project_id);

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
    -- 'fragments': migración del visor a ThatOpen (ver
    -- docs/roadmap/migracion-visor-thatopen-backend.md, B1/B2) — un
    -- .frag generado a partir de un 'ifc' ya procesado, mismo patrón
    -- que 'excel' (generated_from_ifc_file_id más abajo).
    file_type VARCHAR(20) NOT NULL CHECK (file_type IN ('ifc','excel','pdf','txt','image','other','fragments')),
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
-- getProjectFilesService (listado de archivos de un proyecto) y la
-- consulta de "estado de elementos" filtran por esto siempre — ver
-- docs/roadmap/mejoras-backend-post-auditoria.md, punto 2.
CREATE INDEX idx_files_project_id ON files(project_id);

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
-- El árbol de documentos IFC de un proyecto (GET /projects/:id/ifc-documents)
-- filtra por esto — ver docs/roadmap/mejoras-backend-post-auditoria.md,
-- punto 2.
CREATE INDEX idx_ifc_documents_project_id ON ifc_documents(project_id);

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

-- "Elemento conjunto" (estado de cantidad de elementos, ver
-- metrados-estado.*) — QUÉ campos componen la clave que decide si dos
-- elementos son "el mismo" (duplicado) o no. Antes era fijo (archivo +
-- guid + tag + código de partida, hardcodeado en el service); ahora es
-- configurable por proyecto, a propósito: el criterio fijo de 4 campos
-- no alcanza para todos los casos reales (ej. el cliente puede querer
-- comparar por una propiedad propia suya, tipo "Marca", en vez de o
-- además de esos 4). Se crea con default (los 4 campos builtin de
-- siempre) al mismo tiempo que ifc_classification_configs, en
-- POST /projects — así ningún proyecto queda sin config y el
-- comportamiento de antes de esto sigue siendo el default.
CREATE TABLE elemento_conjunto_configs (
    project_id INT PRIMARY KEY REFERENCES projects(project_id) ON DELETE CASCADE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by INT REFERENCES users(user_id)
);

-- Cada fila es UN campo de la clave, en orden (`position`). Mínimo 2
-- campos por proyecto (con 1 solo sería "filtrar por una propiedad",
-- no un criterio compuesto de "elemento conjunto" — validado en el
-- schema Zod, no acá). 'builtin' referencia uno de los 4 campos fijos
-- de siempre; 'property' referencia una propiedad capturada del IFC
-- (property_set OPCIONAL — igual que en clasificación manual, NULL
-- busca en cualquier Pset del elemento).
CREATE TABLE elemento_conjunto_config_fields (
    elemento_conjunto_config_field_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id INT NOT NULL REFERENCES elemento_conjunto_configs(project_id) ON DELETE CASCADE,
    position INT NOT NULL,
    field_type VARCHAR(20) NOT NULL CHECK (field_type IN ('builtin', 'property')),
    builtin_field VARCHAR(30) CHECK (builtin_field IN ('file_name', 'global_id', 'tag', 'partida_code')),
    property_set VARCHAR(255),
    property_name VARCHAR(255),
    CHECK (
        (field_type = 'builtin' AND builtin_field IS NOT NULL AND property_name IS NULL)
        OR
        (field_type = 'property' AND builtin_field IS NULL AND property_name IS NOT NULL)
    ),
    UNIQUE (project_id, position)
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

    -- De cuál de los 5 valores que calcula metrados.py
    -- (lon/area/vol/count/weight) salió el metrado REAL de esta
    -- partida, según su unidad (m->lon, m2->area, m3->vol, kg->weight,
    -- und/otro->count) — no "una fuente por elemento", cada uno de los
    -- 5 valores puede venir de una fuente distinta, esta columna se
    -- queda solo con la del que de verdad importa acá. Valores:
    -- 'tipado' | 'geometrico' | 'texto' | 'default' | 'acero' |
    -- 'acero_diametro' | 'acero_seccion' | NULL (no se pudo resolver
    -- ninguna fuente). Ver docs/roadmap/consolidacion-y-hardening.md
    -- punto 6 y classify.resolver_origen_metrado().
    origen_metrado VARCHAR(20),

    UNIQUE (partida_id, element_id)
);
CREATE INDEX idx_metrado_elements_partida ON metrado_elements (partida_id);
-- GET /ifc-files/:id/elements/:expressId/metrado (ver
-- docs/roadmap/mejoras-backend-post-auditoria.md, punto 1/2) resuelve
-- "dame el metrado de ESTE elemento puntual" sin saber de antemano su
-- partida_id — element_id no era columna líder de ningún índice hasta
-- ahora (solo acompañaba a partida_id en el UNIQUE de arriba).
CREATE INDEX idx_metrado_elements_element ON metrado_elements (element_id);


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



-- ============================================================
-- ALMACÉN BIM — inventario/ubicación 3D/kardex (módulo nuevo, ver
-- docs/roadmap/almacen-bim.md y, sobre todo,
-- docs/roadmap/almacen-bim-base-datos.md — ESE documento es el diseño
-- completo con el razonamiento de cada decisión; acá solo se traduce a
-- SQL real, siguiendo la convención del resto de este archivo (PK
-- `_id` + IDENTITY, snake_case, TIMESTAMPTZ, NUMERIC(18,6) para
-- medidas — mismo tipo que ya usa metrado_elements más arriba).
-- Prototipo explorado antes en `prueba-BIM/ALMACEN-BIM/`.
--
-- Corregido: la primera versión de este bloque tenía TODO en español
-- (tablas y columnas) — inconsistente con el resto de este archivo,
-- donde tabla y columna son SIEMPRE inglés (`created_at`, `name`,
-- `code`...), salvo jerga de dominio genuinamente intraducible
-- (`metrado`, `partida`, `elemento_conjunto`, acá `ruc`/`dni`) o
-- valores de dato tipo enum que el usuario ve/tipea en español (mismo
-- criterio que `project_invitations.status IN ('pendiente',...)`).
-- Reescrito entero en inglés — el nombre del MÓDULO en sí
-- (`modules.code = 'almacen'`, `modules.name = 'ALMACÉN BIM'`, ver
-- system-data.sql) sigue en español a propósito: es el nombre real del
-- módulo/producto, mismo criterio que `METRADOS_MODULE_CODE` en el
-- backend.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Ubicación física: warehouse (la "casa") > rack > bin
-- ------------------------------------------------------------

-- Plantilla VISUAL (colores + cuántos niveles admite un rack adentro)
-- — nunca tamaño, eso lo define cada `warehouses` con sus propias
-- esquinas. Catálogo casi-inmutable: solo se audita cuándo se agregó,
-- no quién/cuándo se editó (ver almacen-bim-base-datos.md, sección 5).
CREATE TABLE warehouse_styles (
    warehouse_style_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL CHECK (LENGTH(TRIM(name)) > 0),
    -- '#RRGGBB' exacto (7 caracteres: '#' + 6 hex) — sin este CHECK,
    -- VARCHAR(7) solo limita el largo, no el formato: dejaría pasar
    -- cualquier texto de 7 caracteres como si fuera un color válido.
    roof_color VARCHAR(7) NOT NULL CHECK (roof_color ~ '^#[0-9A-Fa-f]{6}$'),
    wall_color VARCHAR(7) NOT NULL CHECK (wall_color ~ '^#[0-9A-Fa-f]{6}$'),
    wall_frame_color VARCHAR(7) NOT NULL CHECK (wall_frame_color ~ '^#[0-9A-Fa-f]{6}$'),
    max_level INT NOT NULL CHECK (max_level > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Soft-delete (ver sección 5.1.2 del diseño): un warehouse_style en
    -- uso no se puede borrar de motor (ver ON DELETE RESTRICT en
    -- warehouses.warehouse_style_id más abajo) ni tampoco dar de baja
    -- sin antes cambiarle el estilo a los warehouses que lo usan — eso
    -- lo valida la aplicación, no una FK (cruzaría a otra fila de otra
    -- tabla con una condición, no una simple existencia).
    deleted_at TIMESTAMPTZ
);

-- "La casa": el rectángulo real del plano. project_id usa CASCADE
-- (mismo criterio que TODO lo demás que cuelga de un proyecto en este
-- archivo — files.project_id, ifc_documents.project_id, etc.): si se
-- borra el proyecto entero, se borra con él.
CREATE TABLE warehouses (
    warehouse_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id INT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    -- RESTRICT: no se puede borrar de motor un estilo que algún
    -- warehouse sigue usando (ver 5.1.1 del diseño).
    warehouse_style_id INT NOT NULL REFERENCES warehouse_styles(warehouse_style_id) ON DELETE RESTRICT,
    name VARCHAR(100) NOT NULL CHECK (LENGTH(TRIM(name)) > 0),
    corner1_x NUMERIC(18,6) NOT NULL,
    corner1_z NUMERIC(18,6) NOT NULL,
    corner2_x NUMERIC(18,6) NOT NULL,
    corner2_z NUMERIC(18,6) NOT NULL,
    -- Invariante de la propia fila (no coherencia ENTRE niveles de la
    -- jerarquía, eso el sistema no lo fuerza — ver nota de
    -- almacen-bim-base-datos.md 1.2): un footprint de área cero no es
    -- un warehouse válido bajo ningún criterio.
    CHECK (corner1_x <> corner2_x AND corner1_z <> corner2_z),
    -- Valores en español a propósito (dato real, no identificador de
    -- esquema — mismo criterio que project_invitations.status): a qué
    -- pared va la puerta del modelo 3D.
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('norte','sur','este','oeste')),
    -- Puramente geométrica (|corner2_x-corner1_x| × |corner2_z-corner1_z|),
    -- la recalcula la aplicación cada vez que cambian las esquinas —
    -- columna real para no recalcularla en cada listado/detalle. Con
    -- el CHECK de esquinas de arriba (área ≠ 0) esto ya no puede dar
    -- 0, pero se guarda el invariante acá también, explícito.
    area_m2 NUMERIC(18,6) NOT NULL CHECK (area_m2 > 0),
    -- Espacio interior utilizable — INDEPENDIENTE del footprint de
    -- arriba, a propósito (confirmado explícito: "una casa chica por
    -- fuera puede tener mucho espacio adentro", no se deriva de
    -- corner1/corner2). NO tocar esto para "derivarlo" del footprint
    -- sin que se pida de nuevo.
    grid_width INT NOT NULL CHECK (grid_width > 0),
    grid_depth INT NOT NULL CHECK (grid_depth > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by INT NOT NULL REFERENCES users(user_id),
    updated_at TIMESTAMPTZ,
    updated_by INT REFERENCES users(user_id),
    deleted_at TIMESTAMPTZ
);
-- Único dentro del proyecto, pero SOLO entre los activos — un
-- warehouse dado de baja no debe bloquear reusar su nombre después
-- (mismo espíritu que idx_un_project_cover/idx_un_template_default:
-- unicidad condicional con un índice parcial, no un UNIQUE plano).
CREATE UNIQUE INDEX idx_un_warehouses_name_active ON warehouses (project_id, name) WHERE deleted_at IS NULL;
-- Listado de warehouses de un proyecto — patrón idéntico a
-- idx_projects_owner_id/idx_files_project_id de más arriba.
CREATE INDEX idx_warehouses_project_id ON warehouses (project_id);

-- Mismo criterio que `warehouses`: sin índices de grilla (bay/level)
-- ni ancho/profundidad como columnas — se derivan de las 2 esquinas
-- (LOCALES al warehouse, no coordenadas absolutas). `levels` sí es
-- columna propia porque, a diferencia del footprint, no nace de 2
-- puntos: un rack crece niveles hacia arriba desde el piso.
CREATE TABLE racks (
    rack_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- RESTRICT: no se puede borrar de motor un warehouse que todavía
    -- tiene CUALQUIER rack (5.1.1) — hay que borrar/mover todos sus
    -- racks primero, de abajo hacia arriba.
    warehouse_id INT NOT NULL REFERENCES warehouses(warehouse_id) ON DELETE RESTRICT,
    name VARCHAR(100) NOT NULL CHECK (LENGTH(TRIM(name)) > 0),
    corner1_x NUMERIC(18,6) NOT NULL,
    corner1_z NUMERIC(18,6) NOT NULL,
    corner2_x NUMERIC(18,6) NOT NULL,
    corner2_z NUMERIC(18,6) NOT NULL,
    CHECK (corner1_x <> corner2_x AND corner1_z <> corner2_z),
    levels INT NOT NULL CHECK (levels > 0),
    -- Cuál de las 2 caras (mismo dominio 0/1 que bins.face más abajo)
    -- es la accesible/abierta — sirve para el día que se diseñe un
    -- rack "cerrado" tipo cajón con profundidad=1 (pared de fondo, no
    -- abierto por las 2 caras como el rack de hoy). Con profundidad=2
    -- el dato no tiene efecto práctico pero se llena igual, por
    -- consistencia de esquema. El nombre visible de cada valor (ej.
    -- "norte"/"sur" respecto al rack) es decisión del frontend, no de
    -- esta columna.
    direction INT NOT NULL CHECK (direction IN (0, 1)),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by INT NOT NULL REFERENCES users(user_id),
    updated_at TIMESTAMPTZ,
    updated_by INT REFERENCES users(user_id),
    deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX idx_un_racks_name_active ON racks (warehouse_id, name) WHERE deleted_at IS NULL;
-- Listado de racks de un warehouse — se consulta cada vez que se abre
-- un warehouse en el visor.
CREATE INDEX idx_racks_warehouse_id ON racks (warehouse_id);

-- Ancho (bahías) y profundidad de `racks` NO son columnas — se derivan
-- de sus esquinas (`|corner2_x-corner1_x| / CUBE_SIZE`, etc, ver
-- diseño 1.3). Que el resultado dé un entero exacto y que profundidad
-- sea 1 o 2 (nunca más — con 3+ la fila del medio queda sin cara
-- accesible) es una validación de la aplicación al crear el rack, no
-- un CHECK de este archivo (CUBE_SIZE es una constante de la
-- aplicación, no un dato guardado acá).
CREATE TABLE bins (
    bin_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- RESTRICT: no se puede borrar de motor un rack que todavía tiene
    -- CUALQUIER bin (5.1.1) — en la práctica un rack siempre tiene
    -- bins (se generan solas al crearlo), así que esto bloquea el
    -- hard-delete salvo que se borren antes una por una (lo cual, a su
    -- vez, cada una se bloquea sola si tiene contenido o participa de
    -- un merge — ver más abajo).
    rack_id BIGINT NOT NULL REFERENCES racks(rack_id) ON DELETE RESTRICT,
    bay INT NOT NULL CHECK (bay >= 0),
    level INT NOT NULL CHECK (level >= 0),
    -- 0 = una cara, 1 = la otra — solo tiene sentido real si la
    -- profundidad derivada del rack = 2, pero se guarda siempre en 0
    -- para consistencia cuando profundidad = 1.
    face INT NOT NULL CHECK (face IN (0, 1)),
    -- Coordenada estructural generada sola (ej. "A1 · nivel 1") — el
    -- formato exacto lo arma el frontend al crear la fila. Mismo CHECK
    -- de no-vacío que el resto de los "nombre" de este archivo (se
    -- había quedado afuera acá porque estas 2 columnas nunca las llena
    -- un formulario de alta, solo insertBinsForRack — pero igual hay
    -- que blindarlas, location_label es la identidad legible de la
    -- casilla).
    location_label VARCHAR(100) NOT NULL CHECK (LENGTH(TRIM(location_label)) > 0),
    -- Por defecto = location_label, pero editable y PUEDE repetirse (a
    -- diferencia de location_label, que es la coordenada real) — por
    -- eso no lleva ningún UNIQUE.
    name VARCHAR(100) NOT NULL CHECK (LENGTH(TRIM(name)) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Cuándo se editó `name` por última vez — no hay updated_by acá a
    -- propósito, no estaba en el diseño (que sí lo pide para
    -- warehouses/racks/products/categories) y renombrar un bin es una
    -- edición mucho más liviana que las de esas otras tablas.
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    -- Identidad estructural: dos bins del mismo rack no pueden ocupar
    -- la misma posición. A diferencia del nombre "humano" de
    -- warehouse/rack, esto NO se relaja para bajas lógicas (un bin
    -- dado de baja sigue ocupando su posición física real, reactivarlo
    -- es lo esperado, no crear uno segundo en el mismo lugar).
    UNIQUE (rack_id, bay, level, face)
);
-- El rango válido de bay/level/face según las dimensiones del rack que
-- lo contiene (0 <= bay < ancho derivado, 0 <= level < levels, 0 <=
-- face < profundidad derivada) se valida en la aplicación antes del
-- INSERT — cruza a otra tabla (racks), no es un CHECK de SQL puro (ver
-- diseño 1.4).
CREATE INDEX idx_bins_rack_id ON bins (rack_id);


-- ------------------------------------------------------------
-- 2. Catálogo de productos
-- ------------------------------------------------------------

-- Para esta versión son EXACTAMENTE 3 filas por proyecto, cerradas —
-- Partida (fija) y Materiales/Equipo (relacionales → Partida). La
-- tabla queda genérica a propósito para el día que se habilite crear
-- categorías nuevas (Fase 5 del roadmap de ejecución, a futuro) pero
-- la regla de HOY (nada de crear otra desde la app) es 100% de
-- aplicación — nada acá lo impide a nivel de motor.
CREATE TABLE categories (
    category_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id INT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL CHECK (LENGTH(TRIM(name)) > 0),
    -- Valores en español a propósito (dato real de negocio: "fija" vs.
    -- "relacional", mismo criterio que warehouses.direction).
    type VARCHAR(20) NOT NULL CHECK (type IN ('fijo', 'relacional')),
    -- Ambas NULL si type='fijo'; ambas obligatorias en la aplicación
    -- si type='relacional' (el CHECK de abajo solo liga prefix a
    -- base_category_id entre sí, no al type — cruzar type+2 columnas
    -- en un solo CHECK ya es más frágil de leer que validarlo en
    -- código, y de cualquier forma para esta versión las 3 filas están
    -- fijas de antemano, no las arma un usuario a mano).
    -- Se concatena directo en products.code como `prefix-código`
    -- (ver esa tabla) — mayúsculas/dígitos, sin espacios ni guion
    -- propio (el guion ya lo pone la aplicación al armar el code, uno
    -- adentro del prefix rompería poder distinguirlos a simple vista).
    -- 10 en vez de un VARCHAR(20) genérico: los 2 prefijos reales de
    -- hoy ('MAT', 'EQ', ver system-data.sql) son de 2-3 caracteres, no
    -- hay ningún prefijo de catálogo real que necesite más de 10.
    prefix VARCHAR(10) CHECK (prefix IS NULL OR prefix ~ '^[A-Z0-9]{1,10}$'),
    -- RESTRICT: no se puede borrar de motor una categoría que es la
    -- base de otra (5.1.1).
    base_category_id INT REFERENCES categories(category_id) ON DELETE RESTRICT,
    CHECK ((prefix IS NULL) = (base_category_id IS NULL)),
    -- Contador de tag por categoría, embebido acá — cada categoría ya
    -- pertenece a un solo proyecto, una tabla aparte para 1 columna no
    -- se justifica (diseño 2.1, [decisión]). El incremento SIEMPRE
    -- tiene que hacerse en la misma transacción que el INSERT del
    -- producto nuevo (leer, sumar 1, guardar, atómico) — si no, dos
    -- altas simultáneas se pisan el mismo tag. Eso es responsabilidad
    -- del código de la aplicación, no de esta columna.
    next_tag INT NOT NULL DEFAULT 1 CHECK (next_tag > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by INT NOT NULL REFERENCES users(user_id),
    updated_at TIMESTAMPTZ,
    updated_by INT REFERENCES users(user_id),
    deleted_at TIMESTAMPTZ
);
-- No estaba pedido explícito, pero evita duplicar sin querer el mismo
-- nombre de categoría dentro de un proyecto — mismo criterio de
-- "único mientras esté activo" que warehouses/racks. [decisión mía]
CREATE UNIQUE INDEX idx_un_categories_name_active ON categories (project_id, name) WHERE deleted_at IS NULL;

-- Si la categoría es relacional, `code` es la concatenación completa
-- (prefix + código de la partida) YA guardada acá — no se arma con un
-- JOIN en cada lectura. `base_product_code` guarda aparte el código de
-- la partida relacionada, para saber a cuál pertenece sin parsear
-- `code`.
CREATE TABLE products (
    product_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id INT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    -- RESTRICT: no se puede borrar de motor una categoría que todavía
    -- tiene algún producto (5.1.1).
    category_id INT NOT NULL REFERENCES categories(category_id) ON DELETE RESTRICT,
    code VARCHAR(100) NOT NULL CHECK (LENGTH(TRIM(code)) > 0),
    -- Copia de `categories.type = 'fijo'` en el momento de crear ESTE
    -- producto (fijo, nunca se recalcula) — SOLO existe para que el
    -- índice único condicional de más abajo pueda filtrar por esto:
    -- Postgres no permite que el WHERE de un índice mire una columna
    -- de OTRA tabla (categories), tiene que ser una columna propia.
    -- Regla de negocio real (confirmada): un `code` de categoría FIJA
    -- tiene que ser único (es la identidad real de una Partida); uno
    -- de categoría RELACIONAL puede repetirse — varios Materiales/
    -- Equipos distintos pueden relacionarse con la MISMA Partida, y
    -- como el código de un relacional es únicamente
    -- `prefix-códigoDeLaPartida` (sin nada que distinga uno de otro),
    -- es esperable que se repita.
    is_fixed BOOLEAN NOT NULL,
    -- Solo si la categoría es relacional. A propósito NO es una FK
    -- real a products.code (acoplaría fuerte para evitar un JOIN que
    -- de cualquier forma casi no se usa) — la aplicación valida que
    -- matchee el código de algún producto con categories.type='fijo'.
    base_product_code VARCHAR(100) CHECK (base_product_code IS NULL OR LENGTH(TRIM(base_product_code)) > 0),
    -- Valor de categories.next_tag en el momento de crear ESTE
    -- producto — snapshot, no se recalcula después.
    tag INT NOT NULL CHECK (tag > 0),
    name VARCHAR(200) NOT NULL CHECK (LENGTH(TRIM(name)) > 0),
    -- Normalizada a minúsculas por la aplicación antes de guardar.
    -- Texto libre a propósito, NO un enum cerrado — mismo criterio que
    -- ya usa `metrado_partidas.unit` (línea ~502 de este archivo): las
    -- unidades de obra real (m, m2, m3, kg, und, glb, viaje, bls...)
    -- varían demasiado entre proyectos/proveedores para forzar un
    -- catálogo fijo, ninguna otra tabla de este sistema lo hace.
    unit VARCHAR(20) NOT NULL CHECK (LENGTH(TRIM(unit)) > 0),
    -- Modelo 3D asignado — NULL = todavía sin modelo. Ver
    -- prueba-BIM/ALMACEN-BIM (sección BIM/Modelos del prototipo).
    model_3d_path TEXT,
    -- A diferencia de unit (arriba), esto NO es un dato libre que
    -- tipea el usuario — es el formato real del archivo, y el único
    -- código que lo consume (GLTFLoader en prueba-BIM/ALMACEN-BIM/
    -- app.html y modulo.html) solo sabe cargar estos 2. Guardar
    -- cualquier otro string acá dejaría un modelo "asignado" que
    -- ningún visor real puede abrir.
    model_3d_format VARCHAR(20) CHECK (model_3d_format IS NULL OR model_3d_format IN ('glb', 'gltf')),
    -- Valores en español a propósito (dato real, ya existe así en el
    -- prototipo de BIM/Modelos).
    model_3d_source VARCHAR(20) CHECK (model_3d_source IN ('repositorio', 'subido', 'generado_ia')),
    model_3d_assigned_at TIMESTAMPTZ,
    CHECK ((model_3d_path IS NULL) = (model_3d_format IS NULL)),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by INT NOT NULL REFERENCES users(user_id),
    updated_at TIMESTAMPTZ,
    updated_by INT REFERENCES users(user_id),
    deleted_at TIMESTAMPTZ
);
-- Único mientras esté activo — pero SOLO entre productos de categoría
-- fija (`is_fixed`, ver comentario en la columna). Un código
-- relacional repetido entre varios Materiales/Equipos de la misma
-- Partida no rompe nada: la identidad real de la fila sigue siendo
-- `product_id`, todo lo demás (bin_contents, goods_receipt_items,
-- inventory_movements...) referencia ese id, nunca el código.
CREATE UNIQUE INDEX idx_un_products_code_active ON products (project_id, code) WHERE deleted_at IS NULL AND is_fixed;
CREATE INDEX idx_products_project_id ON products (project_id);
-- "Productos relacionados" (una Partida → sus Materiales/Equipos) —
-- Catálogo, endpoint de detalle (ver Fase 3 del roadmap).
CREATE INDEX idx_products_category_id ON products (category_id);
-- Stock total y ubicación principal (SUM/MAX sobre bin_contents) NO
-- son columnas acá — se calculan siempre en el momento.


-- ------------------------------------------------------------
-- 3. Contenido guardado
-- ------------------------------------------------------------

CREATE TABLE bin_contents (
    bin_content_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- Exactamente uno de los dos (ver CHECK abajo) — RESTRICT en
    -- ambos: no se puede borrar de motor un bin/grupo fusionado que
    -- todavía tiene contenido acá, sin importar la cantidad (la
    -- validación linda de "solo bloquea si cantidad > 0", para el
    -- mensaje de error al usuario, es de la aplicación — el motor es
    -- más estricto a propósito, nunca pierde ni una fila con
    -- quantity=0 en silencio).
    bin_id BIGINT REFERENCES bins(bin_id) ON DELETE RESTRICT,
    bin_merge_group_id BIGINT,
    -- RESTRICT: no se puede borrar de motor un producto que todavía
    -- tiene contenido guardado en algún lado.
    product_id BIGINT NOT NULL REFERENCES products(product_id) ON DELETE RESTRICT,
    quantity NUMERIC(18,6) NOT NULL CHECK (quantity >= 0),
    position_x NUMERIC(18,6) NOT NULL DEFAULT 0,
    position_y NUMERIC(18,6) NOT NULL DEFAULT 0,
    position_z NUMERIC(18,6) NOT NULL DEFAULT 0,
    rotation_x NUMERIC(18,6) NOT NULL DEFAULT 0,
    rotation_y NUMERIC(18,6) NOT NULL DEFAULT 0,
    rotation_z NUMERIC(18,6) NOT NULL DEFAULT 0,
    -- Sin CHECK de rango en rotation_x/y/z a propósito: todavía no hay
    -- ningún endpoint que las escriba (columnas preparadas para el
    -- posicionamiento fino a futuro, ver comentario de bin_merge_groups
    -- más abajo) y no está definido si van a guardarse en grados o
    -- radianes — forzar un rango ahora sería adivinar. scale sí tiene
    -- un invariante universal e independiente de esa decisión: un
    -- factor de escala 0 o negativo no es un objeto 3D válido bajo
    -- ningún criterio.
    scale NUMERIC(18,6) CHECK (scale IS NULL OR scale > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by INT NOT NULL REFERENCES users(user_id),
    -- Última vez que cambió la cantidad acá (se va sumando/restando
    -- con Ingresos/Vales de Salida).
    updated_at TIMESTAMPTZ,
    CHECK ((bin_id IS NOT NULL) <> (bin_merge_group_id IS NOT NULL))
);
CREATE INDEX idx_bin_contents_bin_id ON bin_contents (bin_id);
-- Stock total y ubicación principal de un producto (diseño 2.2) hacen
-- SUM/MAX sobre esta tabla filtrando por product_id — el cálculo
-- central de todo el Catálogo.
CREATE INDEX idx_bin_contents_product_id ON bin_contents (product_id);

-- A futuro, NO se implementa todavía (hoy cada bin es un espacio
-- separado) — ver diseño 3.2. La tabla se crea igual ahora porque
-- bin_contents.bin_merge_group_id ya referencia esto arriba.
CREATE TABLE bin_merge_groups (
    bin_merge_group_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY
);
ALTER TABLE bin_contents
    ADD CONSTRAINT fk_bin_contents_merge_group
    FOREIGN KEY (bin_merge_group_id) REFERENCES bin_merge_groups(bin_merge_group_id) ON DELETE RESTRICT;

CREATE TABLE bin_merge_members (
    bin_merge_member_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- Compositiva: si se borra el grupo (todavía sin contenido, o ya
    -- se validó que no tiene), sus filas de membresía se van con él.
    bin_merge_group_id BIGINT NOT NULL REFERENCES bin_merge_groups(bin_merge_group_id) ON DELETE CASCADE,
    -- RESTRICT: no se puede borrar de motor un bin que participa de un
    -- grupo fusionado (5.1.1).
    bin_id BIGINT NOT NULL REFERENCES bins(bin_id) ON DELETE RESTRICT,
    UNIQUE (bin_id)
);


-- ------------------------------------------------------------
-- 4. Movimientos — Goods Receipt (ingreso) y Goods Issue (vale de
--    salida), simétricos, + Kardex (inventory movements)
-- ------------------------------------------------------------

-- Reducido para esta etapa a "4 datos de compra" + elegir
-- ubicación(es)+cantidad por ítem, sin Órdenes de Compra. Registro de
-- movimiento INMUTABLE: no se edita, no se da de baja (no tiene
-- deleted_at) — un error se corrige con un movimiento nuevo, nunca
-- reescribiendo este.
CREATE TABLE goods_receipts (
    goods_receipt_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id INT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    -- RUC = "Registro Único de Contribuyentes", el identificador
    -- tributario peruano (lo asigna SUNAT) — jerga de dominio
    -- intraducible (mismo criterio que `metrado`/`partida`), no un
    -- nombre de columna traducible. Formato REAL, no genérico: SIEMPRE
    -- 11 dígitos numéricos exactos (2 dígitos de tipo de contribuyente
    -- + 8 de cuerpo + 1 dígito verificador) — nunca letras, guiones ni
    -- espacios, nunca menos ni más de 11. `VARCHAR(20)` sin CHECK
    -- dejaba pasar cualquier cosa, incluido "1" — corregido. El
    -- dígito verificador (checksum módulo 11 con pesos fijos) NO se
    -- valida acá a propósito: implementarlo mal en un CHECK de SQL
    -- rechazaría RUCs reales válidos, un daño peor que no validarlo —
    -- si hace falta a futuro, con una referencia/librería confiable en
    -- la aplicación, no adivinado en el esquema.
    supplier_ruc VARCHAR(11) NOT NULL CHECK (supplier_ruc ~ '^\d{11}$'),
    supplier_name VARCHAR(200) NOT NULL CHECK (LENGTH(TRIM(supplier_name)) > 0),
    -- "Guía de remisión" — el documento de despacho real; su NÚMERO sí
    -- se traduce (a diferencia del RUC, acá no se pierde nada
    -- específico del dominio). A propósito SIN un formato fijo tipo
    -- RUC/DNI: a diferencia de esos (identificador emitido por una
    -- entidad única con una regla nacional), el número de guía lo
    -- define cada proveedor en SU propio documento físico/electrónico
    -- — puede traer serie+correlativo con guion, sin guion, con
    -- letras, etc. Acá solo se transcribe lo que dice el papel, no se
    -- valida contra SUNAT.
    delivery_note_number VARCHAR(50) NOT NULL CHECK (LENGTH(TRIM(delivery_note_number)) > 0),
    -- Fecha del documento — distinta de created_at (cuándo se registró
    -- en el sistema, puede no ser el mismo día).
    purchase_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by INT NOT NULL REFERENCES users(user_id)
);
CREATE INDEX idx_goods_receipts_project_id ON goods_receipts (project_id);

CREATE TABLE goods_receipt_items (
    goods_receipt_item_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- Compositiva: un ítem no existe sin su goods receipt.
    goods_receipt_id BIGINT NOT NULL REFERENCES goods_receipts(goods_receipt_id) ON DELETE CASCADE,
    -- RESTRICT: no se puede borrar de motor un producto con historial
    -- de ingresos.
    product_id BIGINT NOT NULL REFERENCES products(product_id) ON DELETE RESTRICT,
    total_quantity NUMERIC(18,6) NOT NULL CHECK (total_quantity > 0)
);
CREATE INDEX idx_goods_receipt_items_receipt_id ON goods_receipt_items (goods_receipt_id);
CREATE INDEX idx_goods_receipt_items_product_id ON goods_receipt_items (product_id);

-- Reparto entre varias ubicaciones. SUM(quantity) agrupado por
-- goods_receipt_item_id debe dar exactamente total_quantity de ese
-- ítem — cruza filas de la misma tabla, no es un CHECK de SQL puro: lo
-- valida la aplicación ANTES de confirmar el ingreso completo, en la
-- misma transacción que crea/suma bin_contents e inserta
-- inventory_movements (ver diseño 4.3).
CREATE TABLE goods_receipt_item_locations (
    goods_receipt_item_location_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    goods_receipt_item_id BIGINT NOT NULL REFERENCES goods_receipt_items(goods_receipt_item_id) ON DELETE CASCADE,
    -- RESTRICT: no se puede borrar de motor un bin que alguna vez
    -- recibió un ingreso (dejaría el historial huérfano — 5.1.2).
    bin_id BIGINT NOT NULL REFERENCES bins(bin_id) ON DELETE RESTRICT,
    quantity NUMERIC(18,6) NOT NULL CHECK (quantity > 0)
);
CREATE INDEX idx_goods_receipt_item_locations_item_id ON goods_receipt_item_locations (goods_receipt_item_id);
CREATE INDEX idx_goods_receipt_item_locations_bin_id ON goods_receipt_item_locations (bin_id);

-- Simétrico a `goods_receipts`, con los campos REALES del documento
-- físico (Vale de Salida) — NO un "motivo" de texto libre genérico.
-- Trae a qué sector/nivel/bloque de la obra va el material, y quién lo
-- retira por nombre+DNI directo (texto libre, NO un `usuario` del
-- sistema: quien retira en obra no siempre tiene login acá — distinto
-- de created_by, que es quien lo REGISTRÓ en el sistema).
CREATE TABLE goods_issues (
    goods_issue_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id INT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    destination_sector VARCHAR(100) NOT NULL CHECK (LENGTH(TRIM(destination_sector)) > 0),
    destination_level VARCHAR(100) NOT NULL CHECK (LENGTH(TRIM(destination_level)) > 0),
    destination_block VARCHAR(100) NOT NULL CHECK (LENGTH(TRIM(destination_block)) > 0),
    recipient_name VARCHAR(200) NOT NULL CHECK (LENGTH(TRIM(recipient_name)) > 0),
    -- DNI = "Documento Nacional de Identidad" peruano (lo asigna
    -- RENIEC) — mismo criterio que supplier_ruc arriba, jerga de
    -- dominio intraducible. Formato real: SIEMPRE 8 dígitos numéricos
    -- exactos (con ceros a la izquierda si hace falta — es un
    -- identificador, no un número, por eso VARCHAR y no INT). Mismo
    -- error que tenía supplier_ruc: `VARCHAR(20)` sin CHECK dejaba
    -- pasar cualquier largo/contenido — corregido.
    recipient_dni VARCHAR(8) NOT NULL CHECK (recipient_dni ~ '^\d{8}$'),
    issue_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by INT NOT NULL REFERENCES users(user_id)
);
CREATE INDEX idx_goods_issues_project_id ON goods_issues (project_id);

CREATE TABLE goods_issue_items (
    goods_issue_item_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    goods_issue_id BIGINT NOT NULL REFERENCES goods_issues(goods_issue_id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products(product_id) ON DELETE RESTRICT,
    total_quantity NUMERIC(18,6) NOT NULL CHECK (total_quantity > 0)
);
CREATE INDEX idx_goods_issue_items_issue_id ON goods_issue_items (goods_issue_id);
CREATE INDEX idx_goods_issue_items_product_id ON goods_issue_items (product_id);

-- Mismas columnas que goods_receipt_item_locations, invertido:
-- `quantity` se RESTA de bin_contents al confirmar (constraint real ya
-- vive en bin_contents.quantity CHECK (quantity >= 0) — una salida que
-- dejaría negativo se rechaza ahí).
CREATE TABLE goods_issue_item_locations (
    goods_issue_item_location_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    goods_issue_item_id BIGINT NOT NULL REFERENCES goods_issue_items(goods_issue_item_id) ON DELETE CASCADE,
    bin_id BIGINT NOT NULL REFERENCES bins(bin_id) ON DELETE RESTRICT,
    quantity NUMERIC(18,6) NOT NULL CHECK (quantity > 0)
);
CREATE INDEX idx_goods_issue_item_locations_item_id ON goods_issue_item_locations (goods_issue_item_id);
CREATE INDEX idx_goods_issue_item_locations_bin_id ON goods_issue_item_locations (bin_id);

-- Historial inmutable de movimientos — snapshot del saldo resultante
-- en el momento (no se recalcula después leyendo hacia atrás).
-- reference_document_id NO lleva FK real de motor: según
-- reference_document_type apunta a `goods_receipts` O a
-- `goods_issues`, y Postgres no tiene una FK condicional/polimórfica —
-- mismo criterio ya usado en products.base_product_code (a propósito
-- no un FK real, para no forzar una tabla intermedia solo para esto).
-- La aplicación arma esta fila siempre dentro de la misma transacción
-- que el movimiento real, nunca por separado.
CREATE TABLE inventory_movements (
    inventory_movement_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES products(product_id) ON DELETE RESTRICT,
    -- Valores en español a propósito (dato real que se muestra en un
    -- reporte de Kardex, mismo criterio que warehouses.direction).
    type VARCHAR(10) NOT NULL CHECK (type IN ('entrada', 'salida')),
    quantity NUMERIC(18,6) NOT NULL CHECK (quantity > 0),
    bin_id BIGINT NOT NULL REFERENCES bins(bin_id) ON DELETE RESTRICT,
    -- Mismo invariante que bin_contents.quantity (>= 0, nunca
    -- negativo) — es el snapshot de ESE saldo justo después del
    -- movimiento, tiene que respetar la misma regla que la columna que
    -- retrata.
    resulting_balance NUMERIC(18,6) NOT NULL CHECK (resulting_balance >= 0),
    -- A diferencia de `type` de arriba (dato real, en español), esto
    -- es un discriminador TÉCNICO de a qué tabla apunta
    -- reference_document_id — en inglés, matcheando el nombre real de
    -- esas tablas (nunca se muestra tal cual a un usuario).
    reference_document_type VARCHAR(20) NOT NULL CHECK (reference_document_type IN ('goods_receipt', 'goods_issue')),
    reference_document_id BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by INT NOT NULL REFERENCES users(user_id)
);
-- Kardex filtrable por producto/fecha (Fase 4) — la consulta central
-- de este historial.
CREATE INDEX idx_inventory_movements_product_id ON inventory_movements (product_id, created_at);
CREATE INDEX idx_inventory_movements_bin_id ON inventory_movements (bin_id);
