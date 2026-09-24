import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyDragDelta,
  FULL_TURN,
  mountSpatialScene,
  PITCH_MAX,
  PITCH_MIN,
  projector,
  YAW_DRAG_SENSITIVITY,
} from "./spatial-scene";

const INITIAL_YAW = -0.52;
const INITIAL_PITCH = 0.14;

let activeDispose: (() => void) | undefined;

// A no-op canvas context: every drawing method is swallowed, every property set
// is accepted. paintScene only ever calls methods / assigns properties on ctx.
function stubContext(): CanvasRenderingContext2D {
  return new Proxy({}, {
    get: (target, key) => (key in target ? (target as Record<string | symbol, unknown>)[key] : () => undefined),
    set: (target, key, value) => { (target as Record<string | symbol, unknown>)[key] = value; return true; },
  }) as unknown as CanvasRenderingContext2D;
}

interface MountedScene {
  canvas: HTMLCanvasElement;
  pose: () => { yaw: number; pitch: number };
  captured: number[];
  dispose: () => void;
}

// Mount the real scene against a stubbed canvas and track the latest pose the
// scene paints. Reduced motion is forced so every commit renders synchronously
// and onPose reports the exact drag-accumulated yaw/pitch (no smoothing lag).
function mountScene(): MountedScene {
  const canvas = document.createElement("canvas");
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 400, right: 600, bottom: 400, x: 0, y: 0, toJSON: () => ({}) });
  canvas.getContext = (() => stubContext()) as unknown as HTMLCanvasElement["getContext"];
  const captured: number[] = [];
  canvas.setPointerCapture = (id: number) => { captured.push(id); };
  canvas.releasePointerCapture = (id: number) => { const at = captured.indexOf(id); if (at >= 0) captured.splice(at, 1); };
  canvas.hasPointerCapture = (id: number) => captured.includes(id);

  // jsdom has no matchMedia; force prefers-reduced-motion so commits render
  // synchronously (no rAF) and onPose reports exact drag-accumulated poses.
  const previousMatchMedia = window.matchMedia as typeof window.matchMedia | undefined;
  window.matchMedia = ((query: string) => ({ matches: true, media: query, onchange: null, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  let latest = { yaw: INITIAL_YAW, pitch: INITIAL_PITCH };
  const scene = mountSpatialScene(canvas, { onPose: (yaw, pitch) => { latest = { yaw, pitch }; } });

  const dispose = (): void => {
    scene.dispose();
    if (previousMatchMedia) window.matchMedia = previousMatchMedia;
  };
  activeDispose = dispose;
  return { canvas, pose: () => latest, captured, dispose };
}

interface PointerProps { pointerId?: number; pointerType?: string; button?: number; buttons?: number; clientX?: number; clientY?: number }
function fire(canvas: HTMLCanvasElement, type: string, props: PointerProps): void {
  const event = new Event(type, { bubbles: true, cancelable: true }) as Event & PointerProps;
  Object.assign(event, { pointerId: 1, pointerType: "mouse", button: 0, buttons: 1, clientX: 0, clientY: 0 }, props);
  canvas.dispatchEvent(event);
}

afterEach(() => { activeDispose?.(); activeDispose = undefined; document.body.innerHTML = ""; vi.restoreAllMocks(); });

describe("applyDragDelta (pure orbit math)", () => {
  it("raises elevation when dragged up and lowers it when dragged down", () => {
    const up = applyDragDelta(0, 0, 0, -100); // deltaY < 0 = drag up
    const down = applyDragDelta(0, 0, 0, 100); // deltaY > 0 = drag down
    expect(up.pitch).toBeGreaterThan(0);
    expect(down.pitch).toBeLessThan(0);
  });

  it("winds yaw in the drag direction with no horizontal limit", () => {
    let yaw = 0;
    let pitch = 0;
    for (let step = 0; step < 10; step += 1) ({ yaw, pitch } = applyDragDelta(yaw, pitch, 1000, 0));
    expect(yaw).toBeGreaterThan(FULL_TURN * 2); // several revolutions, never clamped
    expect(pitch).toBeCloseTo(0, 6);
  });

  it("keeps pitch inside its limits without touching yaw", () => {
    let pitch = 0;
    for (let step = 0; step < 200; step += 1) ({ pitch } = applyDragDelta(0, pitch, 0, -1000));
    expect(pitch).toBe(PITCH_MAX);
    for (let step = 0; step < 200; step += 1) ({ pitch } = applyDragDelta(0, pitch, 0, 1000));
    expect(pitch).toBe(PITCH_MIN);
  });

  it("maps pitch monotonically downward across a downward drag", () => {
    let pitch = PITCH_MAX;
    const samples = [pitch];
    for (let step = 0; step < 40; step += 1) {
      ({ pitch } = applyDragDelta(0, pitch, 0, 20));
      samples.push(pitch);
    }
    for (let index = 1; index < samples.length; index += 1) {
      expect(samples[index]).toBeLessThanOrEqual(samples[index - 1]!);
    }
  });
});

describe("grab-and-drag interaction (mountSpatialScene pipeline)", () => {
  it("ignores pointer movement when the scene is not grabbed", () => {
    const { canvas, pose } = mountScene();
    const before = pose();
    fire(canvas, "pointermove", { clientX: 300, clientY: 30, buttons: 0 });
    fire(canvas, "pointermove", { clientX: 520, clientY: 380, buttons: 0 });
    const after = pose();
    expect(after.yaw).toBeCloseTo(before.yaw, 6);
    expect(after.pitch).toBeCloseTo(before.pitch, 6);
  });

  it("does not grab on secondary mouse buttons", () => {
    const { canvas, pose } = mountScene();
    const before = pose();
    fire(canvas, "pointerdown", { button: 2, buttons: 2, clientX: 100, clientY: 100 });
    fire(canvas, "pointermove", { button: 2, buttons: 2, clientX: 400, clientY: 100 });
    expect(pose().yaw).toBeCloseTo(before.yaw, 6);
    expect(pose().pitch).toBeCloseTo(before.pitch, 6);
  });

  it("rotates right on right-drag and left on left-drag", () => {
    const { canvas, pose } = mountScene();
    const start = pose();
    fire(canvas, "pointerdown", { clientX: 300, clientY: 200 });
    fire(canvas, "pointermove", { clientX: 400, clientY: 200 }); // +100px right
    const afterRight = pose();
    expect(afterRight.yaw - start.yaw).toBeCloseTo(100 * YAW_DRAG_SENSITIVITY, 6);

    fire(canvas, "pointermove", { clientX: 200, clientY: 200 }); // -200px left
    expect(pose().yaw).toBeLessThan(afterRight.yaw);
  });

  it("accumulates multiple full revolutions while held", () => {
    const { canvas, pose } = mountScene();
    const start = pose();
    fire(canvas, "pointerdown", { clientX: 0, clientY: 200 });
    for (let step = 1; step <= 20; step += 1) fire(canvas, "pointermove", { clientX: step * 600, clientY: 200 });
    const swept = pose().yaw - start.yaw;
    expect(swept).toBeGreaterThan(FULL_TURN * 3); // kept dragging, kept winding
  });

  it("tilts up on up-drag and down on down-drag (regression: vertical was inverted)", () => {
    const { canvas, pose } = mountScene();
    fire(canvas, "pointerdown", { clientX: 300, clientY: 200 });
    fire(canvas, "pointermove", { clientX: 300, clientY: 150 }); // drag up 50px
    const upPitch = pose().pitch;

    fire(canvas, "pointerup", { clientX: 300, clientY: 150 });
    fire(canvas, "pointerdown", { clientX: 300, clientY: 200 });
    fire(canvas, "pointermove", { clientX: 300, clientY: 260 }); // drag down 60px
    const downPitch = pose().pitch;

    expect(upPitch).toBeGreaterThan(INITIAL_PITCH);
    expect(downPitch).toBeLessThan(INITIAL_PITCH);
  });

  it("stops rotating after release", () => {
    const { canvas, pose } = mountScene();
    fire(canvas, "pointerdown", { clientX: 300, clientY: 200 });
    fire(canvas, "pointermove", { clientX: 400, clientY: 200 });
    fire(canvas, "pointerup", { clientX: 400, clientY: 200 });
    const released = pose();
    fire(canvas, "pointermove", { clientX: 550, clientY: 200 });
    expect(pose().yaw).toBeCloseTo(released.yaw, 6);
    expect(pose().pitch).toBeCloseTo(released.pitch, 6);
  });

  it("stops rotating after pointercancel and clears the grab", () => {
    const { canvas, pose, captured } = mountScene();
    fire(canvas, "pointerdown", { pointerId: 7, clientX: 300, clientY: 200 });
    expect(captured).toContain(7);
    fire(canvas, "pointermove", { pointerId: 7, clientX: 400, clientY: 200 });
    fire(canvas, "pointercancel", { pointerId: 7, clientX: 400, clientY: 200 });
    expect(captured).not.toContain(7);
    const cancelled = pose();
    fire(canvas, "pointermove", { pointerId: 7, clientX: 900, clientY: 200 });
    expect(pose().yaw).toBeCloseTo(cancelled.yaw, 6);
  });

  it("captures the pointer for a continued drag and releases it on pointerup", () => {
    const { canvas, captured } = mountScene();
    fire(canvas, "pointerdown", { pointerId: 3, clientX: 300, clientY: 200 });
    expect(captured).toContain(3);
    fire(canvas, "pointerup", { pointerId: 3, clientX: 500, clientY: 480 }); // released while outside element
    expect(captured).not.toContain(3);
  });

  it("uses the same vertical convention for touch as for mouse", () => {
    const { canvas, pose } = mountScene();
    fire(canvas, "pointerdown", { pointerId: 9, pointerType: "touch", button: 0, buttons: 1, clientX: 300, clientY: 200 });
    fire(canvas, "pointermove", { pointerId: 9, pointerType: "touch", buttons: 1, clientX: 300, clientY: 140 }); // up
    expect(pose().pitch).toBeGreaterThan(INITIAL_PITCH);
  });

  it("responds to arrow keys consistently with the drag convention", () => {
    const { canvas, pose } = mountScene();
    const start = pose();
    canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", cancelable: true }));
    const afterUp = pose().pitch;
    canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", cancelable: true }));
    const afterDown = pose().pitch;
    canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", cancelable: true }));

    expect(afterUp).toBeGreaterThan(start.pitch);
    expect(afterDown).toBeLessThan(afterUp);
    expect(pose().yaw).toBeGreaterThan(start.yaw);
  });
});

describe("projector revolution seamlessness", () => {
  it("returns to the same orientation after a full 360° turn", () => {
    const point = { x: 1.2, y: 1.1, z: 0.8 };
    const at0 = projector(600, 400, 0, INITIAL_PITCH)(point);
    const atTurn = projector(600, 400, FULL_TURN, INITIAL_PITCH)(point);
    expect(atTurn.x).toBeCloseTo(at0.x, 6);
    expect(atTurn.y).toBeCloseTo(at0.y, 6);
  });
});
