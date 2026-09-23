export interface FrameQualitySignal {
  readonly sharpness: number;
  readonly exposure: number;
  readonly motion: number;
  readonly usable: boolean;
}

export interface QualityInput {
  readonly width: number;
  readonly height: number;
  readonly pixels: ImageData;
}

export function estimateFrameQuality(input: QualityInput): FrameQualitySignal {
  const { data } = input.pixels;
  if (data.length === 0 || input.width < 640 || input.height < 480) {
    return { sharpness: 0, exposure: 0, motion: 0, usable: false };
  }

  let luminanceSum = 0;
  let edgeEnergy = 0;
  let previous = 0;

  for (let i = 0; i < data.length; i += 4) {
    const luminance = 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
    luminanceSum += luminance;
    if (i > 0) edgeEnergy += Math.abs(luminance - previous);
    previous = luminance;
  }

  const pixels = data.length / 4;
  const mean = luminanceSum / pixels;
  const exposure = 1 - Math.min(1, Math.abs(mean - 128) / 128);
  const sharpness = Math.min(1, edgeEnergy / (pixels * 24));

  return {
    sharpness,
    exposure,
    motion: 0,
    usable: sharpness >= 0.08 && exposure >= 0.2,
  };
}
