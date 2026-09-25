import { describe, expect, it } from "vitest";
import { categorizeQuality, computeImageSignature, findDuplicateGroups, hammingDistance } from "./image-analysis";

function makeImageData(width: number, height: number, paint: (x: number, y: number) => number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = paint(x, y);
      const o = (y * width + x) * 4;
      data[o] = value;
      data[o + 1] = value;
      data[o + 2] = value;
      data[o + 3] = 255;
    }
  }
  // Vitest's test-setup stubs the global ImageData constructor (for canvas mocking
  // elsewhere) with one that ignores a `data` argument entirely, so this builds a
  // plain object matching the shape computeImageSignature actually reads instead
  // of going through `new ImageData(...)`.
  return { data, width, height } as ImageData;
}

const SIZE = 16;
const uniformGray = () => makeImageData(SIZE, SIZE, () => 128);
const checkerboard = () => makeImageData(SIZE, SIZE, (x, y) => ((x + y) % 2 === 0 ? 0 : 255));
const nearBlack = () => makeImageData(SIZE, SIZE, () => 8);
const nearWhite = () => makeImageData(SIZE, SIZE, () => 248);

describe("computeImageSignature", () => {
  it("reports near-zero sharpness for a flat, uniform image", () => {
    const signature = computeImageSignature(uniformGray(), 1200, 1200);
    expect(signature.sharpness).toBeLessThan(0.05);
  });

  it("reports high sharpness for a high-contrast checkerboard", () => {
    const signature = computeImageSignature(checkerboard(), 1200, 1200);
    expect(signature.sharpness).toBeGreaterThan(0.8);
  });

  it("reports full exposure for mid-gray and low exposure at the extremes", () => {
    expect(computeImageSignature(uniformGray(), 1200, 1200).exposure).toBeCloseTo(1, 1);
    expect(computeImageSignature(nearBlack(), 1200, 1200).exposure).toBeLessThan(0.2);
    expect(computeImageSignature(nearWhite(), 1200, 1200).exposure).toBeLessThan(0.2);
  });

  it("carries the original (not the downsampled) dimensions through", () => {
    const signature = computeImageSignature(uniformGray(), 4032, 3024);
    expect(signature.width).toBe(4032);
    expect(signature.height).toBe(3024);
  });
});

describe("categorizeQuality", () => {
  it("passes a sharp, well-exposed, full-resolution photo", () => {
    const signature = computeImageSignature(checkerboard(), 3000, 2000);
    expect(categorizeQuality(signature)).toEqual({ level: "good", reasons: [] });
  });

  it("flags a blurry photo", () => {
    const signature = computeImageSignature(uniformGray(), 3000, 2000);
    expect(categorizeQuality(signature).reasons).toContain("blurry");
  });

  it("flags a too-small photo independently of sharpness", () => {
    const signature = computeImageSignature(checkerboard(), 200, 150);
    expect(categorizeQuality(signature).reasons).toContain("too-small");
  });

  it("distinguishes underexposed from overexposed", () => {
    expect(categorizeQuality(computeImageSignature(nearBlack(), 3000, 2000)).reasons).toContain("too-dark");
    expect(categorizeQuality(computeImageSignature(nearWhite(), 3000, 2000)).reasons).toContain("too-bright");
  });
});

describe("hammingDistance", () => {
  it("is zero for identical hashes", () => {
    expect(hammingDistance("a1b2", "a1b2")).toBe(0);
  });

  it("counts differing bits across the whole hash", () => {
    // 0x0 vs 0xf differs in all 4 bits of that nibble.
    expect(hammingDistance("0", "f")).toBe(4);
  });
});

describe("findDuplicateGroups", () => {
  it("groups near-identical hashes and leaves distinct ones alone", () => {
    const hashes = ["aaaa", "aaab", "ffff", "0000"];
    const groups = findDuplicateGroups(hashes);
    expect(groups).toEqual([[0, 1]]);
  });

  it("returns no groups when every hash is distinct", () => {
    expect(findDuplicateGroups(["0000", "ffff", "5555"])).toEqual([]);
  });
});
