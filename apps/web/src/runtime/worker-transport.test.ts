import { describe, expect, it } from "vitest";
import { WorkerJobTransport } from "./worker-transport";

class FakeWorker {
  readonly messages: unknown[] = [];
  private messageListeners: ((event: MessageEvent) => void)[] = [];
  private errorListeners: ((event: ErrorEvent) => void)[] = [];
  terminated = false;

  postMessage(message: unknown): void { this.messages.push(message); }
  addEventListener(type: "message" | "error", listener: (event: MessageEvent | ErrorEvent) => void): void {
    if (type === "message") this.messageListeners.push(listener as (event: MessageEvent) => void);
    else this.errorListeners.push(listener as (event: ErrorEvent) => void);
  }
  removeEventListener(type: "message" | "error", listener: (event: MessageEvent | ErrorEvent) => void): void {
    if (type === "message") this.messageListeners = this.messageListeners.filter((candidate) => candidate !== listener);
    else this.errorListeners = this.errorListeners.filter((candidate) => candidate !== listener);
  }
  terminate(): void { this.terminated = true; }
  emit(message: unknown): void { for (const listener of this.messageListeners) listener({ data: message } as MessageEvent); }
}

describe("WorkerJobTransport", () => {
  it("submits, forwards events, and clears completed jobs", async () => {
    const worker = new FakeWorker();
    const transport = new WorkerJobTransport<{ value: number }, number>(worker);
    const events: unknown[] = [];
    transport.subscribe((event) => events.push(event));

    await transport.submit({ id: "job-1", operation: "test", input: { value: 1 } });
    expect(worker.messages).toEqual([{ type: "submit", request: { id: "job-1", operation: "test", input: { value: 1 } } }]);

    worker.emit({ type: "completed", status: { id: "job-1", state: "completed", progress: { completed: 1, total: 1 } }, output: 42 });
    expect(events).toHaveLength(1);

    await transport.cancel("job-1");
    expect(worker.messages).toHaveLength(1);
    transport.dispose();
    expect(worker.terminated).toBe(true);
  });

  it("ignores malformed or stale worker messages", async () => {
    const worker = new FakeWorker();
    const transport = new WorkerJobTransport<void, number>(worker);
    const events: unknown[] = [];
    transport.subscribe((event) => events.push(event));
    worker.emit({ type: "completed", status: { id: "unknown", state: "completed", progress: { completed: 1, total: 1 } }, output: 1 });
    worker.emit({ nope: true });
    expect(events).toHaveLength(0);
  });
});
