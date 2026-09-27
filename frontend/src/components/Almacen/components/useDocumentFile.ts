import { useCallback, useEffect, useRef, useState } from 'react';
import { projectService } from '../../../services/project.service';
import { documentDraftService } from '../../../services/almacen/documentDraft.service';
import { DocumentDraftResponse, DocumentDraftType } from '../../../types/almacen.types';

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
const MAX_BYTES = 15 * 1024 * 1024;

/** Estado del documento físico de un formulario de creación: el archivo elegido (vista previa local,
 * sin red), su file_id una vez subido (se sube UNA sola vez y se reutiliza), y la lectura con IA.
 * Una lectura que llega cuando el archivo ya cambió o el formulario se cerró se descarta. */
export function useDocumentFile(projectId: number, documentType: DocumentDraftType) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileId, setFileId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DocumentDraftResponse | null>(null);

  // "A qué archivo pertenece esta lectura" — se invalida al cambiar/quitar el archivo, cancelar o desmontar.
  const token = useRef(0);
  const uploadPromise = useRef<Promise<number> | null>(null);

  useEffect(() => {
    if (!file) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => () => { token.current += 1; }, []);

  const selectFile = useCallback((next: File | null) => {
    token.current += 1;
    uploadPromise.current = null;
    setFileId(null);
    setDraft(null);
    setReading(false);
    setError(null);
    if (!next) { setFile(null); return; }
    if (!ACCEPTED.includes(next.type)) { setError('Solo se aceptan PNG, JPG, WEBP o PDF.'); return; }
    if (next.size > MAX_BYTES) { setError('El archivo supera los 15 MB.'); return; }
    setFile(next);
  }, []);

  // Sube el archivo la primera vez que hace falta (leer o guardar) y reutiliza el file_id después.
  const ensureUploaded = useCallback(async (): Promise<number | null> => {
    if (!file) return null;
    if (fileId !== null) return fileId;
    if (!uploadPromise.current) {
      setUploading(true);
      uploadPromise.current = projectService.uploadFile(projectId, file, 'almacen')
        .then((uploaded: any) => {
          const id = Number(uploaded.file_id);
          setFileId(id);
          return id;
        })
        .finally(() => setUploading(false));
    }
    try {
      return await uploadPromise.current;
    } catch (err) {
      uploadPromise.current = null;
      throw err;
    }
  }, [file, fileId, projectId]);

  const read = useCallback(async (): Promise<DocumentDraftResponse | null> => {
    if (!file) return null;
    const mine = ++token.current;
    setError(null);
    setReading(true);
    try {
      const id = await ensureUploaded();
      if (id === null || mine !== token.current) return null;
      const result = await documentDraftService.readDocument(projectId, id, documentType);
      if (mine !== token.current) return null;
      setDraft(result);
      return result;
    } catch (err) {
      if (mine === token.current) setError(err instanceof Error ? err.message : 'No se pudo leer el documento. Podés llenar el formulario a mano.');
      return null;
    } finally {
      if (mine === token.current) setReading(false);
    }
  }, [file, ensureUploaded, projectId, documentType]);

  const cancelRead = useCallback(() => {
    token.current += 1;
    setReading(false);
  }, []);

  return { file, previewUrl, fileId, uploading, reading, error, draft, selectFile, ensureUploaded, read, cancelRead };
}

export type DocumentFileState = ReturnType<typeof useDocumentFile>;
