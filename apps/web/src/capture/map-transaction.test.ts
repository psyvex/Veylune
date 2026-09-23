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
});
