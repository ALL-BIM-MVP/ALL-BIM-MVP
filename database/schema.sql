
-----------------------------------------------------------
---  USUARIOS / ROLES / PROYECTOS
------------------------------------------------------------

CREATE TABLE modules(
    module_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
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
    email VARCHAR(256) UNIQUE NOT NULL,
    password_hash VARCHAR(256) NOT NULL,
    active BOOLEAN DEFAULT TRUE,
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

CREATE TABLE project_roles(
    project_role_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(60) NOT NULL CHECK (LENGTH(TRIM(name)) > 0),
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_by INT DEFAULT NULL REFERENCES users(user_id),
    UNIQUE(created_by, name)
);

CREATE TABLE project_members(
    project_member_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id INT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(user_id),
    project_role_id INT NOT NULL REFERENCES project_roles(project_role_id),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id,user_id)
);

CREATE TABLE project_invitations(
    invitation_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email VARCHAR(256) NOT NULL,
    status VARCHAR(20) DEFAULT 'pendiente' NOT NULL CHECK(status IN ('pendiente', 'aceptado', 'rechazado', 'cancelado')),
    responded_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '3 days',
    project_id INT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    project_role_id INT NOT NULL REFERENCES project_roles(project_role_id),
    invited_by INT NOT NULL REFERENCES users(user_id)
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

CREATE TABLE ifc_files (
    ifc_file_id BIGINT PRIMARY KEY REFERENCES files(file_id) ON DELETE CASCADE,
    schema_version VARCHAR(10),
    status VARCHAR(20) NOT NULL DEFAULT 'processing'
        CHECK (status IN ('processing','done','error')),
    processed_at TIMESTAMPTZ,
    error_message TEXT
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


-- ------------------------------------------------------------
-- CATALOGO DE COLUMNAS PREDEFINIDAS
-- ------------------------------------------------------------

CREATE TABLE builtin_field_catalog (
    builtin_field    VARCHAR(30) PRIMARY KEY,
    label_default    VARCHAR(100) NOT NULL,
    data_type        VARCHAR(20) NOT NULL CHECK (data_type IN ('text','numeric','integer')),
    is_aggregate     BOOLEAN NOT NULL DEFAULT FALSE,
    applies_to_group VARCHAR(20) NOT NULL CHECK (
        applies_to_group IN ('identificacion','dimensiones','metrado','totales')
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
