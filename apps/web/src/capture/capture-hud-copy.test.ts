import { describe, expect, it } from "vitest";
import { describeOptimization, describeTracking } from "./capture-hud-copy";

describe("capture HUD state copy", () => {
  it("gives each tracking state a clear label and an actionable recovery message", () => {
    expect(describeTracking("idle").liveLabel).toBe("Camera off");
    expect(describeTracking("tracking").guidance).toContain("Move slowly");
    expect(describeTracking("recovering").guidance).toContain("Hold steady");
    expect(describeTracking("lost").guidance).toContain("Reframe your subject");
  });

  it("explains background refinement, stale work, and worker recovery", () => {
    expect(describeOptimization("running").message).toContain("keep scanning");
    expect(describeOptimization("stale").message).toContain("latest map");
    expect(describeOptimization("error").message).toContain("restart it");
  });
});
