import { LiveReconstructionProcessor } from "./live-reconstruction";
import { LocalVisionExtractor, BruteForceDescriptorMatcher } from "./live-vision";
import { LocalPoseEstimator } from "./local-pose-estimator";
import { ReconstructionOptimizationBridge } from "./reconstruction-optimization-bridge";
import { createBrowserReconstructionWorker, type ReconstructionWorkerFactory } from "./reconstruction-worker-factory";
import type { ScanFrame } from "./live-scan";
import type { CaptureTelemetry } from "./capture-app";
import type { PointCloudViewer } from "./point-cloud-viewer";
import type { ReconstructionSessionSnapshot } from "./reconstruction-session";

export interface BatchReconstructOptions {
  readonly mapViewer?: PointCloudViewer;
  readonly onTelemetry: (state: CaptureTelemetry) => void;
  readonly onDone: (session: ReconstructionSessionSnapshot | undefined) => void;
  readonly onError: (message: string) => void;
}

export interface BatchReconstructSession {
  cancel(): void;
}

export function startBatchReconstruct(
  images: readonly { data: ArrayBuffer; mediaType: string }[],
  options: BatchReconstructOptions,
): BatchReconstructSession {
  let cancelled = false;
  let workerFactory: ReconstructionWorkerFactory | undefined;
  let optimizationBridge: ReconstructionOptimizationBridge | undefined;
  let processor: LiveReconstructionProcessor | undefined;

  const state: CaptureTelemetry = { tracking: "idle", optimization: "idle", keyframes: 0, landmarks: 0, reconstructionVersion: 0, iteration: 0, totalIterations: 0, cost: undefined, initialCost: undefined, improvement: undefined, progress: 0 };
  let imageProgress = 0;

  void (async () => {
    try {
      const extractor = new LocalVisionExtractor({ maxKeypoints: 512, minScore: 0.08 });
      const matcher = new BruteForceDescriptorMatcher(0.85);

      // Use first image to derive intrinsics estimate
      const firstBitmap = await decodeImageData(images[0]!);
      const width = firstBitmap.width; const height = firstBitmap.height;
      const intrinsics = { fx: width * 0.9, fy: width * 0.9, cx: width / 2, cy: height / 2 };
      const poseEstimator = new LocalPoseEstimator({ intrinsics, extractor, matcher });

      workerFactory = createBrowserReconstructionWorker();

      processor = new LiveReconstructionProcessor({ intrinsics, extractor, matcher, poseEstimator,
        onSession: (session) => {
          state.keyframes = session.map.keyframes.length;
          state.landmarks = session.map.landmarks.length;
          state.reconstructionVersion = session.map.version;
          options.mapViewer?.update(session);
          options.onTelemetry({ ...state });
          if (!optimizationBridge && workerFactory) {
            const controller = workerFactory.create(session);
            optimizationBridge = new ReconstructionOptimizationBridge(controller, {
              debounceMs: 500, minimumIntervalMs: 1500,
              onState: (s) => { state.optimization = s.phase; state.progress = imageProgress; state.iteration = s.iteration; state.totalIterations = s.totalIterations; state.cost = s.cost; state.initialCost = s.initialCost; state.improvement = s.improvement; options.onTelemetry({ ...state }); },
              onResult: () => {},
              onError: () => {},
            });
            processor?.setOptimizationBridge(optimizationBridge);
          }
        },
      });

      state.tracking = "tracking"; options.onTelemetry({ ...state });

      for (let i = 0; i < images.length; i++) {
        if (cancelled) return;
        const imageData = await decodeImageData(images[i]!);
        const frame: ScanFrame = { timestampMs: i * 100, image: imageData };
        await processor.process(frame);
        imageProgress = (i + 1) / images.length;
        state.progress = imageProgress;
        options.onTelemetry({ ...state });
      }

      if (!cancelled) { state.tracking = "idle"; options.onTelemetry({ ...state }); options.onDone(processor?.snapshot()); }
    } catch (error) {
      if (!cancelled) options.onError(error instanceof Error ? error.message : "Reconstruction failed.");
    } finally {
      optimizationBridge?.dispose();
      workerFactory?.dispose();
    }
  })();

  return {
    cancel() {
      cancelled = true;
      void optimizationBridge?.cancel();
      optimizationBridge?.dispose();
      workerFactory?.dispose();
      processor?.dispose();
    },
  };
}

async function decodeImageData(image: { data: ArrayBuffer; mediaType: string }): Promise<ImageData> {
  const blob = new Blob([image.data], { type: image.mediaType });
  const url = URL.createObjectURL(blob);
  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  } finally {
    URL.revokeObjectURL(url);
  }
}
