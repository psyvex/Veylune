import type { LocalMapSnapshot } from "./map";
import type { PoseGraphSnapshot } from "./keyframe-pose";

export function exportPointCloudPly(map: LocalMapSnapshot, poses?: PoseGraphSnapshot): string {
  const points = map.landmarks;
  const cameras = poses?.poses ?? [];

  const vertexCount = points.length + cameras.length;
  const lines: string[] = [
    "ply",
    "format ascii 1.0",
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
    lines.push(`${pt.x.toFixed(6)} ${pt.y.toFixed(6)} ${pt.z.toFixed(6)} 99 179 237`);
  }
  for (const kf of cameras) {
    const t = kf.pose.translation;
    lines.push(`${t[0].toFixed(6)} ${t[1].toFixed(6)} ${t[2].toFixed(6)} 255 120 80`);
  }

  return lines.join("\n") + "\n";
}

export function downloadPly(filename: string, map: LocalMapSnapshot, poses?: PoseGraphSnapshot): void {
  const content = exportPointCloudPly(map, poses);
  const blob = new Blob([content], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
