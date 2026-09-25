import { api } from '../api';
import { TraceabilityDirection, TraceabilityDocumentType, TraceabilityResponse } from '../../types/almacen.types';

export const traceabilityService = {
  async getTraceability(
    projectId: number, documentType: TraceabilityDocumentType, documentId: string, direction: TraceabilityDirection = 'all'
  ): Promise<TraceabilityResponse> {
    return api.get(`/api/projects/${projectId}/traceability/${documentType}/${documentId}?direction=${direction}`);
  },
};
