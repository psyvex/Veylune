import { afterEach, describe, expect, it, vi } from "vitest";
import { mountVoxelObject, type VoxelObject } from "./voxel-object";
import { applyDragDelta, FULL_TURN, PITCH_DRAG_SENSITIVITY, toDegrees, YAW_DRAG_SENSITIVITY } from "../spatial/drag-orbit";

interface Mounted {
  object: VoxelObject;
  stage: HTMLElement;
  /** Poses reported by the object as it paints them. */
  painted: { yaw: number; pitch: number }[];
  captured: number[];
  /** Drive N animation frames by hand (only meaningful without reduced motion). */
  runFrames: (count: number) => void;
  dispose: () => void;
}

let active: (() => void) | undefined;

/**
 * Mount the real object with pointer capture tracked and frames under test
 * control. `reduced` picks the branch: reduced motion commits poses directly,
 * which is what makes exact drag arithmetic assertable.
 */
function mountObject(options: { reduced?: boolean; label?: string } = {}): Mounted {
  const reduced = options.reduced ?? true;
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

  const queue: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (run: FrameRequestCallback) => {
    queue.push(run);
    return queue.length;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    delete queue[id - 1];
  });

  const host = document.createElement("div");
  document.body.append(host);
  const painted: { yaw: number; pitch: number }[] = [];
  const captured: number[] = [];
  const object = mountVoxelObject(host, {
    ...(options.label === undefined ? {} : { label: options.label }),
    onPose: (yaw, pitch) => { painted.push({ yaw, pitch }); },
  });
  object.element.setPointerCapture = (id: number) => { captured.push(id); };
  object.element.releasePointerCapture = (id: number) => {
    const at = captured.indexOf(id);
    if (at >= 0) captured.splice(at, 1);
  };
  object.element.hasPointerCapture = (id: number) => captured.includes(id);

  const stage = object.element.querySelector<HTMLElement>(".voxel-object-stage")!;
  const dispose = (): void => {
    object.dispose();
    host.remove();
    vi.unstubAllGlobals();
  };
  active = dispose;
  return {
    object,
    stage,
    painted,
    captured,
    runFrames: (count) => {
      for (let index = 0; index < count; index += 1) {
        const run = queue.shift();
        if (!run) return;
        run(0);
      }
    },
    dispose,
  };
}

interface PointerProps { pointerId?: number; pointerType?: string; button?: number; buttons?: number; clientX?: number; clientY?: number }
function fire(element: HTMLElement, type: string, props: PointerProps = {}): void {
  const event = new Event(type, { bubbles: true, cancelable: true }) as Event & PointerProps;
  Object.assign(event, { pointerId: 1, pointerType: "mouse", button: 0, buttons: 1, clientX: 0, clientY: 0 }, props);
  element.dispatchEvent(event);
}

/** Press, move by the given delta while held, then let go. */
function drag(element: HTMLElement, deltaX: number, deltaY: number): void {
  fire(element, "pointerdown");
  fire(element, "pointermove", { clientX: deltaX, clientY: deltaY });
  fire(element, "pointerup");
}

