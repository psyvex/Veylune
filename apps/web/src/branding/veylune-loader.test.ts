import { afterEach, describe, expect, it, vi } from "vitest";
import { mountVeyluneLoader, type VeyluneLoader, type VeyluneLoaderSize } from "./veylune-loader";

const SIZES: readonly VeyluneLoaderSize[] = ["inline", "compact", "default", "fullscreen"];

let loader: VeyluneLoader | undefined;

/**
 * `reduced` drives the branch the loader takes at mount; frames are run
 * synchronously so the sequence is driven by the timers under test alone.
 */
function mountEnvironment(reduced: boolean): void {
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
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
}

function mount(size: VeyluneLoaderSize = "default", options: { reduced?: boolean; announce?: boolean; label?: string } = {}): VeyluneLoader {
  mountEnvironment(options.reduced ?? false);
  const host = document.createElement("div");
  document.body.append(host);
  loader = mountVeyluneLoader(host, {
    size,
    ...(options.announce === undefined ? {} : { announce: options.announce }),
    ...(options.label === undefined ? {} : { label: options.label }),
  });
  return loader;
}

const state = (): string | null => loader?.element.querySelector<SVGSVGElement>(".veylune-mark")?.getAttribute("data-state") ?? null;
const ambient = (): string | null => loader?.element.querySelector<SVGSVGElement>(".veylune-mark")?.getAttribute("data-ambient") ?? null;

afterEach(() => {
  loader?.dispose();
  loader = undefined;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("VeyluneLoader", () => {
  it("offers the four sizes and simplifies the mark for the small ones", () => {
    SIZES.forEach((size) => {
      const mounted = mount(size);
      expect(mounted.element.className).toContain(`veylune-loader--${size}`);
      expect(mounted.element.querySelector(".veylune-mark")).toBeTruthy();
      // The 14px button-scale loader draws the reduced cell set; only the large
      // sizes have room for the full lattice's gutters.
      const variant = mounted.element.querySelector<SVGSVGElement>(".veylune-mark")!.getAttribute("data-variant");
      expect(variant).toBe(size === "inline" ? "micro" : size === "compact" ? "compact" : "full");
      mounted.dispose();
      loader = undefined;
    });
  });

  it("announces itself as a live region, and gets out of the way when told to", () => {
    const announced = mount("default", { label: "Rebuilding the map" });
    expect(announced.element.getAttribute("role")).toBe("status");
    expect(announced.element.getAttribute("aria-live")).toBe("polite");
    expect(announced.element.querySelector(".veylune-mark")?.getAttribute("aria-label")).toBe("Rebuilding the map");
    announced.dispose();
    loader = undefined;

    // Inside a button, the control's own text is the announcement.
    const quiet = mount("inline", { announce: false });
    expect(quiet.element.getAttribute("role")).toBeNull();
    expect(quiet.element.getAttribute("aria-live")).toBeNull();
    expect(quiet.element.querySelector(".veylune-mark")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("scatters, assembles, then rests — without ever spinning", () => {
    mount();
    // The markup is created dormant and the frame after it blooms, so the arrival
    // is a real transition; frames run synchronously here, so the bloom has
    // already landed by the time mount() returns.
    expect(state()).toBe("bloom");
    vi.advanceTimersByTime(40);
    expect(state()).toBe("formation");
    vi.advanceTimersByTime(1_600);
    expect(state()).toBe("stable");
    expect(ambient()).toBe("true");

    // The sequence has an end. A task that takes eleven seconds gets a mark that
    // assembled once and is now sitting still, not a loop to watch.
    vi.advanceTimersByTime(20_000);
    expect(state()).toBe("stable");
    expect(loader?.element.isConnected).toBe(true);
  });

  it("dissolves on finish, then removes itself", () => {
    mount();
    vi.advanceTimersByTime(1_700);
    loader!.finish();
    expect(state()).toBe("dissolve");
    expect(loader!.element.isConnected).toBe(true);
    vi.advanceTimersByTime(800);
    expect(loader!.element.isConnected).toBe(false);
  });

  it("drops pending work on dispose", () => {
    mount();
    vi.advanceTimersByTime(60);
    loader!.dispose();
    expect(loader!.element.isConnected).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    // Nothing left to fire into a detached node.
    vi.advanceTimersByTime(10_000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shows the finished mark instead of a sequence under reduced motion", () => {
    mount("default", { reduced: true });
    expect(state()).toBe("stable");
    // No schedule at all: the static mark is the whole answer for this preference.
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10_000);
    expect(state()).toBe("stable");
    expect(loader!.element.isConnected).toBe(true);
  });

  it("hands over immediately on finish under reduced motion", () => {
    mount("default", { reduced: true });
    loader!.finish();
    expect(loader!.element.isConnected).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("never un-dissolves when finish lands mid-assembly", () => {
    mount();
    vi.advanceTimersByTime(40); // formation is running, settle is still queued
    loader!.finish();
    expect(state()).toBe("dissolve");

    // Walk past the settle timer's slot: it must not fire the mark back to stable and
    // re-ignite the ambient drift under a mark that is already leaving.
    vi.advanceTimersByTime(1_560);
    expect(state()).toBe("dissolve");
    expect(ambient()).toBe("false");
    vi.advanceTimersByTime(1_000);
    expect(loader!.element.isConnected).toBe(false);
  });

  it("names its live region as a change, after the region exists", () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false, media: query, onchange: null,
      addListener: () => undefined, removeListener: () => undefined,
      addEventListener: () => undefined, removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }));
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (run: FrameRequestCallback) => {
      frames.push(run);
      return frames.length;
    });

    const host = document.createElement("div");
    document.body.append(host);
    loader = mountVeyluneLoader(host, { label: "Rebuilding the map" });

    // A live region that arrives already holding its text is often not announced at
    // all, so the name is applied only once the region is in the document.
    const mark = loader.element.querySelector<SVGSVGElement>(".veylune-mark")!;
    expect(mark.hasAttribute("aria-label")).toBe(false);
    expect(loader.element.getAttribute("role")).toBe("status");

    frames.forEach((run) => run(0));
    expect(mark.getAttribute("aria-label")).toBe("Rebuilding the map");
  });

  it("lets a surface drive the states itself", () => {
    mount();
    vi.advanceTimersByTime(1_700);
    loader!.setState("bloom");
    expect(state()).toBe("bloom");
    loader!.setState("dormant");
    expect(state()).toBe("dormant");
    // The mount sequence has run out, so nothing resets what the caller set.
    vi.advanceTimersByTime(5_000);
    expect(state()).toBe("dormant");
  });
});
