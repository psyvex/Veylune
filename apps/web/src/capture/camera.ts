export type CameraFacingMode = "user" | "environment";

export interface CameraConstraints {
  readonly facingMode: CameraFacingMode;
  readonly width: number;
  readonly height: number;
  readonly frameRate: number;
}

export interface CameraSession {
  readonly stream: MediaStream;
  readonly video: HTMLVideoElement;
  readonly facingMode: CameraFacingMode;
  stop(): void;
}

/** Turns a getUserMedia DOMException into something a person can act on. */
export function describeCameraError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : error instanceof Error ? error.name : "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "Camera permission was denied. Allow it in your browser's site settings, then tap Start again.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No camera found. Connect a camera or open Veylune on a device with one.";
    case "NotReadableError":
    case "TrackStartError":
      return "The camera is in use by another app. Close that app and tap Start again.";
    case "OverconstrainedError":
      return "This camera cannot provide the requested video settings. Try a different camera.";
    case "SecurityError":
      return "The browser blocked the camera for security reasons. Veylune must be opened over HTTPS.";
    default:
      return "Unable to start the camera. Check the permission prompt and your camera connection.";
  }
}

export async function enumerateVideoInputs(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === "videoinput");
}

export async function openCamera(constraints: CameraConstraints): Promise<CameraSession> {
  // getUserMedia is hidden entirely outside secure contexts, so say that
  // first — "not supported" would be wrong on an otherwise capable browser.
  if (!window.isSecureContext) {
    throw new Error("The camera needs a secure connection. Open this page over HTTPS (or on localhost) and try again.");
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera capture is not supported by this browser.");
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: constraints.facingMode },
        width: { ideal: constraints.width },
        height: { ideal: constraints.height },
        frameRate: { ideal: constraints.frameRate, max: constraints.frameRate },
      },
    });
  } catch (error) {
    throw new Error(describeCameraError(error));
  }

  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play();

  return {
    stream,
    video,
    facingMode: constraints.facingMode,
    stop() {
      for (const track of stream.getTracks()) track.stop();
      video.srcObject = null;
    },
  };
}
