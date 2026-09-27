import { api } from '../api';
import { DocumentDraftResponse, DocumentDraftType } from '../../types/almacen.types';

// La IA tarda segundos y, en el peor caso (servicio saturado, reintentando con modelos de respaldo),
// 2-3 minutos: el timeout normal de 30s la cortaría antes de tiempo.
const AI_READ_TIMEOUT_MS = 4 * 60_000;

export const documentDraftService = {
  // Leer NO guarda nada: devuelve el borrador para que el usuario lo revise y lo confirme.
  async readDocument(projectId: number, fileId: number, documentType: DocumentDraftType): Promise<DocumentDraftResponse> {
    return api.post(`/api/projects/${projectId}/document-drafts`, { file_id: fileId, document_type: documentType }, AI_READ_TIMEOUT_MS);
  },
};
