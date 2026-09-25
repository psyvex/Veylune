import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyDragDelta,
  formatPoseReadout,
  FULL_TURN,
  makePointCloud,
  INITIAL_POSE,
  mountSpatialScene,
  paintScene,
  PITCH_DRAG_SENSITIVITY,
  projector,
  type SceneMode,
  YAW_DRAG_SENSITIVITY,
} from "./spatial-scene";

// The pose the scene is built to open on, read from the scene rather than repeated
// here, so a change to it moves these expectations instead of silently passing.
const INITIAL_YAW = INITIAL_POSE.yaw;
const INITIAL_PITCH = INITIAL_POSE.pitch;
const DEG = Math.PI / 180;

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
  /** Frames the scene currently has queued with the (stubbed) animation loop. */
  pendingFrames: () => number;
  /** Run the queued frame, if any, and report whether one ran. */
  runFrame: () => boolean;
  /** Frames queued but not run — the ones a disposal has to make harmless. */
  peekFrames: () => FrameRequestCallback[];
  dispose: () => void;
}

// Mount the real scene against a stubbed canvas and track the latest pose the
// scene paints. Reduced motion is forced by default so every commit renders
// synchronously and onPose reports the exact drag-accumulated yaw/pitch (no
// smoothing lag); the loop tests pass `reduced: false` to keep the real one.
function mountScene(options: { reduced?: boolean } = {}): MountedScene {
  const reduced = options.reduced ?? true;
  const canvas = document.createElement("canvas");
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 400, right: 600, bottom: 400, x: 0, y: 0, toJSON: () => ({}) });
  canvas.getContext = (() => stubContext()) as unknown as HTMLCanvasElement["getContext"];
  const captured: number[] = [];
  canvas.setPointerCapture = (id: number) => { captured.push(id); };
  canvas.releasePointerCapture = (id: number) => { const at = captured.indexOf(id); if (at >= 0) captured.splice(at, 1); };
  canvas.hasPointerCapture = (id: number) => captured.includes(id);

  // jsdom has no matchMedia; this is what picks the branch the scene mounts on.
  const previousMatchMedia = window.matchMedia as typeof window.matchMedia | undefined;
  window.matchMedia = ((query: string) => ({ matches: reduced, media: query, onchange: null, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;

  // The animation loop is stubbed too, so a test can count the frames the scene has
  // in flight instead of waiting on real ones.
  const queue = new Map<number, FrameRequestCallback>();
  let frameIds = 0;
  vi.stubGlobal("requestAnimationFrame", (run: FrameRequestCallback) => {
    frameIds += 1;
    queue.set(frameIds, run);
    return frameIds;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => { queue.delete(id); });

  let latest = { yaw: INITIAL_YAW, pitch: INITIAL_PITCH };
  const scene = mountSpatialScene(canvas, { onPose: (yaw, pitch) => { latest = { yaw, pitch }; } });

  const dispose = (): void => {
    scene.dispose();
    if (previousMatchMedia) window.matchMedia = previousMatchMedia;
  };
  activeDispose = dispose;
  return {
    canvas,
    pose: () => latest,
    captured,
    pendingFrames: () => queue.size,
    runFrame: () => {
      const [id, run] = queue.entries().next().value ?? [];
      if (!run) return false;
      queue.delete(id!);
      run(0);
      return true;
    },
    peekFrames: () => [...queue.values()],
    dispose,
  };
}

interface PointerProps { pointerId?: number; pointerType?: string; button?: number; buttons?: number; clientX?: number; clientY?: number }
function fire(canvas: HTMLCanvasElement, type: string, props: PointerProps): void {
  const event = new Event(type, { bubbles: true, cancelable: true }) as Event & PointerProps;
  Object.assign(event, { pointerId: 1, pointerType: "mouse", button: 0, buttons: 1, clientX: 0, clientY: 0 }, props);
  canvas.dispatchEvent(event);
}

afterEach(() => {
  activeDispose?.();
  activeDispose = undefined;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("applyDragDelta (pure orbit math)", () => {
  it("raises elevation when dragged up and lowers it when dragged down", () => {
    const up = applyDragDelta(0, 0, 0, -100); // deltaY < 0 = drag up
    const down = applyDragDelta(0, 0, 0, 100); // deltaY > 0 = drag down
    expect(up.pitch).toBeCloseTo(100 * PITCH_DRAG_SENSITIVITY, 10);
    expect(down.pitch).toBeCloseTo(-100 * PITCH_DRAG_SENSITIVITY, 10);
  });

  it("winds yaw in the drag direction with no horizontal limit", () => {
    let yaw = 0;
    let pitch = 0;
    for (let step = 0; step < 10; step += 1) ({ yaw, pitch } = applyDragDelta(yaw, pitch, 1000, 0));
    expect(yaw).toBeGreaterThan(FULL_TURN * 2); // several revolutions, never clamped
    expect(pitch).toBeCloseTo(0, 6);
  });

  it("accumulates vertical rotation past 90°, 180° and a full 360° (no clamp)", () => {
    let pitch = 0;
    const milestones = new Set<string>();
    // One long continuous upward drag: each step is a small deltaY < 0.
    for (let step = 0; step < 200; step += 1) {
      ({ pitch } = applyDragDelta(0, pitch, 0, -30));
      const degrees = (pitch * 180) / Math.PI;
      for (const m of [90, 180, 270, 360, 450] as const) {
        if (degrees >= m) milestones.add(String(m));
      }
    }
    const degrees = (pitch * 180) / Math.PI;
    expect(degrees).toBeGreaterThan(450); // reached past a full vertical revolution
    expect(pitch).toBeGreaterThan(Math.PI); // past 180° of raw radians
    expect([...milestones].sort((a, b) => Number(a) - Number(b))).toEqual(["90", "180", "270", "360", "450"]);
  });

  it("reverses vertical rotation continuously (up then down)", () => {
    let pitch = 0;
    for (let step = 0; step < 40; step += 1) ({ pitch } = applyDragDelta(0, pitch, 0, -40)); // up
    const peak = pitch;
    expect(peak).toBeGreaterThan(Math.PI); // went well past 180°
    for (let step = 0; step < 20; step += 1) ({ pitch } = applyDragDelta(0, pitch, 0, 40)); // back down
    expect(pitch).toBeLessThan(peak);
    expect(pitch).toBeGreaterThan(0); // still positive: moved down from the peak, monotonically
  });

  it("accumulates both axes at once", () => {
    let yaw = 0;
    let pitch = 0;
    for (let step = 0; step < 30; step += 1) ({ yaw, pitch } = applyDragDelta(yaw, pitch, 120, -120));
    expect(yaw).toBeGreaterThan(FULL_TURN); // horizontal still winds fully
    expect(pitch).toBeGreaterThan(Math.PI / 2); // vertical winds up past 90°
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

  it("accumulates a full vertical revolution while held (no elevation freeze)", () => {
    const { canvas, pose } = mountScene();
    const start = pose();
    fire(canvas, "pointerdown", { clientX: 300, clientY: 4000 });
    let maxPitch = start.pitch;
    for (let step = 1; step <= 20; step += 1) {
      fire(canvas, "pointermove", { clientX: 300, clientY: 4000 - step * 400 }); // keep dragging up
      maxPitch = Math.max(maxPitch, pose().pitch);
    }
    const swept = maxPitch - start.pitch;
    expect(swept).toBeGreaterThan(FULL_TURN); // past 360° of vertical rotation
    expect(maxPitch).toBeGreaterThan(Math.PI); // past 180°
  });

  it("tilts up on up-drag and down on down-drag, and reverses (regression: was clamped/inverted)", () => {
    const { canvas, pose } = mountScene();
    fire(canvas, "pointerdown", { clientX: 300, clientY: 3000 });
    for (let step = 1; step <= 15; step += 1) fire(canvas, "pointermove", { clientX: 300, clientY: 3000 - step * 300 }); // drag up
    const upPitch = pose().pitch;
    expect(upPitch).toBeGreaterThan(INITIAL_PITCH);
    expect(upPitch).toBeGreaterThan(Math.PI); // kept going past 180°, no clamp

    fire(canvas, "pointerup", { clientX: 300, clientY: 3000 - 15 * 300 });
    fire(canvas, "pointerdown", { clientX: 300, clientY: 0 });
    for (let step = 1; step <= 10; step += 1) fire(canvas, "pointermove", { clientX: 300, clientY: step * 300 }); // drag down
    expect(pose().pitch).toBeLessThan(upPitch); // reversed direction, moving back down
  });

  it("keeps horizontal 360° intact while vertical passes a full turn", () => {
    const { canvas, pose } = mountScene();
    fire(canvas, "pointerdown", { clientX: 300, clientY: 4000 });
    for (let step = 1; step <= 16; step += 1) fire(canvas, "pointermove", { clientX: step * 500, clientY: 4000 - step * 350 }); // diagonal
    const { yaw, pitch } = pose();
    expect(yaw - INITIAL_YAW).toBeGreaterThan(FULL_TURN); // horizontal full turn
    expect(pitch - INITIAL_PITCH).toBeGreaterThan(FULL_TURN); // vertical full turn, simultaneously
  });

  it("continues rotating while the pointer moves outside the element (capture keeps drag alive)", () => {
    const { canvas, pose } = mountScene();
    fire(canvas, "pointerdown", { clientX: 300, clientY: 200 });
    fire(canvas, "pointermove", { clientX: 300, clientY: -5000 }); // far above the element
    expect(pose().pitch).toBeGreaterThan(INITIAL_PITCH); // still rotating, not stopped by leaving
  });

  it("stops rotating after release", () => {
    const { canvas, pose } = mountScene();
    fire(canvas, "pointerdown", { clientX: 300, clientY: 200 });
    fire(canvas, "pointermove", { clientX: 400, clientY: 100 });
    fire(canvas, "pointerup", { clientX: 400, clientY: 100 });
    const released = pose();
    fire(canvas, "pointermove", { clientX: 550, clientY: -2000 });
    expect(pose().yaw).toBeCloseTo(released.yaw, 6);
    expect(pose().pitch).toBeCloseTo(released.pitch, 6);
  });

  it("stops rotating after pointercancel and clears the grab", () => {
    const { canvas, pose, captured } = mountScene();
    fire(canvas, "pointerdown", { pointerId: 7, clientX: 300, clientY: 200 });
    expect(captured).toContain(7);
    fire(canvas, "pointermove", { pointerId: 7, clientX: 400, clientY: 100 });
    fire(canvas, "pointercancel", { pointerId: 7, clientX: 400, clientY: 100 });
    expect(captured).not.toContain(7);
    const cancelled = pose();
    fire(canvas, "pointermove", { pointerId: 7, clientX: 900, clientY: -2000 });
    expect(pose().yaw).toBeCloseTo(cancelled.yaw, 6);
    expect(pose().pitch).toBeCloseTo(cancelled.pitch, 6);
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

  it("keeps the first finger's drag when a second finger lands", () => {
    const { canvas, pose } = mountScene();
    const start = pose();
    fire(canvas, "pointerdown", { pointerId: 4, pointerType: "touch", clientX: 300, clientY: 400 });
    fire(canvas, "pointermove", { pointerId: 4, pointerType: "touch", clientX: 300, clientY: 300 }); // dragged 100px up
    const afterFirst = pose();
    expect(afterFirst.pitch).toBeGreaterThan(start.pitch);

    // A grab does not transfer to a second finger, and the model does not jump to it.
    fire(canvas, "pointerdown", { pointerId: 5, pointerType: "touch", clientX: 500, clientY: 400 });
    fire(canvas, "pointermove", { pointerId: 5, pointerType: "touch", clientX: 100, clientY: 3800 });
    expect(pose().yaw).toBeCloseTo(afterFirst.yaw, 6);
    expect(pose().pitch).toBeCloseTo(afterFirst.pitch, 6);

    // Lifting the second finger must not end the first one's grab either.
    fire(canvas, "pointerup", { pointerId: 5, pointerType: "touch", clientX: 100, clientY: 3800 });
    fire(canvas, "pointermove", { pointerId: 4, pointerType: "touch", clientX: 300, clientY: 100 });
    expect(pose().pitch).toBeGreaterThan(afterFirst.pitch);

    fire(canvas, "pointerup", { pointerId: 4, pointerType: "touch", clientX: 300, clientY: 100 });
    const released = pose();
    fire(canvas, "pointermove", { pointerId: 4, pointerType: "touch", clientX: 300, clientY: 4000 });
    expect(pose()).toEqual(released);
  });

  it("accumulates a full vertical revolution via arrow keys too (keyboard unclamped)", () => {
    const { canvas, pose } = mountScene();
    for (let step = 0; step < 120; step += 1) {
      canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", cancelable: true }));
    }
    expect(pose().pitch - INITIAL_PITCH).toBeGreaterThan(FULL_TURN); // 120 * 0.066 ≈ 7.92 rad > 2π
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

describe("the paint loop", () => {
  it("keeps one animation chain, however often it is poked", () => {
    const { canvas, pose, pendingFrames, runFrame, dispose } = mountScene({ reduced: false });
    // Mount paints once, then the loop carries on from that single frame.
    expect(pendingFrames()).toBe(1);

    // An arrow key paints directly. Each of those direct calls used to leave its own
    // pending frame behind, so eight keys meant eight parallel 60fps chains, and a
    // later dispose would have cancelled exactly one of them.
    for (let step = 0; step < 8; step += 1) {
      canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", cancelable: true }));
      expect(pendingFrames()).toBe(1);
    }

    // A resize is the same story, and so is a drag (which commits through the same
    // direct path when it is not easing).
    window.dispatchEvent(new Event("resize"));
    expect(pendingFrames()).toBe(1);
    fire(canvas, "pointerdown", { clientX: 300, clientY: 200 });
    fire(canvas, "pointermove", { clientX: 380, clientY: 160 });
    fire(canvas, "pointerup", { clientX: 380, clientY: 160 });
    expect(pendingFrames()).toBe(1);

    // Running the chain keeps it single, and the scene keeps easing toward wherever
    // the input left it.
    const before = pose().yaw;
    for (let step = 0; step < 120; step += 1) {
      expect(runFrame()).toBe(true);
      expect(pendingFrames()).toBe(1);
    }
    expect(pose().yaw).toBeGreaterThan(before);

    dispose();
    // The one id it had is the one id it cancels: nothing is left ticking.
    expect(pendingFrames()).toBe(0);
  });

  it("refuses to restart from a frame that was in flight when it was disposed", () => {
    const { pose, pendingFrames, peekFrames, dispose } = mountScene({ reduced: false });
    const inFlight = peekFrames();
    expect(inFlight).toHaveLength(1);
    const resting = pose();

    dispose();
    // A frame callback that the browser had already lined up still fires after
    // disposal; it has to render nothing and, above all, must not re-request itself.
    inFlight.forEach((run) => run(0));
    expect(pendingFrames()).toBe(0);
    expect(pose()).toEqual(resting);
  });
});

describe("projector revolution seamlessness", () => {
  it("returns to the same orientation after a full horizontal 360° turn", () => {
    const point = { x: 1.2, y: 1.1, z: 0.8 };
    const at0 = projector(600, 400, 0, INITIAL_PITCH)(point);
    const atTurn = projector(600, 400, FULL_TURN, INITIAL_PITCH)(point);
    expect(atTurn.x).toBeCloseTo(at0.x, 6);
    expect(atTurn.y).toBeCloseTo(at0.y, 6);
  });

  it("returns to the same orientation after a full vertical 360° turn", () => {
    const point = { x: 1.2, y: 1.1, z: 0.8 };
    const at0 = projector(600, 400, INITIAL_YAW, 0.3)(point);
    const atTurn = projector(600, 400, INITIAL_YAW, 0.3 + FULL_TURN)(point);
    expect(atTurn.x).toBeCloseTo(at0.x, 6);
    expect(atTurn.y).toBeCloseTo(at0.y, 6);
    expect(atTurn.depth).toBeCloseTo(at0.depth, 6);
  });

  it("stays continuous across the 180° vertical crossing (no freeze/flip of the derivative)", () => {
    const point = { x: 1.2, y: 1.1, z: 0.8 };
    const step = 0.02;
    const before = projector(600, 400, 0, Math.PI - step)(point);
    const at = projector(600, 400, 0, Math.PI)(point);
    const after = projector(600, 400, 0, Math.PI + step)(point);
    const gap1 = Math.hypot(at.x - before.x, at.y - before.y);
    const gap2 = Math.hypot(after.x - at.x, after.y - at.y);
    expect(gap2).toBeLessThan(gap1 * 2 + 1e-6); // no sudden jump past the limit
  });
});

/**
 * A context that keeps score. Every pen position, piece of type and stroke is
 * recorded, which is the only way to ask a canvas "what did you just draw" — and the
 * layers of this scene are exactly the kind of thing that can quietly stop being
 * drawn, or be drawn at NaN, without any test noticing from the DOM.
 */
interface Recording {
  ctx: CanvasRenderingContext2D;
  points: number[];
  texts: string[];
  arcs: number;
  strokes: number;
}
function recordContext(): Recording {
  const record: Recording = { points: [], texts: [], arcs: 0, strokes: 0, ctx: undefined as unknown as CanvasRenderingContext2D };
  record.ctx = new Proxy({} as Record<string, unknown>, {
    get: (target, key) => (key in target
      ? (target as Record<string | symbol, unknown>)[key]
      : (...args: unknown[]) => {
        if (key === "moveTo" || key === "lineTo") record.points.push(...(args as number[]));
        if (key === "arc") { record.points.push(args[0] as number, args[1] as number); record.arcs += 1; }
        if (key === "fillText") { record.texts.push(String(args[0])); record.points.push(args[1] as number, args[2] as number); }
        if (key === "stroke") record.strokes += 1;
      }),
    set: (target, key, value) => { (target as Record<string | symbol, unknown>)[key] = value; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return record;
}

const STAGES: readonly SceneMode[] = [0, 1, 2];

function paint(mode: SceneMode, time: number, animate: boolean, yaw = INITIAL_YAW): Recording {
  const record = recordContext();
  paintScene(record.ctx, 1000, 500, time, mode, yaw, 0.14, makePointCloud(), animate);
  return record;
}

describe("what the scene draws", () => {
  it("rings the subject with eight numbered stations, in every stage", () => {
    STAGES.forEach((mode) => {
      const { texts } = paint(mode, 4.2, true);
      const stations = ["01", "02", "03", "04", "05", "06", "07", "08"].filter((label) => texts.includes(label));
      expect(stations, `stage ${mode} numbers all eight keyframes`).toHaveLength(8);
    });
  });

  it("labels the axes it measures against", () => {
    const { texts } = paint(0, 1.5, true);
    expect(["X", "Y", "Z"].every((axis) => texts.includes(axis))).toBe(true);
  });

  it("never puts a non-finite number on the canvas, at any stage or angle", () => {
    STAGES.forEach((mode) => {
      [-0.52, 0.9, 1.9, 3.1, 4.4, 6.0].forEach((yaw) => {
        [0, 1.7, 9.4].forEach((time) => {
          const { points } = paint(mode, time, true, yaw);
          expect(points.length, `stage ${mode} at yaw ${yaw} drew something`).toBeGreaterThan(0);
          expect(points.every(Number.isFinite), `stage ${mode} at yaw ${yaw} stays finite`).toBe(true);
        });
      });
    });
  });

  it("finishes the map rather than emptying it when motion is reduced", () => {
    // The same instant, painted live and painted still. Live and early in the sweep,
    // the beam has not reached most of the cloud yet; still, the cloud is the finished
    // map it is scanning into — a paused film, not a blank wall.
    const live = paint(0, 0.2, true);
    const still = paint(0, 0.2, false);
    expect(still.arcs).toBeGreaterThan(live.arcs * 4);
    // And it is the whole drawing that survives, not just the points.
    expect(still.strokes).toBeGreaterThan(50);
    expect(["01", "08"].every((label) => still.texts.includes(label))).toBe(true);
  });

  it("draws every station exactly once, splitting the rig across the room's depth", () => {
    // The rig is painted twice a frame — the half behind the subject, then the half in
    // front. Split wrong and a station either vanishes or is drawn twice.
    // Sorted, because the two passes contribute them in depth order, not station order.
    const labels = paint(1, 0.4, true).texts.filter((text) => /^0[1-8]$/.test(text)).sort();
    expect(labels).toEqual(["01", "02", "03", "04", "05", "06", "07", "08"]);
  });
});

describe("the pose readout", () => {
  it("reads the opening pose as a dial, not as radians", () => {
    // The pinned figure for the pose the scene opens on — the one number in this file that
    // is allowed to be a literal, because it is what a reviewer would read on screen. Raise
    // the camera and this fails on purpose: the hero's own readout is derived, not pinned.
    expect(formatPoseReadout(INITIAL_POSE.yaw, INITIAL_POSE.pitch)).toBe("YAW 330° · PITCH +011°");
  });

  it("keeps yaw inside one turn however far the drag wound it", () => {
    // Drag past a full revolution and the readout reports where on the dial you are,
    // not how many times you have been round.
    expect(formatPoseReadout(FULL_TURN * 2 + 90 * DEG, 0)).toBe("YAW 090° · PITCH +000°");
    expect(formatPoseReadout(-90 * DEG, 0)).toBe("YAW 270° · PITCH +000°");
    // The far side of a turn, where a naive wrap would print a 360 no dial has.
    expect(formatPoseReadout(359.9 * DEG, 0)).toBe("YAW 000° · PITCH +000°");
  });

  it("signs pitch, and never shows a negative zero", () => {
    expect(formatPoseReadout(0, -0.1)).toBe("YAW 000° · PITCH −006°");
    expect(formatPoseReadout(0, 0)).toBe("YAW 000° · PITCH +000°");
    expect(formatPoseReadout(0, -0.001)).toBe("YAW 000° · PITCH +000°");
  });
});
