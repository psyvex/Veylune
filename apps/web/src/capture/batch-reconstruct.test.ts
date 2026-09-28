import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeImageData, startBatchReconstruct } from "./batch-reconstruct";
import type { CaptureTelemetry } from "./capture-app";
import type { ReconstructionSessionSnapshot } from "./reconstruction-session";

// The optimization worker is an integration boundary here; a duck-typed
// controller (the bridge only reads state/cancel/dispose) keeps the test to
// the batch loop and its frameToImage bookkeeping.
vi.mock("./reconstruction-worker-factory", () => ({
  createBrowserReconstructionWorker: () => ({
    create: () => ({ state: "idle", synchronize: () => true, optimize: async () => ({ committed: false, stale: false, jobId: "test" }), cancel: () => undefined, dispose: () => undefined }),
    dispose: () => undefined,
  }),
}));

const SIZE = 64;

/** The ArrayBuffer's first int32 tags which source image a blob came from;
 * the stubbed decoder paints deterministic noise for that tag so identical
 * tags decode to identical frames. */
function tag(index: number): ArrayBuffer {
  const buffer = new ArrayBuffer(4);
  new Int32Array(buffer)[0] = index;
  return buffer;
}

let lastTag = 0;
function noiseFor(tagValue: number): Uint8ClampedArray {
  let state = tagValue * 2654435761 + 1;
  const data = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      state = (state * 1664525 + 1013904223) >>> 0;
      const v = (state >>> 24) & 255;
      const i = (y * SIZE + x) * 4;
      data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
    }
  }
  return data;
}

function stubDecodePipeline(): void {
  vi.stubGlobal("createImageBitmap", async (blob: Blob) => {
    lastTag = new Int32Array(await blob.arrayBuffer())[0]!;
    return { width: SIZE, height: SIZE, close: () => undefined };
  });
  vi.stubGlobal("OffscreenCanvas", class {
    constructor(readonly width: number, readonly height: number) {}
    getContext(): unknown {
      return {
        drawImage: () => undefined,
        getImageData: () => ({ width: this.width, height: this.height, data: noiseFor(lastTag) }),
      };
    }
  });
}

afterEach(() => vi.unstubAllGlobals());

interface Done { session: ReconstructionSessionSnapshot | undefined; frameToImage: readonly number[] }

function run(images: readonly { data: ArrayBuffer; mediaType: string }[]): {
  done: Promise<Done>;
  errors: Promise<string>;
  telemetry: () => CaptureTelemetry | undefined;
} {
  let resolveDone!: (value: Done) => void;
  let resolveError!: (value: string) => void;
  const done = new Promise<Done>((resolve) => { resolveDone = resolve; });
  const errors = new Promise<string>((resolve) => { resolveError = resolve; });
  let latest: CaptureTelemetry | undefined;
  startBatchReconstruct(images, {
    onTelemetry: (state) => { latest = state; },
    onDone: (session, frameToImage) => resolveDone({ session, frameToImage }),
    onError: (message) => resolveError(message),
  });
  return { done, errors, telemetry: () => latest };
}

describe("decodeImageData", () => {
  it("draws the decoded bitmap onto an offscreen canvas and returns its pixels", async () => {
    stubDecodePipeline();
    const image = await decodeImageData({ data: tag(4), mediaType: "image/png" });
    expect(image.width).toBe(SIZE);
    expect(image.height).toBe(SIZE);
    expect(image.data).toHaveLength(SIZE * SIZE * 4);
  });
});

describe("startBatchReconstruct", () => {
  it("tracks identical frames and maps every accepted frame back to its source image", async () => {
    stubDecodePipeline();
    const { done, errors, telemetry } = run([tag(1), tag(1), tag(1)].map((data) => ({ data, mediaType: "image/png" })));
    const race = await Promise.race([done.then(() => "done" as const), errors.then(() => "error" as const)]);
    expect(race).toBe("done");
    const result = await done;
    expect(result.session).toBeDefined();
    expect(result.session?.map.keyframes.length).toBeGreaterThanOrEqual(1);
    // Identical frames track perfectly, so all three are accepted in order.
    expect(result.frameToImage).toEqual([0, 1, 2]);
    expect(telemetry()?.progress).toBe(1);
    expect(telemetry()?.tracking).toBe("idle");
  });

  it("reports decode failures through onError", async () => {
    vi.stubGlobal("createImageBitmap", () => Promise.reject(new Error("decode exploded")));
    const { errors } = run([{ data: tag(0), mediaType: "image/png" }]);
    expect(await errors).toBe("decode exploded");
  });

  it("stops silently when cancelled before any frame is processed", async () => {
    stubDecodePipeline();
    const onSettled = vi.fn();
    const handle = startBatchReconstruct(
      Array.from({ length: 10 }, (_, index) => ({ data: tag(index), mediaType: "image/png" })),
      { onTelemetry: () => undefined, onDone: onSettled, onError: onSettled },
    );
    handle.cancel();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onSettled).not.toHaveBeenCalled();
  });
});
