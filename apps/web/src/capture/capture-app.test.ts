import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountCaptureApp } from "./capture-app";
import type { CapabilityProfile } from "../runtime/capabilities";

const capabilities: CapabilityProfile = { webgpu: "supported", wasm: "supported", wasmSimd: "unknown", workers: "supported", offscreenCanvas: "supported", webCodecs: "unsupported", webnn: "unsupported", sharedArrayBuffer: "unsupported", crossOriginIsolated: "unsupported", persistentStorage: "unknown" };

describe("capture app", () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  it("mounts an accessible, responsive capture workspace", () => { const root = document.createElement("div"); mountCaptureApp(root, capabilities); expect(root.querySelector("video")).toBeTruthy(); expect(root.querySelector('[data-action=start]')).toBeTruthy(); expect(root.querySelector('[data-action=snapshot]')).toBeTruthy(); expect(root.querySelector('[data-action=cancel-optimization]')).toBeTruthy(); expect(root.querySelector('[data-metric=progress]')).toBeTruthy(); expect(root.querySelector("progress[aria-label='Map refinement progress']")).toBeTruthy(); expect(root.querySelector('[aria-live=polite]')).toBeTruthy(); expect(root.querySelector("main.capture-layout")).toBeTruthy(); expect(root.textContent).toContain("Build a clear, usable 3D capture as you move."); });
  it("renders running and recovering optimization states in plain language", () => {
    const root = document.createElement("div");
    const app = mountCaptureApp(root, capabilities, { optimization: "running", progress: 0.6, iteration: 3, totalIterations: 5, cost: 4.125, initialCost: 10, improvement: 5.875, tracking: "recovering" });
    expect(root.querySelector(".refinement-panel")?.getAttribute("data-phase")).toBe("running");
    expect(root.querySelector('[data-metric=optimization]')?.textContent).toBe("Refining");
    expect((root.querySelector('[data-metric=progress-bar]') as HTMLProgressElement).value).toBe(60);
    expect(root.querySelector('[data-metric=iterations]')?.textContent).toBe("3 of 5 iterations");
    expect(root.querySelector('[data-metric=optimization-message]')?.textContent).toContain("keep scanning");
    expect(root.querySelector('[data-action=cancel-optimization]')?.hasAttribute("disabled")).toBe(false);
    expect(root.querySelector('[data-metric=tracking]')?.textContent).toBe("Recovering tracking");
    app.dispose();
  });
  it("keeps the finished scan visible after stop — stats and export survive, refinement resets", () => {
    const root = document.createElement("div");
    const app = mountCaptureApp(root, capabilities, { keyframes: 7, landmarks: 42, reconstructionVersion: 3, tracking: "tracking", optimization: "running", iteration: 3, totalIterations: 5, progress: 0.6 });
    // jsdom swallows clicks on disabled buttons; a live scan would have the
    // stop control enabled, so enable it the same way startCamera does.
    root.querySelector<HTMLButtonElement>('[data-action=stop]')!.disabled = false;
    root.querySelector<HTMLButtonElement>('[data-action=stop]')!.click();
    // The scan result stays on screen so it can be saved or exported.
    expect(root.querySelector('[data-metric=keyframes]')?.textContent).toBe("7");
    expect(root.querySelector('[data-metric=points]')?.textContent).toBe("42");
    expect(root.querySelector(".capture-status")?.textContent).toBe("Camera stopped");
    // Refinement-only numbers describe the worker, not the map — those reset.
    expect(root.querySelector('[data-metric=iterations]')?.textContent).toBe("0 of 0 iterations");
    expect((root.querySelector("progress[aria-label='Map refinement progress']") as HTMLProgressElement).value).toBe(0);
    // Stopped controls: start available again, capture controls off, reset
    // stays enabled so the kept result can be cleared deliberately.
    expect(root.querySelector('[data-action=start]')?.hasAttribute("disabled")).toBe(false);
    expect(root.querySelector('[data-action=snapshot]')?.hasAttribute("disabled")).toBe(true);
    expect(root.querySelector('[data-action=reset]')?.hasAttribute("disabled")).toBe(false);
    app.dispose();
  });
  it("cleans up the mounted app", () => { const root = document.createElement("div"); const app = mountCaptureApp(root, capabilities); app.dispose(); expect(root.childElementCount).toBe(0); });
});
