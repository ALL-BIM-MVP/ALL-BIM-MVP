// Motor que lee un documento (imagen o PDF) y devuelve sus datos crudos. Es una interfaz a propósito:
// el proveedor de IA se elige por configuración (AI_PROVIDER) y se puede cambiar sin tocar el resto
// (borradores, validaciones, endpoint). En las pruebas se reemplaza por un lector simulado.
import { AppError } from "../../models/errors/app-error.js";
import { DOCUMENT_DRAFT_ERRORS } from "../../models/errors/almacen/document-draft.errors.js";
import type { DocumentRead } from "./document-read.schema.js";
import type { DraftDocumentType } from "./document-read.prompt.js";
import { createGeminiDocumentReader } from "./gemini-document-reader.js";

export interface DocumentReaderInput {
    bytes: Buffer;
    mimeType: string;
    documentType: DraftDocumentType;
}

export interface DocumentReaderResult {
    read: DocumentRead;
    engine: { provider: string; model: string };
    usage: { input_tokens: number | null; output_tokens: number | null };
}

export interface DocumentReader {
    read(input: DocumentReaderInput): Promise<DocumentReaderResult>;
}

let override: DocumentReader | null = null;
// Solo para pruebas: reemplaza el motor real (null = volver al configurado).
export const setDocumentReaderForTests = (reader: DocumentReader | null): void => { override = reader; };

export const getDocumentReader = (): DocumentReader => {
    if (override) return override;
    const provider = (process.env.AI_PROVIDER ?? "gemini").trim().toLowerCase();
    if (provider === "gemini") return createGeminiDocumentReader();
    throw new AppError(DOCUMENT_DRAFT_ERRORS.AI_NOT_CONFIGURED);
};
