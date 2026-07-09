DROP DATABASE IF EXISTS all_bim;

CREATE DATABASE all_bim;

\c all_bim

CREATE TABLE roles (
    role_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(40) UNIQUE NOT NULL,
    is_assignable BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE users (
    user_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(60) NOT NULL CHECK (LENGTH(TRIM(name)) > 0),
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(256) NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    role_id INT NOT NULL REFERENCES roles(role_id)
);

CREATE TABLE user_invitations (
    invitation_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email VARCHAR(150) NOT NULL,
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
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by INT NOT NULL REFERENCES users(user_id)
);

CREATE TABLE project_roles(
    project_role_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(60) NOT NULL CHECK (LENGTH(TRIM(name)) > 0),
    is_default BOOLEAN DEFAULT FALSE,
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
    email VARCHAR(150) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK(status IN ('pendiente', 'aceptado', 'rechazado', 'cancelado')),
    responded_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '3 days',
    project_id INT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    project_role_id INT NOT NULL REFERENCES project_roles(project_role_id),
    invited_by INT NOT NULL REFERENCES users(user_id)
);

CREATE TABLE ifc_files (
    ifc_file_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(80) NOT NULL,
    file_path TEXT NOT NULL,
    file_size BIGINT,
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    project_id INT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    uploaded_by INT NOT NULL REFERENCES users(user_id) 
);

CREATE TABLE cache_data (
    cache_data_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(80) NOT NULL,
    cache_path TEXT NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ifc_file_id INT UNIQUE REFERENCES ifc_files(ifc_file_id) ON DELETE CASCADE
);


INSERT INTO roles(name, is_assignable)
VALUES
    ('ADMINISTRADOR', false),
    ('SUPERVISOR', true),
    ('MODERADOR', true),
    ('USUARIO', true);

INSERT INTO users (
    name, email, password_hash, role_id
)
VALUES (
    'Ismael', 'ismael@email.com', '$2b$10$NxPQ5w4pQpFsSXT9ICdn7O2xCIhhBP5oou1Rzd9P9aodX2Cqlfo4i', 1
);


---PARA EL UUID : 621a7eaf-4d18-46eb-8fcb-9b3935f292a3
INSERT INTO user_invitations(
    email, token_hash, role_id
) 
VALUES (
    'ismaelsalvadorpachacutecllanos@gmail.com', 
    'a6957c03a48a92d4a510ec6d67943c90399009a49e741759e1869ae6e2537a5f', 
    1
);