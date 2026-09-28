import { decodeImageData } from "./batch-reconstruct";
import type { LandmarkColor } from "./export-ply";
import type { ReconstructionSessionSnapshot } from "./reconstruction-session";

/**
 * Samples each landmark's color from the first keyframe image that observed it.
 * Observations are walked in source-frame order so each image is decoded at
 * most once; `maxDecodes` bounds the work on very large sets. frameToImage
 * maps pipeline frameIndex → input image index (rejected frames shift them).
 */
export async function colorizeLandmarks(
  session: ReconstructionSessionSnapshot,
  images: readonly { data: ArrayBuffer; mediaType: string }[],
  frameToImage: readonly number[],
  maxDecodes = 240,
): Promise<Map<string, LandmarkColor>> {
  const colors = new Map<string, LandmarkColor>();
  if (!images.length) return colors;
  const frameOf = new Map(session.map.keyframes.map((keyframe) => [keyframe.id, keyframe.frameIndex]));
  const ordered = [...session.observations].sort((a, b) => (frameOf.get(a.keyframeId) ?? -1) - (frameOf.get(b.keyframeId) ?? -1));
  let currentImageIndex = -1;
  let current: ImageData | undefined;
  let decodes = 0;
  for (const observation of ordered) {
    if (colors.has(observation.landmarkId)) continue;
    const frameIndex = frameOf.get(observation.keyframeId);
    if (frameIndex === undefined) continue;
    const imageIndex = frameToImage[frameIndex] ?? -1;
    if (imageIndex < 0 || imageIndex >= images.length) continue;
    if (imageIndex !== currentImageIndex) {
      if (decodes >= maxDecodes) break;
      decodes += 1;
      current = await decodeImageData(images[imageIndex]!);
      currentImageIndex = imageIndex;
    }
    if (!current) continue;
    const x = Math.max(0, Math.min(current.width - 1, Math.round(observation.x)));
    const y = Math.max(0, Math.min(current.height - 1, Math.round(observation.y)));
    const i = (y * current.width + x) * 4;
    colors.set(observation.landmarkId, [current.data[i]!, current.data[i + 1]!, current.data[i + 2]!]);
  }
  return colors;
}
