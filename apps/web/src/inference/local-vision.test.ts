import { describe, expect, it } from "vitest";
import { CpuVisionFallback } from "./local-vision";
import { matchVisionPoints } from "./vision-matching";
import { trackFrame } from "./vision-tracking";

function frame(width: number, height: number, points: readonly [number, number][]): { width: number; height: number; rgba: Uint8Array } { const rgba = new Uint8Array(width * height * 4); rgba.fill(255); for (const [x, y] of points) { const i = (y * width + x) * 4; rgba[i] = 0; rgba[i + 1] = 0; rgba[i + 2] = 0; } return { width, height, rgba }; }

describe("local vision", () => {
  it("extracts bounded finite CPU fallback features", async () => { const engine = new CpuVisionFallback(); const points = await engine.extract(frame(64, 64, [[20, 20], [32, 32], [44, 44]]), { maxPoints: 20, gridStep: 4 }); expect(points.length).toBeLessThanOrEqual(20); expect(points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.descriptor.every(Number.isFinite))).toBe(true); });
  it("matches descriptors with ratio filtering", () => { const a = [{ x: 1, y: 1, score: 1, descriptor: [0, 0] }, { x: 2, y: 2, score: 1, descriptor: [1, 1] }]; const b = [{ x: 3, y: 3, score: 1, descriptor: [0, 0] }, { x: 4, y: 4, score: 1, descriptor: [1, 1] }]; expect(matchVisionPoints(a, b)).toHaveLength(2); });
  it("returns stable translation tracking", () => { const previous = Array.from({ length: 20 }, (_, i) => ({ x: i * 2, y: i * 3, score: 1, descriptor: [i / 20, 1 - i / 20] })); const current = previous.map((p) => ({ ...p, x: p.x + 4, y: p.y - 3 })); const result = trackFrame(previous, current, { minMatches: 5 }); expect(result).toBeDefined(); expect(result!.dx).toBe(4); expect(result!.dy).toBe(-3); expect(result!.confidence).toBeGreaterThan(0); });
});