afterEach(() => {
  active?.();
  active = undefined;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("VoxelObject interaction", () => {
  it("ignores the pointer until it is held down", () => {
    const { object, painted } = mountObject();
    const before = object.pose();

    // Waving the cursor across the mark — including a long sweep on both axes and a
    // hover with a button already down elsewhere — must not turn it.
    fire(object.element, "pointermove", { clientX: 400, clientY: 300 });
    fire(object.element, "pointermove", { clientX: -400, clientY: -300 });
    fire(object.element, "pointermove", { clientX: 220, clientY: 90, buttons: 0 });

    expect(object.pose()).toEqual(before);
    expect(painted).toHaveLength(1); // the single paint at mount
  });

  it("does not grab on a secondary button", () => {
    const { object, captured } = mountObject();
    const before = object.pose();

    fire(object.element, "pointerdown", { button: 2 });
    fire(object.element, "pointermove", { clientX: 120, clientY: 40 });

    expect(object.pose()).toEqual(before);
    expect(captured).toEqual([]);
    expect(object.element.classList.contains("is-orbiting")).toBe(false);
  });

  it("turns with the drag: right winds yaw, left unwinds it", () => {
    const { object } = mountObject();
    const start = object.pose();

    drag(object.element, 120, 0);
    expect(object.pose().yaw - start.yaw).toBeCloseTo(120 * YAW_DRAG_SENSITIVITY, 10);
    expect(object.pose().pitch).toBeCloseTo(start.pitch, 10);

    drag(object.element, -120, 0);
    expect(object.pose().yaw).toBeCloseTo(start.yaw, 10);
  });

  it("raises the object when dragged up, never the other way round", () => {
    const { object } = mountObject();
    const start = object.pose();

    drag(object.element, 0, -100); // deltaY < 0 is an upward drag
    expect(object.pose().pitch - start.pitch).toBeCloseTo(100 * PITCH_DRAG_SENSITIVITY, 10);

    drag(object.element, 0, 100);
    expect(object.pose().pitch).toBeCloseTo(start.pitch, 10);
  });

  it("accumulates a full turn on both axes with no limit to run into", () => {
    const { object, stage } = mountObject();

    // One drag is a small angle; holding and continuing is what proves there is no
    // clamp and no dependency on reaching an edge of the screen.
    for (let step = 0; step < 30; step += 1) drag(object.element, 900, 0);
    expect(object.pose().yaw).toBeGreaterThan(FULL_TURN * 3);

    for (let step = 0; step < 40; step += 1) drag(object.element, 0, -900);
    expect(object.pose().pitch).toBeGreaterThan(FULL_TURN);

    // The pose is painted as it was accumulated: past a full turn, not wrapped, so a
    // long drag never snaps to a new angle mid-gesture.
    const transform = stage.style.transform;
    expect(transform).toContain("rotateX(");
    expect(transform).toContain("rotateY(");
    const yawDegrees = Number(/rotateY\((-?[\d.]+)deg\)/.exec(transform)![1]);
    expect(yawDegrees).toBeGreaterThan(360);
    expect(yawDegrees).toBeCloseTo(toDegrees(object.pose().yaw), 4);
  });

  it("keeps the orientation it was released at", () => {
    const { object, runFrames } = mountObject();

    drag(object.element, 260, -180);
    const released = object.pose();
    runFrames(120);

    expect(object.pose()).toEqual(released);
    expect(object.element.classList.contains("is-orbiting")).toBe(false);
  });

  it("ends the grab on cancel and releases the pointer", () => {
    const { object, captured } = mountObject();
    const before = object.pose();

    fire(object.element, "pointerdown");
    expect(captured).toEqual([1]);
    expect(object.element.classList.contains("is-orbiting")).toBe(true);

    fire(object.element, "pointercancel");
    expect(captured).toEqual([]);
    expect(object.element.classList.contains("is-orbiting")).toBe(false);

    // A pointer that has been cancelled must not keep steering after the fact.
    fire(object.element, "pointermove", { clientX: 300, clientY: 200 });
    expect(object.pose()).toEqual(before);
  });

  it("does not end an active drag when the pointer leaves the element", () => {
    const { object } = mountObject();
    const start = object.pose();

    fire(object.element, "pointerdown");
    fire(object.element, "pointermove", { clientX: 60, clientY: 0 });
    // Capture keeps the drag alive exactly as a physical grab would.
    fire(object.element, "pointerleave");
    fire(object.element, "pointermove", { clientX: 180, clientY: 0 });
    fire(object.element, "pointerup");

    expect(object.pose().yaw - start.yaw).toBeCloseTo(180 * YAW_DRAG_SENSITIVITY, 10);
  });

  it("keeps the touch convention identical to the mouse", () => {
    const { object } = mountObject();
    const start = object.pose();

    fire(object.element, "pointerdown", { pointerType: "touch", button: 0 });
    fire(object.element, "pointermove", { pointerType: "touch", clientX: 0, clientY: -140 });
    fire(object.element, "pointerup", { pointerType: "touch" });

    expect(object.pose().pitch - start.pitch).toBeGreaterThan(0);
  });

  it("steers with the keyboard and leaves other keys alone", () => {
    const { object } = mountObject();
    const start = object.pose();

    const press = (key: string, shift = false): KeyboardEvent => {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, shiftKey: shift });
      object.element.dispatchEvent(event);
      return event;
    };
    expect(press("ArrowRight").defaultPrevented).toBe(true);
    expect(object.pose().yaw).toBeGreaterThan(start.yaw);
    press("ArrowUp");
    expect(object.pose().pitch).toBeGreaterThan(start.pitch);
    press("ArrowDown");
    press("ArrowDown");
    expect(object.pose().pitch).toBeLessThan(start.pitch);

    const before = object.pose();
    expect(press("Tab").defaultPrevented).toBe(false);
    expect(object.pose()).toEqual(before);
  });

  it("eases toward the pose instead of jumping, when motion is welcome", () => {
    const { object, runFrames } = mountObject({ reduced: false });
    const start = object.pose();

    fire(object.element, "pointerdown");
    fire(object.element, "pointermove", { clientX: 500, clientY: 0 });
    fire(object.element, "pointerup");

    // The drag target is ahead of what is painted, and the frames close the gap.
    const lagging = object.pose().yaw;
    expect(lagging).toBeCloseTo(start.yaw, 6);
    runFrames(1);
    expect(object.pose().yaw).toBeGreaterThan(lagging);
    runFrames(600);
    // Converged to within the frame loop's settle threshold, then it stops
    // requesting frames rather than spinning forever.
    expect(Math.abs(object.pose().yaw - (start.yaw + 500 * YAW_DRAG_SENSITIVITY))).toBeLessThan(0.001);
    expect(object.pose().yaw).toBeLessThan(start.yaw + 500 * YAW_DRAG_SENSITIVITY);
  });

  it("reports every pose it paints, through the shared drag convention", () => {
    const { object, painted } = mountObject();
    const start = object.pose();
    drag(object.element, 100, -40);

    // The same function the hero scene uses, called with the same deltas: the two
    // objects cannot drift apart on sign or range without this failing.
    const expected = applyDragDelta(start.yaw, start.pitch, 100, -40);
    expect(object.pose().yaw).toBeCloseTo(expected.yaw, 10);
    expect(object.pose().pitch).toBeCloseTo(expected.pitch, 10);
    expect(painted.length).toBeGreaterThan(1);
    expect(painted.at(-1)).toEqual(object.pose());
  });
});

