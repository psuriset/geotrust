import workerSource from '../../../generated/worker-source';
import type { Command, Result, Reply } from './protocol';
export interface JobClient {
  run(command: Command, progress: (phase: string) => void): Promise<Result>;
  cancel(): void;
  dispose(): void;
}
export function createWorker(): Worker {
  const url = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
  try {
    return new Worker(url, { name: 'geotrust-analysis' });
  } finally {
    URL.revokeObjectURL(url);
  }
}
/** Hard cancellation terminates computation immediately, including synchronous geometry/JSON work. */
export class AnalysisClient implements JobClient {
  private worker?: Worker;
  private sequence = 0;
  private pending?: {
    id: number;
    resolve: (value: Result) => void;
    reject: (error: Error) => void;
    progress: (phase: string) => void;
  };
  constructor(private factory: () => Worker = createWorker) {}
  run(command: Command, progress: (phase: string) => void): Promise<Result> {
    if (this.pending) this.cancel();
    return new Promise((resolve, reject) => {
      this.pending = { id: ++this.sequence, resolve, reject, progress };
      try {
        if (!this.worker) {
          this.worker = this.factory();
          const worker = this.worker;
          worker.onmessage = ({ data }: MessageEvent<Reply>) => {
            const pending = this.pending;
            if (!pending || data.id !== pending.id) return;
            if (data.kind === 'progress') pending.progress(data.phase);
            else {
              this.pending = undefined;
              if (data.kind === 'result') pending.resolve(data.value);
              else pending.reject(new Error(data.message));
            }
          };
          worker.onerror = () => {
            if (this.worker === worker)
              this.reset(new Error('Analysis worker failed; retry to start a new worker.'));
          };
          worker.onmessageerror = () => {
            if (this.worker === worker)
              this.reset(new Error('Analysis worker message could not be read.'));
          };
        }
        this.worker.postMessage({ id: this.sequence, command });
      } catch (error) {
        this.reset(error as Error);
      }
    });
  }
  private reset(error: Error) {
    this.worker?.terminate();
    this.worker = undefined;
    this.pending?.reject(error);
    this.pending = undefined;
  }
  cancel() {
    this.reset(new DOMException('Cancelled', 'AbortError'));
  }
  dispose() {
    this.cancel();
  }
}
