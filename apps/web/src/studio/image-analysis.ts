/**
 * Local, model-free image quality and duplicate analysis for the import
 * flow, per Phase 1 of docs/06-roadmap-and-acceptance.md ("identifies
 * obvious duplicates", "explains why a photo is low quality").
 *
 * No ML model is involved: sharpness/exposure come from pixel statistics
 * on a small downsampled copy of each image, and duplicate detection uses
 * a difference hash (dHash) compared by Hamming distance. This keeps the
 * feature usable offline and fast enough for hundreds of images without
 * waiting on the inference engine work in docs/75-production-task-pipeline.md.
 */

const ANALYSIS_SIZE = 32;
/** Below this on the short edge, a photo is too small to be a useful capture view. */
const MIN_USABLE_DIMENSION = 480;
/** dHash is a 63-bit fingerprint (32x32 downsample, row/column differences); two images
 * differing in at most this many bits are treated as near-duplicates. */
const DUPLICATE_HAMMING_THRESHOLD = 6;

export interface ImageSignature {
  readonly width: number;
  readonly height: number;
  readonly sharpness: number;
  readonly exposure: number;
  /** Mean luminance (0-255) of the downsampled image, used to tell an
   * underexposed photo from an overexposed one when `exposure` is low. */
  readonly meanLuminance: number;
  /** Difference hash of the downsampled grayscale image, as a hex string. */
  readonly hash: string;
}

export type QualityReason = "too-small" | "blurry" | "too-dark" | "too-bright";

export interface ImageQuality {
  readonly level: "good" | "low";
  readonly reasons: readonly QualityReason[];
}

/**
 * Computes sharpness (row-wise gradient energy, normalized) and exposure
 * (how close mean luminance sits to mid-gray) from a square grayscale
 * pixel buffer, plus a difference hash of the same buffer.
 */
export function computeImageSignature(
  pixels: ImageData,
  originalWidth: number,
  originalHeight: number,
): ImageSignature {
  const { data, width, height } = pixels;
  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i += 1) {
    const o = i * 4;
    gray[i] = 0.2126 * data[o]! + 0.7152 * data[o + 1]! + 0.0722 * data[o + 2]!;
  }

  let luminanceSum = 0;
  let gradientSum = 0;
  let gradientSamples = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = gray[y * width + x]!;
      luminanceSum += value;
      if (x > 0) {
        gradientSum += Math.abs(value - gray[y * width + x - 1]!);
        gradientSamples += 1;
      }
      if (y > 0) {
        gradientSum += Math.abs(value - gray[(y - 1) * width + x]!);
        gradientSamples += 1;
      }
    }
  }

  const meanLuminance = luminanceSum / gray.length;
  const exposure = 1 - Math.min(1, Math.abs(meanLuminance - 128) / 128);
  const sharpness = gradientSamples === 0 ? 0 : Math.min(1, (gradientSum / gradientSamples) / 40);

  return {
    width: originalWidth,
    height: originalHeight,
    sharpness,
    exposure,
    meanLuminance,
    hash: differenceHash(gray, width, height),
  };
}

/** Difference hash: one bit per pixel for "brighter than the pixel to its right",
 * plus one bit per pixel for "brighter than the pixel below" — robust to resizing,
 * mild recompression, and small exposure shifts, which is what "the same shot,
 * exported twice" or "two frames a second apart" look like in practice. */
function differenceHash(gray: Float32Array, width: number, height: number): string {
  const bits: number[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      bits.push(gray[y * width + x]! < gray[y * width + x + 1]! ? 1 : 0);
    }
  }
  for (let y = 0; y < height - 1; y += 1) {
    for (let x = 0; x < width; x += 1) {
      bits.push(gray[y * width + x]! < gray[(y + 1) * width + x]! ? 1 : 0);
    }
  }
  let hex = "";
  for (let i = 0; i < bits.length; i += 4) {
    const nibble = (bits[i] ?? 0) * 8 + (bits[i + 1] ?? 0) * 4 + (bits[i + 2] ?? 0) * 2 + (bits[i + 3] ?? 0);
    hex += nibble.toString(16);
  }
  return hex;
}

export function hammingDistance(hashA: string, hashB: string): number {
  const length = Math.max(hashA.length, hashB.length);
  let distance = 0;
  for (let i = 0; i < length; i += 1) {
    const a = parseInt(hashA[i] ?? "0", 16);
    const b = parseInt(hashB[i] ?? "0", 16);
    distance += popcount(a ^ b);
  }
  return distance;
}

function popcount(nibble: number): number {
  let n = nibble;
  let count = 0;
  while (n) { count += n & 1; n >>= 1; }
  return count;
}

export function categorizeQuality(
  signature: Pick<ImageSignature, "sharpness" | "exposure" | "width" | "height" | "meanLuminance">,
): ImageQuality {
  const reasons: QualityReason[] = [];
  if (Math.min(signature.width, signature.height) < MIN_USABLE_DIMENSION) reasons.push("too-small");
  if (signature.sharpness < 0.12) reasons.push("blurry");
  if (signature.exposure < 0.35) reasons.push(signature.meanLuminance < 128 ? "too-dark" : "too-bright");
  return { level: reasons.length === 0 ? "good" : "low", reasons };
}

/** Groups item indices whose hashes are within the duplicate threshold of each other.
 * O(n²) comparisons, fine at the hundreds-of-images scale this runs at locally. */
export function findDuplicateGroups(hashes: readonly string[]): readonly (readonly number[])[] {
  const visited = new Set<number>();
  const groups: number[][] = [];
  for (let i = 0; i < hashes.length; i += 1) {
    if (visited.has(i)) continue;
    const group = [i];
    for (let j = i + 1; j < hashes.length; j += 1) {
      if (visited.has(j)) continue;
      if (hammingDistance(hashes[i]!, hashes[j]!) <= DUPLICATE_HAMMING_THRESHOLD) group.push(j);
    }
    if (group.length > 1) {
      group.forEach((index) => visited.add(index));
      groups.push(group);
    }
  }
  return groups;
}

/** Decodes an image file, reads its natural size, and draws a small square
 * downsample for analysis. Cost is dominated by image decode, not the tiny
 * canvas draw, so this stays fast even for large source photos. */
export async function decodeImageForAnalysis(
  file: File,
): Promise<{ width: number; height: number; pixels: ImageData }> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = ANALYSIS_SIZE;
    canvas.height = ANALYSIS_SIZE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("2D canvas context is unavailable for image analysis.");
    context.drawImage(bitmap, 0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE);
    const pixels = context.getImageData(0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE);
    return { width: bitmap.width, height: bitmap.height, pixels };
  } finally {
    bitmap.close();
  }
}

export async function analyzeImageFile(file: File): Promise<ImageSignature> {
  const { width, height, pixels } = await decodeImageForAnalysis(file);
  return computeImageSignature(pixels, width, height);
}

export function qualityReasonLabel(reason: QualityReason): string {
  switch (reason) {
    case "too-small": return "Low resolution";
    case "blurry": return "Looks blurry";
    case "too-dark": return "Underexposed";
    case "too-bright": return "Overexposed";
  }
}
