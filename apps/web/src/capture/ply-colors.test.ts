import { afterEach, describe, expect, it, vi } from "vitest";
import { colorizeLandmarks } from "./ply-colors";
import { decodeImageData } from "./batch-reconstruct";
import type { ReconstructionSessionSnapshot } from "./reconstruction-session";

vi.mock("./batch-reconstruct", () => ({
  // Decoded pixels encode the source image index (rgb = (index + 1) * 100) so
  // assertions can tell which image a landmark's color came from.
  decodeImageData: vi.fn((image: { data: ArrayBuffer }) => {
    const index = new Int32Array(image.data)[0]!;
    const data = new Uint8ClampedArray(4 * 4 * 4);
    for (let i = 0; i < 16; i += 1) {
      data[i * 4] = (index + 1) * 100;
      data[i * 4 + 1] = 7;
      data[i * 4 + 2] = 3;
      data[i * 4 + 3] = 255;
    }
    return Promise.resolve({ width: 4, height: 4, data });
  }),
}));

afterEach(() => vi.clearAllMocks());

const image = (index: number): { data: ArrayBuffer; mediaType: string } => {
  const buffer = new ArrayBuffer(4);
  new Int32Array(buffer)[0] = index;
  return { data: buffer, mediaType: "image/png" };
};

// Keyframes live on pipeline frame indices 3/5/7 which map to source images
// 0/1/2 — the frames between them were rejected and shifted the mapping.
const frameToImage = [-1, -1, -1, 0, -1, 1, -1, 2];
const session = {
  map: {
    keyframes: [
      { id: "kf-a", frameIndex: 3 },
      { id: "kf-b", frameIndex: 5 },
      { id: "kf-c", frameIndex: 7 },
    ],
  },
  observations: [
    { id: "o1", keyframeId: "kf-b", landmarkId: "lm-shared", x: 1, y: 1 },
    { id: "o2", keyframeId: "kf-a", landmarkId: "lm-shared", x: 2, y: 2 },
    { id: "o3", keyframeId: "kf-c", landmarkId: "lm-late", x: 0, y: 0 },
    { id: "o4", keyframeId: "kf-b", landmarkId: "lm-mid", x: 3, y: 3 },
    { id: "o5", keyframeId: "kf-gone", landmarkId: "lm-orphan", x: 0, y: 0 },
    { id: "o6", keyframeId: "kf-c", landmarkId: "lm-oob", x: 0, y: 0 },
  ],
} as unknown as ReconstructionSessionSnapshot;

// lm-oob's frame maps past the end of the images array.
const images = [image(0), image(1), image(2)];
frameToImage[7] = 9; // kf-c points at a nonexistent image in this scenario
const sessionWithValidImages = {
  ...session,
} as unknown as ReconstructionSessionSnapshot;

describe("colorizeLandmarks", () => {
  it("samples each landmark from the earliest keyframe that observed it", async () => {
    const colors = await colorizeLandmarks(sessionWithValidImages, [image(0), image(1), image(2)], frameToImage);
    // lm-shared was seen by kf-a (image 0) and kf-b (image 1); the earlier wins.
    expect(colors.get("lm-shared")).toEqual([100, 7, 3]);
    expect(colors.get("lm-mid")).toEqual([200, 7, 3]);
  });

  it("skips landmarks whose only observations are untraceable to an image", async () => {
    const colors = await colorizeLandmarks(sessionWithValidImages, images, frameToImage);
    expect(colors.has("lm-orphan")).toBe(false); // keyframe not in the map
    expect(colors.has("lm-late")).toBe(false); // frameToImage[7] points past the array
  });

  it("decodes every source image at most once", async () => {
    const valid = [-1, -1, -1, 0, -1, 1, -1, 2];
    await colorizeLandmarks(session, [image(0), image(1), image(2)], valid);
    expect(vi.mocked(decodeImageData)).toHaveBeenCalledTimes(3);
  });

  it("honors maxDecodes and stops coloring beyond the budget", async () => {
    const valid = [-1, -1, -1, 0, -1, 1, -1, 2];
    const colors = await colorizeLandmarks(session, [image(0), image(1), image(2)], valid, 1);
    expect(colors.get("lm-shared")).toEqual([100, 7, 3]);
    expect(colors.has("lm-mid")).toBe(false);
    expect(colors.has("lm-late")).toBe(false);
    expect(vi.mocked(decodeImageData)).toHaveBeenCalledTimes(1);
  });

  it("returns an empty map when there are no images", async () => {
    expect((await colorizeLandmarks(session, [], frameToImage)).size).toBe(0);
    expect(vi.mocked(decodeImageData)).not.toHaveBeenCalled();
  });
});
