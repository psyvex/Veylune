import type { TensorInput, TensorOutput, InferenceEngine } from "./engine";
import type { InferenceBackend } from "./model";
import { rgbaToNchwTensor } from "./vision/preprocess";

export interface VisionPoint { readonly x: number; readonly y: number; readonly score: number; readonly descriptor: readonly number[]; }
export interface VisionFrame { readonly width: number; readonly height: number; readonly rgba: Uint8Array; }
export interface LocalVisionOptions { readonly maxPoints?: number; readonly gridStep?: number; readonly patchRadius?: number; readonly backend?: InferenceBackend; }
export interface LocalVisionEngine { readonly backend: InferenceBackend; load(modelBytes: ArrayBuffer): Promise<void>; extract(frame: VisionFrame, options?: LocalVisionOptions): Promise<readonly VisionPoint[]>; unload(): Promise<void>; }

export class LocalVisionEngineAdapter implements LocalVisionEngine {
  readonly backend: InferenceBackend;
  constructor(private readonly engine: InferenceEngine, private readonly tensorOutputDecoder: (output: TensorOutput) => readonly VisionPoint[]) { this.backend = engine.backend; }
  async load(modelBytes: ArrayBuffer): Promise<void> { await this.engine.load(modelBytes); }
  async extract(frame: VisionFrame, options?: LocalVisionOptions): Promise<readonly VisionPoint[]> {
    const tensor: TensorInput = rgbaToNchwTensor(frame.rgba, { width: frame.width, height: frame.height });
    return this.tensorOutputDecoder(await this.engine.run(tensor)).slice(0, options?.maxPoints ?? 2000);
  }
  async unload(): Promise<void> { await this.engine.unload(); }
}

export class CpuVisionFallback implements LocalVisionEngine {
  readonly backend = "wasm" as const;
  async load(_modelBytes: ArrayBuffer): Promise<void> {}
  async unload(): Promise<void> {}
  async extract(frame: VisionFrame, options: LocalVisionOptions = {}): Promise<readonly VisionPoint[]> {
    const step = Math.max(4, Math.floor(options.gridStep ?? 12));
    const radius = Math.max(1, Math.floor(options.patchRadius ?? 2));
    const maxPoints = Math.max(1, Math.floor(options.maxPoints ?? 1000));
    const points: VisionPoint[] = [];
    for (let y = radius; y < frame.height - radius && points.length < maxPoints; y += step) {
      for (let x = radius; x < frame.width - radius && points.length < maxPoints; x += step) {
        const score = cornerScore(frame, x, y, radius);
        if (score < 0.08) continue;
        points.push({ x, y, score, descriptor: patchDescriptor(frame, x, y, radius) });
      }
    }
    return points;
  }
}

function luminance(frame: VisionFrame, x: number, y: number): number { const i = (y * frame.width + x) * 4; return (0.299 * frame.rgba[i]! + 0.587 * frame.rgba[i + 1]! + 0.114 * frame.rgba[i + 2]!) / 255; }
function cornerScore(frame: VisionFrame, x: number, y: number, radius: number): number { const c = luminance(frame, x, y); let gx = 0; let gy = 0; for (let d = 1; d <= radius; d++) { gx += Math.abs(luminance(frame, x + d, y) - luminance(frame, x - d, y)); gy += Math.abs(luminance(frame, x, y + d) - luminance(frame, x, y - d)); } return Math.min(1, gx * gy * 4); }
function patchDescriptor(frame: VisionFrame, x: number, y: number, radius: number): readonly number[] { const descriptor: number[] = []; for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) descriptor.push(luminance(frame, x + dx, y + dy)); const mean = descriptor.reduce((a, b) => a + b, 0) / descriptor.length; const norm = Math.sqrt(descriptor.reduce((a, b) => a + (b - mean) ** 2, 0)) || 1; return descriptor.map((value) => (value - mean) / norm); }
