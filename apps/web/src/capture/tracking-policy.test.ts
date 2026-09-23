import { describe, expect, it } from "vitest";
import { KeyframePolicy } from "./keyframe-policy";
import { TrackingRecovery } from "./tracking-recovery";

describe("tracking recovery and keyframe policy", () => {
  it("recovers from a transient tracking failure", () => { const recovery = new TrackingRecovery({ successesToTrack: 2, failuresToLose: 3 }); expect(recovery.current).toBe("initializing"); recovery.accept(); expect(recovery.current).toBe("initializing"); recovery.accept(); expect(recovery.current).toBe("tracking"); recovery.reject(); expect(recovery.current).toBe("recovering"); recovery.accept(); expect(recovery.current).toBe("recovering"); recovery.accept(); expect(recovery.current).toBe("tracking"); });
  it("resets after sustained tracking loss", () => { const recovery = new TrackingRecovery({ failuresToLose: 2 }); recovery.accept(); recovery.accept(); recovery.reject(); expect(recovery.current).toBe("recovering"); recovery.reject(); expect(recovery.current).toBe("lost"); });
  it("requires meaningful motion or elapsed time before inserting a keyframe", () => { const policy = new KeyframePolicy({ minConfidence: 0.5, minInliers: 8, minTranslation: 0.1, minRotationRad: 0.2, maxIntervalMs: 1000 }); const base = { confidence: 0.9, inliers: 20, translationDelta: 0.01, rotationDeltaRad: 0.01, elapsedMs: 100 }; expect(policy.shouldInsert(base)).toBe(false); expect(policy.shouldInsert({ ...base, translationDelta: 0.11 })).toBe(true); expect(policy.shouldInsert({ ...base, elapsedMs: 1001 })).toBe(true); expect(policy.shouldInsert({ ...base, confidence: 0.2, translationDelta: 1 })).toBe(false); });
});
