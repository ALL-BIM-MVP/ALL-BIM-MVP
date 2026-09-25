// Motor de lectura con Google Gemini (API REST, sin SDK). Configuración por variables de entorno:
//   GEMINI_API_KEY      clave del servicio (solo en el servidor, nunca en el frontend)
//   AI_MODEL            modelo principal (por defecto gemini-3.6-flash)
//   AI_MODEL_FALLBACKS  modelos de respaldo separados por coma: se prueban en orden si el principal no
//                       responde (saturado o sin cuota). Cada modelo tiene su propia cuota.
//   AI_TIMEOUT_MS       tiempo máximo por intento (por defecto 45000)
// Reintenta con espera creciente cuando el servicio está saturado (500/503/504). Una cuota agotada
// (429 RESOURCE_EXHAUSTED) no se reintenta: pasa directo al siguiente modelo. Nunca se registra la clave
// ni el contenido del documento.
// Nota de diseño: 2 intentos por modelo (no 3) a propósito — es una petición HTTP síncrona que el usuario
// espera con el formulario bloqueado; un modelo verdaderamente colgado (nunca un error rápido, que es lo
// normal) con 3 modelos × 3 intentos × 90s podía llegar a ~13 minutos en el peor caso. Con esto, el techo
// real baja a unos minutos y sigue sobrando margen para una respuesta lenta pero real.
import { AppError } from "../../models/errors/app-error.js";
import { DOCUMENT_DRAFT_ERRORS } from "../../models/errors/almacen/document-draft.errors.js";
import { logger } from "../../utils/logger.js";
import { DOCUMENT_READ_JSON_SCHEMA, DocumentReadSchema } from "./document-read.schema.js";
import { buildDocumentReadPrompt } from "./document-read.prompt.js";
import type { DocumentReader, DocumentReaderInput, DocumentReaderResult } from "./document-reader.js";

const DEFAULT_MODEL = "gemini-3.6-flash";
const ATTEMPTS_PER_MODEL = 2;
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface GeminiResponse {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

// Gemini no acepta la clave "$schema" del JSON Schema.
const responseSchema = (() => { const { $schema: _omit, ...rest } = DOCUMENT_READ_JSON_SCHEMA as Record<string, unknown>; return rest; })();

export const createGeminiDocumentReader = (): DocumentReader => {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) throw new AppError(DOCUMENT_DRAFT_ERRORS.AI_NOT_CONFIGURED);
    const primary = process.env.AI_MODEL?.trim() || DEFAULT_MODEL;
    const fallbacks = (process.env.AI_MODEL_FALLBACKS ?? "").split(",").map((m) => m.trim()).filter((m) => m && m !== primary);
    const models = [primary, ...fallbacks];
    const timeoutMs = Number(process.env.AI_TIMEOUT_MS) > 0 ? Number(process.env.AI_TIMEOUT_MS) : 45_000;

    // Una llamada a UN modelo, con reintentos por saturación. Lanza AI_UNAVAILABLE / AI_TIMEOUT.
    const callModel = async (model: string, input: DocumentReaderInput): Promise<GeminiResponse> => {
        let lastStatus = 0;
        let lastDetail = "";
        for (let attempt = 1; attempt <= ATTEMPTS_PER_MODEL; attempt++) {
            let response: Response;
            try {
                response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
                    method: "POST",
                    headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
                    signal: AbortSignal.timeout(timeoutMs),
                    body: JSON.stringify({
                        contents: [{ parts: [
                            { inline_data: { mime_type: input.mimeType, data: input.bytes.toString("base64") } },
                            { text: buildDocumentReadPrompt(input.documentType) },
                        ] }],
                        generationConfig: { temperature: 0, responseMimeType: "application/json", responseJsonSchema: responseSchema },
                    }),
                });
            } catch (error) {
                if ((error as Error).name === "TimeoutError" || (error as Error).name === "AbortError") throw new AppError(DOCUMENT_DRAFT_ERRORS.AI_TIMEOUT);
                lastStatus = 0;
                lastDetail = "sin conexión";
                if (attempt === ATTEMPTS_PER_MODEL) break;
                await sleep(1500 * 2 ** (attempt - 1));
                continue;
            }
            if (response.ok) return (await response.json()) as GeminiResponse;
            lastStatus = response.status;
            lastDetail = await response.json().then((b: { error?: { status?: string; message?: string } }) => `${b.error?.status ?? ""}: ${(b.error?.message ?? "").slice(0, 160)}`).catch(() => "");
            const quotaExhausted = lastDetail.startsWith("RESOURCE_EXHAUSTED");
            if (!RETRYABLE.has(response.status) || quotaExhausted || attempt === ATTEMPTS_PER_MODEL) break;
            await sleep(1500 * 2 ** (attempt - 1));
        }
        logger.warn({ status: lastStatus, detail: lastDetail, model }, "La lectura de documentos con IA falló en un modelo");
        throw new AppError(DOCUMENT_DRAFT_ERRORS.AI_UNAVAILABLE);
    };

    return {
        async read(input: DocumentReaderInput): Promise<DocumentReaderResult> {
            const startedAt = Date.now();
            let body: GeminiResponse | null = null;
            let used = primary;
            let failure: AppError | null = null;
            for (const model of models) {
                try { body = await callModel(model, input); used = model; break; }
                catch (error) { if (!(error instanceof AppError)) throw error; failure = error; }
            }
            if (!body) throw failure ?? new AppError(DOCUMENT_DRAFT_ERRORS.AI_UNAVAILABLE);

            const candidate = body.candidates?.[0];
            const text = candidate?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
            if (body.promptFeedback?.blockReason || !text || (candidate?.finishReason && candidate.finishReason !== "STOP")) {
                logger.warn({ model: used, finishReason: candidate?.finishReason, blocked: body.promptFeedback?.blockReason }, "Lectura sin resultado utilizable");
                throw new AppError(DOCUMENT_DRAFT_ERRORS.AI_BAD_OUTPUT);
            }
            let json: unknown;
            try { json = JSON.parse(text); } catch { throw new AppError(DOCUMENT_DRAFT_ERRORS.AI_BAD_OUTPUT); }
            const parsed = DocumentReadSchema.safeParse(json);
            if (!parsed.success) throw new AppError(DOCUMENT_DRAFT_ERRORS.AI_BAD_OUTPUT);
            logger.info({ model: used, ms: Date.now() - startedAt, inputTokens: body.usageMetadata?.promptTokenCount, outputTokens: body.usageMetadata?.candidatesTokenCount }, "Documento leído con IA");
            return {
                read: parsed.data,
                engine: { provider: "gemini", model: used },
                usage: { input_tokens: body.usageMetadata?.promptTokenCount ?? null, output_tokens: body.usageMetadata?.candidatesTokenCount ?? null },
            };
        },
    };
};
