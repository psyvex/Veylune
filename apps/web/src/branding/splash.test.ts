import { afterEach, describe, expect, it, vi } from "vitest";
import { mountVeyluneSplash, type VeyluneSplash } from "./splash";

let splash: VeyluneSplash | undefined;

function mount(reduced = false): VeyluneSplash {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduced,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }));
  vi.stubGlobal("requestAnimationFrame", (run: FrameRequestCallback) => {
    run(0);
    return 1;
  });
  const host = document.createElement("div");
  document.body.append(host);
  splash = mountVeyluneSplash(host, { label: "Loading Veylune" });
  return splash;
}

const state = (): string | null =>
  splash?.element.querySelector<SVGSVGElement>(".veylune-mark")?.getAttribute("data-state") ?? null;

afterEach(() => {
  splash?.dispose();
  splash = undefined;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Veylune splash", () => {
  it("is the same geometry as the mark, with nothing else on the screen", () => {
    const element = mount().element;
    expect(element.className).toContain("veylune-splash");
    const marks = element.querySelectorAll(".veylune-mark");
    expect(marks).toHaveLength(1);
    expect(marks[0]!.getAttribute("data-variant")).toBe("full");
    expect(element.textContent).toContain("VEYLUNE");
    // No second element to animate: an assembly becomes a title card with one.
    expect(element.children).toHaveLength(2);
  });

  it("says what it is doing, in words, for assistive tech", () => {
    const element = mount().element;
    expect(element.getAttribute("role")).toBe("status");
    expect(element.getAttribute("aria-live")).toBe("polite");
    expect(element.querySelector(".veylune-mark")?.getAttribute("aria-label")).toBe("Loading Veylune");
  });

  it("plays the assembly once and then hands over", () => {
    const element = mount().element;
    // Frames run synchronously here, so the opening pose has already been replaced.
    expect(state()).toBe("bloom");
    expect(element.classList.contains("is-formed")).toBe(false);

    vi.advanceTimersByTime(300);
    expect(state()).toBe("formation");
    expect(element.classList.contains("is-formed")).toBe(true);

    // Hold, then the object un-picks itself while the overlay fades.
    vi.advanceTimersByTime(2_100);
    expect(state()).toBe("dissolve");
    expect(element.classList.contains("is-leaving")).toBe(true);
    expect(element.isConnected).toBe(true);

    vi.advanceTimersByTime(1_000);
    expect(element.isConnected).toBe(false);

    // Nothing keeps running underneath an overlay that has already left.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("can be cut short", () => {
    const element = mount().element;
    vi.advanceTimersByTime(300);
    splash!.dismiss();
    expect(element.isConnected).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    // Late timers must not resurrect it.
    vi.advanceTimersByTime(10_000);
    expect(element.isConnected).toBe(false);
  });

  it("lets the reader skip the overlay", () => {
    const element = mount().element;
    vi.advanceTimersByTime(100);
    element.click();
    expect(element.isConnected).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("takes Escape as a skip, and stops listening once it is gone", () => {
    const element = mount().element;
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    // The listener is on the window, so a document-level event must reach it.
    expect(element.isConnected).toBe(false);

    const again = mount().element;
    again.click();
    expect(again.isConnected).toBe(false);
    // A disposed splash must not keep a window listener that disposes nothing.
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shows the finished mark instead of a sequence under reduced motion", () => {
    const element = mount(true).element;
    expect(state()).toBe("stable");
    expect(element.classList.contains("is-formed")).toBe(true);
    expect(element.classList.contains("is-leaving")).toBe(false);

    vi.advanceTimersByTime(500);
    expect(element.isConnected).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
