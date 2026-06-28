DROP DATABASE IF EXISTS all_bim;

CREATE DATABASE all_bim;

\c all_bim

CREATE TABLE roles (
    role_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(40) UNIQUE NOT NULL
);

CREATE TABLE users (
    user_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(60) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(256) NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    role_id INT NOT NULL REFERENCES roles(role_id)
);

CREATE TABLE invitations (
    invitation_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email VARCHAR(150) NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL DEFAULT NOW() + INTERVAL '3 days',
    used BOOLEAN NOT NULL DEFAULT FALSE,
    role_id INT NOT NULL REFERENCES roles(role_id)
);

CREATE TABLE refresh_tokens (
    refresh_token_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    last_used TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    user_id INT NOT NULL REFERENCES users(user_id)
);

CREATE TABLE projects (
    project_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ifc_files (
    ifc_file_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(80) NOT NULL,
    file_path VARCHAR(120) NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id INT REFERENCES users(user_id)
);

CREATE TABLE cache_data (
    cache_data_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(80) NOT NULL,
    cache_path VARCHAR(120) NOT NULL,
    ifc_file_id INT REFERENCES ifc_files(ifc_file_id)
);




INSERT INTO roles(name)
VALUES
    ('ADMINISTRADOR'),
    ('EDITOR'),
    ('USUARIO');

INSERT INTO users (
    name, email, password_hash, role_id
)
VALUES (
    'Ismael', 'ismael@email.com', '$2b$10$NxPQ5w4pQpFsSXT9ICdn7O2xCIhhBP5oou1Rzd9P9aodX2Cqlfo4i', 1
),(
    'Ismael Salvador ', 'ismaelsalvador@email.com', '$2b$10$NxPQ5w4pQpFsSXT9ICdn7O2xCIhhBP5oou1Rzd9P9aodX2Cqlfo5i', 2
),(
    'Ismael Pacahcutec', 'ismaelpachacutec@email.com', '$2b$10$NxPQ5w4pQpFsSXT9ICdn7O2xCIhhBP5oou1Rzd9P9aodX2Cqlfo6i', 3
),(
    'Ismael Llanos', 'ismaellanos@email.com', '$2b$10$NxPQ5w4pQpFsSXT9ICdn7O2xCIhhBP5oou1Rzd9P9aodX2Cqlfo8qi', 2
);


---PARA EL UUID : 621a7eaf-4d18-46eb-8fcb-9b3935f292a3
INSERT INTO invitations(
    email, token_hash, role_id
) 
VALUES (
    'ismaelsalvadorpachacutecllanos@gmail.com', 
    'a6957c03a48a92d4a510ec6d67943c90399009a49e741759e1869ae6e2537a5f', 
    1
);