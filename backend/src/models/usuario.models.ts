export interface Usuario {
    usuario_id: number;
    nombre: string;
    correo: string;
    contrasena_hash: string;
    activo: boolean;
    creado_en: string
};