import type { FeatureDescriptor, FeatureMatcher, FeatureSet, Keypoint } from "./features";
import type { ScanFrame } from "./live-scan";

export interface VisionExtractor { extract(frame: ScanFrame): Promise<FeatureSet>; }
export interface DescriptorMatcher extends FeatureMatcher {}
export interface LocalVisionOptions { readonly maxKeypoints?: number; readonly patchRadius?: number; readonly minScore?: number; }

/** 4×4 spatial cells × 8 gradient-orientation bins. */
export const DESCRIPTOR_DIM = 128;

export class LocalVisionExtractor implements VisionExtractor {
  private readonly maxKeypoints: number;
  private readonly patchRadius: number;
  private readonly minScore: number;
  constructor(options: LocalVisionOptions = {}) { this.maxKeypoints = Math.max(16, Math.min(2048, options.maxKeypoints ?? 512)); this.patchRadius = Math.max(1, Math.min(4, options.patchRadius ?? 2)); this.minScore = Math.max(0, Math.min(1, options.minScore ?? 0.12)); }
  async extract(frame: ScanFrame): Promise<FeatureSet> { const { data, width, height } = frame.image; const candidates: Keypoint[] = []; const step = Math.max(2, Math.floor(Math.min(width, height) / 160)); const margin = this.patchRadius * 3 + 2; for (let y = margin; y < height - margin; y += step) for (let x = margin; x < width - margin; x += step) { const gx = luminance(data, width, x + 1, y) - luminance(data, width, x - 1, y); const gy = luminance(data, width, x, y + 1) - luminance(data, width, x, y - 1); const score = Math.min(1, Math.hypot(gx, gy) / 255); if (score >= this.minScore) candidates.push({ x, y, score }); } candidates.sort((a, b) => b.score - a.score); const keypoints = suppressNearby(candidates, this.maxKeypoints, Math.max(3, step * 2)).map((point) => refineCentroid(data, width, height, point)); return { keypoints, descriptors: keypoints.map((point) => ({ values: descriptor(data, width, height, point, this.patchRadius), dimension: DESCRIPTOR_DIM })) }; }
}
export class BruteForceDescriptorMatcher implements DescriptorMatcher { constructor(private readonly ratio = 0.8) {} match(reference: FeatureSet, current: FeatureSet) { const matches: { referenceIndex: number; currentIndex: number; distance: number }[] = []; for (let i = 0; i < reference.descriptors.length; i++) { const a = reference.descriptors[i]; if (!a) continue; let best = Number.POSITIVE_INFINITY, second = Number.POSITIVE_INFINITY, bestIndex = -1; for (let j = 0; j < current.descriptors.length; j++) { const b = current.descriptors[j]; if (!b || b.dimension !== a.dimension) continue; const distance = l2(a.values, b.values); if (distance < best) { second = best; best = distance; bestIndex = j; } else if (distance < second) second = distance; } if (bestIndex >= 0 && best <= second * this.ratio) matches.push({ referenceIndex: i, currentIndex: bestIndex, distance: best }); } return matches; } }
function luminance(data: Uint8ClampedArray, width: number, x: number, y: number): number { const i = (y * width + x) * 4; return 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!; }
/**
 * Gradient-orientation histogram over a 4×4 cell grid (128-D), folded
 * orientations (mod π), magnitude-weighted with bilinear splatting into both
 * cells and bins. L2-normalize → clamp at 0.2 → renormalize tames
 * illumination spikes the way SIFT does. Unlike the old raw luminance patch
 * it survives the brightness drift and exposure ramps that made the phone
 * camera's frames fail the ratio test halfway through a scan.
 */
