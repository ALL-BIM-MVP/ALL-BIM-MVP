import type { ErrorFormat } from "../app-error.js";

export const MODEL_3D_ASSET_ERRORS = {

    // Un solo mensaje para "no existe" Y "existe pero no lo podés ver
    // desde este proyecto" (ver assertModel3DAssetVisible) — a
    // propósito no se distinguen: si se distinguieran, alguien podría
    // usar el mensaje de error para averiguar qué IDs de modelos
    // ajenos existen de verdad, sin tener acceso a ellos.
    MODEL_3D_ASSET_NOT_FOUND: {
        statusCode: 400,
        response: {
            code: "MODEL_3D_ASSET_NOT_FOUND",
            message: "El modelo 3D indicado no existe o no está disponible para vos en este proyecto."
        }
    },

    MODEL_3D_ASSET_FILE_REQUIRED: {
        statusCode: 400,
        response: {
            code: "MODEL_3D_ASSET_FILE_REQUIRED",
            message: "Hace falta adjuntar un archivo (campo `file`, multipart/form-data)."
        }
    },

    MODEL_3D_ASSET_INVALID_EXTENSION: {
        statusCode: 400,
        response: {
            code: "MODEL_3D_ASSET_INVALID_EXTENSION",
            message: "El archivo tiene que ser .glb o .gltf — son los únicos formatos que el visor 3D real sabe cargar."
        }
    },

} satisfies Record<string, ErrorFormat>;
