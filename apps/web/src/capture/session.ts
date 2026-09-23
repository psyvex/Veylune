import type { CapturedFrame } from "./frame";

export type ScanState = "idle" | "capturing" | "paused" | "completed" | "cancelled";

export interface CaptureSession {
  readonly id: string;
  readonly state: ScanState;
  readonly frames: readonly CapturedFrame[];
}

export function createCaptureSession(id: string): CaptureSession {
  return { id, state: "idle", frames: [] };
}

export function acceptFrame(session: CaptureSession, frame: CapturedFrame): CaptureSession {
  if (session.state !== "capturing") return session;
  return {
    ...session,
    frames: [...session.frames, frame],
  };
}

export function startCapture(session: CaptureSession): CaptureSession {
  if (session.state === "completed" || session.state === "cancelled") return session;
  return { ...session, state: "capturing" };
}

export function pauseCapture(session: CaptureSession): CaptureSession {
  return session.state === "capturing" ? { ...session, state: "paused" } : session;
}

export function completeCapture(session: CaptureSession): CaptureSession {
  return session.state === "capturing" || session.state === "paused"
    ? { ...session, state: "completed" }
    : session;
}

export function cancelCapture(session: CaptureSession): CaptureSession {
  return { ...session, state: "cancelled" };
}
