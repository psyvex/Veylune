import { describe, expect, it } from "vitest";
import { LiveScanSession, type ScanFrame, type ScanProcessor } from "./live-scan";

class FakeProcessor implements ScanProcessor { calls = 0; resetCalls = 0; constructor(private readonly result = true) {} async process(_frame: ScanFrame): Promise<boolean> { this.calls++; return this.result; } reset(): void { this.resetCalls++; } }
function camera(): { stream: MediaStream; video: HTMLVideoElement; stop(): void } { const video = document.createElement("video"); Object.defineProperties(video, { readyState: { value: 2 }, videoWidth: { value: 64 }, videoHeight: { value: 48 } }); return { stream: {} as MediaStream, video, stop() {} }; }

describe("LiveScanSession", () => {
  it("enforces single-flight processing and reports accepted frames", async () => { const processor = new FakeProcessor(true); const session = new LiveScanSession(camera(), processor, { maxFps: 60, maxWidth: 64 }); session.start(); await new Promise((resolve) => setTimeout(resolve, 30)); session.stop(); expect(processor.calls).toBeGreaterThan(0); expect(session.getMetrics().accepted).toBe(processor.calls); expect(session.getMetrics().processed).toBe(processor.calls); });
  it("records tracking loss and resets the processor on stop", async () => { const processor = new FakeProcessor(false); const session = new LiveScanSession(camera(), processor, { maxFps: 60, maxWidth: 64 }); session.start(); await new Promise((resolve) => setTimeout(resolve, 30)); session.stop(); expect(session.getMetrics().trackingLost).toBeGreaterThan(0); expect(processor.resetCalls).toBe(1); });
});
