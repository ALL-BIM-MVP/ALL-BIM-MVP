DROP DATABASE IF EXISTS all_bim;

CREATE DATABASE all_bim;

\c all_bim

CREATE TABLE roles (
    rol_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre VARCHAR(40) UNIQUE NOT NULL
);

CREATE TABLE usuarios (
    usuario_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre VARCHAR(60) NOT NULL,
    correo VARCHAR(120) UNIQUE NOT NULL,
    contrasena_hash VARCHAR(256) NOT NULL,
    activo BOOLEAN DEFAULT TRUE,
    creado_en TIMESTAMP DEFAULT NOW(),
    rol_id INT NOT NULL REFERENCES roles(rol_id)
);


INSERT INTO roles (nombre)
VALUES
    ('admin'),
    ('editor'),
    ('usuario');

INSERT INTO usuarios (
    nombre, correo, contrasena_hash, rol_id
)
VALUES (
    'Ismael', 'ismael@email.com', 'hash_de_prueba', 1
);