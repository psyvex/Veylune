import { describe, expect, it } from "vitest";
import { mountPointCloudViewer } from "./point-cloud-viewer";

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

describe("mountPointCloudViewer", () => {
  it("never throws mounting, updating, or disposing, and settles unavailable without real WebGL", async () => {
    // jsdom has no real WebGL context, so once the dynamic three.js import resolves,
    // constructing a WebGLRenderer fails and the viewer settles into its no-op
    // fallback (docs/06-roadmap-and-acceptance.md's capability-aware fallback
    // requirement) rather than throwing.
    const container = document.createElement("div");
    const viewer = mountPointCloudViewer(container);

    expect(() => viewer.update(undefined)).not.toThrow();
    await flush();

    expect(viewer.available).toBe(false);
    expect(() => viewer.dispose()).not.toThrow();
    // A no-op viewer must never touch the container, so any static fallback
    // markup a caller already put there survives.
    expect(container.childElementCount).toBe(0);
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
