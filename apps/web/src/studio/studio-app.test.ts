import { afterEach, describe, expect, it } from "vitest";
import type { CapabilityProfile } from "../runtime/capabilities";
import { mountStudioApp } from "./studio-app";

const capabilities: CapabilityProfile = {
  webgpu: "unsupported", wasm: "supported", wasmSimd: "unknown", workers: "supported",
  offscreenCanvas: "supported", webCodecs: "unsupported", webnn: "unsupported",
  sharedArrayBuffer: "unsupported", crossOriginIsolated: "unsupported", persistentStorage: "unknown",
};
let dispose: (() => void) | undefined;

afterEach(() => {
  dispose?.();
  dispose = undefined;
  location.hash = "";
  document.body.innerHTML = "";
  localStorage.clear();
});

describe("Studio navigation and appearance", () => {
  it("starts on a multipage workspace with image import and capture routes", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    dispose = mountStudioApp(root, capabilities).dispose;
    await settle();

    expect(root.querySelector(".studio-sidebar nav")?.textContent).toContain("Projects");
    expect(root.querySelector(".studio-content h1")?.textContent).toContain("Make something");
    expect(root.querySelector('a[href="#/import"]')).toBeTruthy();

    location.hash = "#/import";
    await settle();
    expect(root.querySelector(".studio-content h1")?.textContent).toContain("Bring your images");
    expect(root.querySelector('[data-folder-input]')?.hasAttribute("webkitdirectory")).toBe(true);

    location.hash = "#/settings";
    await settle();
    expect(root.querySelectorAll("[data-theme-option]")).toHaveLength(3);
  });

  it("applies and persists a selected visual theme", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    dispose = mountStudioApp(root, capabilities).dispose;
    location.hash = "#/settings";
    await settle();

    root.querySelector<HTMLButtonElement>('[data-theme-option="glacier"]')?.click();
    expect(root.querySelector(".studio-shell")?.getAttribute("data-theme")).toBe("glacier");
    expect(localStorage.getItem("veylune-theme")).toBe("glacier");
    expect(root.querySelector('[data-theme-option="glacier"]')?.getAttribute("aria-pressed")).toBe("true");
  });
});

function settle(): Promise<void> { return new Promise((resolve) => setTimeout(resolve, 0)); }
