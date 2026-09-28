import { describe, expect, it } from "vitest";
import { loadSyntheticOptimizationFixture } from "./optimization-fixtures";
import { prepareBundleAdjustment } from "./bundle-adjustment";

describe("loadSyntheticOptimizationFixture", () => {
  it("loads the checked-in benchmarks/fixtures JSON with enough data to run bundle adjustment", async () => {
    const fixture = await loadSyntheticOptimizationFixture();
    expect(fixture.landmarks.length).toBeGreaterThan(0);
    expect(fixture.observations.length).toBeGreaterThan(0);
    expect(prepareBundleAdjustment(fixture).status).toBe("not-run");
  });
});
