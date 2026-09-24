import { afterEach, describe, expect, it, vi } from "vitest";
import { mountMarketingPage } from "./marketing-page";

let dispose: (() => void) | undefined;

afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
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
    expect(root.querySelectorAll('a[href^="/studio#/"]').length).toBeGreaterThanOrEqual(4);
    expect(root.querySelector("#privacy")?.textContent).toContain("stay with you");
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
    expect(object!.getAttribute("role")).toBe("img");
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
