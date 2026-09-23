import type { JobError, JobEvent, JobRequest, JobStatus, JobTransport } from "./job";

interface WorkerPort {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: "message" | "error", listener: (event: MessageEvent | ErrorEvent) => void): void;
  removeEventListener(type: "message" | "error", listener: (event: MessageEvent | ErrorEvent) => void): void;
  terminate?(): void;
}

type WorkerMessage<TOutput> =
  | { readonly type: "progress"; readonly status: JobStatus }
  | { readonly type: "completed"; readonly status: JobStatus; readonly output: TOutput }
  | { readonly type: "failed"; readonly status: JobStatus };

export class WorkerJobTransport<TInput, TOutput> implements JobTransport<TInput, TOutput> {
  private readonly listeners = new Set<(event: JobEvent<TOutput>) => void>();
  private readonly active = new Set<string>();
  private readonly onMessageBound: (event: MessageEvent) => void;
  private readonly onErrorBound: (event: ErrorEvent) => void;

  constructor(private readonly worker: WorkerPort) {
    this.onMessageBound = (event) => this.onMessage(event.data);
    this.onErrorBound = (event) => this.onWorkerError(event);
    worker.addEventListener("message", this.onMessageBound);
    worker.addEventListener("error", this.onErrorBound);
  }

  async submit(request: JobRequest<TInput>): Promise<void> {
    if (!isValidId(request.id) || !request.operation) throw new Error("Invalid job request.");
    if (this.active.has(request.id)) throw new Error(`Job ${request.id} is already active.`);
    this.active.add(request.id);
    try {
      this.worker.postMessage({ type: "submit", request });
    } catch (error) {
      this.active.delete(request.id);
      throw error;
    }
  }

  async cancel(id: string): Promise<void> {
    if (!isValidId(id)) throw new Error("Invalid job id.");
    if (!this.active.has(id)) return;
    this.worker.postMessage({ type: "cancel", id });
  }

  subscribe(listener: (event: JobEvent<TOutput>) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.worker.removeEventListener("message", this.onMessageBound);
    this.worker.removeEventListener("error", this.onErrorBound);
    this.listeners.clear();
    this.active.clear();
    this.worker.terminate?.();
  }

  private onMessage(message: unknown): void {
    if (!isWorkerMessage<TOutput>(message)) return;
    const id = message.status.id;
    if (!this.active.has(id)) return;
    if (message.type === "completed" || message.type === "failed") this.active.delete(id);
    const event = message as JobEvent<TOutput>;
    for (const listener of this.listeners) listener(event);
  }

  private onWorkerError(event: ErrorEvent): void {
    for (const id of this.active) {
      const status: JobStatus = {
        id,
        state: "failed",
        progress: { completed: 0, total: 0 },
        error: { code: "WORKER_ERROR", message: event.message || "Worker execution failed.", retryable: true } satisfies JobError,
      };
      this.active.delete(id);
      const failed: JobEvent<TOutput> = { type: "failed", status };
      for (const listener of this.listeners) listener(failed);
    }
  }
}

function isValidId(id: unknown): id is string { return typeof id === "string" && id.length > 0 && id.length <= 128; }
function isWorkerMessage<TOutput>(value: unknown): value is WorkerMessage<TOutput> {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  if (message.type !== "progress" && message.type !== "completed" && message.type !== "failed") return false;
  const status = message.status;
  if (!status || typeof status !== "object") return false;
  const candidate = status as Record<string, unknown>;
  return typeof candidate.id === "string" && typeof candidate.state === "string" && typeof candidate.progress === "object";
}
