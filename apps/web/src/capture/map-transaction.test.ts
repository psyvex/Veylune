import { describe, expect, it } from "vitest";
import { LocalMap, validateSnapshot } from "./map";
import { beginMapTransaction, commitMapTransaction } from "./map-transaction";

describe("local map transactions", () => {
  it("rejects stale transactions", () => {
    const map = new LocalMap();
    const transaction = beginMapTransaction(map);
    map.clear();
    expect(commitMapTransaction(map, transaction, transaction.candidate)).toBe(false);
  });

  it("rejects invalid candidate snapshots", () => {
    const snapshot = { version: 0, landmarks: [{ id: "bad", x: 0, y: 0, z: -1, observations: 1, lastSeenFrame: 0 }], keyframes: [] };
    expect(validateSnapshot(snapshot)).toBe(false);
  });

  it("counts triangulation views on upsert", () => {
    const map = new LocalMap();
    // A keyframe pair triangulates from two views — the first insert must
    // already satisfy the export gate (observations >= 2), or the PLY comes
    // out with zero landmark vertices.
    expect(map.upsertLandmark("lm:pair", { x: 1, y: 0, z: 2 }, 1, 2).observations).toBe(2);
    // A later re-observation adds its own views on top.
    expect(map.upsertLandmark("lm:pair", { x: 1, y: 0, z: 2 }, 2, 1).observations).toBe(3);
    // Legacy default stays single-count.
    expect(map.upsertLandmark("lm:other", { x: 0, y: 1, z: 1 }, 1).observations).toBe(1);
  });
});
