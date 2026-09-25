import { openCamera, type CameraSession } from "./camera";
import { LiveScanSession, type ScanProcessor } from "./live-scan";
import { LiveReconstructionProcessor } from "./live-reconstruction";
import { LocalVisionExtractor, BruteForceDescriptorMatcher } from "./live-vision";
import { LocalPoseEstimator } from "./local-pose-estimator";
import { ReconstructionOptimizationBridge } from "./reconstruction-optimization-bridge";
import { createBrowserReconstructionWorker, type ReconstructionWorkerFactory } from "./reconstruction-worker-factory";
import type { ReconstructionController } from "./reconstruction-controller";
import type { CapabilityProfile } from "../runtime/capabilities";
import { describeOptimization, describeTracking, type CaptureOptimizationPhase, type CaptureTrackingPhase } from "./capture-hud-copy";

export interface CaptureApp { readonly element: HTMLElement; dispose(): void; }
export interface CaptureTelemetry { tracking: CaptureTrackingPhase; optimization: CaptureOptimizationPhase; keyframes: number; reconstructionVersion: number; iteration: number; totalIterations: number; cost: number | undefined; initialCost: number | undefined; improvement: number | undefined; progress: number; }

export function mountCaptureApp(root: HTMLElement, capabilities: CapabilityProfile, telemetry: Partial<CaptureTelemetry> = {}): CaptureApp {
  let camera: CameraSession | undefined; let scan: LiveScanSession | undefined; let processor: LiveReconstructionProcessor | undefined; let workerFactory: ReconstructionWorkerFactory | undefined; let optimizationBridge: ReconstructionOptimizationBridge | undefined; let optimizationController: ReconstructionController | undefined; let running = false; let latestSession: Parameters<ReconstructionWorkerFactory["create"]>[0] | undefined; let recoveringWorker = false;
  const state: CaptureTelemetry = { tracking: telemetry.tracking ?? "idle", optimization: telemetry.optimization ?? "idle", keyframes: telemetry.keyframes ?? 0, reconstructionVersion: telemetry.reconstructionVersion ?? 0, iteration: telemetry.iteration ?? 0, totalIterations: telemetry.totalIterations ?? 0, cost: telemetry.cost, initialCost: telemetry.initialCost, improvement: telemetry.improvement, progress: telemetry.progress ?? 0 };
  const shell = document.createElement("section"); shell.className = "veylune-capture veylune-glass-theme"; shell.setAttribute("aria-label", "Veylune capture workspace");
  shell.innerHTML = `<header class="capture-header"><div><p class="eyebrow">SPATIAL SCAN WORKSPACE</p><h1>Veylune</h1><p class="capture-subtitle">Build a clear, usable 3D capture as you move.</p></div><div class="live-indicator" data-live-indicator="idle"><span aria-hidden="true"></span><span data-live-label>Camera off</span></div></header><main class="capture-layout"><section class="capture-primary" aria-label="Camera and scan controls"><div class="capture-stage"><video autoplay muted playsinline aria-label="Live camera preview"></video><canvas aria-hidden="true"></canvas><div class="capture-stage-top"><span class="stage-chip"><span class="stage-dot" aria-hidden="true"></span>LIVE VIEW</span><span class="stage-chip" data-metric="tracking">Waiting for camera</span></div><div class="capture-status" role="status" aria-live="polite">Ready to scan</div></div><div class="capture-controls"><button type="button" class="button-primary" data-action="start">Start camera</button><button type="button" data-action="snapshot" disabled>Capture image</button><button type="button" data-action="stop" disabled>Stop scan</button></div></section><aside class="capture-side" aria-label="Reconstruction progress"><section class="refinement-card" aria-labelledby="refinement-title" data-phase="idle"><div class="card-heading"><div><p class="eyebrow">BACKGROUND PROCESS</p><h2 id="refinement-title">Map refinement</h2></div><span class="phase-badge" data-metric="optimization">Waiting</span></div><p class="refinement-message" data-metric="optimization-message" aria-live="polite">Capture a few keyframes to begin refining your map.</p><progress class="refinement-progress" data-metric="progress-bar" value="0" max="100" aria-label="Map refinement progress">0%</progress><div class="progress-caption"><span data-metric="progress">0%</span><span data-metric="iterations">0 of 0 iterations</span></div><button type="button" class="button-subtle" data-action="cancel-optimization" disabled>Cancel refinement</button></section><section class="metrics-card" aria-labelledby="metrics-title"><div class="card-heading"><div><p class="eyebrow">SESSION</p><h2 id="metrics-title">Capture summary</h2></div><span class="session-mark" aria-hidden="true">01</span></div><dl class="capture-metrics"><div><dt>Keyframes</dt><dd data-metric="keyframes">${state.keyframes}</dd></div><div><dt>Map version</dt><dd data-metric="version">${state.reconstructionVersion}</dd></div><div><dt>Current cost</dt><dd data-metric="cost">—</dd></div><div><dt>Cost improvement</dt><dd data-metric="improvement">—</dd></div></dl></section><section class="capabilities-card" aria-label="Browser capabilities"><span>Local processing</span><span>WebGPU <b>${capabilities.webgpu}</b></span><span>WASM <b>${capabilities.wasm}</b></span><span>Workers <b>${capabilities.workers}</b></span></section></aside></main>`;
  root.replaceChildren(shell);
  const video = shell.querySelector<HTMLVideoElement>("video")!; const canvas = shell.querySelector<HTMLCanvasElement>("canvas")!; const status = shell.querySelector<HTMLElement>(".capture-status")!; const start = shell.querySelector<HTMLButtonElement>("[data-action=start]")!; const snapshot = shell.querySelector<HTMLButtonElement>("[data-action=snapshot]")!; const stop = shell.querySelector<HTMLButtonElement>("[data-action=stop]")!;
  const cancelOptimization = shell.querySelector<HTMLButtonElement>("[data-action=cancel-optimization]")!;
  const updateTelemetry = (): void => {
    const progress = Math.max(0, Math.min(1, Number.isFinite(state.progress) ? state.progress : 0));
    const tracking = describeTracking(state.tracking);
    const optimization = describeOptimization(state.optimization);
    shell.querySelector<HTMLElement>("[data-metric=tracking]")!.textContent = tracking.label;
    shell.querySelector<HTMLElement>("[data-live-label]")!.textContent = tracking.liveLabel;
    shell.querySelector<HTMLElement>("[data-live-indicator]")!.dataset.liveIndicator = state.tracking;
    shell.querySelector<HTMLElement>("[data-metric=optimization]")!.textContent = optimization.label;
    shell.querySelector<HTMLElement>("[data-metric=optimization-message]")!.textContent = optimization.message;
    shell.querySelector<HTMLElement>(".refinement-card")!.setAttribute("data-phase", state.optimization);
    shell.querySelector<HTMLElement>("[data-metric=keyframes]")!.textContent = String(state.keyframes);
    shell.querySelector<HTMLElement>("[data-metric=version]")!.textContent = String(state.reconstructionVersion);
    shell.querySelector<HTMLElement>("[data-metric=progress]")!.textContent = `${Math.round(progress * 100)}%`;
    const progressBar = shell.querySelector<HTMLProgressElement>("[data-metric=progress-bar]")!;
    progressBar.value = progress * 100;
    progressBar.textContent = `${Math.round(progress * 100)}%`;
    shell.querySelector<HTMLElement>("[data-metric=iterations]")!.textContent = `${state.iteration} of ${state.totalIterations} iterations`;
    shell.querySelector<HTMLElement>("[data-metric=cost]")!.textContent = state.cost === undefined ? "—" : `${state.cost.toPrecision(4)}${state.initialCost === undefined ? "" : ` · started at ${state.initialCost.toPrecision(4)}`}`;
    shell.querySelector<HTMLElement>("[data-metric=improvement]")!.textContent = state.improvement === undefined ? "—" : state.improvement.toPrecision(4);
    cancelOptimization.disabled = state.optimization !== "pending" && state.optimization !== "running";
  };
  updateTelemetry();
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
        latestSession = session; const tracking = processor?.trackingState ?? "idle"; setTrackingState(tracking === "recovering" || tracking === "lost" ? tracking : tracking === "idle" || tracking === "initializing" ? "idle" : "tracking"); state.keyframes = session.map.keyframes.length; state.reconstructionVersion = session.map.version;
        optimizationController?.synchronize(session);
        attachOptimization(session);
        updateTelemetry();
      } });
      const reconstructionProcessor: ScanProcessor = { process: (frame) => processor!.process(frame), reset: () => processor?.reset() };
      scan = new LiveScanSession(camera, reconstructionProcessor, { maxFps: 12, maxWidth: 960, onMetrics: () => { const tracking = processor?.trackingState ?? "idle"; setTrackingState(tracking === "recovering" || tracking === "lost" ? tracking : tracking === "idle" || tracking === "initializing" ? "idle" : "tracking"); } });
      scan.start(); running = true; setTrackingState("tracking"); snapshot.disabled = false; stop.disabled = false;
    } catch (error) { running = false; scan?.stop(); processor?.dispose(); optimizationBridge?.dispose(); workerFactory?.dispose(); camera?.stop(); scan = undefined; processor = undefined; optimizationBridge = undefined; optimizationController = undefined; workerFactory = undefined; latestSession = undefined; camera = undefined; status.textContent = error instanceof Error ? error.message : "Unable to start camera."; start.disabled = false; snapshot.disabled = true; stop.disabled = true; }
  };
  const setTrackingState = (tracking: CaptureTelemetry["tracking"]): void => { if (state.tracking === tracking) return; state.tracking = tracking; status.textContent = describeTracking(tracking).guidance; updateTelemetry(); };
  const stopCamera = (): void => { running = false; scan?.stop(); processor?.dispose(); void optimizationBridge?.cancel(); optimizationBridge?.dispose(); workerFactory?.dispose(); scan = undefined; processor = undefined; optimizationBridge = undefined; optimizationController = undefined; workerFactory = undefined; latestSession = undefined; camera = undefined; state.tracking = "idle"; state.optimization = "idle"; state.keyframes = 0; state.reconstructionVersion = 0; state.iteration = 0; state.totalIterations = 0; state.progress = 0; state.cost = undefined; state.initialCost = undefined; state.improvement = undefined; updateTelemetry(); snapshot.disabled = true; stop.disabled = true; start.disabled = false; status.textContent = "Camera stopped"; };
  start.addEventListener("click", () => void startCamera()); snapshot.addEventListener("click", captureFrame); stop.addEventListener("click", stopCamera); cancelOptimization.addEventListener("click", () => { if (!optimizationBridge) return; cancelOptimization.disabled = true; shell.querySelector<HTMLElement>("[data-metric=optimization-message]")!.textContent = "Stopping refinement…"; void optimizationBridge.cancel().then(() => { if (!shell.isConnected || state.optimization !== "idle") return; shell.querySelector<HTMLElement>("[data-metric=optimization-message]")!.textContent = "Refinement canceled. Your live map is unchanged."; }).catch(() => { if (!shell.isConnected) return; shell.querySelector<HTMLElement>("[data-metric=optimization-message]")!.textContent = "Could not stop refinement. It will finish in the background."; }); });
  const dispose = (): void => { stopCamera(); shell.remove(); };
  return { element: shell, dispose };
}
