import { describe, expect, it } from "vitest";
import { mountPointCloudViewer } from "./point-cloud-viewer";

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

describe("mountPointCloudViewer", () => {
  it("mounts a disabled toolbar, never throws, and settles unavailable without real WebGL", async () => {
    // jsdom has no real WebGL context, so once the dynamic three.js import resolves,
    // constructing a WebGLRenderer fails and the viewer settles into its no-op
    // fallback (docs/06-roadmap-and-acceptance.md's capability-aware fallback
    // requirement) rather than throwing. The toolbar still renders — visible but
    // disabled — so the DOM shape matches the WebGL path.
    const container = document.createElement("div");
    const fallback = document.createElement("p");
    fallback.textContent = "start a scan";
    container.append(fallback);
    const viewer = mountPointCloudViewer(container);

    const buttons = [...container.querySelectorAll<HTMLButtonElement>("button[data-pcv-action]")];
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.every((button) => button.disabled)).toBe(true);

    expect(() => viewer.update(undefined, new Map())).not.toThrow();
    await flush();

    expect(viewer.available).toBe(false);
    // No-op actions must be callable and inert; the caller's fallback copy survives.
    expect(() => {
      viewer.zoomIn(); viewer.zoomOut(); viewer.fit(); viewer.resetView();
      viewer.setAutoRotate(true); viewer.setLayer("grid", false);
    }).not.toThrow();
    expect(container.contains(fallback)).toBe(true);
    expect(container.querySelector("canvas")).toBeNull();
    expect(() => viewer.dispose()).not.toThrow();
    expect(container.querySelector(".pcv-toolbar")).toBeNull();
    expect(container.contains(fallback)).toBe(true);
  });

  it("expands on request and collapses on Escape", () => {
    const container = document.createElement("div");
    const viewer = mountPointCloudViewer(container);
    viewer.setExpanded(true);
    expect(container.dataset.pcvExpanded).toBe("true");
    const expandButton = container.querySelector<HTMLButtonElement>('[data-pcv-action="expand"]')!;
    expect(expandButton.getAttribute("aria-pressed")).toBe("true");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(container.dataset.pcvExpanded).toBeUndefined();
    expect(expandButton.getAttribute("aria-pressed")).toBe("false");
    viewer.dispose();
  });

  it("is safe to update and dispose repeatedly, before and after the load settles", async () => {
    const container = document.createElement("div");
    const viewer = mountPointCloudViewer(container);
    viewer.update(undefined);
    viewer.update(undefined);
    await flush();
    viewer.update(undefined);
    viewer.dispose();
    expect(() => viewer.dispose()).not.toThrow();
  });
});
