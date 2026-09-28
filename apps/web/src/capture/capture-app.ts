import { openCamera, enumerateVideoInputs, type CameraSession, type CameraFacingMode } from "./camera";
import { LiveScanSession, type ScanProcessor } from "./live-scan";
import { LiveReconstructionProcessor } from "./live-reconstruction";
import { LocalVisionExtractor, BruteForceDescriptorMatcher } from "./live-vision";
import { LocalPoseEstimator } from "./local-pose-estimator";
import { ReconstructionOptimizationBridge } from "./reconstruction-optimization-bridge";
import { createBrowserReconstructionWorker, type ReconstructionWorkerFactory } from "./reconstruction-worker-factory";
import type { ReconstructionController } from "./reconstruction-controller";
import type { CapabilityProfile } from "../runtime/capabilities";
import { describeOptimization, describeTracking, type CaptureOptimizationPhase, type CaptureTrackingPhase } from "./capture-hud-copy";
import { mountPointCloudViewer, type PointCloudViewer } from "./point-cloud-viewer";
import { downloadPly } from "./export-ply";
import { defaultIntrinsics, type CameraIntrinsics } from "./geometry";
import { ensureReconstructionEngineReady } from "./reconstruction-engine-bootstrap.js";

/** Frame width the live scan processes at; the camera stream is downscaled to
 * this by LiveScanSession, so every geometric constant (intrinsics above all)
 * must be stated in downscaled pixels, not the raw stream size. */
export const SCAN_MAX_WIDTH = 960;

/** Pinhole constants matched to the downscaled frame the pipeline actually
 * sees. See the note in startCamera — mixing stream-size intrinsics with
 * downscaled features silently kills all triangulation. */
export function scanIntrinsics(videoWidth: number, videoHeight: number, maxWidth = SCAN_MAX_WIDTH): CameraIntrinsics {
  const scale = Math.min(1, maxWidth / Math.max(1, videoWidth));
  return defaultIntrinsics(Math.max(1, Math.round(videoWidth * scale)), Math.max(1, Math.round(videoHeight * scale)));
}

export interface CaptureApp { readonly element: HTMLElement; readonly snapshots: readonly Blob[]; readonly session: import("./reconstruction-session").ReconstructionSessionSnapshot | undefined; dispose(): void; }
export interface CaptureTelemetry { tracking: CaptureTrackingPhase; optimization: CaptureOptimizationPhase; keyframes: number; landmarks: number; reconstructionVersion: number; iteration: number; totalIterations: number; cost: number | undefined; initialCost: number | undefined; improvement: number | undefined; progress: number; }
export interface CaptureAppOptions { readonly onStopped?: (snapshots: readonly Blob[]) => void; }

