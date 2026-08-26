export class IfcWorkerClient {
  private worker: Worker;
  private reqCounter = 0;

  constructor() {
    this.worker = new Worker(new URL('./ifcWorker.ts', import.meta.url), { type: 'module' });
  }

  private nextReqId() { return `r${++this.reqCounter}`; }

  openModel(
    buffer: ArrayBuffer,
    callbacks: {
      onProgress?: (percent: number, label: string) => void;
      onShellReady: (data: { shellMeshes: any[]; typeGroups: any[]; levelGroups: any[]; expressIdToTypeEntries: [number, string][] }) => void;
      onDetailMesh?: (mesh: any) => void;
      onDetailDone?: () => void;
    }
  ) {
    const reqId = this.nextReqId();
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.reqId !== reqId) return;
      if (msg.type === 'progress') callbacks.onProgress?.(msg.percent, msg.label);
      else if (msg.type === 'shellReady') callbacks.onShellReady(msg);
      else if (msg.type === 'detailMesh') callbacks.onDetailMesh?.(msg.mesh);
      else if (msg.type === 'detailDone') {
        callbacks.onDetailDone?.();
        this.worker.removeEventListener('message', handler);
      }
      else if (msg.type === 'fatalError') {
        console.error('[ifcWorker]', msg.error);
        this.worker.removeEventListener('message', handler);
      }
    };
    this.worker.addEventListener('message', handler);
    this.worker.postMessage({ cmd: 'openModel', reqId, buffer }, [buffer]);
  }

  getEntityDetails(expressId: number): Promise<any> {
    const reqId = this.nextReqId();
    return new Promise((resolve, reject) => {
      const handler = (e: MessageEvent) => {
        const msg = e.data;
        if (msg.reqId !== reqId) return;
        this.worker.removeEventListener('message', handler);
        if (msg.type === 'entityDetails') resolve(msg.result);
        else reject(new Error(msg.error ?? 'error desconocido'));
      };
      this.worker.addEventListener('message', handler);
      this.worker.postMessage({ cmd: 'getEntityDetails', reqId, expressId });
    });
  }

  indexAllParams(): Promise<any[]> {
    const reqId = this.nextReqId();
    return new Promise((resolve) => {
      const handler = (e: MessageEvent) => {
        const msg = e.data;
        if (msg.reqId !== reqId) return;
        this.worker.removeEventListener('message', handler);
        resolve(msg.paramIndex);
      };
      this.worker.addEventListener('message', handler);
      this.worker.postMessage({ cmd: 'indexAllParams', reqId });
    });
  }

  buildGuidMap(): Promise<Map<string, number>> {
    const reqId = this.nextReqId();
    return new Promise((resolve) => {
      const handler = (e: MessageEvent) => {
        const msg = e.data;
        if (msg.reqId !== reqId) return;
        this.worker.removeEventListener('message', handler);
        resolve(msg.map);
      };
      this.worker.addEventListener('message', handler);
      this.worker.postMessage({ cmd: 'buildGuidMap', reqId });
    });
  }

  checkLineExists(expressId: number): Promise<boolean> {
    const reqId = this.nextReqId();
    return new Promise((resolve) => {
      const handler = (e: MessageEvent) => {
        const msg = e.data;
        if (msg.reqId !== reqId) return;
        this.worker.removeEventListener('message', handler);
        resolve(msg.exists);
      };
      this.worker.addEventListener('message', handler);
      this.worker.postMessage({ cmd: 'checkLineExists', reqId, expressId });
    });
  }

  dispose() { this.worker.terminate(); }
}