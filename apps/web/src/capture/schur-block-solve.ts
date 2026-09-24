import type { SchurBlocks, BlockMatrix } from "./schur-blocks";
import { solvePositiveDefinite } from "./linear-solve";

export interface SchurBlockSolveResult {
  readonly status: "solved" | "singular" | "insufficient";
  readonly cameraStep: Float64Array;
  readonly landmarkStep: Float64Array;
}

/** Solves a bundle system whose landmark blocks are independent 3x3 blocks. */
export function solveBundleSchurBlocks(
  blocks: SchurBlocks,
  damping = 1e-3,
): SchurBlockSolveResult {
  const cameraSize = blocks.camera.rows;
  const landmarkSize = blocks.landmark.rows;
  if (cameraSize === 0 || landmarkSize === 0 || landmarkSize % 3 !== 0) {
    return { status: "insufficient", cameraStep: new Float64Array(cameraSize), landmarkStep: new Float64Array(landmarkSize) };
  }

  const reduced = new Float64Array(blocks.camera.values);
  for (let i = 0; i < cameraSize; i += 1) reduced[i * cameraSize + i] += damping;
  const reducedGradient = new Float64Array(blocks.cameraGradient);
  const landmarkCount = landmarkSize / 3;
  const inverses: Float64Array[] = [];

  for (let block = 0; block < landmarkCount; block += 1) {
    const offset = block * 3;
    const c = new Float64Array(9);
    for (let r = 0; r < 3; r += 1) for (let col = 0; col < 3; col += 1) {
      c[r * 3 + col] = blocks.landmark.values[(offset + r) * landmarkSize + offset + col] + (r === col ? damping : 0);
    }
    const inverse = invert3(c);
    if (!inverse) return { status: "singular", cameraStep: new Float64Array(cameraSize), landmarkStep: new Float64Array(landmarkSize) };
    inverses.push(inverse);

    const bg = mul3(inverse, blocks.landmarkGradient.slice(offset, offset + 3));
    for (let i = 0; i < cameraSize; i += 1) {
      const bi = blocks.cameraLandmark.values.slice(i * landmarkSize + offset, i * landmarkSize + offset + 3);
      reducedGradient[i] -= dot3(bi, bg);
      for (let j = 0; j < cameraSize; j += 1) {
        const bj = blocks.cameraLandmark.values.slice(j * landmarkSize + offset, j * landmarkSize + offset + 3);
        reduced[i * cameraSize + j] -= dot3(bi, mul3(inverse, bj));
      }
    }
  }

  const cameraStep = solvePositiveDefinite({ size: cameraSize, matrix: reduced, rhs: reducedGradient.map((value) => -value) as Float64Array });
  if (!cameraStep) return { status: "singular", cameraStep: new Float64Array(cameraSize), landmarkStep: new Float64Array(landmarkSize) };

  const landmarkStep = new Float64Array(landmarkSize);
  for (let block = 0; block < landmarkCount; block += 1) {
    const offset = block * 3;
    const rhs = blocks.landmarkGradient.slice(offset, offset + 3);
    for (let camera = 0; camera < cameraSize; camera += 1) {
      const b = blocks.cameraLandmark.values.slice(camera * landmarkSize + offset, camera * landmarkSize + offset + 3);
      for (let component = 0; component < 3; component += 1) rhs[component] += b[component]! * cameraStep[camera]!;
    }
    const local = mul3(inverses[block]!, rhs).map((value) => -value);
    landmarkStep.set(local, offset);
  }

  return { status: "solved", cameraStep, landmarkStep };
}

function invert3(a: Float64Array): Float64Array | undefined {
  const determinant = a[0]! * (a[4]! * a[8]! - a[5]! * a[7]!) - a[1]! * (a[3]! * a[8]! - a[5]! * a[6]!) + a[2]! * (a[3]! * a[7]! - a[4]! * a[6]!);
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) return undefined;
  const inv = new Float64Array(9);
  inv[0] = (a[4]! * a[8]! - a[5]! * a[7]!) / determinant;
  inv[1] = (a[2]! * a[7]! - a[1]! * a[8]!) / determinant;
  inv[2] = (a[1]! * a[5]! - a[2]! * a[4]!) / determinant;
  inv[3] = (a[5]! * a[6]! - a[3]! * a[8]!) / determinant;
  inv[4] = (a[0]! * a[8]! - a[2]! * a[6]!) / determinant;
  inv[5] = (a[2]! * a[3]! - a[0]! * a[5]!) / determinant;
  inv[6] = (a[3]! * a[7]! - a[4]! * a[6]!) / determinant;
  inv[7] = (a[1]! * a[6]! - a[0]! * a[7]!) / determinant;
  inv[8] = (a[0]! * a[4]! - a[1]! * a[3]!) / determinant;
  return inv;
}
function mul3(a: Float64Array, v: Float64Array): Float64Array { return new Float64Array([a[0]! * v[0]! + a[1]! * v[1]! + a[2]! * v[2]!, a[3]! * v[0]! + a[4]! * v[1]! + a[5]! * v[2]!, a[6]! * v[0]! + a[7]! * v[1]! + a[8]! * v[2]!]); }
function dot3(a: Float64Array, b: Float64Array): number { return a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!; }
