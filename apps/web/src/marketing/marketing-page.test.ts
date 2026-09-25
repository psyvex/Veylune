import { afterEach, describe, expect, it, vi } from "vitest";
import { formatPoseReadout, INITIAL_POSE } from "./spatial-scene";
import { mountMarketingPage } from "./marketing-page";

let dispose: (() => void) | undefined;

afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mountPage(): HTMLElement {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => null);
  const root = document.createElement("div");
  document.body.append(root);
  dispose = mountMarketingPage(root).dispose;
  return root;
}

describe("Veylune marketing page", () => {
  it("introduces the spatial workflow through a full-width interactive scene", () => {
    const root = mountPage();

    expect(root.querySelector("main h1")?.textContent).toContain("See a space");
    expect(root.querySelector(".spatial-canvas")?.getAttribute("aria-label")).toMatch(/press and hold/i);
    expect(root.querySelector(".spatial-canvas")?.getAttribute("aria-label")).toMatch(/drag/i);
    expect(root.querySelector(".spatial-canvas")?.getAttribute("aria-label")).toMatch(/360 degrees/i);
    expect(root.querySelector(".scene-caption")?.textContent).toContain("DRAG TO ORBIT");
    expect(root.querySelector(".marketing-hero")?.querySelector(".hero-intro")).toBeTruthy();
    expect(root.querySelectorAll(".feature-card")).toHaveLength(3);
    expect(root.querySelectorAll('a[href^="/studio/"]').length).toBeGreaterThanOrEqual(4);
    expect(root.querySelector("#privacy")?.textContent).toContain("stay with you");
  });

  it("lays the hero out as a column, with the copy under the scene it describes", () => {
    const root = mountPage();
    const stage = root.querySelector<HTMLElement>(".hero-stage")!;
    const copy = root.querySelector<HTMLElement>(".hero-intro")!;
    // Same section, and the copy after the whole visual block in document order — the
    // reading order is the layout, not something the stylesheet has to argue for.
    expect(stage.contains(root.querySelector(".spatial-canvas"))).toBe(true);
    expect(stage.compareDocumentPosition(copy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Nothing washes over the scene or floats on it any more.
    expect(root.querySelector(".scene-vignette")).toBeNull();
    expect(root.querySelectorAll(".hero-enhancement, .hero-data-card, .scene-callout")).toHaveLength(0);
  });

  it("keeps the annotation layer decorative, so the canvas is the only thing named", () => {
    const root = mountPage();
    const annotations = root.querySelector<HTMLElement>(".hero-annotations")!;
    expect(root.querySelectorAll(".hero-note").length).toBeGreaterThanOrEqual(4);
    expect(annotations.getAttribute("aria-hidden")).toBe("true");
    expect(annotations.contains(root.querySelector(".spatial-canvas"))).toBe(false);
    // One heading for the hero: the stage label lost its h2 so the page has a single
    // place to point a reader, and the canvas carries the description.
    expect(root.querySelectorAll(".marketing-hero h1, .marketing-hero h2")).toHaveLength(1);
  });

  it("names the keyframe rail it belongs to in the hero detail strip", () => {
    const root = mountPage();
    expect(root.querySelector(".hero-detail")?.textContent).toContain("KEYFRAME RAIL");
    expect(root.querySelector(".hero-detail")?.getAttribute("aria-hidden")).toBe("true");
    expect(root.querySelectorAll(".frame-rail li")).toHaveLength(8);
  });

  it("keeps the compact navigation keyboard accessible", () => {
    const root = mountPage();
    const button = root.querySelector<HTMLButtonElement>(".marketing-menu-toggle")!;
    const nav = root.querySelector<HTMLElement>(".marketing-nav")!;

    expect(button.getAttribute("aria-expanded")).toBe("false");
    button.click();
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(nav.classList.contains("is-open")).toBe(true);
    nav.querySelector<HTMLAnchorElement>('a[href="#product"]')!.click();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(nav.classList.contains("is-open")).toBe(false);
  });

  it("switches the scene explanation and selected reconstruction stage", () => {
    const root = mountPage();
    const align = root.querySelector<HTMLButtonElement>('[data-scene-step="1"]')!;
    align.click();

    expect(root.querySelector("[data-step-title]")?.textContent).toBe("Align the views");
    expect(root.querySelector("[data-scene-caption]")?.textContent).toBe("POSE GRAPH / ALIGNED VIEWS");
    expect(align.getAttribute("aria-pressed")).toBe("true");
    expect(root.querySelector('[data-scene-step="0"]')?.getAttribute("aria-pressed")).toBe("false");
  });
});

describe("Veylune identity on the marketing page", () => {
  it("replaces the letter mark with the shared geometry, twice, as decoration", () => {
    const root = mountPage();
    const marks = root.querySelectorAll(".marketing-mark .veylune-mark");
    expect(marks).toHaveLength(2); // header and footer
    marks.forEach((mark) => {
      // The word sits beside it, and the links name themselves, so the mark itself
      // must not be announced a second time.
      expect(mark.getAttribute("aria-hidden")).toBe("true");
      expect(mark.getAttribute("data-variant")).toBe("compact");
    });
    // Nothing but the geometry is inside: the italic "V" it replaces is gone, not
    // layered behind the mark where it would still print.
    root.querySelectorAll(".marketing-mark").forEach((slot) => {
      expect(slot.textContent?.trim()).toBe("");
      expect(slot.querySelector("svg")).toBeTruthy();
    });
  });

  it("shows the object in the privacy section instead of orbiting rings", () => {
    const root = mountPage();
    expect(root.querySelectorAll(".privacy-orbit")).toHaveLength(0);
    const mark = root.querySelector("#privacy .privacy-mark .veylune-mark");
    expect(mark).toBeTruthy();
    expect(mark!.getAttribute("data-variant")).toBe("full");
    // jsdom has no IntersectionObserver, so the page assembles its identity marks
    // immediately; the scroll path that leaves them scattered first is covered in
    // "Veylune identity assembly on scroll".
    expect(mark!.getAttribute("data-state")).toBe("stable");
  });

  it("offers the closing section's identity as something you can grab", () => {
    const root = mountPage();
    expect(root.querySelectorAll(".closing-orb")).toHaveLength(0);
    const object = root.querySelector<HTMLElement>(".closing-object .voxel-object");
    expect(object).toBeTruthy();
    expect(object!.getAttribute("role")).toBe("group");
    expect(object!.getAttribute("aria-label")).toMatch(/press and hold/i);
    expect(object!.querySelector(".veylune-mark")).toBeTruthy();
    // Nothing follows the cursor: the object only ever turns on a drag.
    expect(object!.querySelector<HTMLElement>(".voxel-object-stage")!.style.transform).toContain("rotateX(");
  });

  it("gives the identity object away with the page", () => {
    const root = mountPage();
    expect(root.querySelector(".closing-object .voxel-object")).toBeTruthy();
    dispose?.();
    dispose = undefined;
    expect(root.querySelector(".closing-object .voxel-object")).toBeNull();
  });
});

describe("the readout that reports the scene's pose", () => {
  // A page whose canvas actually paints: getContext hands back something that swallows
  // drawing, and the animation loop is stubbed so the only frame that ever runs is the
  // one this test causes. Everything else about the page is real.
  function mountLivePage(): HTMLElement {
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => new Proxy({}, {
      get: (target, key) => (key in target ? (target as Record<string | symbol, unknown>)[key] : () => undefined),
      set: (target, key, value) => { (target as Record<string | symbol, unknown>)[key] = value; return true; },
    }) as unknown as CanvasRenderingContext2D);
    const root = document.createElement("div");
    document.body.append(root);
    dispose = mountMarketingPage(root).dispose;
    return root;
  }

  it("reports the pose the scene opened on, in degrees", () => {
    const root = mountLivePage();
    expect(root.querySelector("[data-scene-pose]")?.textContent).toBe(formatPoseReadout(INITIAL_POSE.yaw, INITIAL_POSE.pitch));
  });

  it("follows the scene instead of showing a pose of its own", () => {
    const root = mountLivePage();
    const readout = root.querySelector("[data-scene-pose]")!;
    const opened = readout.textContent;

    root.querySelector<HTMLCanvasElement>(".spatial-canvas")!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", cancelable: true }));

    // One arrow step is 0.12 rad of *intended* rotation, and a single frame of easing
    // (16%) has been applied to it. Anything else in this string is a number the page
    // made up rather than the one the scene is at.
    expect(readout.textContent).toBe(formatPoseReadout(INITIAL_POSE.yaw + 0.12 * 0.16, INITIAL_POSE.pitch));
    expect(readout.textContent).not.toBe(opened);
  });

  it("still reads out a pose when the canvas cannot paint at all", () => {
    // No 2d context means no frames, and a readout that only ever updates on a frame
    // would be blank; it reports the pose the scene would have opened on.
    const root = mountPage();
    expect(root.querySelector("[data-scene-pose]")?.textContent).toBe(formatPoseReadout(INITIAL_POSE.yaw, INITIAL_POSE.pitch));
  });
});

describe("Veylune identity assembly on scroll", () => {
  class FakeObserver {
    static instances: FakeObserver[] = [];
    readonly targets = new Set<Element>();
    constructor(private readonly callback: IntersectionObserverCallback) {
      FakeObserver.instances.push(this);
    }
    observe(target: Element): void { this.targets.add(target); }
    unobserve(target: Element): void { this.targets.delete(target); }
    disconnect(): void { this.targets.clear(); }
    takeRecords(): IntersectionObserverEntry[] { return []; }
    root = null;
    rootMargin = "";
    thresholds: number[] = [];
    reveal(): void {
      this.targets.forEach((target) => {
        this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
      });
    }
  }

  it("starts scattered and assembles once, when the section is reached", () => {
    FakeObserver.instances.length = 0;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => null);
    vi.stubGlobal("IntersectionObserver", FakeObserver);

    const root = document.createElement("div");
    document.body.append(root);
    dispose = mountMarketingPage(root).dispose;

    const mark = root.querySelector<SVGSVGElement>("#privacy .veylune-mark")!;
    // Waiting, not decorative motion: the mark holds its scattered pose until the
    // reader gets to it, then builds.
    expect(mark.getAttribute("data-state")).toBe("bloom");

    FakeObserver.instances.forEach((observer) => observer.reveal());
    expect(mark.getAttribute("data-state")).toBe("stable");

    // One time only — an identity that re-assembles every scroll is a loader.
    mark.setAttribute("data-state", "bloom");
    FakeObserver.instances.forEach((observer) => observer.reveal());
    expect(mark.getAttribute("data-state")).toBe("bloom");

    vi.unstubAllGlobals();
  });
});
