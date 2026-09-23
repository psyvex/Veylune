import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountCaptureApp } from "./capture-app";
import type { CapabilityProfile } from "../runtime/capabilities";

const capabilities: CapabilityProfile = { webgpu: "supported", wasm: "supported", wasmSimd: "unknown", workers: "supported", offscreenCanvas: "supported", webCodecs: "unsupported", webnn: "unsupported", sharedArrayBuffer: "unsupported", crossOriginIsolated: "unsupported", persistentStorage: "unknown" };

describe("capture app", () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  it("mounts live scan controls", () => { const root = document.createElement("div"); mountCaptureApp(root, capabilities); expect(root.querySelector("video")).toBeTruthy(); expect(root.querySelector('[data-action=start]')).toBeTruthy(); expect(root.querySelector('[data-action=snapshot]')).toBeTruthy(); expect(root.textContent).toContain("Local-first 3D capture"); });
  it("cleans up the mounted app", () => { const root = document.createElement("div"); const app = mountCaptureApp(root, capabilities); app.dispose(); expect(root.childElementCount).toBe(0); });
});
