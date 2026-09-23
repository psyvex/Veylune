import { describe, expect, it } from "vitest";
import { sha256Hex } from "./indexeddb";

describe("indexeddb storage primitives", () => {
  it("computes deterministic SHA-256 artifact hashes", async () => {
    const data = new TextEncoder().encode("Veylune").buffer;
    expect(await sha256Hex(data)).toBe("e03ad985248e9d1e311869df824f075b04b1c6928f64eccf171c70de29905e81");
  });
});
