
import { IfcImporter } from '@thatopen/fragments';

self.onmessage = async (e: MessageEvent) => {
  const { reqId, bytes } = e.data as { reqId: string; bytes: ArrayBuffer };
  try {
    const importer = new IfcImporter();
    importer.wasm = { path: '/wasm/', absolute: false };
   
    importer.doubleSidedMaterials = true;
    const fragBytes = await importer.process({ bytes: new Uint8Array(bytes), raw: false });
  
    const exact = fragBytes.buffer.slice(fragBytes.byteOffset, fragBytes.byteOffset + fragBytes.byteLength);
    (self as any).postMessage({ reqId, type: 'done', fragBytes: exact }, [exact]);
  } catch (err) {
    (self as any).postMessage({ reqId, type: 'error', error: err instanceof Error ? err.message : String(err) });
  }
};
