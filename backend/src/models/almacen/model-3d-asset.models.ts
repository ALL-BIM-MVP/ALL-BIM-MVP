// model_3d_assets — ver database/schema.sql. Del USUARIO que lo sube,
// NO de un proyecto (a diferencia del resto de este módulo) — por eso
// no tiene project_id ni es una extensión de `files`. `file_path`
// queda afuera de esta interfaz a propósito (nunca se expone al
// cliente, solo lo lee el service para servir el contenido).
export interface Model3DAssetRow {
    model_3d_asset_id: number;
    name: string;
    format: "glb" | "gltf";
    owner_id: number;
    // Congelado al subir — ver comentario grande en schema.sql. Nunca
    // se recalcula después.
    is_system: boolean;
    created_at: Date;
}

// URL de descarga — SIEMPRE relativa a un proyecto puntual (aunque el
// asset en sí no le pertenezca a ninguno) porque la autorización de
// CADA pedido depende de "¿desde qué proyecto se está mirando esto?"
// (ver assertModel3DAssetVisible) — nunca una URL firmada (a
// diferencia de los archivos de `files`): este archivo puede vivir y
// reusarse mucho tiempo, una URL que vence a los 5 minutos no sirve
// para eso. Bearer normal, mismo criterio que el resto de este módulo.
export const buildModel3DAssetUrl = (projectId: number, assetId: number): string =>
    `/projects/${projectId}/model-3d-assets/${assetId}/content`;
