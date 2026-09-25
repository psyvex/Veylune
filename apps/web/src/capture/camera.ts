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

export async function enumerateVideoInputs(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === "videoinput");
}

export async function openCamera(constraints: CameraConstraints): Promise<CameraSession> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera capture is not supported by this browser.");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: constraints.facingMode },
      width: { ideal: constraints.width },
      height: { ideal: constraints.height },
      frameRate: { ideal: constraints.frameRate, max: constraints.frameRate },
    },
  });

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
