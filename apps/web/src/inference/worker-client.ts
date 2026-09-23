import type { InferenceBackend, InferenceResult } from "./model";
import type { InferenceWorkerEvent, InferenceWorkerRequest } from "./worker-protocol";

export interface WorkerInferenceResult {
  readonly jobId: string;
  readonly result: InferenceResult<ArrayBuffer>;
}

export class InferenceWorkerClient {
  private readonly worker: Worker;
  private readonly pending = new Map<string, { resolve: (value: WorkerInferenceResult) => void; reject: (reason: unknown) => void }>();

  constructor(url: URL) {
    this.worker = new Worker(url, { type: "module", name: "veylune-inference" });
    this.worker.addEventListener("message", (event: MessageEvent<InferenceWorkerEvent>) => this.handle(event.data));
  }

  load(modelKey: string, backend: InferenceBackend): void {
    this.post({ type: "load", modelKey, backend });
  }

  run(jobId: string, modelKey: string, input: ArrayBuffer): Promise<WorkerInferenceResult> {
    return new Promise((resolve, reject) => {
      this.pending.set(jobId, { resolve, reject });
      this.post({ type: "run", jobId, modelKey, input }, [input]);
    });
  }

  cancel(jobId: string): void {
    this.post({ type: "cancel", jobId });
  }

  unload(modelKey: string): void {
    this.post({ type: "unload", modelKey });
  }

  terminate(): void {
    for (const pending of this.pending.values()) pending.reject(new Error("Inference worker terminated."));
    this.pending.clear();
    this.worker.terminate();
  }

  private post(message: InferenceWorkerRequest, transfer: Transferable[] = []): void {
    this.worker.postMessage(message, transfer);
  }

  private handle(event: InferenceWorkerEvent): void {
    if (event.type === "result") {
      const pending = this.pending.get(event.jobId);
      if (!pending) return;
      this.pending.delete(event.jobId);
      pending.resolve({
        jobId: event.jobId,
        result: {
          output: event.output,
          modelId: "worker",
          modelVersion: "unknown",
          backend: "wasm",
        },
      });
      return;
    }
    if (event.type === "error" && event.jobId) {
      const pending = this.pending.get(event.jobId);
      if (!pending) return;
      this.pending.delete(event.jobId);
      pending.reject(new Error(`${event.code}: ${event.message}`));
    }
  }
}
