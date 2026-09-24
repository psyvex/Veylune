import { openCamera, type CameraSession } from "./camera";
import { LiveScanSession, type ScanProcessor } from "./live-scan";
import { LiveReconstructionProcessor } from "./live-reconstruction";
import { LocalVisionExtractor, BruteForceDescriptorMatcher } from "./live-vision";
import { LocalPoseEstimator } from "./local-pose-estimator";
import { ReconstructionOptimizationBridge } from "./reconstruction-optimization-bridge";
import { createBrowserReconstructionWorker, type ReconstructionWorkerFactory } from "./reconstruction-worker-factory";
import type { ReconstructionController } from "./reconstruction-controller";
import type { CapabilityProfile } from "../runtime/capabilities";

export interface CaptureApp { readonly element: HTMLElement; dispose(): void; }
export interface CaptureTelemetry { tracking: "idle" | "tracking" | "recovering" | "lost"; optimization: "idle" | "pending" | "running" | "success" | "stale" | "error"; keyframes: number; reconstructionVersion: number; iteration: number; totalIterations: number; cost: number | undefined; initialCost: number | undefined; improvement: number | undefined; progress: number; }

export function mountCaptureApp(root: HTMLElement, capabilities: CapabilityProfile, telemetry: Partial<CaptureTelemetry> = {}): CaptureApp {
  let camera: CameraSession | undefined; let scan: LiveScanSession | undefined; let processor: LiveReconstructionProcessor | undefined; let workerFactory: ReconstructionWorkerFactory | undefined; let optimizationBridge: ReconstructionOptimizationBridge | undefined; let optimizationController: ReconstructionController | undefined; let running = false; let latestSession: Parameters<ReconstructionWorkerFactory["create"]>[0] | undefined; let recoveringWorker = false;
  const state: CaptureTelemetry = { tracking: telemetry.tracking ?? "idle", optimization: telemetry.optimization ?? "idle", keyframes: telemetry.keyframes ?? 0, reconstructionVersion: telemetry.reconstructionVersion ?? 0, iteration: 0, totalIterations: 0, cost: undefined, initialCost: undefined, improvement: undefined, progress: 0 };
  const shell = document.createElement("section"); shell.className = "veylune-capture";
  shell.innerHTML = `<header><h1>Veylune</h1><p>Local-first 3D capture</p></header><div class="capture-stage"><video autoplay muted playsinline></video><canvas aria-hidden="true"></canvas><div class="capture-status" role="status">Ready to scan</div></div><div class="capture-controls"><button type="button" data-action="start">Start camera</button><button type="button" data-action="snapshot" disabled>Capture image</button><button type="button" data-action="stop" disabled>Stop</button><button type="button" data-action="cancel-optimization" disabled>Cancel optimization</button></div><dl class="capture-metrics"><div><dt>Tracking</dt><dd data-metric="tracking">${state.tracking}</dd></div><div><dt>Optimization</dt><dd data-metric="optimization">${state.optimization}</dd></div><div><dt>Optimization progress</dt><dd data-metric="progress">0%</dd></div><div><dt>Iterations</dt><dd data-metric="iterations">0 / 0</dd></div><div><dt>Cost</dt><dd data-metric="cost">—</dd></div><div><dt>Cost improvement</dt><dd data-metric="improvement">—</dd></div><div><dt>Keyframes</dt><dd data-metric="keyframes">${state.keyframes}</dd></div><div><dt>Map version</dt><dd data-metric="version">${state.reconstructionVersion}</dd></div></dl><dl class="capture-capabilities"><div><dt>WebGPU</dt><dd>${capabilities.webgpu}</dd></div><div><dt>WASM</dt><dd>${capabilities.wasm}</dd></div><div><dt>Workers</dt><dd>${capabilities.workers}</dd></div></dl>`;
  root.replaceChildren(shell);
  const video = shell.querySelector<HTMLVideoElement>("video")!; const canvas = shell.querySelector<HTMLCanvasElement>("canvas")!; const status = shell.querySelector<HTMLElement>(".capture-status")!; const start = shell.querySelector<HTMLButtonElement>("[data-action=start]")!; const snapshot = shell.querySelector<HTMLButtonElement>("[data-action=snapshot]")!; const stop = shell.querySelector<HTMLButtonElement>("[data-action=stop]")!;
  const cancelOptimization = shell.querySelector<HTMLButtonElement>("[data-action=cancel-optimization]")!;
  const updateTelemetry = (): void => { shell.querySelector<HTMLElement>("[data-metric=tracking]")!.textContent = state.tracking; shell.querySelector<HTMLElement>("[data-metric=optimization]")!.textContent = state.optimization; shell.querySelector<HTMLElement>("[data-metric=keyframes]")!.textContent = String(state.keyframes); shell.querySelector<HTMLElement>("[data-metric=version]")!.textContent = String(state.reconstructionVersion); shell.querySelector<HTMLElement>("[data-metric=progress]")!.textContent = `${Math.round(state.progress * 100)}%`; shell.querySelector<HTMLElement>("[data-metric=iterations]")!.textContent = `${state.iteration} / ${state.totalIterations}`; shell.querySelector<HTMLElement>("[data-metric=cost]")!.textContent = state.cost === undefined ? "—" : `${state.cost.toPrecision(4)} (start ${state.initialCost?.toPrecision(4) ?? "—"})`; shell.querySelector<HTMLElement>("[data-metric=improvement]")!.textContent = state.improvement === undefined ? "—" : state.improvement.toPrecision(4); cancelOptimization.disabled = state.optimization !== "pending" && state.optimization !== "running"; };
  const captureFrame = (): void => { if (!video.videoWidth || !video.videoHeight) return; canvas.width = video.videoWidth; canvas.height = video.videoHeight; const context = canvas.getContext("2d"); if (!context) return; context.drawImage(video, 0, 0); status.textContent = `Captured ${canvas.width} × ${canvas.height}`; };
  const startCamera = async (): Promise<void> => {
    if (running) return; start.disabled = true; status.textContent = "Requesting camera permission…";
    try {
      camera = await openCamera({ facingMode: "environment", width: 1280, height: 720, frameRate: 30 }); video.srcObject = camera.stream;
      const width = camera.video.videoWidth || 1280; const height = camera.video.videoHeight || 720; const intrinsics = { fx: width * 0.9, fy: width * 0.9, cx: width / 2, cy: height / 2 };
      const extractor = new LocalVisionExtractor({ maxKeypoints: 384 }); const matcher = new BruteForceDescriptorMatcher(0.8); const poseEstimator = new LocalPoseEstimator({ intrinsics, extractor, matcher });
      workerFactory = createBrowserReconstructionWorker();
      const attachOptimization = (session: Parameters<ReconstructionWorkerFactory["create"]>[0]): void => {
        latestSession = session;
        if (optimizationBridge || !workerFactory) return;
        const controller = workerFactory.create(session);
        optimizationController = controller;
        optimizationBridge = new ReconstructionOptimizationBridge(controller, { debounceMs: 300, minimumIntervalMs: 1000, onState: (optimizationState) => { state.optimization = optimizationState.phase; state.progress = optimizationState.progress; state.iteration = optimizationState.iteration; state.totalIterations = optimizationState.totalIterations; state.cost = optimizationState.cost; state.initialCost = optimizationState.initialCost; state.improvement = optimizationState.improvement; updateTelemetry(); }, onResult: (result) => { if (result.committed && result.output && !processor?.applyOptimizedSession(result.output.candidate)) status.textContent = "Optimization completed, but its map could not be applied to live capture."; }, onError: (error) => {
          state.optimization = "error"; status.textContent = error instanceof Error ? `${error.message} Restarting optimization worker…` : "Background optimization failed. Restarting optimization worker…"; updateTelemetry();
          if (recoveringWorker || !latestSession || !running) return;
          recoveringWorker = true; optimizationBridge?.dispose(); optimizationBridge = undefined; optimizationController = undefined; workerFactory?.dispose(); workerFactory = createBrowserReconstructionWorker();
          if (latestSession) { attachOptimization(latestSession); const recoveredBridge = optimizationBridge as ReconstructionOptimizationBridge | undefined; recoveredBridge?.notifyKeyframeInserted(); }
          recoveringWorker = false;
        } });
        processor?.setOptimizationBridge(optimizationBridge);
      };
      processor = new LiveReconstructionProcessor({ intrinsics, extractor, matcher, poseEstimator, onSession: (session) => {
        latestSession = session; const tracking = processor?.trackingState ?? "idle"; state.tracking = tracking === "recovering" || tracking === "lost" ? tracking : tracking === "idle" || tracking === "initializing" ? "idle" : "tracking"; state.keyframes = session.map.keyframes.length; state.reconstructionVersion = session.map.version;
        optimizationController?.synchronize(session);
        attachOptimization(session);
        updateTelemetry();
      } });
      const reconstructionProcessor: ScanProcessor = { process: (frame) => processor!.process(frame), reset: () => processor?.reset() };
      scan = new LiveScanSession(camera, reconstructionProcessor, { maxFps: 12, maxWidth: 960, onMetrics: (metrics) => { const tracking = processor?.trackingState ?? "idle"; state.tracking = tracking === "recovering" || tracking === "lost" ? tracking : tracking === "idle" || tracking === "initializing" ? "idle" : "tracking"; updateTelemetry(); status.textContent = `Scanning · ${metrics.accepted} accepted · ${Math.round(metrics.averageLatencyMs)} ms/frame`; } });
      scan.start(); running = true; state.tracking = "tracking"; updateTelemetry(); snapshot.disabled = false; stop.disabled = false;
    } catch (error) { running = false; scan?.stop(); processor?.dispose(); optimizationBridge?.dispose(); workerFactory?.dispose(); camera?.stop(); scan = undefined; processor = undefined; optimizationBridge = undefined; optimizationController = undefined; workerFactory = undefined; latestSession = undefined; camera = undefined; status.textContent = error instanceof Error ? error.message : "Unable to start camera."; start.disabled = false; snapshot.disabled = true; stop.disabled = true; }
  };
  const stopCamera = (): void => { running = false; scan?.stop(); processor?.dispose(); void optimizationBridge?.cancel(); optimizationBridge?.dispose(); workerFactory?.dispose(); scan = undefined; processor = undefined; optimizationBridge = undefined; optimizationController = undefined; workerFactory = undefined; latestSession = undefined; camera = undefined; state.tracking = "idle"; state.optimization = "idle"; state.keyframes = 0; state.reconstructionVersion = 0; state.iteration = 0; state.totalIterations = 0; state.progress = 0; state.cost = undefined; state.initialCost = undefined; state.improvement = undefined; updateTelemetry(); snapshot.disabled = true; stop.disabled = true; start.disabled = false; status.textContent = "Camera stopped"; };
  start.addEventListener("click", () => void startCamera()); snapshot.addEventListener("click", captureFrame); stop.addEventListener("click", stopCamera); cancelOptimization.addEventListener("click", () => { void optimizationBridge?.cancel(); });
  const dispose = (): void => { stopCamera(); shell.remove(); };
  return { element: shell, dispose };
}
