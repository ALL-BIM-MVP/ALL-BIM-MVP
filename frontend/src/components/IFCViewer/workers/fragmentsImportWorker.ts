// Conversión IFC -> Fragments del lado del CLIENTE — para archivos que
// nunca pasan por el backend ("Solo graficar", ver Visor3DTab.tsx) o
// mientras el backend todavía no terminó de generar su propio .frag
// (flujo "Procesar"). Mismo IfcImporter que ya usa el backend
// (backend/src/services/fragments-runner.ts) — es la clase pública de
// @thatopen/fragments, funciona igual en browser que en Node, solo
// cambia de dónde saca el wasm de web-ifc: acá apunta a /wasm/ (mismo
// wasm que ya usa ifcWorker.ts para el camino de siempre — ver
// api.SetWasmPath('/wasm/', true) ahí), no a un path de filesystem.
//
// Corre en un Worker aparte (no en el hilo principal) porque la
// conversión real mide 15-25s de CPU en el backend — bloquear la UI
// ese tiempo sería inaceptable.
import { IfcImporter } from '@thatopen/fragments';

self.onmessage = async (e: MessageEvent) => {
  const { reqId, bytes } = e.data as { reqId: string; bytes: ArrayBuffer };
  try {
    const importer = new IfcImporter();
    importer.wasm = { path: '/wasm/', absolute: false };
    const fragBytes = await importer.process({ bytes: new Uint8Array(bytes), raw: false });
    // .slice() en vez de mandar fragBytes.buffer directo — por si el
    // Uint8Array devuelto es una vista con byteOffset/byteLength que no
    // cubre el ArrayBuffer entero, así el buffer transferido es
    // exactamente el contenido real, ni un byte de más.
    const exact = fragBytes.buffer.slice(fragBytes.byteOffset, fragBytes.byteOffset + fragBytes.byteLength);
    (self as any).postMessage({ reqId, type: 'done', fragBytes: exact }, [exact]);
  } catch (err) {
    (self as any).postMessage({ reqId, type: 'error', error: err instanceof Error ? err.message : String(err) });
  }
};
