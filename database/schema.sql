CREATE DATABASE all_bim;

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
    created_at TIMESTAMP DEFAULT NOW(),
    role_id INT NOT NULL REFERENCES roles(role_id)
);

CREATE TABLE invitations (
    invitation_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email VARCHAR(150) NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL DEFAULT NOW() + INTERVAL '3 days',
    used BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE refresh_tokens (
    refresh_token_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(user_id),
    token_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    last_used TIMESTAMP NOT NULL DEFAULT NOW(),
    active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE projects (
    project_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    start_date TIMESTAMP,
    end_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE ifc_files (
    ifc_file_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    file_path VARCHAR(120) NOT NULL,
    uploaded_at TIMESTAMP NOT NULL DEFAULT NOW(),
    user_id INT REFERENCES users(user_id)
);

CREATE TABLE cache_data (
    cache_data_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    cache_path VARCHAR(120) NOT NULL,
    uploaded_at TIMESTAMP NOT NULL DEFAULT NOW(),
    ifc_file_id INT REFERENCES ifc_files(ifc_file_id)
);