describe("VoxelObject presentation", () => {
  it("is an image you are told how to hold", () => {
    const { object } = mountObject();
    expect(object.element.getAttribute("role")).toBe("img");
    expect(object.element.tabIndex).toBe(0);
    const label = object.element.getAttribute("aria-label") ?? "";
    expect(label).toMatch(/press and hold/i);
    expect(label).toMatch(/drag/i);
    expect(label).toMatch(/360 degrees/i);
    expect(label).toMatch(/arrow keys/i);
    expect(label).toMatch(/stays where you left it/i);
  });

  it("accepts its own label and draws the shared geometry", () => {
    const { object } = mountObject({ label: "Veylune mark" });
    expect(object.element.getAttribute("aria-label")).toBe("Veylune mark");
    const mark = object.element.querySelector<SVGSVGElement>(".veylune-mark");
    expect(mark?.getAttribute("data-variant")).toBe("full");
    // The object is shown assembled; it is not waiting to be assembled.
    expect(mark?.getAttribute("data-state")).toBe("stable");
    expect(mark?.querySelectorAll(".vb-cell").length).toBeGreaterThan(5);
  });

  it("paints an upright, three-quarter pose before being touched", () => {
    const { object, stage } = mountObject();
    expect(stage.style.transform).toMatch(/rotateX\(/);
    expect(stage.style.transform).toMatch(/rotateY\(/);
    const transform = stage.style.transform;
    const pitch = Number(/rotateX\((-?[\d.]+)deg\)/.exec(transform)![1]);
    const yaw = Number(/rotateY\((-?[\d.]+)deg\)/.exec(transform)![1]);
    expect(Math.abs(pitch)).toBeLessThan(90);
    expect(Math.abs(yaw)).toBeLessThan(90);
    expect(toDegrees(object.pose().pitch)).toBeCloseTo(pitch, 4);
  });

  it("removes itself and its listeners", () => {
    const { object, painted } = mountObject();
    const element = object.element;
    object.dispose();
    expect(element.isConnected).toBe(false);
    painted.length = 0;
    // Nothing is left to repaint after disposal.
    fire(element, "pointerdown");
    fire(element, "pointermove", { clientX: 200, clientY: 200 });
    expect(painted).toHaveLength(0);
    object.dispose();
  });
});

describe("one drag convention across surfaces", () => {
  it("is literally the same function the hero scene uses", async () => {
    // Both surfaces import the same module rather than each keeping its own copy of
    // the signs, which is the only thing that stops the vertical axis being right in
    // one place and inverted in the other.
    const scene = await import("../marketing/spatial-scene");
    expect(scene.applyDragDelta).toBe(applyDragDelta);
    expect(scene.FULL_TURN).toBe(FULL_TURN);
    expect(scene.YAW_DRAG_SENSITIVITY).toBe(YAW_DRAG_SENSITIVITY);
    expect(scene.PITCH_DRAG_SENSITIVITY).toBe(PITCH_DRAG_SENSITIVITY);
  });
});
