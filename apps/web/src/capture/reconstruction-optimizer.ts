import { optimizeBundle, type BundleOptimizerOptions, type BundleOptimizationResult } from "./bundle-optimizer";
import type { BundleProblem } from "./bundle-problem";
import type { ReconstructionSessionSnapshot } from "./reconstruction-session";
import { validateReconstructionSession } from "./reconstruction-session";

export interface ReconstructionOptimizationResult { readonly status: "committed" | "rejected" | "insufficient" | "cancelled"; readonly optimization: BundleOptimizationResult; readonly candidate?: ReconstructionSessionSnapshot; }
export function optimizeReconstructionSession(session: ReconstructionSessionSnapshot, options?: Partial<BundleOptimizerOptions>): ReconstructionOptimizationResult {
  if (!validateReconstructionSession(session)) return { status: "insufficient", optimization: { status: "insufficient", iterations: 0, initialCost: Infinity, finalCost: Infinity, problem: toBundleProblem(session) } };
  const optimization = optimizeBundle(toBundleProblem(session), options);
  if (optimization.status === "cancelled") return { status: "cancelled", optimization };
  if (optimization.status !== "converged" || !Number.isFinite(optimization.finalCost) || optimization.finalCost >= optimization.initialCost) return { status: optimization.status === "insufficient" ? "insufficient" : "rejected", optimization };
  return { status: "committed", optimization, candidate: fromBundleResult(session, optimization.problem) };
}
function toBundleProblem(session: ReconstructionSessionSnapshot): BundleProblem { const poseById = new Map(session.poses.poses.map((pose) => [pose.id, pose])); return { cameras: session.map.keyframes.flatMap((keyframe) => { const pose = poseById.get(keyframe.id); return pose ? [{ id: keyframe.id, intrinsics: session.calibration.intrinsics, distortion: session.calibration.distortion, pose: pose.pose, fixed: pose.fixed }] : []; }), landmarks: session.map.landmarks, observations: session.observations.map((observation) => ({ landmarkId: observation.landmarkId, cameraId: observation.keyframeId, observedX: observation.x, observedY: observation.y })) }; }
function fromBundleResult(session: ReconstructionSessionSnapshot, problem: BundleProblem): ReconstructionSessionSnapshot { const cameras = new Map(problem.cameras.map((camera) => [camera.id, camera.pose])); const landmarks = new Map(problem.landmarks.map((landmark) => [landmark.id, landmark])); return { ...session, map: { ...session.map, version: session.map.version + 1, landmarks: session.map.landmarks.map((landmark) => landmarks.get(landmark.id) ?? landmark), keyframes: session.map.keyframes.map((keyframe) => { const pose = cameras.get(keyframe.id) ?? keyframe.pose; return { ...keyframe, ...(pose ? { pose } : {}) }; }) }, poses: { ...session.poses, version: session.poses.version + 1, poses: session.poses.poses.map((pose) => ({ ...pose, pose: cameras.get(pose.id) ?? pose.pose })) }, createdAtMs: Date.now() }; }