export function mountCaptureApp(root: HTMLElement, capabilities: CapabilityProfile, telemetry: Partial<CaptureTelemetry> = {}, options: CaptureAppOptions = {}): CaptureApp {
  // Idempotent, fire-and-forget: main.ts already loads the engine for the
  // capability-display DOM attribute, but that path shouldn't be a hidden
  // prerequisite for the tracking loop to reach WASM math — capture-app
  // starts its own load attempt so it works standalone too (tests, a future
  // page that mounts it without main.ts's wiring). See
  // reconstruction-engine-bootstrap.ts's module doc.
  void ensureReconstructionEngineReady();
  let camera: CameraSession | undefined; let scan: LiveScanSession | undefined; let processor: LiveReconstructionProcessor | undefined; let workerFactory: ReconstructionWorkerFactory | undefined; let optimizationBridge: ReconstructionOptimizationBridge | undefined; let optimizationController: ReconstructionController | undefined; let running = false; let latestSession: Parameters<ReconstructionWorkerFactory["create"]>[0] | undefined; let recoveringWorker = false; let facingMode: CameraFacingMode = "environment";
  const snapshots: Blob[] = [];
  const state: CaptureTelemetry = { tracking: telemetry.tracking ?? "idle", optimization: telemetry.optimization ?? "idle", keyframes: telemetry.keyframes ?? 0, landmarks: telemetry.landmarks ?? 0, reconstructionVersion: telemetry.reconstructionVersion ?? 0, iteration: telemetry.iteration ?? 0, totalIterations: telemetry.totalIterations ?? 0, cost: telemetry.cost, initialCost: telemetry.initialCost, improvement: telemetry.improvement, progress: telemetry.progress ?? 0 };
  const shell = document.createElement("section"); shell.className = "veylune-capture veylune-glass-theme"; shell.setAttribute("aria-label", "Veylune capture workspace");
  shell.innerHTML = `<header class="capture-header"><span class="capture-eyebrow">SPATIAL SCAN</span><div class="live-indicator" data-live-indicator="idle"><span aria-hidden="true"></span><span data-live-label>Camera off</span></div></header><main class="capture-layout"><div class="capture-primary"><div class="capture-stage"><video autoplay muted playsinline aria-label="Live camera preview"></video><canvas aria-hidden="true"></canvas><canvas class="feature-overlay" aria-hidden="true"></canvas><div class="stage-flash" aria-hidden="true"></div><div class="stage-hud-top"><span class="stage-chip"><span class="stage-dot" aria-hidden="true"></span>LIVE</span><span class="stage-chip" data-metric="tracking">Waiting for camera</span></div><div class="capture-status" role="status" aria-live="polite">Build a clear, usable 3D capture as you move.</div><div class="stage-controls-bar"><button type="button" class="btn-start" data-action="start"><span class="btn-icon" aria-hidden="true">◎</span><span class="btn-label">Start camera</span></button><button type="button" class="btn-flip" data-action="flip" hidden aria-label="Flip camera"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M1 5h10M11 5l-3-3M11 5l-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 11H5M5 11l3-3M5 11l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="btn-label">Flip</span></button><button type="button" class="btn-snapshot" data-action="snapshot" disabled><span class="btn-icon" aria-hidden="true">⊙</span><span class="btn-label">Snapshot</span><span class="snapshot-badge" data-snapshot-count></span></button><button type="button" class="btn-reset" data-action="reset" disabled><span class="btn-icon" aria-hidden="true">↺</span><span class="btn-label">Reset</span></button><button type="button" class="btn-stop" data-action="stop" disabled><span class="btn-icon" aria-hidden="true">◼</span><span class="btn-label">Stop</span></button></div></div><div class="capture-metrics-strip"><div class="metric-cell"><span class="metric-label">Keyframes</span><span data-metric="keyframes" class="metric-value">${state.keyframes}</span></div><div class="metric-cell"><span class="metric-label">Points</span><span data-metric="points" class="metric-value">0</span></div><div class="metric-cell"><span class="metric-label">Cost</span><span data-metric="cost" class="metric-value">—</span></div><div class="metric-cell"><span class="metric-label">Improvement</span><span data-metric="improvement" class="metric-value">—</span></div></div></div><aside class="capture-side" aria-label="Reconstruction progress"><div class="map-preview-panel"><p class="side-label">RECONSTRUCTION</p><div class="map-preview-stage" data-map-preview><p class="map-preview-empty">Start a scan to see the 3D map build up here.</p></div><p class="scale-note">Approximate monocular scale — check distances against a known object after export.</p><button type="button" class="btn-subtle btn-download-ply" data-action="download-ply" disabled>⬇ Download PLY</button></div><div class="refinement-panel" data-phase="idle"><div class="refinement-header"><p class="side-label">REFINEMENT</p><span class="phase-badge" data-metric="optimization">Waiting</span></div><p class="refinement-message" data-metric="optimization-message" aria-live="polite">Capture a few keyframes to begin refining your map.</p><progress class="refinement-progress" data-metric="progress-bar" value="0" max="100" aria-label="Map refinement progress">0%</progress><div class="progress-caption"><span data-metric="progress">0%</span><span data-metric="iterations">0 of 0 iterations</span></div><button type="button" class="btn-subtle" data-action="cancel-optimization" disabled>Cancel</button></div><div class="capabilities-strip" aria-label="Browser capabilities"><span>Local</span><span>WebGPU <b>${capabilities.webgpu}</b></span><span>WASM <b>${capabilities.wasm}</b></span><span>Workers <b>${capabilities.workers}</b></span></div></aside></main>`;
  root.replaceChildren(shell);
  const video = shell.querySelector<HTMLVideoElement>("video")!; const canvas = shell.querySelector<HTMLCanvasElement>("canvas")!; const featureOverlay = shell.querySelector<HTMLCanvasElement>(".feature-overlay")!; const resetBtn = shell.querySelector<HTMLButtonElement>("[data-action=reset]")!; const status = shell.querySelector<HTMLElement>(".capture-status")!; const start = shell.querySelector<HTMLButtonElement>("[data-action=start]")!; const flipBtn = shell.querySelector<HTMLButtonElement>("[data-action=flip]")!; const snapshot = shell.querySelector<HTMLButtonElement>("[data-action=snapshot]")!; const stop = shell.querySelector<HTMLButtonElement>("[data-action=stop]")!;
  // A real, navigable view of the sparse point cloud and camera trajectory the live
  // pipeline is already building, in place of the progress numbers being the only
  // visible result of a scan (see point-cloud-viewer.ts). Degrades to a no-op when
  // WebGL is unavailable, leaving the static fallback copy already in the DOM.
  const mapPreview: PointCloudViewer = mountPointCloudViewer(shell.querySelector<HTMLElement>("[data-map-preview]")!);
  const cancelOptimization = shell.querySelector<HTMLButtonElement>("[data-action=cancel-optimization]")!;
  const downloadPlyBtn = shell.querySelector<HTMLButtonElement>("[data-action=download-ply]")!;
  const updateTelemetry = (): void => {
    const progress = Math.max(0, Math.min(1, Number.isFinite(state.progress) ? state.progress : 0));
    const tracking = describeTracking(state.tracking);
    const optimization = describeOptimization(state.optimization);
    shell.querySelector<HTMLElement>("[data-metric=tracking]")!.textContent = tracking.label;
    shell.querySelector<HTMLElement>("[data-live-label]")!.textContent = tracking.liveLabel;
    shell.querySelector<HTMLElement>("[data-live-indicator]")!.dataset.liveIndicator = state.tracking;
    const scanningButIdle = state.optimization === "idle" && state.tracking !== "idle";
    shell.querySelector<HTMLElement>("[data-metric=optimization]")!.textContent = scanningButIdle ? "Building" : optimization.label;
    shell.querySelector<HTMLElement>("[data-metric=optimization-message]")!.textContent = scanningButIdle ? "Building initial map… keep scanning slowly." : optimization.message;
    shell.querySelector<HTMLElement>(".refinement-panel")!.setAttribute("data-phase", state.optimization);
    shell.querySelector<HTMLElement>("[data-metric=keyframes]")!.textContent = String(state.keyframes);
    shell.querySelector<HTMLElement>("[data-metric=points]")!.textContent = String(state.landmarks);
    const versionCell = shell.querySelector<HTMLElement>("[data-metric=version]");
    if (versionCell) versionCell.textContent = String(state.reconstructionVersion);
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
  const updateSnapshotCount = (): void => {
    const badge = shell.querySelector<HTMLElement>("[data-snapshot-count]");
    if (badge) badge.textContent = snapshots.length > 0 ? String(snapshots.length) : "";
  };
  const captureFrame = (): void => {
    if (!video.videoWidth || !video.videoHeight) return;
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const context = canvas.getContext("2d"); if (!context) return;
    context.drawImage(video, 0, 0);
    canvas.toBlob((blob) => { if (blob) { snapshots.push(blob); updateSnapshotCount(); } }, "image/jpeg", 0.92);
    status.textContent = `Frame ${snapshots.length + 1} captured`;
    setTimeout(() => { if (status.textContent?.startsWith("Frame")) status.textContent = ""; }, 2500);
    const flash = shell.querySelector<HTMLElement>(".stage-flash")!;
    flash.classList.remove("stage-flash--active");
    void flash.offsetWidth;
    flash.classList.add("stage-flash--active");
  };
  const startCamera = async (): Promise<void> => {
    if (running) return; start.disabled = true; status.textContent = "Requesting camera permission…";
    try {
      camera = await openCamera({ facingMode, width: 1280, height: 720, frameRate: 30 }); video.srcObject = camera.stream;
      enumerateVideoInputs().then((inputs) => { if (inputs.length > 1) flipBtn.hidden = false; }).catch(() => {});
      const width = camera.video.videoWidth || 1280; const height = camera.video.videoHeight || 720;
      // Features are extracted from the frames LiveScanSession downscales to
      // scanMaxWidth — the intrinsics MUST be expressed for those pixels.
      // Full-resolution intrinsics over-scale fx/cx (~33% at 1280→960), so
      // every triangulated point misses its own pixel by tens of px and the
      // reprojection gate throws the whole cloud away: keyframes climb, Points
      // stays 0. Phone cameras (always >960) hit this; small webcams don't —
      // which made the bug look intermittent.
      const intrinsics = scanIntrinsics(width, height);
      const extractor = new LocalVisionExtractor({ maxKeypoints: 512, minScore: 0.08 }); const matcher = new BruteForceDescriptorMatcher(0.85); const poseEstimator = new LocalPoseEstimator({ intrinsics, extractor, matcher });
      workerFactory = createBrowserReconstructionWorker();
      const attachOptimization = (session: Parameters<ReconstructionWorkerFactory["create"]>[0]): void => {
        latestSession = session;
        if (optimizationBridge || !workerFactory) return;
        const controller = workerFactory.create(session);
        optimizationController = controller;
        optimizationBridge = new ReconstructionOptimizationBridge(controller, { debounceMs: 300, minimumIntervalMs: 1000, onState: (optimizationState) => { state.optimization = optimizationState.phase; state.progress = optimizationState.progress; state.iteration = optimizationState.iteration; state.totalIterations = optimizationState.totalIterations; state.cost = optimizationState.cost; state.initialCost = optimizationState.initialCost; state.improvement = optimizationState.improvement; updateTelemetry(); }, onResult: (result) => { if (result.committed && result.output && !processor?.applyOptimizedSession(result.output.candidate)) { if (latestSession) optimizationController?.synchronize(latestSession); status.textContent = "Map changed while refinement finished — retrying with the latest map."; } }, onError: (error) => {
          state.optimization = "error"; status.textContent = error instanceof Error ? `${error.message} Restarting optimization worker…` : "Background optimization failed. Restarting optimization worker…"; updateTelemetry();
          if (recoveringWorker || !latestSession || !running) return;
          recoveringWorker = true; optimizationBridge?.dispose(); optimizationBridge = undefined; optimizationController = undefined; workerFactory?.dispose(); workerFactory = createBrowserReconstructionWorker();
          if (latestSession) { attachOptimization(latestSession); const recoveredBridge = optimizationBridge as ReconstructionOptimizationBridge | undefined; recoveredBridge?.notifyKeyframeInserted(); }
          recoveringWorker = false;
        } });
        processor?.setOptimizationBridge(optimizationBridge);
      };
      processor = new LiveReconstructionProcessor({ intrinsics, extractor, matcher, poseEstimator, onSession: (session) => {
        latestSession = session; const tracking = processor?.trackingState ?? "idle"; setTrackingState(tracking === "recovering" || tracking === "lost" ? tracking : tracking === "idle" || tracking === "initializing" ? "idle" : "tracking"); state.keyframes = session.map.keyframes.length; state.landmarks = session.map.landmarks.length; state.reconstructionVersion = session.map.version; shell.querySelector<HTMLElement>("[data-metric=points]")!.textContent = String(state.landmarks);
        optimizationController?.synchronize(session);
        attachOptimization(session);
        updateTelemetry();
        mapPreview.update(session, processor?.colors());
        downloadPlyBtn.disabled = session.map.landmarks.length === 0;
      } });
      const reconstructionProcessor: ScanProcessor = { process: (frame) => processor!.process(frame), reset: () => processor?.reset() };
      scan = new LiveScanSession(camera, reconstructionProcessor, { maxFps: 12, maxWidth: SCAN_MAX_WIDTH, onMetrics: () => {
        const tracking = processor?.trackingState ?? "idle"; setTrackingState(tracking === "recovering" || tracking === "lost" ? tracking : tracking === "idle" || tracking === "initializing" ? "idle" : "tracking");
        const kps = processor?.lastKeypoints; const fw = processor?.lastFrameWidth ?? 0; const fh = processor?.lastFrameHeight ?? 0;
        const cw = video.clientWidth; const ch = video.clientHeight;
        if (kps && kps.length > 0 && fw > 0 && fh > 0 && cw > 0 && ch > 0) {
          featureOverlay.width = cw; featureOverlay.height = ch;
          const ctx = featureOverlay.getContext("2d"); if (!ctx) return;
          ctx.clearRect(0, 0, cw, ch);
          // Account for object-fit:cover — video is scaled to cover container, edges cropped
          const vw = video.videoWidth || fw; const vh = video.videoHeight || fh;
          const coverScale = Math.max(cw / vw, ch / vh);
          const renderW = vw * coverScale; const renderH = vh * coverScale;
          const ox = (cw - renderW) / 2; const oy = (ch - renderH) / 2;
          // Frame is a downscaled version of the same aspect ratio as the raw video
          const sx = renderW / fw; const sy = renderH / fh;
          ctx.fillStyle = "rgba(99,179,237,0.9)";
          for (const kp of kps) { ctx.beginPath(); ctx.arc(ox + kp.x * sx, oy + kp.y * sy, 3, 0, Math.PI * 2); ctx.fill(); }
        } else {
          const ctx = featureOverlay.getContext("2d"); ctx?.clearRect(0, 0, featureOverlay.width, featureOverlay.height);
        }
      } });
      // A new scan starts from a clean slate — stop keeps the previous result
      // on screen, so clear it here (old snapshots would otherwise mix into
      // the next project).
      snapshots.length = 0; updateSnapshotCount(); latestSession = undefined; mapPreview.update(undefined); downloadPlyBtn.disabled = true;
      state.keyframes = 0; state.landmarks = 0; state.reconstructionVersion = 0; state.iteration = 0; state.totalIterations = 0; state.progress = 0; state.cost = undefined; state.initialCost = undefined; state.improvement = undefined; updateTelemetry();
      scan.start(); running = true; setTrackingState("tracking"); snapshot.disabled = false; stop.disabled = false; resetBtn.disabled = false;
      // Rotating mid-scan swaps the principal point under the map — lock the
      // device in whatever orientation the scan started in. Rejected outside
      // fullscreen on some platforms; a silently unlocked scan still works.
      // lock() rejects (not throws) on unsupported devices — swallow the
      // rejection so it never surfaces as an unhandled console error.
      try { void screen.orientation?.lock?.(screen.orientation.type)?.catch?.(() => {}); } catch { /* unsupported */ }
    } catch (error) { running = false; scan?.stop(); processor?.dispose(); optimizationBridge?.dispose(); workerFactory?.dispose(); camera?.stop(); scan = undefined; processor = undefined; optimizationBridge = undefined; optimizationController = undefined; workerFactory = undefined; latestSession = undefined; camera = undefined; status.textContent = error instanceof Error ? error.message : "Unable to start camera."; start.disabled = false; snapshot.disabled = true; stop.disabled = true; }
  };
  const setTrackingState = (tracking: CaptureTelemetry["tracking"]): void => { if (state.tracking === tracking) return; state.tracking = tracking; const guidance = describeTracking(tracking).guidance; status.textContent = tracking === "tracking" ? (snapshots.length === 0 ? "Camera ready — tap Snapshot to capture frames." : guidance) : guidance; updateTelemetry(); };
  const stopCamera = (): void => {
    try { screen.orientation?.unlock?.(); } catch { /* unsupported */ }
    running = false; scan?.stop(); processor?.dispose(); void optimizationBridge?.cancel(); optimizationBridge?.dispose(); workerFactory?.dispose(); scan = undefined; processor = undefined; optimizationBridge = undefined; optimizationController = undefined; workerFactory = undefined; camera = undefined;
    // Stopping must NOT erase the scan: keyframes, points, the map preview and
    // latestSession stay so the result is visible and exportable while the
    // user saves the project or downloads the PLY. Refinement-only numbers
    // reset (they describe the worker, not the map). A new start or Reset
    // clears everything.
    state.tracking = "idle"; state.optimization = "idle"; state.iteration = 0; state.totalIterations = 0; state.progress = 0; state.cost = undefined; state.initialCost = undefined; state.improvement = undefined;
    updateTelemetry(); snapshot.disabled = true; stop.disabled = true; resetBtn.disabled = false; flipBtn.hidden = true; start.disabled = false;
    if (snapshots.length > 0) {
      status.textContent = `${snapshots.length} frame${snapshots.length === 1 ? "" : "s"} captured — save as a project below.`;
      options.onStopped?.(snapshots);
    } else {
      status.textContent = latestSession?.map.landmarks.length ? "Camera stopped — your map is kept on the right. Download the PLY or start a new scan." : "Camera stopped";
    }
  };
  const flipCamera = async (): Promise<void> => {
    if (!running || !camera) return;
    flipBtn.disabled = true; status.textContent = "Switching camera…";
    const prevFacing = facingMode;
    facingMode = facingMode === "environment" ? "user" : "environment";
    scan?.stop(); scan = undefined;
    camera.stop(); camera = undefined;
    try {
      camera = await openCamera({ facingMode, width: 1280, height: 720, frameRate: 30 });
      video.srcObject = camera.stream;
      processor?.reset();
      const reconstructionProcessor: ScanProcessor = { process: (frame) => processor!.process(frame), reset: () => processor?.reset() };
      scan = new LiveScanSession(camera, reconstructionProcessor, { maxFps: 12, maxWidth: SCAN_MAX_WIDTH, onMetrics: () => { const tracking = processor?.trackingState ?? "idle"; setTrackingState(tracking === "recovering" || tracking === "lost" ? tracking : tracking === "idle" || tracking === "initializing" ? "idle" : "tracking"); } });
      scan.start(); status.textContent = `Switched to ${facingMode === "environment" ? "rear" : "front"} camera`;
    } catch {
      facingMode = prevFacing; status.textContent = "Could not switch camera.";
    }
    flipBtn.disabled = false;
  };
  start.addEventListener("click", () => void startCamera()); flipBtn.addEventListener("click", () => void flipCamera()); snapshot.addEventListener("click", captureFrame); stop.addEventListener("click", stopCamera);
  resetBtn.addEventListener("click", () => { processor?.reset(); optimizationBridge?.cancel(); latestSession = undefined; state.keyframes = 0; state.landmarks = 0; state.reconstructionVersion = 0; state.iteration = 0; state.totalIterations = 0; state.progress = 0; state.cost = undefined; state.initialCost = undefined; state.improvement = undefined; state.optimization = "idle"; updateTelemetry(); shell.querySelector<HTMLElement>("[data-metric=points]")!.textContent = "0"; mapPreview.update(undefined); downloadPlyBtn.disabled = true; status.textContent = "Scan reset — move slowly to start a new map."; });
  downloadPlyBtn.addEventListener("click", () => { if (!latestSession) return; const name = `veylune-scan-${new Date().toISOString().slice(0,19).replace(/[T:]/g,"-")}.ply`; downloadPly(name, latestSession.map, latestSession.poses, processor?.colors()); }); cancelOptimization.addEventListener("click", () => { if (!optimizationBridge) return; cancelOptimization.disabled = true; shell.querySelector<HTMLElement>("[data-metric=optimization-message]")!.textContent = "Stopping refinement…"; void optimizationBridge.cancel().then(() => { if (!shell.isConnected || state.optimization !== "idle") return; shell.querySelector<HTMLElement>("[data-metric=optimization-message]")!.textContent = "Refinement canceled. Your live map is unchanged."; }).catch(() => { if (!shell.isConnected) return; shell.querySelector<HTMLElement>("[data-metric=optimization-message]")!.textContent = "Could not stop refinement. It will finish in the background."; }); });
  const dispose = (): void => { stopCamera(); mapPreview.dispose(); shell.remove(); };
  return { element: shell, snapshots, get session() { return latestSession; }, dispose };
}
