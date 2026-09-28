import { describe, expect, it } from "vitest";
import { exportPointCloudPly } from "./export-ply";
import type { LocalMapSnapshot } from "./map";
import type { PoseGraphSnapshot } from "./keyframe-pose";

const map: LocalMapSnapshot = {
  version: 3,
  landmarks: [
    { id: "a", x: 1, y: 2, z: 3, observations: 2, lastSeenFrame: 5 },
    { id: "b", x: -1, y: 0.5, z: 4, observations: 7, lastSeenFrame: 9 },
    { id: "single", x: 9, y: 9, z: 9, observations: 1, lastSeenFrame: 2 },
  ],
  keyframes: [],
};

const poses: PoseGraphSnapshot = {
  version: 2,
  poses: [
    { id: "k0", frameIndex: 0, timestampMs: 0, pose: { rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], translation: [0, 0, 0] }, fixed: true },
    { id: "k1", frameIndex: 1, timestampMs: 100, pose: { rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], translation: [0.5, 0.1, 0] }, fixed: false },
  ],
};

describe("exportPointCloudPly", () => {
  it("writes a valid ASCII PLY header with one vertex per kept point and camera", () => {
    const ply = exportPointCloudPly(map, poses);
    const lines = ply.trimEnd().split("\n");
    expect(lines[0]).toBe("ply");
    expect(lines[1]).toBe("format ascii 1.0");
    expect(lines[2]).toBe("comment provenance=observed generator=veylune-capture-pipeline");
    // Two triangulated landmarks (observations >= 2) plus two camera centers.
    expect(lines[3]).toBe("element vertex 4");
    expect(lines.slice(4, 10)).toEqual(["property float x", "property float y", "property float z", "property uchar red", "property uchar green", "property uchar blue"]);
    expect(lines[10]).toBe("end_header");
    expect(lines).toHaveLength(11 + 4);
  });

  it("excludes single-observation landmarks — they are single-ray guesses", () => {
    const ply = exportPointCloudPly(map, poses);
    const body = ply.trimEnd().split("\n").slice(11);
    expect(body).toHaveLength(4);
    expect(body.some((line) => line.startsWith("9.000000"))).toBe(false);
    expect(body[0]).toBe("1.000000 2.000000 3.000000 99 179 237");
    expect(body[2]).toBe("0.000000 0.000000 0.000000 255 120 80");
  });

  it("exports landmarks only when no pose graph is supplied", () => {
    const ply = exportPointCloudPly(map);
    expect(ply).toContain("element vertex 2");
  });

  it("uses sampled colors when provided and the default blue otherwise", () => {
    const colors = new Map<string, readonly [number, number, number]>([["a", [210, 30, 5]]]);
    const ply = exportPointCloudPly(map, undefined, colors);
    const body = ply.trimEnd().split("\n").slice(11);
    expect(body[0]).toBe("1.000000 2.000000 3.000000 210 30 5");
    expect(body[1]).toBe("-1.000000 0.500000 4.000000 99 179 237");
  });
});
