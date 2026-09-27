import React, { useEffect, useRef, useState } from 'react';
import { FileText, Loader2, Sparkles, X } from 'lucide-react';
import { DocumentFileState } from './useDocumentFile';

interface DocumentPanelProps {
  doc: DocumentFileState;
  // Bloquea elegir/quitar archivo (ej. mientras se guarda el formulario).
  disabled?: boolean;
  // Con el borrador ya aplicado, leer de nuevo pisaría lo que el usuario corrigió y gasta cuota.
  onRead: () => void;
}

/** Columna "Documento físico": arrastrar, elegir o pegar (Ctrl+V) una foto o PDF, verlo mientras se
 * llena el formulario y, si el usuario quiere, leerlo con IA. Leer NUNCA guarda nada. */
const DocumentPanel: React.FC<DocumentPanelProps> = ({ doc, disabled, onRead }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const { file, previewUrl, uploading, reading, error, draft, selectFile, cancelRead } = doc;
  const busy = uploading || reading;

  // Ctrl+V con una imagen en el portapapeles — listener agregado y quitado al desmontar (nunca queda colgado).
  useEffect(() => {
    if (disabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.kind === 'file' && i.type.startsWith('image/'));
      const pasted = item?.getAsFile();
      if (pasted) selectFile(pasted);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [disabled, selectFile]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (disabled || busy) return;
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) selectFile(dropped);
  };

  const askRead = () => {
    if (draft && !window.confirm('Ya se leyó este documento. Leerlo de nuevo vuelve a gastar cuota y reemplaza lo que la IA llenó. ¿Continuar?')) return;
    onRead();
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
      <div className="px-5 pt-4 pb-3 border-b border-gray-100">
        <p className="text-sm font-semibold text-gray-800">Documento físico</p>
        <p className="text-xs text-gray-400">Sube la foto o el PDF: se ve aquí y se puede leer con IA para llenar el formulario.</p>
      </div>

      <div className="p-4">
        <input
          ref={inputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.webp,.pdf"
          className="hidden"
          onChange={(e) => { selectFile(e.target.files?.[0] ?? null); e.target.value = ''; }}
        />

        {!file ? (
          <div
            onClick={() => !disabled && inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`cursor-pointer border border-dashed rounded-lg py-10 px-4 text-center transition-colors ${dragging ? 'border-[#0056b3] bg-blue-50' : 'border-gray-300 hover:border-[#0056b3] hover:bg-blue-50/40'}`}
          >
            <FileText size={28} className="mx-auto text-purple-300 mb-2" />
            <p className="text-sm font-semibold text-gray-700">Arrastra aquí la foto o el PDF</p>
            <p className="text-xs text-gray-400 mt-1">o haz clic para elegirlo · también puedes pegar una imagen (Ctrl+V)</p>
            <p className="text-[11px] text-gray-400 mt-2">PNG, JPG, WEBP o PDF · máx. 15 MB</p>
          </div>
        ) : (
          <>
            <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
              {file.type === 'application/pdf' ? (
                <iframe title="Vista previa del documento" src={previewUrl ?? undefined} className="w-full h-[28rem] bg-white" />
              ) : (
                <img src={previewUrl ?? undefined} alt="Vista previa del documento" className="w-full max-h-[28rem] object-contain" />
              )}
            </div>
            <div className="flex items-center justify-between gap-2 mt-2">
              <p className="text-xs text-gray-500 truncate">{file.name}</p>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => inputRef.current?.click()}
                  disabled={disabled || busy}
                  className="text-xs font-medium text-[#0056b3] hover:underline disabled:opacity-40"
                >
                  Cambiar
                </button>
                <button
                  onClick={() => selectFile(null)}
                  disabled={disabled || busy}
                  className="text-xs font-medium text-red-500 hover:underline disabled:opacity-40 flex items-center gap-0.5"
                >
                  <X size={12} /> Quitar
                </button>
              </div>
            </div>

            {reading ? (
              <div className="mt-3 flex items-center justify-between gap-3 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5">
                <p className="text-sm text-[#0056b3] flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> Leyendo documento… puede tardar unos segundos</p>
                <button onClick={cancelRead} className="text-xs font-semibold text-gray-600 hover:underline">Cancelar</button>
              </div>
            ) : (
              <button
                onClick={askRead}
                disabled={disabled || uploading}
                className="mt-3 w-full flex items-center justify-center gap-1.5 bg-[#0056b3] text-white rounded-lg py-2 text-sm font-semibold hover:bg-[#004494] transition-colors disabled:opacity-50"
              >
                <Sparkles size={15} /> {uploading ? 'Subiendo…' : draft ? 'Volver a leer con IA' : 'Leer con IA'}
              </button>
            )}
            <p className="text-[11px] text-gray-400 mt-2">La IA puede equivocarse (sobre todo con letra a mano): revisa siempre lo que llena antes de guardar.</p>
          </>
        )}

        {error && <p className="mt-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
      </div>
    </div>
  );
};

export default DocumentPanel;
