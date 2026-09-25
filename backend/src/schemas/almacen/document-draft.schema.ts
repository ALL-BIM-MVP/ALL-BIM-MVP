import z from 'zod';
import { idSchema } from './document-common.schema.js';

// POST /projects/:projectId/document-drafts — lee un archivo ya subido (POST /files, module_code=almacen)
// y devuelve el borrador del documento indicado.
export const CreateDocumentDraftBodySchema = z.object({
    file_id: idSchema,
    document_type: z.enum(["requisition", "quotation", "purchase-order", "invoice", "goods-receipt"]),
});
export type CreateDocumentDraftBody = z.infer<typeof CreateDocumentDraftBodySchema>;
