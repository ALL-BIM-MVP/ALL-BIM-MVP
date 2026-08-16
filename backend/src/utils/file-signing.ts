// URLs firmadas de corta duración para servir archivos privados sin
// pasar por fetch()+Blob por cada uno — pensado a propósito para que
// se sienta lo más parecido posible a una URL presignada de S3
// (GetObject con Expires): se firma una vez al armar la lista, se usa
// directo en <img src="..."> sin Authorization, y vence sola a los
// pocos minutos. El día que esto migre a S3 real, este archivo es lo
// único que cambia — el resto de la API (thumbnail_url en la lista,
// GET /files/:id/thumbnail|content) queda igual.
//
// La autorización queda fijada en el momento de firmar (ver
// buildSignedFileUrl, llamado desde files.models.ts con datos que ya
// pasaron por assertProjectAccess al armar la lista) — un token válido
// NO vuelve a chequear membresía/dueño contra la BD, exactamente igual
// que S3 no vuelve a consultar IAM cuando alguien usa una URL
// presignada ya emitida.
import jwt from "jsonwebtoken";

if (!process.env.FILE_SIGNING_SECRET) {
    throw new Error("ERROR: variable 'FILE_SIGNING_SECRET' no definida.");
}

const FILE_SIGNING_SECRET : string = process.env.FILE_SIGNING_SECRET;

// Corta a propósito: se regenera en cada GET de la lista, no está
// pensada para guardarse ni compartirse fuera de esa sesión de uso.
const SIGNED_URL_TTL_SECONDS = Number(process.env.FILE_SIGNED_URL_TTL_SECONDS) || 300;

export type SignedFilePurpose = "content" | "thumbnail";

// file_id viaja como STRING a propósito, no number — files.file_id es
// BIGINT, y node-postgres lo devuelve como string para no arriesgar
// precisión (mismo criterio de "nunca castear BIGINT ids" que sigue el
// resto del backend). Firmar con Number(fileId) y comparar contra
// Number(req.params.fileId) parece inofensivo pero rompe en cuanto un
// lado castea y el otro no — se fuerza String() en los dos bordes
// (signFileAccess/verifyFileAccess) para que la comparación sea
// siempre string===string.
interface SignedFilePayload {
    file_id : string;
    purpose : SignedFilePurpose;
}

export const signFileAccess = (fileId : string | number, purpose : SignedFilePurpose) : string => {
    return jwt.sign(
        { file_id: String(fileId), purpose } satisfies SignedFilePayload,
        FILE_SIGNING_SECRET,
        { expiresIn: SIGNED_URL_TTL_SECONDS }
    );
};

// No lanza — un token vencido/inválido/de otro archivo o de otro
// propósito (ej. uno de "thumbnail" reusado para pedir "content") es
// simplemente "no autorizado", no una excepción; quien llama decide
// qué hacer (ver middlewares/file-access.middleware.ts).
export const verifyFileAccess = (token : string, fileId : string | number, purpose : SignedFilePurpose) : boolean => {
    try {
        const decoded = jwt.verify(token, FILE_SIGNING_SECRET);
        if (typeof decoded === "string") return false;

        const payload = decoded as Partial<SignedFilePayload>;
        return payload.file_id === String(fileId) && payload.purpose === purpose;
    } catch {
        return false;
    }
};

// Path relativo al mismo prefijo de API que ya usa el resto de rutas
// de archivos (GET /files/:id/content) — el frontend le antepone su
// baseUrl de siempre, no hace falta tratarlo distinto.
export const buildSignedFileUrl = (fileId : string | number, purpose : SignedFilePurpose) : string => {
    const token = signFileAccess(fileId, purpose);
    return `/files/${fileId}/${purpose}?token=${token}`;
};
