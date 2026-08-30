// Cliente del worker de conversión IFC -> Fragments del lado del
// cliente — ver el comentario largo en fragmentsImportWorker.ts. Un
// worker nuevo por conversión (no uno persistente como
// IfcWorkerClient): esto se llama una sola vez por archivo cargado,
// no hace falta mantenerlo vivo entre llamadas.
//
// El buffer se TRANSFIERE (detach), no se copia — quien llama
// (Visor3DTab.tsx) tiene que pasar una copia exclusiva de la que nadie
// más dependa. No copiar acá adentro es a propósito: el buffer
// "de siempre" (el que carga el camino web-ifc en paralelo) se detachea
// solo en ALGÚN momento de ese otro camino, y copiarlo tarde acá
// corría el riesgo real de toparse con un buffer ya detacheado
// ("Cannot perform Construct on a detached ArrayBuffer", confirmado en
// vivo) — la copia tiene que salir ANTES de que exista esa carrera.
export function convertIfcToFragmentsClientSide(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./fragmentsImportWorker.ts', import.meta.url), { type: 'module' });
    const reqId = 'r1';

    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.reqId !== reqId) return;
      worker.terminate();
      if (msg.type === 'done') resolve(msg.fragBytes);
      else reject(new Error(msg.error ?? 'error desconocido en la conversión a Fragments'));
    };
    worker.onerror = (err) => {
      worker.terminate();
      reject(err);
    };
    worker.postMessage({ reqId, bytes: buffer }, [buffer]);
  });
}
