export interface CapturedFrame {
  readonly timestamp: number;
  readonly image: ImageBitmap;
  readonly width: number;
  readonly height: number;
}

export interface FrameQuality {
  readonly sharpness: number;
  readonly exposure: number;
  readonly usable: boolean;
}

export async function captureFrame(video: HTMLVideoElement): Promise<CapturedFrame> {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    throw new Error("Camera frame is not ready.");
  }

  const image = await createImageBitmap(video);
  return {
    timestamp: performance.now(),
    image,
    width: image.width,
    height: image.height,
  };
}

export function assessFrame(frame: CapturedFrame): FrameQuality {
  // Initial conservative gate. Pixel-level quality analysis belongs in the worker pipeline.
  const validDimensions = frame.width >= 640 && frame.height >= 480;
  return {
    sharpness: 0,
    exposure: 0,
    usable: validDimensions,
  };
}
