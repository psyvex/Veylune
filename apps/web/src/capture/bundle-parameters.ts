import type { BundleProblem, CameraBlock } from "./bundle-problem";

export interface ParameterBlock {
  readonly id: string;
  readonly kind: "camera-translation" | "landmark";
  readonly offset: number;
  readonly size: number;
  readonly fixed: boolean;
}

export interface BundleParameterLayout {
  readonly blocks: readonly ParameterBlock[];
  readonly values: Float64Array;
}

export function buildBundleParameterLayout(problem: BundleProblem): BundleParameterLayout {
  const blocks: ParameterBlock[] = [];
  const values: number[] = [];
  let offset = 0;

  for (const camera of problem.cameras) {
    if (camera.fixed) continue;
    blocks.push({ id: camera.id, kind: "camera-translation", offset, size: 3, fixed: false });
    values.push(...camera.pose.translation);
    offset += 3;
  }

  for (const landmark of problem.landmarks) {
    blocks.push({ id: landmark.id, kind: "landmark", offset, size: 3, fixed: false });
    values.push(landmark.x, landmark.y, landmark.z);
    offset += 3;
  }

  return { blocks, values: new Float64Array(values) };
}

export function findParameterBlock(layout: BundleParameterLayout, id: string): ParameterBlock | undefined {
  return layout.blocks.find((block) => block.id === id);
}
