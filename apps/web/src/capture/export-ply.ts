import type { LocalMapSnapshot } from "./map";
import type { PoseGraphSnapshot } from "./keyframe-pose";

export type LandmarkColor = readonly [number, number, number];
const DEFAULT_POINT_COLOR: LandmarkColor = [99, 179, 237];

export function exportPointCloudPly(map: LocalMapSnapshot, poses?: PoseGraphSnapshot, colors?: ReadonlyMap<string, LandmarkColor>): string {
  // Single-observation landmarks are single-ray guesses, not triangulated
  // points — keep them out of the exported cloud.
  const points = map.landmarks.filter((landmark) => landmark.observations >= 2);
  const cameras = poses?.poses ?? [];

  const vertexCount = points.length + cameras.length;
  const lines: string[] = [
    "ply",
    "format ascii 1.0",
    // Provenance disclosure groundwork for EU AI Act Article 50 (see
    // docs/75-production-task-pipeline.md task 50): every point here comes
    // from real multi-view triangulation against camera frames, not a
    // generative model, so it is EvidenceState::Observed, not Generated.
    // This comment is the only disclosure surface that exists so far —
    // it is not itself a compliance certification.
    "comment provenance=observed generator=veylune-capture-pipeline",
    `element vertex ${vertexCount}`,
    "property float x",
    "property float y",
    "property float z",
    "property uchar red",
    "property uchar green",
    "property uchar blue",
    "end_header",
  ];

  for (const pt of points) {
    const c = colors?.get(pt.id) ?? DEFAULT_POINT_COLOR;
    lines.push(`${pt.x.toFixed(6)} ${pt.y.toFixed(6)} ${pt.z.toFixed(6)} ${c[0]} ${c[1]} ${c[2]}`);
  }
  for (const kf of cameras) {
    const t = kf.pose.translation;
    lines.push(`${t[0].toFixed(6)} ${t[1].toFixed(6)} ${t[2].toFixed(6)} 255 120 80`);
  }

  return lines.join("\n") + "\n";
}

export function downloadPly(filename: string, map: LocalMapSnapshot, poses?: PoseGraphSnapshot, colors?: ReadonlyMap<string, LandmarkColor>): void {
  const content = exportPointCloudPly(map, poses, colors);
  const blob = new Blob([content], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
