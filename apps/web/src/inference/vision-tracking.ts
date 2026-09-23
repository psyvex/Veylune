import type { VisionPoint } from "./local-vision";
import { matchVisionPoints, type Match } from "./vision-matching";

export interface TrackingResult { readonly matches: readonly Match[]; readonly inlierRatio: number; readonly dx: number; readonly dy: number; readonly confidence: number; }
export interface TrackingOptions { readonly minMatches?: number; readonly maxDisplacement?: number; }

export function trackFrame(previous: readonly VisionPoint[], current: readonly VisionPoint[], options: TrackingOptions = {}): TrackingResult | undefined {
  const matches = matchVisionPoints(previous, current);
  const minMatches = options.minMatches ?? 12;
  if (matches.length < minMatches) return undefined;
  const dx = median(matches.map((m) => m.current.x - m.previous.x));
  const dy = median(matches.map((m) => m.current.y - m.previous.y));
  const maxDisplacement = options.maxDisplacement ?? Math.max(32, Math.min(160, 0.25 * Math.max(1, Math.hypot(dx, dy)) + 80));
  const inliers = matches.filter((m) => Math.hypot((m.current.x - m.previous.x) - dx, (m.current.y - m.previous.y) - dy) <= maxDisplacement);
  if (inliers.length < minMatches) return undefined;
  const confidence = Math.min(1, (inliers.length / Math.max(1, matches.length)) * Math.min(1, inliers.length / 100));
  return { matches: inliers, inlierRatio: inliers.length / matches.length, dx, dy, confidence };
}
function median(values: readonly number[]): number { const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2; }
