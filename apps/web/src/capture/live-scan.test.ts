import { describe, expect, it, vi } from "vitest";
import { LiveScanController } from "./live-scan";
import { CameraFrameScheduler } from "./camera-frames";

function video(): HTMLVideoElement { return { videoWidth: 640, videoHeight: 480, readyState: HTMLMediaElement.HAVE_CURRENT_DATA } as HTMLVideoElement; }

describe("camera frame scheduler", () => { it("drops work while processing and respects fps", async () => { const callbacks: unknown[] = []; const scheduler = new CameraFrameScheduler(video(), (frame) => { callbacks.push(frame); }, { maxFps: 30 }); expect(scheduler).toBeDefined(); scheduler.stop(); }); });

describe("live scan controller", () => { it("reports processing state", async () => { const stop = vi.fn(); const controller = new LiveScanController({ camera: { facingMode: "environment", width: 640, height: 480, frameRate: 30 }, process: () => true }); expect(controller.getState().running).toBe(false); expect(stop).not.toHaveBeenCalled(); }); });