function descriptor(data: Uint8ClampedArray, width: number, height: number, point: Keypoint, radius: number): Float32Array {
  const cells = 4, bins = 8;
  const values = new Float32Array(cells * cells * bins);
  const support = Math.max(3, radius * 3);
  const cellSize = (support * 2) / cells;
  const cx0 = Math.round(point.x), cy0 = Math.round(point.y);
  const clampX = (v: number) => (v < 1 ? 1 : v > width - 2 ? width - 2 : v);
  const clampY = (v: number) => (v < 1 ? 1 : v > height - 2 ? height - 2 : v);
  for (let dy = -support; dy <= support; dy++) {
    for (let dx = -support; dx <= support; dx++) {
      const x = clampX(cx0 + dx), y = clampY(cy0 + dy);
      const gx = luminance(data, width, x + 1, y) - luminance(data, width, x - 1, y);
      const gy = luminance(data, width, x, y + 1) - luminance(data, width, x, y - 1);
      const mag = Math.hypot(gx, gy);
      if (mag < 1) continue;
      let ori = Math.atan2(gy, gx);
      if (ori < 0) ori += Math.PI;
      if (ori >= Math.PI) ori -= Math.PI;
      const binF = (ori / Math.PI) * bins;
      const bLow = Math.floor(binF) % bins;
      const bHigh = (bLow + 1) % bins;
      const wBin = binF - Math.floor(binF);
      const fx = (dx + support) / cellSize - 0.5;
      const fy = (dy + support) / cellSize - 0.5;
      const gx0 = Math.floor(fx), gy0 = Math.floor(fy);
      const wx = fx - gx0, wy = fy - gy0;
      for (let oy = 0; oy <= 1; oy++) {
        const cellY = gy0 + oy;
        if (cellY < 0 || cellY >= cells) continue;
        const wY = oy === 0 ? 1 - wy : wy;
        for (let ox = 0; ox <= 1; ox++) {
          const cellX = gx0 + ox;
          if (cellX < 0 || cellX >= cells) continue;
          const base = (cellY * cells + cellX) * bins;
          const w = mag * wY * (ox === 0 ? 1 - wx : wx);
          values[base + bLow] = values[base + bLow]! + w * (1 - wBin);
          values[base + bHigh] = values[base + bHigh]! + w * wBin;
        }
      }
    }
  }
  let norm = 0;
  for (let i = 0; i < values.length; i++) norm += values[i]! * values[i]!;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < values.length; i++) values[i] = values[i]! / norm;
  let clampedNorm = 0;
  for (let i = 0; i < values.length; i++) { if (values[i]! > 0.2) values[i] = 0.2; clampedNorm += values[i]! * values[i]!; }
  clampedNorm = Math.sqrt(clampedNorm) || 1;
  for (let i = 0; i < values.length; i++) values[i] = values[i]! / clampedNorm;
  return values;
}
function l2(a: Float32Array, b: Float32Array): number { let sum = 0; for (let i = 0; i < a.length; i++) { const d = a[i]! - b[i]!; sum += d * d; } return Math.sqrt(sum); }
/**
 * Intensity-centroid refinement. Grid-scan candidates land on whole pixels;
 * leaving them there quantizes every downstream measurement to 1 px, and at
 * walking baselines that noise is the same size as the parallax signal — the
 * epipolar cost can no longer tell true lateral motion from a forward-drift
 * impostor. Snap each keypoint to the luminance centroid of its local blob
 * (±1.5 px max drift) and the localization noise drops to ~0.1 px.
 */
function refineCentroid(data: Uint8ClampedArray, width: number, height: number, point: Keypoint): Keypoint {
  const r = 2;
  let mean = 0, count = 0;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { mean += luminance(data, width, point.x + dx, point.y + dy); count++; }
  mean /= count;
  let sx = 0, sy = 0, sw = 0;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const w = luminance(data, width, point.x + dx, point.y + dy) - mean;
      if (w <= 0) continue;
      sx += dx * w; sy += dy * w; sw += w;
    }
  }
  if (sw <= 0) return point;
  const ox = sx / sw, oy = sy / sw;
  if (!Number.isFinite(ox) || !Number.isFinite(oy) || Math.abs(ox) > 1.5 || Math.abs(oy) > 1.5) return point;
  return { ...point, x: point.x + ox, y: point.y + oy };
}
function suppressNearby(points: readonly Keypoint[], max: number, radius: number): Keypoint[] { const selected: Keypoint[] = [], r2 = radius * radius; for (const point of points) { if (selected.every((other) => (other.x - point.x) ** 2 + (other.y - point.y) ** 2 >= r2)) selected.push(point); if (selected.length >= max) break; } return selected; }
