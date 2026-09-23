import { describe, expect, it } from "vitest";
import { commitBundleOptimization } from "./bundle-commit";
import type { BundleProblem } from "./bundle-problem";
import type { BundleOptimizationResult } from "./bundle-optimizer";
import { LocalMap } from "./map";

function problem(): BundleProblem {
  return {
    cameras: [],
    landmarks: [{ id: "p", x: 0.01, y: 0, z: 2.01, observations: 2, lastSeenFrame: 1 }],
    observations: [],
  };
}

function result(overrides: Partial<BundleOptimizationResult> = {}): BundleOptimizationResult {
  return {
    status: "converged",
    iterations: 2,
    initialCost: 10,
    finalCost: 5,
    problem: problem(),
    ...overrides,
  };
}

describe("bundle optimization commit", () => {
  it("commits an improved safe landmark result", () => {
    const map = new LocalMap();
    map.upsertLandmark("p", { x: 0, y: 0, z: 2 }, 1);
    const committed = commitBundleOptimization(map, result());
    expect(committed).toEqual({ committed: true, reason: "committed" });
    expect(map.getLandmark("p")?.z).toBe(2.01);
  });

  it("rejects unsafe depth changes without mutating the map", () => {
    const map = new LocalMap();
    map.upsertLandmark("p", { x: 0, y: 0, z: 2 }, 1);
    const rejected = commitBundleOptimization(map, result({ problem: { ...problem(), landmarks: [{ ...problem().landmarks[0]!, z: 4 }] } }));
    expect(rejected).toEqual({ committed: false, reason: "unsafe-landmark-update" });
    expect(map.getLandmark("p")?.z).toBe(2);
  });

  it("rejects non-improving optimizer output", () => {
    const map = new LocalMap();
    map.upsertLandmark("p", { x: 0, y: 0, z: 2 }, 1);
    const rejected = commitBundleOptimization(map, result({ finalCost: 10 }));
    expect(rejected).toEqual({ committed: false, reason: "no-improvement" });
  });
});
