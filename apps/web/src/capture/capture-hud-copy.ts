export type CaptureTrackingPhase = "idle" | "tracking" | "recovering" | "lost";
export type CaptureOptimizationPhase = "idle" | "pending" | "running" | "success" | "stale" | "error";

const TRACKING_COPY: Record<CaptureTrackingPhase, { readonly label: string; readonly liveLabel: string; readonly guidance: string }> = {
  idle: { label: "Waiting for camera", liveLabel: "Camera off", guidance: "Ready to scan. Start the camera when you are set." },
  tracking: { label: "Tracking scene", liveLabel: "Scanning", guidance: "Tracking the scene. Move slowly around your subject." },
  recovering: { label: "Recovering tracking", liveLabel: "Reacquiring", guidance: "Tracking is unstable. Hold steady while Veylune reacquires features." },
  lost: { label: "Tracking paused", liveLabel: "Paused", guidance: "Tracking paused. Reframe your subject and move slowly to resume." },
};

const OPTIMIZATION_COPY: Record<CaptureOptimizationPhase, { readonly label: string; readonly message: string }> = {
  idle: { label: "Waiting", message: "Capture a few keyframes to begin refining your map." },
  pending: { label: "Queued", message: "Your latest keyframes are queued for background refinement." },
  running: { label: "Refining", message: "Refining the map in the background. You can keep scanning." },
  success: { label: "Up to date", message: "Map refinement is complete. Capture can continue from the updated map." },
  stale: { label: "Needs refresh", message: "The capture changed during refinement. A fresh pass will use the latest map." },
  error: { label: "Recovering", message: "The background worker stopped. Veylune is attempting to restart it." },
};

export function describeTracking(phase: CaptureTrackingPhase) { return TRACKING_COPY[phase]; }
export function describeOptimization(phase: CaptureOptimizationPhase) { return OPTIMIZATION_COPY[phase]; }
