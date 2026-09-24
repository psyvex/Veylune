import { applyDragDelta, toDegrees } from "../spatial/drag-orbit";
import { voxelBloomSvg, type VoxelVariant } from "./voxel-bloom";

/**
 * The identity as something you can hold.
 *
 * A marketing surface wants the mark to behave like an object rather than an
 * image, and this is the whole of it: the same SVG geometry, put in a perspective
 * container, rotated by the same drag convention the hero scene uses. Importing
 * `applyDragDelta` is the point — one set of signs for the whole product, so the
 * vertical axis cannot be correct in one place and inverted in another.
 *
 * What it deliberately is not:
 *   - a cursor tracker. Moving the pointer across the mark does nothing at all;
 *     rotation only ever comes from a drag started with the button held down.
 *   - a bounded tilt. Both axes accumulate without limit, so a full 360° spin on
 *     either axis is reachable by keeping dragging, and a revolution returns to
 *     the same orientation instead of hitting a wall.
 *   - a turntable. Release and the object stays exactly where it was left; it
 *     eases into that pose, it never wanders on its own.
 *
 * Rotation is done by the browser's 3D transform rather than by projecting cells
 * by hand, which keeps the mark pixel-crisp at any angle for free. The depth read
 * stays in the tone, as it does everywhere else, so the object reads as a volume
 * even square-on.
 */

export interface VoxelObjectOptions {
  readonly label?: string;
  readonly className?: string;
  readonly variant?: VoxelVariant;
  /** Starting pose, radians. Defaults to a slight three-quarter view. */
  readonly yaw?: number;
  readonly pitch?: number;
  /** Called with the live pose, for tests and for anything that must sync to it. */
  readonly onPose?: (yaw: number, pitch: number) => void;
}

export interface VoxelObject {
  readonly element: HTMLElement;
  pose(): { yaw: number; pitch: number };
  dispose(): void;
}

const SMOOTHING = 0.16;
const KEY_STEP = 0.24;
const SETTLED = 0.0006;
const DEFAULT_YAW = -0.42;
const DEFAULT_PITCH = 0.2;

export function mountVoxelObject(host: HTMLElement, options: VoxelObjectOptions = {}): VoxelObject {
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  const element = document.createElement("div");
  element.className = ["voxel-object", options.className].filter(Boolean).join(" ");
  element.tabIndex = 0;
  element.setAttribute("role", "img");
  element.setAttribute(
    "aria-label",
    options.label
      ?? "Veylune identity object. Press and hold to grab it, then drag to spin it a full 360 degrees in any direction, or use the arrow keys. Release to let go and it stays where you left it.",
  );
  element.innerHTML = `<div class="voxel-object-stage">${voxelBloomSvg({
    variant: options.variant ?? "full",
    state: "stable",
    ambient: !reducedMotion,
  })}</div>`;
  host.append(element);

  const stage = element.querySelector<HTMLElement>(".voxel-object-stage")!;

  let yaw = options.yaw ?? DEFAULT_YAW;
  let pitch = options.pitch ?? DEFAULT_PITCH;
  let targetYaw = yaw;
  let targetPitch = pitch;
  let press: { pointerId: number; x: number; y: number } | undefined;
  let frame = 0;
  let disposed = false;

  const paint = (): void => {
    // The accumulated pose is written out as-is. No clamping and no wrapping:
    // 411° and 51° are the same look, but wrapping would make a long drag
    // visibly snap, and past 180° it would flip.
    stage.style.transform = `rotateX(${toDegrees(pitch)}deg) rotateY(${toDegrees(yaw)}deg)`;
    options.onPose?.(yaw, pitch);
  };

  const step = (): void => {
    frame = 0;
    yaw += (targetYaw - yaw) * SMOOTHING;
    pitch += (targetPitch - pitch) * SMOOTHING;
    paint();
    if (Math.abs(targetYaw - yaw) > SETTLED || Math.abs(targetPitch - pitch) > SETTLED) {
      frame = requestAnimationFrame(step);
    }
  };

  const commit = (next: { yaw: number; pitch: number }): void => {
    targetYaw = next.yaw;
    targetPitch = next.pitch;
    if (reducedMotion) {
      // Nothing eases into place; the object moves because the user is moving it.
      yaw = targetYaw;
      pitch = targetPitch;
      paint();
      return;
    }
    if (!frame) frame = requestAnimationFrame(step);
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    press = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    element.setPointerCapture?.(event.pointerId);
    element.classList.add("is-orbiting");
  };

  const onPointerMove = (event: PointerEvent): void => {
    // The only source of rotation in this component: a pointer that is down, and
    // whose button is still held. Hovering never rotates anything.
    if (!press || press.pointerId !== event.pointerId) return;
    if (event.pointerType === "mouse" && event.buttons === 0) return;
    commit(applyDragDelta(targetYaw, targetPitch, event.clientX - press.x, event.clientY - press.y));
    press.x = event.clientX;
    press.y = event.clientY;
  };

  const onPointerRelease = (event: PointerEvent): void => {
    if (press && event.pointerId !== press.pointerId) return;
    if (element.hasPointerCapture?.(event.pointerId)) element.releasePointerCapture?.(event.pointerId);
    press = undefined;
    element.classList.remove("is-orbiting");
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const rotation = event.shiftKey ? KEY_STEP : KEY_STEP * 0.5;
    if (event.key === "ArrowLeft") commit({ yaw: targetYaw - rotation, pitch: targetPitch });
    else if (event.key === "ArrowRight") commit({ yaw: targetYaw + rotation, pitch: targetPitch });
    else if (event.key === "ArrowUp") commit({ yaw: targetYaw, pitch: targetPitch + rotation * 0.55 });
    else if (event.key === "ArrowDown") commit({ yaw: targetYaw, pitch: targetPitch - rotation * 0.55 });
    else return;
    event.preventDefault();
  };

  element.addEventListener("pointerdown", onPointerDown);
  element.addEventListener("pointermove", onPointerMove);
  element.addEventListener("pointerup", onPointerRelease);
  element.addEventListener("pointercancel", onPointerRelease);
  element.addEventListener("keydown", onKeyDown);

  paint();

  return {
    element,
    pose: () => ({ yaw, pitch }),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerup", onPointerRelease);
      element.removeEventListener("pointercancel", onPointerRelease);
      element.removeEventListener("keydown", onKeyDown);
      element.remove();
    },
  };
}
