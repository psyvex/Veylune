export interface CameraFrame { readonly width: number; readonly height: number; readonly timestampMs: number; readonly pixels: ImageData; }
export interface FrameSchedulerOptions { readonly maxFps?: number; readonly maxWidth?: number; readonly maxHeight?: number; }
export class CameraFrameScheduler {
  private running = false;
  private busy = false;
  private lastTimestamp = -Infinity;
  private raf = 0;
  constructor(private readonly video: HTMLVideoElement, private readonly onFrame: (frame: CameraFrame) => Promise<void> | void, private readonly options: FrameSchedulerOptions = {}) {}
  start(): void { if (this.running) return; this.running = true; this.schedule(); }
  stop(): void { this.running = false; if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; }
  private schedule(): void { if (!this.running) return; this.raf = requestAnimationFrame((timestamp) => { this.raf = 0; void this.tick(timestamp); }); }
  private async tick(timestamp: number): Promise<void> { if (!this.running) return; const maxFps = this.options.maxFps ?? 15; const minDelta = 1000 / maxFps; if (timestamp - this.lastTimestamp < minDelta || this.busy || this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) { this.schedule(); return; }
    const sourceWidth = this.video.videoWidth; const sourceHeight = this.video.videoHeight; if (!sourceWidth || !sourceHeight) { this.schedule(); return; }
    const scale = Math.min(1, (this.options.maxWidth ?? 1280) / sourceWidth, (this.options.maxHeight ?? 720) / sourceHeight); const width = Math.max(1, Math.round(sourceWidth * scale)); const height = Math.max(1, Math.round(sourceHeight * scale)); const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height; const context = canvas.getContext("2d", { willReadFrequently: true }); if (!context) { this.schedule(); return; }
    context.drawImage(this.video, 0, 0, width, height); const pixels = context.getImageData(0, 0, width, height); this.lastTimestamp = timestamp; this.busy = true; try { await this.onFrame({ width, height, timestampMs: timestamp, pixels }); } finally { this.busy = false; this.schedule(); }
  }
}
export function stopCameraOnPageHide(session: { stop(): void }): () => void { const handler = () => session.stop(); window.addEventListener("pagehide", handler, { once: true }); return () => window.removeEventListener("pagehide", handler); }
