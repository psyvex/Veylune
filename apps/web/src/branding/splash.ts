import { voxelBloomSvg } from "./voxel-bloom";

/**
 * The boot splash — the same geometry as the mark, favicon and loader, playing
 * its sequence once before the app it was covering is handed over.
 *
 * The story is the identity's: an empty field, the core cell, the cells around
 * it, the finished volume, a hold, then the object un-picking itself as the app
 * arrives. Nothing else is drawn on the screen, because a second element to
 * animate would turn an assembly into a title card.
 *
 * It is an overlay, not a gate. The app mounts underneath it in the same tick,
 * so the splash hides work that is happening rather than delaying it, and if it
 * is disposed early the app is simply already there.
 */

export interface VeyluneSplash {
  readonly element: HTMLElement;
  /** Cut the splash short and hand over to the app immediately. */
  dismiss(): void;
  dispose(): void;
}

/** Empty field long enough to read as empty, short enough not to test patience. */
const OPENING_MS = 260;
/** How long the finished mark holds before the hand-over. */
const HOLD_MS = 620;
/** Assembly, then hold, then leave. */
const FORMATION_MS = 1400;
const LEAVE_MS = 1000;

export function mountVeyluneSplash(host: HTMLElement, options: { label?: string } = {}): VeyluneSplash {
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  const element = document.createElement("div");
  element.className = "veylune-splash";
  element.setAttribute("role", "status");
  element.setAttribute("aria-live", "polite");
  element.innerHTML = `${voxelBloomSvg({
    variant: "full",
    state: reducedMotion ? "stable" : "dormant",
    ambient: false,
  })}<span class="veylune-splash-word" aria-hidden="true">VEYLUNE</span>`;
  host.append(element);

  const mark = element.querySelector<SVGSVGElement>(".veylune-mark");
  const timers: number[] = [];
  let disposed = false;

  /**
   * Named a frame after the region is in the DOM, not at creation: a live region that
   * arrives already holding its text is routinely skipped, so the label is applied as
   * a change instead of as part of the markup.
   */
  const name = (): void => {
    if (!disposed) mark?.setAttribute("aria-label", options.label ?? "Loading Veylune");
  };

  const later = (run: () => void, ms: number): void => {
    timers.push(window.setTimeout(() => {
      if (!disposed) run();
    }, ms));
  };

  // The overlay sits on top of a working app, so it has to let go on demand: a click
  // anywhere, or Escape, hands over immediately rather than making anyone sit through
  // the rest of the sequence.
  const skip = (): void => { dispose(); };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") dispose();
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    timers.forEach((id) => window.clearTimeout(id));
    timers.length = 0;
    element.removeEventListener("click", skip);
    window.removeEventListener("keydown", onKeyDown);
    element.remove();
  };

  element.addEventListener("click", skip);
  window.addEventListener("keydown", onKeyDown);

  if (reducedMotion) {
    // No sequence to play. Show the finished mark for a moment so the boot is
    // not a flash, then hand over — no travel, no fade, nothing to trigger.
    element.classList.add("is-formed");
    requestAnimationFrame(name);
    later(dispose, 400);
  } else {
    requestAnimationFrame(() => {
      if (disposed) return;
      name();
      mark?.setAttribute("data-state", "bloom");
      later(() => {
        mark?.setAttribute("data-state", "formation");
        mark?.setAttribute("data-ambient", "true");
        element.classList.add("is-formed");
        later(() => {
          mark?.setAttribute("data-state", "dissolve");
          element.classList.add("is-leaving");
          later(dispose, LEAVE_MS);
        }, FORMATION_MS + HOLD_MS);
      }, OPENING_MS);
    });
  }

  return { element, dismiss: dispose, dispose };
}
