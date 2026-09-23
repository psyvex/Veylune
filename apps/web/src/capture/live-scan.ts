import type { CameraSession } from "./camera";

export interface ScanFrame { readonly timestampMs: number; readonly image: ImageData; }
export interface ScanMetrics { readonly processed: number; readonly accepted: number; readonly rejected: number; readonly trackingLost: number; readonly averageLatencyMs: number; readonly targetFps: number; }
export interface ScanProcessor { process(frame: ScanFrame): Promise<boolean>; reset(): void; }
export interface LiveScanOptions { readonly maxFps?: number; readonly maxWidth?: number; readonly onFrame?: (frame: ScanFrame) => void; readonly onMetrics?: (metrics: ScanMetrics) => void; }

export class LiveScanSession {
  private raf = 0; private busy = false; private stopped = true; private lastCapture = 0; private targetFps: number;
  private processed = 0; private accepted = 0; private rejected = 0; private trackingLost = 0; private latencyTotal = 0;
  constructor(private readonly camera: CameraSession, private readonly processor: ScanProcessor, private readonly options: LiveScanOptions = {}) { this.targetFps = clamp(options.maxFps ?? 20, 1, 60); }
  start(): void { if (!this.stopped) return; this.stopped = false; this.raf = requestAnimationFrame((time) => void this.tick(time)); }
  stop(): void { this.stopped = true; if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; this.camera.stop(); this.processor.reset(); }
  getMetrics(): ScanMetrics { return { processed: this.processed, accepted: this.accepted, rejected: this.rejected, trackingLost: this.trackingLost, averageLatencyMs: this.processed ? this.latencyTotal / this.processed : 0, targetFps: this.targetFps }; }
  private async tick(now: number): Promise<void> { if (this.stopped) return; this.raf = requestAnimationFrame((time) => void this.tick(time)); if (this.busy || now - this.lastCapture < 1000 / this.targetFps) return;
    const video = this.camera.video; if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth <= 0 || video.videoHeight <= 0) return;
    this.lastCapture = now; const scale = Math.min(1, (this.options.maxWidth ?? 1280) / video.videoWidth); const width = Math.max(1, Math.round(video.videoWidth * scale)); const height = Math.max(1, Math.round(video.videoHeight * scale));
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height; const context = canvas.getContext("2d", { willReadFrequently: true }); if (!context) return;
    context.drawImage(video, 0, 0, width, height); const frame: ScanFrame = { timestampMs: now, image: context.getImageData(0, 0, width, height) }; this.options.onFrame?.(frame); this.busy = true; const started = now;
    try { if (await this.processor.process(frame)) this.accepted++; else { this.rejected++; this.trackingLost++; } } finally { this.latencyTotal += (typeof performance !== "undefined" ? performance.now() : Date.now()) - started; this.processed++; this.busy = false; this.adaptTargetFps(); this.options.onMetrics?.(this.getMetrics()); }
  }
  private adaptTargetFps(): void { const latency = this.processed ? this.latencyTotal / this.processed : 0; const ceiling = clamp(this.options.maxFps ?? 20, 1, 60); if (latency > 100) this.targetFps = Math.max(5, Math.min(this.targetFps, ceiling * 0.5)); else if (latency < 35) this.targetFps = Math.min(ceiling, this.targetFps + 1); }
}
function clamp(value: number, min: number, max: number): number { return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min; }
