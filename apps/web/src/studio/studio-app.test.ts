import { afterEach, describe, expect, it, vi } from "vitest";
import type { CapabilityProfile } from "../runtime/capabilities";
import { mountStudioApp } from "./studio-app";

function stubImageDecoding(): void {
  // jsdom has no image decoder; the quality scan (studio/image-analysis.ts) only
  // needs width/height and a close() method from the bitmap, and reads pixels
  // through canvas getContext("2d"), which test-setup.ts already stubs to return
  // deterministic all-zero data — every stubbed file therefore decodes as the
  // same (blurry, underexposed) signature, which is what these tests assert on.
  vi.stubGlobal("createImageBitmap", () =>
    Promise.resolve({ width: 1200, height: 1200, close: () => {} }),
  );
}

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
  vi.unstubAllGlobals();
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
    expect(root.querySelector(".studio-shell")?.getAttribute("data-accent")).toBe("glacier");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(localStorage.getItem("veylune-theme")).toBe("glacier");
    expect(root.querySelector('[data-theme-option="glacier"]')?.getAttribute("aria-pressed")).toBe("true");
  });
});

function settle(): Promise<void> { return new Promise((resolve) => setTimeout(resolve, 0)); }

function selectFiles(root: HTMLElement, files: File[]): void {
  const input = root.querySelector<HTMLInputElement>("[data-file-input]")!;
  Object.defineProperty(input, "files", { value: files, configurable: true });
  input.dispatchEvent(new Event("change"));
}

describe("Import quality scan", () => {
  it("flags a low-quality photo and reports duplicates across the selection", async () => {
    stubImageDecoding();
    const root = document.createElement("div");
    document.body.append(root);
    dispose = mountStudioApp(root, capabilities).dispose;
    location.hash = "#/import";
    await settle();

    const a = new File([new Uint8Array([1, 2, 3])], "a.jpg", { type: "image/jpeg" });
    const b = new File([new Uint8Array([4, 5, 6])], "b.jpg", { type: "image/jpeg" });
    selectFiles(root, [a, b]);
    await settle();
    // The scan runs after the file list itself renders; give its awaited
    // createImageBitmap/analysis chain a turn to resolve for both files.
    await settle();
    await settle();

    const chip = root.querySelector('[data-file-index="0"] [data-quality-chip] .chip');
    expect(chip?.textContent).toMatch(/blurry/i);

    const note = root.querySelector<HTMLElement>("[data-scan-note]");
    expect(note?.hidden).toBe(false);
    expect(note?.textContent).toMatch(/duplicate/i);
  });

  it("never blocks import when quality scanning is unavailable", async () => {
    // No stubImageDecoding(): createImageBitmap is genuinely undefined here,
    // matching an environment where it's unsupported. The per-file catch in
    // runQualityScan must swallow that rather than let it propagate.
    const root = document.createElement("div");
    document.body.append(root);
    dispose = mountStudioApp(root, capabilities).dispose;
    location.hash = "#/import";
    await settle();

    selectFiles(root, [new File([new Uint8Array([1, 2, 3])], "a.jpg", { type: "image/jpeg" })]);
    await settle();
    await settle();

    expect(root.querySelector('[data-action="import-submit"]')).toBeTruthy();
    expect(root.querySelector('[data-file-index="0"] .file-name')?.textContent).toContain("a.jpg");
  });
});

describe("Studio identity", () => {
  it("carries the same mark as the marketing page, in the theme's own colour", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    dispose = mountStudioApp(root, capabilities).dispose;
    await settle();

    const glyph = root.querySelector<HTMLElement>(".brand-glyph")!;
    const mark = glyph.querySelector<SVGSVGElement>(".veylune-mark");
    expect(mark).toBeTruthy();
    expect(mark!.getAttribute("data-variant")).toBe("compact");
    // The sidebar link is already named, so the mark must not be read out again,
    // and the italic "V" it replaced must not still be in the DOM.
    expect(mark!.getAttribute("aria-hidden")).toBe("true");
    expect(glyph.textContent?.trim()).toBe("");
  });
});
