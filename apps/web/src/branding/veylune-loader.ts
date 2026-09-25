import { voxelBloomSvg, type VoxelState, type VoxelVariant } from "./voxel-bloom";

/**
 * VeyluneLoader — the mark performing its own assembly as a busy indicator.
 *
 * The sequence is the identity's, not a spinner's: cells appear scattered,
 * travel inward from the core outward, settle, then breathe. It is deliberately
 * not a loop — a task that takes eleven seconds is served by a mark that
 * assembled once and is now resting, which is calmer than re-playing the
 * assembly and far calmer than spinning a ring.
 *
 * Timings mirror the `--voxel-*` tokens in voxel-bloom.css. They are repeated
 * rather than read from the stylesheet because the sequence has to survive being
 * scheduled, and the values are stable by contract; changing a token without
 * changing the other side stretches the animation without moving the hand-off.
 */

export type VeyluneLoaderSize = "inline" | "compact" | "default" | "fullscreen";

export interface VeyluneLoaderOptions {
  readonly size?: VeyluneLoaderSize;
  /** Accessible name. Omit only where a nearby label already says what is happening. */
  readonly label?: string;
  readonly className?: string;
  /**
   * Announce the loader as a live region. Default true; switch it off where the
   * loader sits inside a control that already says what it is doing — a live
   * region inside a button would make the announcement be read twice.
   */
  readonly announce?: boolean;
}

export interface VeyluneLoader {
  readonly element: HTMLElement;
  /** Play a state, for surfaces that want to drive the mark themselves. */
  setState(state: VoxelState): void;
  /** Play the dissolve and remove the loader when it has finished. */
  finish(): void;
  dispose(): void;
}

/** Assembly duration: bloom-to-settle plus the last cell's stagger. */
const FORMATION_MS = 1560;
/** Dissolve plus a beat, before the element is removed. */
const DISSOLVE_MS = 760;

const SIZES: readonly VeyluneLoaderSize[] = ["inline", "compact", "default", "fullscreen"];

/**
 * Mount the loader into `host`.
 *
 * Like every other mount in this app it returns a `dispose()` that removes the
 * listeners, timers and node it created; nothing here outlives that call.
 */
export function mountVeyluneLoader(host: HTMLElement, options: VeyluneLoaderOptions = {}): VeyluneLoader {
  const size = SIZES.includes(options.size ?? "default") ? options.size ?? "default" : "default";
  const announce = options.announce ?? true;
  const label = options.label ?? "Loading";
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  // The same auto-simplification the favicons use: at button size the reduced cell
  // set is what stays legible, at 26px the compact lattice, and only at the large
  // sizes does the full lattice have room for its gutters and shear.
  const variant: VoxelVariant = size === "inline" ? "micro" : size === "compact" ? "compact" : "full";

  const element = document.createElement("div");
  element.className = ["veylune-loader", `veylune-loader--${size}`, options.className]
    .filter(Boolean)
    .join(" ");
  if (announce) {
    element.setAttribute("role", "status");
    element.setAttribute("aria-live", "polite");
  }
  // Deliberately nameless at creation, see `name` below.
  element.innerHTML = voxelBloomSvg({
    variant,
    state: reducedMotion ? "stable" : "dormant",
    ambient: false,
  });
  host.append(element);

  const mark = element.querySelector<SVGSVGElement>(".veylune-mark");
  const timers: number[] = [];
  let disposed = false;
  let finishing = false;

  /**
   * Give the mark its name a beat after the region exists. A live region inserted
   * already holding its text is routinely not announced — from the AT's point of view
   * nothing changed — so the name is applied as a change, on the next frame.
   *
   * Without a live region the mark stays decorative entirely: whatever owns the label
   * (a button's own text, a heading beside it) is already the announcement.
   */
  const name = (): void => {
    if (announce && !disposed) mark?.setAttribute("aria-label", label);
  };

  const setState = (state: VoxelState): void => {
    mark?.setAttribute("data-state", state);
  };

  const later = (run: () => void, ms: number): void => {
    timers.push(window.setTimeout(() => {
      if (!disposed) run();
    }, ms));
  };

  /** The mark has assembled; let it sit and breathe. */
  const settle = (): void => {
    // `finish()` can land while the assembly is still running. A settle timer that
    // fires after that would un-dissolve the mark — stable, ambient drift, still
    // fading out — so the leaving decision wins.
    if (finishing) return;
    setState("stable");
    mark?.setAttribute("data-ambient", "true");
  };

  if (reducedMotion) {
    // No sequence to play: show the finished mark, which is the whole point of
    // the state, and let `finish()` remove it immediately.
    settle();
    requestAnimationFrame(name);
  } else {
    // A frame first, so the browser paints the dormant pose and the transition
    // to the structure is a real transition rather than a mid-flight guess.
    requestAnimationFrame(() => {
      if (disposed) return;
      name();
      setState("bloom");
      later(() => {
        setState("formation");
        later(settle, FORMATION_MS);
      }, 40);
    });
  }

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    timers.forEach((id) => window.clearTimeout(id));
    timers.length = 0;
    element.remove();
  };

  return {
    element,
    setState: (state) => {
      if (!disposed) setState(state);
    },
    finish: () => {
      if (disposed) return;
      if (reducedMotion) {
        dispose();
        return;
      }
      finishing = true;
      setState("dissolve");
      later(dispose, DISSOLVE_MS);
    },
    dispose,
  };
}
