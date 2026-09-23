import type { CameraIntrinsics } from "./geometry";
import type { CameraPose } from "./triangulation";
import type { Landmark } from "./map";
import type { BundleAdjustmentObservation } from "./bundle-adjustment";
import type { RadialTangentialDistortion } from "./distortion";
import { projectDistortedPoint } from "./distortion";

export interface CameraBlock {
  readonly id: string;
  readonly intrinsics: CameraIntrinsics;
  readonly distortion: RadialTangentialDistortion;
  readonly pose: CameraPose;
  readonly fixed: boolean;
}

export interface BundleProblem {
  readonly cameras: readonly CameraBlock[];
  readonly landmarks: readonly Landmark[];
  readonly observations: readonly BundleAdjustmentObservation[];
}

export interface BundleResidual {
  readonly landmarkId: string;
  readonly cameraId: string;
  readonly residualX: number;
  readonly residualY: number;
  readonly valid: boolean;
}

export function computeBundleResiduals(problem: BundleProblem): readonly BundleResidual[] {
  const cameras = new Map(problem.cameras.map((camera) => [camera.id, camera]));
  const landmarks = new Map(problem.landmarks.map((landmark) => [landmark.id, landmark]));
  const residuals: BundleResidual[] = [];

  for (const observation of problem.observations) {
    const camera = cameras.get(observation.cameraId);
    const landmark = landmarks.get(observation.landmarkId);
    if (!camera || !landmark) {
      residuals.push({ landmarkId: observation.landmarkId, cameraId: observation.cameraId, residualX: 0, residualY: 0, valid: false });
      continue;
    }

    const projected = projectWorldPoint(landmark, camera);
    if (!projected) {
      residuals.push({ landmarkId: landmark.id, cameraId: camera.id, residualX: 0, residualY: 0, valid: false });
      continue;
    }

    residuals.push({
      landmarkId: landmark.id,
      cameraId: camera.id,
      residualX: projected[0] - observation.observedX,
      residualY: projected[1] - observation.observedY,
      valid: Number.isFinite(projected[0]) && Number.isFinite(projected[1]),
    });
  }
  return residuals;
}

function projectWorldPoint(landmark: Landmark, camera: CameraBlock): readonly [number, number] | undefined {
  const rotation = camera.pose.rotation;
  const translation = camera.pose.translation;
  const x = rotation[0]! * landmark.x + rotation[1]! * landmark.y + rotation[2]! * landmark.z + translation[0]!;
  const y = rotation[3]! * landmark.x + rotation[4]! * landmark.y + rotation[5]! * landmark.z + translation[1]!;
  const z = rotation[6]! * landmark.x + rotation[7]! * landmark.y + rotation[8]! * landmark.z + translation[2]!;
  return projectDistortedPoint([x, y, z], camera.intrinsics, camera.distortion);
}
