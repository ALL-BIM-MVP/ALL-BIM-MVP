import path from "node:path";
import fs from "node:fs";
import sharp from "sharp";

// Miniatura de arranque: cabe dentro de 400×300 (fit:"inside", nunca
// recorta ni deforma), sin agrandar imágenes que ya son más chicas que
// eso. Siempre se guarda como JPEG — el thumbnail es solo para
// previsualizar en una lista, no hace falta preservar el formato
// original ni la transparencia (se aplana sobre blanco). Si algún día
// hace falta un tamaño distinto por contexto (ej. una grilla más
// grande), esto es lo único que hay que tocar.
const THUMBNAIL_MAX_WIDTH = 400;
const THUMBNAIL_MAX_HEIGHT = 300;
const THUMBNAIL_JPEG_QUALITY = 82;

// Mismo directorio que el archivo original, en una subcarpeta
// "thumbnails" — así queda bajo la misma protección que el resto de
// uploads/:projectId/ (privado, nunca montado como estático), sin
// tener que replicar el cálculo de carpeta por proyecto acá.
const thumbnailPathFor = (sourcePath : string) : string => {
    const dir = path.join(path.dirname(sourcePath), "thumbnails");
    return path.join(dir, `${path.basename(sourcePath)}.jpg`);
};

// Nunca lanza — un thumbnail fallido (imagen corrupta, formato que
// sharp no soporta, etc.) no debe tumbar la subida del archivo
// original. Devuelve null en ese caso, que es lo que
// saveFileService guarda en thumbnail_path (NULL = no disponible).
export const generateThumbnail = async (sourcePath : string) : Promise<string | null> => {
    const outputPath = thumbnailPathFor(sourcePath);

    try {
        await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

        await sharp(sourcePath)
            .resize({
                width: THUMBNAIL_MAX_WIDTH,
                height: THUMBNAIL_MAX_HEIGHT,
                fit: "inside",
                withoutEnlargement: true,
            })
            .flatten({ background: "#ffffff" })
            .jpeg({ quality: THUMBNAIL_JPEG_QUALITY })
            .toFile(outputPath);

        return outputPath;
    } catch (error) {
        console.error("No se pudo generar el thumbnail:", error instanceof Error ? error.message : error);
        await fs.promises.rm(outputPath, { force: true });
        return null;
    }
};
