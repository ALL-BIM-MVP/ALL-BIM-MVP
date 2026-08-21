import path from "node:path";
import fs from "node:fs";
import sharp from "sharp";
import { PUBLIC_UPLOADS_DIR } from "../middlewares/upload.midleware.js";

// Cuadrado, recortado (fit:"cover", a diferencia del fit:"inside" de
// utils/thumbnail.ts) — un avatar necesita llenar el círculo/cuadrado
// que le da la UI sin dejar franjas vacías, no "caber adentro" como un
// thumbnail de lista. Siempre JPEG, mismo criterio que el resto de
// imágenes derivadas de este proyecto (no hace falta preservar
// transparencia para una foto de perfil).
const AVATAR_SIZE = 256;
const AVATAR_JPEG_QUALITY = 85;

// Nombre de archivo DETERMINÍSTICO (userId.jpg, siempre la misma
// extensión porque sharp siempre reencodea a JPEG) — a diferencia de
// la portada de proyecto (que preserva el nombre/extensión original y
// necesita borrar el archivo viejo antes de insertar el nuevo por la
// unicidad de project_images), acá no hace falta ningún nombre único
// ni limpieza de "el archivo anterior": subir una foto nueva
// simplemente sobreescribe el mismo path de siempre.
const avatarPathFor = (userId : number) : string =>
    path.join(PUBLIC_UPLOADS_DIR, "avatars", `${userId}.jpg`);

// A diferencia de generateThumbnail (que nunca lanza — un thumbnail
// fallido no debe tumbar la subida de un archivo que sigue siendo
// válido igual), acá SÍ se propaga el error: la foto de perfil ES el
// contenido que el usuario pidió subir, si sharp no puede procesarla
// (formato no soportado, archivo corrupto) no hay "subida exitosa
// parcial" que devolver — el controller lo traduce a 400.
export const saveProfilePicture = async (buffer : Buffer, userId : number) : Promise<string> => {
    const outputPath = avatarPathFor(userId);
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

    await sharp(buffer)
        .resize({ width: AVATAR_SIZE, height: AVATAR_SIZE, fit: "cover" })
        .jpeg({ quality: AVATAR_JPEG_QUALITY })
        .toFile(outputPath);

    return outputPath;
};

// force:true — no hace falta que exista (ej. borrar la foto de una
// cuenta que nunca subió una, o limpiar tras is_deleted si ya se había
// borrado antes por otra vía).
export const deleteProfilePicture = async (filePath : string) : Promise<void> => {
    await fs.promises.rm(filePath, { force: true });
};
