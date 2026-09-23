import type { VisionFrame, VisionPoint } from "./local-vision";

export interface Match { readonly previous: VisionPoint; readonly current: VisionPoint; readonly distance: number; }
export interface MatchOptions { readonly ratio?: number; readonly maxDistance?: number; readonly maxMatches?: number; }

export function matchVisionPoints(previous: readonly VisionPoint[], current: readonly VisionPoint[], options: MatchOptions = {}): readonly Match[] {
  const ratio = options.ratio ?? 0.8;
  const maxDistance = options.maxDistance ?? 0.7;
  const maxMatches = options.maxMatches ?? Math.min(previous.length, 2000);
  const matches: Match[] = [];
  for (const source of previous) {
    let best: VisionPoint | undefined; let bestDistance = Infinity; let second = Infinity;
    for (const target of current) { const distance = descriptorDistance(source.descriptor, target.descriptor); if (distance < bestDistance) { second = bestDistance; bestDistance = distance; best = target; } else if (distance < second) second = distance; }
    if (best && bestDistance <= maxDistance && bestDistance <= second * ratio) matches.push({ previous: source, current: best, distance: bestDistance });
    if (matches.length >= maxMatches) break;
  }
  return matches;
}

export function frameFromImageData(image: ImageData): VisionFrame { return { width: image.width, height: image.height, rgba: new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength) }; }
export function descriptorDistance(a: readonly number[], b: readonly number[]): number { if (a.length !== b.length || a.length === 0) return Infinity; let sum = 0; for (let i = 0; i < a.length; i++) sum += (a[i]! - b[i]!) ** 2; return Math.sqrt(sum / a.length); }
