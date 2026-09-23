import type { CapturedFrame } from "./frame";

export interface ScanMetrics {
  readonly acceptedFrames: number;
  readonly rejectedFrames: number;
  readonly duplicateFrames: number;
  readonly coverage: number;
  readonly lastAcceptedAt?: number;
}

export interface ScanDecision {
  readonly accept: boolean;
  readonly duplicate: boolean;
  readonly reason: "quality" | "duplicate" | "coverage" | "accepted";
}

export interface ScanState {
  readonly metrics: ScanMetrics;
  readonly lastSignature?: Uint8Array;
}

function signature(frame: CapturedFrame): Uint8Array {
  const canvas = new OffscreenCanvas(16, 16);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return new Uint8Array();
  context.drawImage(frame.image, 0, 0, 16, 16);
  return context.getImageData(0, 0, 16, 16).data;
}

function distance(a: Uint8Array | undefined, b: Uint8Array): number {
  if (!a || a.length !== b.length) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (let i = 0; i < b.length; i += 4) sum += Math.abs(a[i]! - b[i]!);
  return sum / (b.length / 4);
}

export function evaluateScanFrame(
  state: ScanState,
  frame: CapturedFrame,
  usable: boolean,
): { readonly state: ScanState; readonly decision: ScanDecision } {
  if (!usable) {
    return {
      state: { ...state, metrics: { ...state.metrics, rejectedFrames: state.metrics.rejectedFrames + 1 } },
      decision: { accept: false, duplicate: false, reason: "quality" },
    };
  }

  const nextSignature = signature(frame);
  const duplicate = distance(state.lastSignature, nextSignature) < 6;
  if (duplicate) {
    return {
      state: { ...state, metrics: { ...state.metrics, duplicateFrames: state.metrics.duplicateFrames + 1 } },
      decision: { accept: false, duplicate: true, reason: "duplicate" },
    };
  }

  return {
    state: {
      lastSignature: nextSignature,
      metrics: {
        ...state.metrics,
        acceptedFrames: state.metrics.acceptedFrames + 1,
        coverage: Math.min(1, (state.metrics.acceptedFrames + 1) / 24),
        lastAcceptedAt: performance.now(),
      },
    },
    decision: { accept: true, duplicate: false, reason: "accepted" },
  };
}
