import { applyDragDelta, FULL_TURN, PITCH_DRAG_SENSITIVITY, toDegrees, YAW_DRAG_SENSITIVITY } from "../spatial/drag-orbit";

type Vec3 = { x: number; y: number; z: number };
type ScreenPoint = { x: number; y: number; depth: number };
export type SceneMode = 0 | 1 | 2;

const ROOM_WIDTH = 3.35;
const ROOM_DEPTH = 3.1;
const ROOM_HEIGHT = 2.75;
const CAMERA_TARGET: Vec3 = { x: 0, y: 0.75, z: 0 };

/**
 * How far the eye sits from the room, in scene units. Everything is sized around
 * this: it is the depth a point at the centre of the room projects at, so it is
 * also the line between "nearer than the subject" and "behind it".
 */
const CAMERA_DISTANCE = 14;

/**
 * Eight camera stations ringed around the subject at deliberately uneven heights,
 * so the pose graph never reads as a flat circle. Deterministic on purpose: the rig
 * has to be the same rig in every frame, and in every test.
 */
const KEYFRAME_RING: readonly Vec3[] = Array.from({ length: 8 }, (_, index) => {
  const angle = (index / 8) * FULL_TURN + 0.34;
  const radius = 3.05 + (index % 3) * 0.28;
  const height = index % 2 === 0 ? 0.62 + (index % 4) * 0.44 : 2.3 - (index % 3) * 0.38;
  return { x: Math.cos(angle) * radius, y: height, z: Math.sin(angle) * radius };
});

/** Dashed planes through the room at reading height, chest height, eye height. */
const DEPTH_CONTOURS: readonly number[] = [0.55, 1.2, 1.85];

/** How long one station holds the emphasis, so the rig reads as a sequence. */
const KEYFRAME_HOLD = 1.9;

/**
 * The pose the scene opens on. Exported because the page shows this pose as text
 * before the first frame has anything to report, and a readout that starts by
 * disagreeing with the picture is worse than no readout.
 *
 * The pitch is high enough to read the floor as a plane rather than a line: the room
 * is being shown as a volume someone walked around, not as a façade seen head-on.
 */
export const INITIAL_POSE: { yaw: number; pitch: number } = { yaw: -0.52, pitch: 0.2 };

// The drag convention itself lives in src/spatial/drag-orbit.ts so that the
// identity object and the room scan cannot drift apart on sign or range. It is
// re-exported here because this has always been the module callers and the
// behavioural tests import it from.
export { applyDragDelta, FULL_TURN, PITCH_DRAG_SENSITIVITY, YAW_DRAG_SENSITIVITY };

const ORBIT_SMOOTHING = 0.16;

export function mountSpatialScene(canvas: HTMLCanvasElement, options?: { onPose?: (yaw: number, pitch: number) => void }): { setStage(stage: number): void; dispose(): void } {
  const context = canvas.getContext("2d");
  if (!context) return { setStage: () => undefined, dispose: () => undefined };

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const cloud = makePointCloud();
  let mode: SceneMode = 0;
  let width = 1;
  let height = 1;
  let pixelRatio = 1;
  let frame = 0;
  let targetYaw = INITIAL_POSE.yaw;
  let targetPitch = INITIAL_POSE.pitch;
  let yaw = targetYaw;
  let pitch = targetPitch;
  let press: { pointerId: number; x: number; y: number } | undefined;
  let inView = true;
  let disposed = false;
  // A tap — not a drag — leaves a ripple where it landed. `downAt` is the immutable point
  // the gesture started at; `press.x/y` above gets overwritten on every drag move, which is
  // exactly why a second, untouched record is needed to tell "held still and released" from
  // "dragged in a circle and happened to end up close to where it began".
  let downAt: { x: number; y: number; time: number } | undefined;
  let ripples: { x: number; y: number; start: number }[] = [];
  const RIPPLE_LIFE = 650;
  // The scene does not arrive finished. makePointCloud emits the back wall, then the
  // left wall, then the floor, then the furniture — so drawing the leading slice of it
  // resolves the room surface by surface, which is what a capture looks like as it
  // builds. A fade would have hidden that; this is the same ten frames doing the work
  // the scan does later on. Frozen, there is nothing to build and the plate is full.
  const openedAt = reducedMotion ? 0 : performance.now();

  const resize = (): void => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    width = rect.width;
    height = rect.height;
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    render(performance.now());
  };

  const render = (now: number): void => {
    if (disposed) return;
    // This call owns the loop. `frame` still holds the id this callback was scheduled
    // under, and a direct call (arrow key, resize) still holds whatever frame was
    // pending — either way it is cancelled before the next one is requested, or every
    // direct call would leave an orphan 60fps chain behind that nothing can cancel.
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (!reducedMotion) {
      yaw += (targetYaw - yaw) * ORBIT_SMOOTHING;
      pitch += (targetPitch - pitch) * ORBIT_SMOOTHING;
    }
    const reveal = reducedMotion ? 1 : clamp((now - openedAt) / 950, 0, 1);
    paintScene(context, width, height, now / 1000, mode, yaw, pitch, reveal >= 1 ? cloud : cloud.slice(0, Math.round(cloud.length * reveal * reveal)), !reducedMotion, hoverIndex);
    options?.onPose?.(yaw, pitch);
    // A tap's own feedback, drawn straight in canvas pixels rather than threaded through
    // paintScene as a 3D point — it belongs to the glass, not the room, so it stays put
    // exactly where the finger landed regardless of how the model orbits under it.
    if (ripples.length) {
      ripples = ripples.filter((ripple) => now - ripple.start < RIPPLE_LIFE);
      ripples.forEach((ripple) => {
        const age = clamp((now - ripple.start) / RIPPLE_LIFE, 0, 1);
        context.beginPath();
        context.arc(ripple.x, ripple.y, 4 + age * 26, 0, Math.PI * 2);
        context.globalAlpha = (1 - age) * 0.55;
        context.strokeStyle = "#b17f55";
        context.lineWidth = 1.4;
        context.stroke();
        context.globalAlpha = 1;
      });
    }
    if (!reducedMotion && !document.hidden && inView) frame = requestAnimationFrame(render);
  };
  const startAnimation = (): void => {
    if (!reducedMotion && !document.hidden && inView && !frame) frame = requestAnimationFrame(render);
  };

  // The one thing a reader can do without dragging: point at a station and have it answer.
  // Independent of the grab-orbit state below — mouse only, since touch has no hover and
  // would otherwise light up whatever station a finger last tapped near on its way past.
  let hoverIndex = -1;
  const onHoverMove = (event: PointerEvent): void => {
    if (press || event.pointerType !== "mouse") return;
    const rect = canvas.getBoundingClientRect();
    const project = projector(width, height, yaw, pitch);
    let nearest = -1;
    let nearestDistance = 22;
    KEYFRAME_RING.forEach((point, index) => {
      const screen = project(point);
      const distance = Math.hypot(screen.x - (event.clientX - rect.left), screen.y - (event.clientY - rect.top));
      if (distance < nearestDistance) { nearestDistance = distance; nearest = index; }
    });
    if (nearest === hoverIndex) return;
    hoverIndex = nearest;
    if (reducedMotion) render(performance.now());
  };
  const onHoverLeave = (): void => {
    if (hoverIndex === -1) return;
    hoverIndex = -1;
    if (reducedMotion) render(performance.now());
  };

  // Grab-and-drag orbit: the scene only moves while a primary pointer is held
  // down. Each move contributes a delta (see applyDragDelta); release/cancel/
  // leave always clears the grab so the model is never left "held".
  const commit = (next: { yaw: number; pitch: number }): void => {
    targetYaw = next.yaw;
    targetPitch = next.pitch;
    if (reducedMotion) { yaw = targetYaw; pitch = targetPitch; render(performance.now()); }
  };
  const onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    // A grab does not transfer. A second finger landing mid-drag used to become the
    // pointer being tracked, which teleported the model to the new finger; only the
    // first pointer holds the object until it is released.
    if (press || event.isPrimary === false) return;
    press = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    downAt = { x: event.clientX, y: event.clientY, time: performance.now() };
    canvas.setPointerCapture?.(event.pointerId);
    canvas.classList.add("is-orbiting");
  };
  const onPointerMove = (event: PointerEvent): void => {
    if (!press || press.pointerId !== event.pointerId) return;
    if (event.pointerType === "mouse" && event.buttons === 0) return;
    const next = applyDragDelta(targetYaw, targetPitch, event.clientX - press.x, event.clientY - press.y);
    press.x = event.clientX;
    press.y = event.clientY;
    commit(next);
  };
  const onPointerRelease = (event: PointerEvent): void => {
    if (press && event.pointerId !== press.pointerId) return;
    // A tap: held still, released promptly, and a genuine release rather than a cancel —
    // a drag that happened to end back near where it started still moved, and a cancelled
    // gesture (losing capture, a scroll takeover) isn't an intentional tap either.
    if (!reducedMotion && event.type === "pointerup" && downAt && Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) < 6 && performance.now() - downAt.time < 600) {
      const rect = canvas.getBoundingClientRect();
      ripples = [...ripples, { x: event.clientX - rect.left, y: event.clientY - rect.top, start: performance.now() }].slice(-4);
      startAnimation();
    }
    downAt = undefined;
    if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture?.(event.pointerId);
    press = undefined;
    canvas.classList.remove("is-orbiting");
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    const rotation = event.shiftKey ? 0.24 : 0.12;
    if (event.key === "ArrowLeft") targetYaw -= rotation;
    else if (event.key === "ArrowRight") targetYaw += rotation;
    else if (event.key === "ArrowUp") targetPitch += rotation * 0.55;
    else if (event.key === "ArrowDown") targetPitch -= rotation * 0.55;
    else return;
    event.preventDefault();
    if (reducedMotion) { yaw = targetYaw; pitch = targetPitch; }
    render(performance.now());
  };
  const onVisibilityChange = (): void => {
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
    else startAnimation();
  };
  const resizeObserver = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(resize);
  const visibilityObserver = typeof IntersectionObserver === "undefined" ? undefined : new IntersectionObserver((entries) => {
    inView = entries.some((entry) => entry.isIntersecting);
    if (!inView) { cancelAnimationFrame(frame); frame = 0; }
    else startAnimation();
  });

  // No pointerleave handler: pointer capture keeps the drag alive when the
  // pointer leaves the canvas mid-gesture, so a full revolution can continue
  // outside the original bounds. Only up/cancel end the grab.
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointermove", onHoverMove);
  canvas.addEventListener("pointerleave", onHoverLeave);
  canvas.addEventListener("pointerup", onPointerRelease);
  canvas.addEventListener("pointercancel", onPointerRelease);
  canvas.addEventListener("keydown", onKeyDown);
  document.addEventListener("visibilitychange", onVisibilityChange);
  resizeObserver?.observe(canvas);
  visibilityObserver?.observe(canvas);
  if (!resizeObserver) window.addEventListener("resize", resize);
  resize();
  startAnimation();

  return {
    setStage(stage: number): void { mode = clamp(Math.round(stage), 0, 2) as SceneMode; if (reducedMotion) render(performance.now()); },
    dispose(): void {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      visibilityObserver?.disconnect();
      if (!resizeObserver) window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointermove", onHoverMove);
      canvas.removeEventListener("pointerleave", onHoverLeave);
      canvas.removeEventListener("pointerup", onPointerRelease);
      canvas.removeEventListener("pointercancel", onPointerRelease);
      canvas.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    },
  };
}

/**
 * One frame of the room, painted back to front.
 *
 * `animate` is the difference between a live scan and a plate: with it off, every
 * travelling element parks at a position that shows the work *finished* — the cloud
 * fully resolved, all eight stations linked, no pulse caught mid-beat — instead of
 * the scene going flat and empty. Reduced motion is a paused film, not a blank wall.
 */
export function paintScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  mode: SceneMode,
  yaw: number,
  pitch: number,
  cloud: readonly Vec3[],
  animate: boolean,
  // Optional and last, so every existing caller (including the test suite's positional
  // `paintScene(ctx, w, h, time, mode, yaw, pitch, cloud, animate)` calls) keeps working
  // unchanged. -1 means "nothing is being pointed at".
  hoverIndex = -1,
): void {
  ctx.clearRect(0, 0, width, height);
  const project = projector(width, height, yaw + (animate ? Math.sin(time * 0.17) * 0.035 : 0), pitch);
  const horizon = project(CAMERA_TARGET).depth;
  drawScanField(ctx, project, mode, time, animate);
  // The rig is drawn twice, split on the subject's own depth, so a station that has
  // orbited behind the room is occluded by it instead of floating on top.
  drawKeyframeRig(ctx, project, mode, time, animate, horizon, "back", hoverIndex);
  drawRoomShell(ctx, project, mode);
  drawFloorGrid(ctx, project, mode);
  drawGhostShells(ctx, project, mode, time, animate);
  drawFurniture(ctx, project, mode);
  if (mode === 2) {
    drawRoomMesh(ctx, project);
    drawResolvedSurfaces(ctx, project, time, animate);
  }
  drawPointCloud(ctx, project, cloud, mode, time, animate);
  drawScanBeam(ctx, project, mode, time, animate);
  drawKeyframeRig(ctx, project, mode, time, animate, horizon, "front", hoverIndex);
  if (mode === 2) drawRefinementPulse(ctx, project, time, animate);
}

export function projector(width: number, height: number, yaw: number, pitch: number): (point: Vec3) => ScreenPoint {
  const cosYaw = Math.cos(yaw), sinYaw = Math.sin(yaw);
  const cosPitch = Math.cos(pitch), sinPitch = Math.sin(pitch);
  // Two terms, and they answer to different axes. The width term is what makes the room
  // fill the stage instead of sitting in the middle of it; 2.1 is the aspect a wide stage
  // already has, so a phone stage — squarer than the drawing is wide — crops in and lets
  // the empty near corners run past the frame rather than shrink the room to a flat band.
  // The height term is the one that decides whether the drawing has vertical presence: at
  // this focal the reconstruction is about 0.22 of a focal length tall, so 3.9 keeps it
  // inside a stage of any proportion at roughly four fifths of its height. Loosen that
  // number and a short stage hands the room a flat band; tighten it and a tall one gets a
  // room that stops short of the frame.
  const crop = clamp(2.1 / (width / height), 1, 1.34);
  const focal = Math.min(width * 1.42 * crop, height * 3.9);
  // The target sits near the floor, so the drawing reaches up from here much further than
  // it reaches down, and the anchor has to sit low in the stage to keep the ceiling and the
  // high stations inside it.
  const targetY = height * 0.6;
  return ({ x, y, z }) => {
    const rotatedX = x * cosYaw - z * sinYaw;
    const rotatedZ = x * sinYaw + z * cosYaw;
    const centeredY = y - 0.82;
    const rotatedY = centeredY * cosPitch - rotatedZ * sinPitch;
    const depth = Math.max(4.5, CAMERA_DISTANCE + centeredY * sinPitch + rotatedZ * cosPitch);
    const scale = focal / depth;
    // Vertical squash, i.e. how much the projection is a plan view of the volume and how
    // much it is a flat elevation of it. Left low it is the reason the room read as a wide
    // strip; 0.78 keeps the foreshortening without flattening the walls into the floor.
    return { x: width / 2 + rotatedX * scale, y: targetY - rotatedY * scale * 0.78, depth };
  };
}

/**
 * A soft light source, placed where the window already is, rendered as a screen-space
 * gradient rather than a per-vertex value — canvas has no per-fragment lighting, so this
 * is the cheap approximation: a radial falloff centred on the window's projected position,
 * warm at the source and cooling toward whatever base tone the surface already had. Reused
 * across the floor and both walls so the three faces read as lit by one thing, not three.
 */
function windowLight(ctx: CanvasRenderingContext2D, project: (point: Vec3) => ScreenPoint, base: string, litRadius: number): string | CanvasGradient {
  const source = project({ x: -0.6, y: 1.4, z: -ROOM_DEPTH });
  const gradient = ctx.createRadialGradient(source.x, source.y, 0, source.x, source.y, litRadius);
  // Falls back to the flat base colour if the context can't actually build a gradient —
  // a stub context in a test, or any environment where canvas is a no-op — rather than
  // assuming addColorStop exists on whatever createRadialGradient happened to return.
  if (!gradient || typeof gradient.addColorStop !== "function") return base;
  gradient.addColorStop(0, shade(base, 1.22));
  gradient.addColorStop(0.55, base);
  gradient.addColorStop(1, shade(base, 0.86));
  return gradient;
}

function drawRoomShell(ctx: CanvasRenderingContext2D, project: (point: Vec3) => ScreenPoint, mode: SceneMode): void {
  const x = ROOM_WIDTH, z = ROOM_DEPTH, h = ROOM_HEIGHT;
  polygon(ctx, project, [{ x: -x, y: 0, z: -z }, { x, y: 0, z: -z }, { x, y: 0, z }, { x: -x, y: 0, z }], windowLight(ctx, project, "rgba(196, 215, 203, .58)", 520), "#7b998d", .95);
  polygon(ctx, project, [{ x: -x, y: 0, z: -z }, { x, y: 0, z: -z }, { x, y: h, z: -z }, { x: -x, y: h, z: -z }], windowLight(ctx, project, mode === 2 ? "rgba(190, 211, 201, .3)" : "rgba(215, 223, 207, .26)", 460), "#8da79a", .92);
  polygon(ctx, project, [{ x: -x, y: 0, z: -z }, { x: -x, y: 0, z }, { x: -x, y: h, z }, { x: -x, y: h, z: -z }], windowLight(ctx, project, mode === 2 ? "rgba(209, 220, 202, .22)" : "rgba(218, 221, 203, .18)", 380), "#9aab9b", .8);
  const edges: readonly [Vec3, Vec3][] = [
    [{ x: -x, y: 0, z: -z }, { x, y: 0, z: -z }], [{ x, y: 0, z: -z }, { x, y: 0, z }], [{ x, y: 0, z }, { x: -x, y: 0, z }], [{ x: -x, y: 0, z }, { x: -x, y: 0, z: -z }],
    [{ x: -x, y: h, z: -z }, { x, y: h, z: -z }], [{ x: -x, y: h, z: -z }, { x: -x, y: h, z }], [{ x: -x, y: h, z }, { x: -x, y: 0, z }], [{ x, y: h, z: -z }, { x, y: 0, z: -z }], [{ x: -x, y: h, z: -z }, { x: -x, y: 0, z: -z }],
  ];
  edges.forEach(([a, b], index) => line3d(ctx, project, a, b, index < 4 ? "#66877b" : "#779186", index < 4 ? .58 : .8, 1));
  const windowRect = [{ x: -1.6, y: .8, z: -z + .015 }, { x: .75, y: .8, z: -z + .015 }, { x: .75, y: 2.35, z: -z + .015 }, { x: -1.6, y: 2.35, z: -z + .015 }];
  polygon(ctx, project, windowRect, "rgba(248, 249, 237, .42)", "#8da699", .78);
  line3d(ctx, project, { x: -.42, y: .8, z: -z }, { x: -.42, y: 2.35, z: -z }, "#94a99d", .74, 1);
  line3d(ctx, project, { x: -1.6, y: 1.58, z: -z }, { x: .75, y: 1.58, z: -z }, "#94a99d", .74, 1);
}

function drawFloorGrid(ctx: CanvasRenderingContext2D, project: (point: Vec3) => ScreenPoint, mode: SceneMode): void {
  const lineColor = mode === 2 ? "#658d7d" : "#8ca596";
  for (let x = -ROOM_WIDTH; x <= ROOM_WIDTH; x += .5) line3d(ctx, project, { x, y: .012, z: -ROOM_DEPTH }, { x, y: .012, z: ROOM_DEPTH }, lineColor, mode === 2 ? .34 : .24, .75);
  for (let z = -ROOM_DEPTH; z <= ROOM_DEPTH; z += .5) line3d(ctx, project, { x: -ROOM_WIDTH, y: .012, z }, { x: ROOM_WIDTH, y: .012, z }, lineColor, mode === 2 ? .34 : .24, .75);
}

/**
 * The scaffolding the reconstruction is measured against: corner brackets marking
 * the scanned volume, an axis triad at its origin, dashed contour planes, and an
 * eye line running out past the walls. Everything here is deliberately fainter than
 * the room — it is the paper the drawing sits on, not a second subject.
 */
function drawScanField(ctx: CanvasRenderingContext2D, project: (point: Vec3) => ScreenPoint, mode: SceneMode, time: number, animate: boolean): void {
  // These were tuned when a gradient wash sat over them and pulled them back. On bare
  // paper the same numbers disappear, so the whole field carries a little more ink —
  // still well under the room's own outlines, which stay the darkest thing drawn.
  const emphasis = mode === 1 ? 1.3 : 1;
  drawEyeLine(ctx, project, .17 * emphasis);
  drawVolumeBrackets(ctx, project, .3 * emphasis);
  drawBoundaryTicks(ctx, project, .22 * emphasis);
  drawAxisTriad(ctx, project, .34 * emphasis, time, animate);
  drawDepthContours(ctx, project, .2);
}

/** A dashed horizon at standing height, extending past the room on both sides. */
function drawEyeLine(ctx: CanvasRenderingContext2D, project: (point: Vec3) => ScreenPoint, alpha: number): void {
  dashed(ctx, [4, 6], () => line3d(ctx, project, { x: -ROOM_WIDTH * 1.7, y: 1.5, z: 0 }, { x: ROOM_WIDTH * 1.7, y: 1.5, z: 0 }, "#6d8b7c", alpha, 1));
}

/** L-shaped brackets at the four floor corners: the boundary of the scan volume. */
function drawVolumeBrackets(ctx: CanvasRenderingContext2D, project: (point: Vec3) => ScreenPoint, alpha: number): void {
  const inset = 0.12;
  const arm = 0.62;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (ROOM_WIDTH - inset);
    const z = sz * (ROOM_DEPTH - inset);
    line3d(ctx, project, { x, y: 0.02, z }, { x: x - sx * arm, y: 0.02, z }, "#5d8271", alpha, 1.3);
    line3d(ctx, project, { x, y: 0.02, z }, { x, y: 0.02, z: z - sz * arm }, "#5d8271", alpha, 1.3);
  }
}

/** Short ticks standing off the two visible floor edges, like a measuring rule. */
function drawBoundaryTicks(ctx: CanvasRenderingContext2D, project: (point: Vec3) => ScreenPoint, alpha: number): void {
  for (let x = -ROOM_WIDTH + 0.5; x <= ROOM_WIDTH - 0.4; x += 0.5) {
    const long = Math.round(x * 2) % 4 === 0;
    line3d(ctx, project, { x, y: 0.02, z: ROOM_DEPTH }, { x, y: 0.02, z: ROOM_DEPTH + (long ? 0.16 : 0.09) }, "#6f8b7c", long ? alpha * 1.4 : alpha, 1);
  }
  for (let z = -ROOM_DEPTH + 0.5; z <= ROOM_DEPTH - 0.4; z += 0.5) {
    const long = Math.round(z * 2) % 4 === 0;
    line3d(ctx, project, { x: -ROOM_WIDTH, y: 0.02, z }, { x: -ROOM_WIDTH - (long ? 0.16 : 0.09), y: 0.02, z }, "#6f8b7c", long ? alpha * 1.4 : alpha, 1);
  }
}

/** X / Y / Z from the back-left floor corner, which is the volume's origin. */
function drawAxisTriad(ctx: CanvasRenderingContext2D, project: (point: Vec3) => ScreenPoint, alpha: number, time: number, animate: boolean): void {
  const origin: Vec3 = { x: -ROOM_WIDTH, y: 0, z: -ROOM_DEPTH };
  const length = 1.15;
  const axes: readonly [{ readonly label: "X"; readonly to: Vec3 }, { readonly label: "Y"; readonly to: Vec3 }, { readonly label: "Z"; readonly to: Vec3 }] = [
    { label: "X", to: { x: origin.x + length, y: 0, z: origin.z } },
    { label: "Y", to: { x: origin.x, y: length, z: origin.z } },
    { label: "Z", to: { x: origin.x, y: 0, z: origin.z + length } },
  ];
  axes.forEach(({ to }) => {
    line3d(ctx, project, origin, to, "#527d6c", alpha, 1.1);
    for (let step = 0.3; step < length; step += 0.3) {
      const mark = toward(origin, to, step / length);
      line3d(ctx, project, { ...mark, y: mark.y + 0.06 }, { ...mark, y: mark.y - 0.06 }, "#527d6c", alpha * 0.75, 1);
    }
  });
  // The letters hold still when the reader has asked not to be chased: they sit at
  // the tip of their axis either way, only the breath on them stops.
  const lift = animate ? Math.sin(time * 0.9) * 0.008 : 0;
  axes.forEach(({ label, to }) => label3d(ctx, project(to), label, "#4d7565", alpha + (animate ? 0.06 : 0.1), 8 + lift * 100));
}

function drawDepthContours(ctx: CanvasRenderingContext2D, project: (point: Vec3) => ScreenPoint, alpha: number): void {
  const inset = 0.42;
  dashed(ctx, [4, 5], () => DEPTH_CONTOURS.forEach((y, index) => {
    const x = ROOM_WIDTH - inset;
    const z = ROOM_DEPTH - inset;
    const corners: readonly Vec3[] = [{ x: -x, y, z: -z }, { x, y, z: -z }, { x, y, z }, { x: -x, y, z }];
    corners.forEach((from, corner) => line3d(ctx, project, from, corners[(corner + 1) % corners.length]!, "#5f8878", alpha + index * 0.015, 1));
  }));
}

/**
 * The tolerance shell around each solid: a wireframe slightly larger than the thing
 * itself, which is what an unrefined surface looks like from the outside. In Refine
 * these are gone — the surfaces have landed — and the ghosting moves to the walls.
 */
function drawGhostShells(ctx: CanvasRenderingContext2D, project: (point: Vec3) => ScreenPoint, mode: SceneMode, time: number, animate: boolean): void {
  if (mode === 2) return;
  GHOST_SHELLS.forEach((shell, index) => {
    const breath = animate ? 0.045 + Math.sin(time * 0.8 + index * 1.4) * 0.012 : 0.05;
    wireBox(ctx, project, expand(shell, breath), "#6b8c7c", mode === 1 ? 0.3 : 0.24);
  });
}

// The chair and the lamp are deliberately left out here. A ghost shell reads fine around
// something chunky like the table or the object on it, where the wireframe sits close to
// the solid it is a tolerance around — but the chair and lamp are thin and tall, so a
// shell wrapping their *whole* bounding box (floor to lamp shade, floor to chair back) is
// mostly empty air around a small dotted top. That is what looked like a surface missing
// its scan coverage; it was a wireframe that was never meant to have any.
const GHOST_SHELLS: readonly { min: Vec3; max: Vec3 }[] = [
  { min: { x: -.95, y: .12, z: -.15 }, max: { x: .9, y: .94, z: 1.05 } },
  { min: { x: -.32, y: 1.12, z: .2 }, max: { x: .3, y: 1.68, z: .82 } },
];

function drawFurniture(ctx: CanvasRenderingContext2D, project: (point: Vec3) => ScreenPoint, mode: SceneMode): void {
  const refinement = mode === 2;
  // Unrefined solids are still *there* — they just aren't decided yet. On bare paper
  // the old fills read as nothing at all, so each one carries enough pigment to be
  // seen as a volume while staying visibly cloudier than the refined version.
  // The table: base, top, four legs.
  drawBox(ctx, project, { min: { x: -.95, y: .12, z: -.15 }, max: { x: .9, y: .94, z: 1.05 } }, refinement ? "rgba(119, 157, 137, .78)" : "rgba(169, 186, 164, .34)", "#668579", refinement ? .92 : .78);
  drawBox(ctx, project, { min: { x: -1.18, y: .93, z: -.42 }, max: { x: 1.12, y: 1.12, z: 1.27 } }, refinement ? "rgba(205, 183, 145, .9)" : "rgba(205, 183, 145, .46)", "#9c8d71", .88);
  for (const x of [-.82, .78]) for (const z of [-.25, 1.08]) {
    drawBox(ctx, project, { min: { x: x - .07, y: 0, z: z - .07 }, max: { x: x + .07, y: .94, z: z + .07 } }, refinement ? "rgba(143, 160, 137, .8)" : "rgba(143, 160, 137, .38)", "#708575", .8);
  }
  // The object being scanned, sitting on the table — the one thing this room exists to
  // reconstruct.
  drawBox(ctx, project, { min: { x: -.32, y: 1.12, z: .2 }, max: { x: .3, y: 1.68, z: .82 } }, refinement ? "rgba(193, 155, 118, .88)" : "rgba(193, 155, 118, .42)", "#9e795b", .88);
  // The low bench in the back-left corner, and something left on it.
  drawBox(ctx, project, { min: { x: -2.65, y: .1, z: -1.1 }, max: { x: -1.65, y: .74, z: .2 } }, refinement ? "rgba(152, 175, 159, .72)" : "rgba(152, 175, 159, .28)", "#81978a", .82);
  drawBox(ctx, project, { min: { x: -2.4, y: .74, z: -.95 }, max: { x: -1.9, y: .84, z: -.35 } }, refinement ? "rgba(190, 140, 110, .82)" : "rgba(190, 140, 110, .34)", "#8a5f45", .8);
  drawBox(ctx, project, { min: { x: -2.32, y: .84, z: -.86 }, max: { x: -1.98, y: .92, z: -.44 } }, refinement ? "rgba(206, 162, 128, .82)" : "rgba(206, 162, 128, .34)", "#96694d", .8);
  // A chair, pulled up to the table on the open side: seat, backrest, four legs — the
  // room's first piece of furniture that isn't a flat surface something else sits on.
  drawBox(ctx, project, { min: { x: -.16, y: .4, z: 1.42 }, max: { x: .16, y: .48, z: 1.7 } }, refinement ? "rgba(178, 148, 112, .84)" : "rgba(178, 148, 112, .36)", "#8a7355", .84);
  drawBox(ctx, project, { min: { x: -.16, y: .48, z: 1.6 }, max: { x: .16, y: .98, z: 1.68 } }, refinement ? "rgba(178, 148, 112, .8)" : "rgba(178, 148, 112, .32)", "#8a7355", .8);
  for (const x of [-.13, .13]) for (const z of [1.45, 1.67]) {
    drawBox(ctx, project, { min: { x: x - .03, y: 0, z: z - .03 }, max: { x: x + .03, y: .4, z: z + .03 } }, refinement ? "rgba(150, 126, 96, .8)" : "rgba(150, 126, 96, .3)", "#75603f", .76);
  }
  // A floor lamp in the back-right corner: base, pole, shade — tall and thin, which is
  // what makes the room read as a volume with height rather than a floor plan with walls.
  drawBox(ctx, project, { min: { x: 2.52, y: 0, z: -2.58 }, max: { x: 2.88, y: .06, z: -2.22 } }, refinement ? "rgba(140, 150, 145, .78)" : "rgba(140, 150, 145, .3)", "#6d7d76", .78);
  drawBox(ctx, project, { min: { x: 2.66, y: .06, z: -2.42 }, max: { x: 2.74, y: 1.86, z: -2.38 } }, refinement ? "rgba(140, 150, 145, .7)" : "rgba(140, 150, 145, .26)", "#6d7d76", .7);
  drawBox(ctx, project, { min: { x: 2.42, y: 1.86, z: -2.62 }, max: { x: 2.98, y: 2.16, z: -2.18 } }, refinement ? "rgba(232, 212, 176, .9)" : "rgba(232, 212, 176, .48)", "#a68f63", .86);
}

function drawBox(ctx: CanvasRenderingContext2D, project: (point: Vec3) => ScreenPoint, box: { min: Vec3; max: Vec3 }, fill: string, stroke: string, alpha: number): void {
  const { min, max } = box;
  const p = [
    { x: min.x, y: min.y, z: min.z }, { x: max.x, y: min.y, z: min.z }, { x: max.x, y: max.y, z: min.z }, { x: min.x, y: max.y, z: min.z },
    { x: min.x, y: min.y, z: max.z }, { x: max.x, y: min.y, z: max.z }, { x: max.x, y: max.y, z: max.z }, { x: min.x, y: max.y, z: max.z },
  ];
  const faces = [[3, 2, 6, 7], [1, 5, 6, 2], [4, 5, 6, 7], [0, 1, 2, 3]];
  // The top face (index 2) catches the window directly, so it gets the same gradient
  // treatment as the room shell instead of a flat multiplier — everything else on the box
  // stays a plain shade, which is enough for faces the light only grazes.
  const faceColors: readonly (string | CanvasGradient)[] = [fill, shade(fill, .82), windowLight(ctx, project, shade(fill, 1.12), 260), shade(fill, .94)];
  faces.forEach((face, index) => polygon(ctx, project, face.map((pointIndex) => p[pointIndex]!), faceColors[index]!, stroke, alpha));
}

function drawRoomMesh(ctx: CanvasRenderingContext2D, project: (point: Vec3) => ScreenPoint): void {
  for (let x = -ROOM_WIDTH; x <= ROOM_WIDTH; x += .35) line3d(ctx, project, { x, y: 0, z: -ROOM_DEPTH }, { x, y: ROOM_HEIGHT, z: -ROOM_DEPTH }, "#476f61", .38, .65);
  for (let y = .25; y < ROOM_HEIGHT; y += .25) line3d(ctx, project, { x: -ROOM_WIDTH, y, z: -ROOM_DEPTH }, { x: ROOM_WIDTH, y, z: -ROOM_DEPTH }, "#476f61", .34, .65);
  for (let z = -ROOM_DEPTH; z <= ROOM_DEPTH; z += .35) line3d(ctx, project, { x: -ROOM_WIDTH, y: 0, z }, { x: -ROOM_WIDTH, y: ROOM_HEIGHT, z }, "#688575", .26, .65);
  for (let y = .25; y < ROOM_HEIGHT; y += .25) line3d(ctx, project, { x: -ROOM_WIDTH, y, z: -ROOM_DEPTH }, { x: -ROOM_WIDTH, y, z: ROOM_DEPTH }, "#688575", .25, .65);
}

/**
 * Surfaces that have been solved, washed in one after another and back out again on
 * a slow breath. A plateau would be a loader; a wipe would be a demo. Held under
 * .1 alpha so it reads as glass settling over the room, not as a highlight.
 */
function drawResolvedSurfaces(ctx: CanvasRenderingContext2D, project: (point: Vec3) => ScreenPoint, time: number, animate: boolean): void {
  const patches: readonly (readonly Vec3[])[] = [
    [{ x: -1.9, y: .02, z: -1.4 }, { x: 1.9, y: .02, z: -1.4 }, { x: 1.9, y: .02, z: 1.6 }, { x: -1.9, y: .02, z: 1.6 }],
    [{ x: -1.6, y: .8, z: -ROOM_DEPTH + .02 }, { x: .75, y: .8, z: -ROOM_DEPTH + .02 }, { x: .75, y: 2.35, z: -ROOM_DEPTH + .02 }, { x: -1.6, y: 2.35, z: -ROOM_DEPTH + .02 }],
    [{ x: -1.18, y: 1.13, z: -.42 }, { x: 1.12, y: 1.13, z: -.42 }, { x: 1.12, y: 1.13, z: 1.27 }, { x: -1.18, y: 1.13, z: 1.27 }],
  ];
  const sweep = animate ? Math.abs(((time * 0.17) % 2) - 1) : 1;
  patches.forEach((patch, index) => {
    const reveal = clamp((sweep - index * 0.16) / 0.6, 0, 1);
    if (reveal > 0) polygon(ctx, project, patch, `rgba(196, 219, 205, ${(0.09 * reveal).toFixed(3)})`, "#8fb6a2", 0.05 + 0.07 * reveal);
  });
}

/**
 * Eight stations, the graph between them, and the sight line of whichever one is
 * currently holding the emphasis. Called twice per frame with `pass` selecting the
 * half that belongs behind the room and the half in front of it.
 */
function drawKeyframeRig(ctx: CanvasRenderingContext2D, project: (point: Vec3) => ScreenPoint, mode: SceneMode, time: number, animate: boolean, horizon: number, pass: "back" | "front", hoverIndex: number): void {
  const stations = KEYFRAME_RING.map((point) => ({ point, screen: project(point) }));
  const active = animate ? Math.floor(time / KEYFRAME_HOLD) % stations.length : -1;
  const aligned = mode === 1;
  const behind = (a: ScreenPoint, b: ScreenPoint): boolean => (a.depth + b.depth) / 2 > horizon;

  dashed(ctx, [3, 5], () => stations.forEach((station, index) => {
    const next = stations[(index + 1) % stations.length]!;
    const far = behind(station.screen, next.screen);
    if ((pass === "back") !== far) return;
    line3d(ctx, project, station.point, next.point, "#5c8172", (aligned ? 0.6 : 0.26) * (far ? 0.7 : 1), aligned ? 1.3 : 1);
  }));

  stations.forEach((station, index) => {
    const far = station.screen.depth > horizon;
    if ((pass === "back") !== far) return;
    const isActive = index === active;
    const isHovered = !isActive && index === hoverIndex;
    // In Align every station shows its whole sight line — that is the pose graph.
    // Elsewhere every station keeps a short stub instead, so the ring reads as eight
    // cameras aimed at the subject in every stage rather than dots on a circle.
    const reach = isActive ? 1 : aligned ? 0.86 : 0.3;
    const aim = toward(station.point, CAMERA_TARGET, reach);
    if (isActive || aligned) line3d(ctx, project, station.point, aim, isActive ? "#b17f55" : "#537f70", isActive ? 0.62 : (far ? 0.16 : 0.26), isActive ? 1.2 : 1);
    else line3d(ctx, project, station.point, aim, "#537f70", far ? 0.2 : 0.34, 1);
    // The one new object in the scene: a literal camera at the station currently under
    // the beam, aimed at the subject — a frustum, not another dot, because "this station
    // is a camera" is the entire point of the rig and had never actually been drawn.
    if (isActive && !far) drawCameraGlyph(ctx, project, station.point, CAMERA_TARGET, 0.7);

    const { x, y } = station.screen;
    if (isActive || isHovered) {
      // A soft halo under the emphasised node, not just the ring already drawn below it.
      // Active (the beam's own timeline) glows clay; hovered (the reader's own cursor)
      // glows sage — two different reasons a station is lit should not look identical.
      const glowColor = isActive ? "177, 127, 85" : "90, 140, 118";
      const glow = ctx.createRadialGradient(x, y, 0, x, y, isActive ? 16 : 13);
      if (glow && typeof glow.addColorStop === "function") {
        glow.addColorStop(0, `rgba(${glowColor}, ${isActive ? .5 : .4})`);
        glow.addColorStop(1, `rgba(${glowColor}, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(x, y, isActive ? 16 : 13, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = (far ? 0.62 : 0.9) * (isActive || isHovered ? 1 : 0.8);
    ctx.beginPath(); ctx.arc(x, y, isActive ? 2.6 : isHovered ? 2.2 : 1.7, 0, Math.PI * 2);
    ctx.fillStyle = isActive ? "#b17f55" : isHovered ? "#4a7c67" : "#3f7565"; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, isActive ? 6 : isHovered ? 5.2 : 4.2, 0, Math.PI * 2);
    ctx.strokeStyle = isActive ? "#b17f55" : isHovered ? "#4a7c67" : "#4d7f6e"; ctx.lineWidth = 1; ctx.stroke();
    ctx.globalAlpha = 1;
    label3d(ctx, station.screen, pad2(index + 1), isActive ? "#a86a44" : isHovered ? "#3c6b56" : "#5c7669", far ? 0.55 : isActive || isHovered ? 0.95 : 0.72, 8);

    if (isActive) {
      // The active frame breathes; frozen, it keeps a single calm ring instead.
      const beat = animate ? 7 + Math.sin(time * 2.4) * 2.2 : 8;
      ctx.beginPath(); ctx.arc(x, y, beat, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(177, 127, 85, .5)"; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, beat + 6, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(177, 127, 85, .14)"; ctx.lineWidth = 1; ctx.stroke();
    }
  });
}

/**
 * A camera, drawn as a frustum: four edges running from the station out to a small
 * rectangle facing the subject, plus the rectangle itself as a faint pane of glass. The
 * station was always meant to be a camera — this is what finally draws it as one instead
 * of a numbered dot with a sight line, the one moment the rig stops being a diagram of a
 * capture and starts looking like the device doing it.
 */
function drawCameraGlyph(ctx: CanvasRenderingContext2D, project: (point: Vec3) => ScreenPoint, station: Vec3, target: Vec3, alpha: number): void {
  const forward = normalize(subtract(target, station));
  const reference: Vec3 = Math.abs(forward.y) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const right = normalize(cross(forward, reference));
  const up = cross(right, forward);
  const lens = addVec(station, scaleVec(forward, 0.24));
  const corners = [
    addVec(lens, addVec(scaleVec(right, 0.1), scaleVec(up, 0.075))),
    addVec(lens, addVec(scaleVec(right, -0.1), scaleVec(up, 0.075))),
    addVec(lens, addVec(scaleVec(right, -0.1), scaleVec(up, -0.075))),
    addVec(lens, addVec(scaleVec(right, 0.1), scaleVec(up, -0.075))),
  ];
  corners.forEach((corner) => line3d(ctx, project, station, corner, "#b17f55", alpha * 0.55, 1));
  polygon(ctx, project, corners, "rgba(177, 127, 85, .16)", "#b17f55", alpha);
}

function drawPointCloud(ctx: CanvasRenderingContext2D, project: (point: Vec3) => ScreenPoint, points: readonly Vec3[], mode: SceneMode, time: number, animate: boolean): void {
  const scanY = scanElevation(time);
  const pulse = animate ? .72 + Math.sin(time * 2.4) * .12 : .82;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!;
    // Capture only: the cloud fills in as the beam climbs, and stays filled when
    // nothing is animating it.
    if (animate && mode === 0 && point.y > scanY) continue;
    const screen = project(point);
    // Verified against a real render, not guessed: at 1.65/1.1px the cloud is genuinely
    // there (confirmed by zooming into a screenshot) but invisible at the page's actual
    // scale — a small surface like the chair seat or lamp shade only carries a couple
    // dozen points, and at a couple of screen pixels each they read as noise, not cover.
    const size = screen.depth < CAMERA_DISTANCE ? 2 : 1.4;
    // Only every fifth point is full strength; the floor under that has to stay high
    // enough that the cloud reads as a filled volume rather than scattered dust.
    // Each point twinkles on its own phase rather than all of them breathing in lockstep
    // with the uniform `pulse` above — a fixed offset derived from the point's own index,
    // so it is stable frame to frame and costs nothing to compute.
    const twinkle = animate ? .88 + Math.sin(time * 3.1 + index * 2.399963) * .12 : 1;
    ctx.globalAlpha = (mode === 2 ? .46 : mode === 1 ? .76 : pulse) * (index % 5 === 0 ? 1 : .8) * twinkle;
    ctx.beginPath(); ctx.arc(screen.x, screen.y, size, 0, Math.PI * 2);
    ctx.fillStyle = mode === 1 && index % 9 === 0 ? "#b57e56" : mode === 2 ? "#4d7868" : "#497a6b";
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Where the capture beam currently sits, in the room's own height units. */
function scanElevation(time: number): number {
  return (time * 0.3) % (ROOM_HEIGHT + 0.5) - 0.25;
}

/**
 * The capture sweep, kept honest: a plane at the scan height, its glow, and a tick
 * on each wall it crosses. In Align and Refine it stays, at less than half strength,
 * because capture never really stops while a map is being solved.
 */
function drawScanBeam(ctx: CanvasRenderingContext2D, project: (point: Vec3) => ScreenPoint, mode: SceneMode, time: number, animate: boolean): void {
  const y = animate ? scanElevation(time) : 1.42;
  const strength = mode === 0 ? 1 : 0.42;
  line3d(ctx, project, { x: -ROOM_WIDTH, y, z: -ROOM_DEPTH }, { x: ROOM_WIDTH, y, z: -ROOM_DEPTH }, "#b78056", .74 * strength, 2);
  line3d(ctx, project, { x: -ROOM_WIDTH, y, z: -ROOM_DEPTH }, { x: ROOM_WIDTH, y, z: -ROOM_DEPTH }, "#b78056", .14 * strength, 9);
  line3d(ctx, project, { x: -ROOM_WIDTH, y, z: -ROOM_DEPTH }, { x: -ROOM_WIDTH + .4, y, z: -ROOM_DEPTH }, "#b78056", .5 * strength, 1.4);
  line3d(ctx, project, { x: ROOM_WIDTH, y, z: -ROOM_DEPTH }, { x: ROOM_WIDTH - .4, y, z: -ROOM_DEPTH }, "#b78056", .5 * strength, 1.4);
}

function drawRefinementPulse(ctx: CanvasRenderingContext2D, project: (point: Vec3) => ScreenPoint, time: number, animate: boolean): void {
  const radius = animate ? 4 + (Math.sin(time * 1.5) + 1) * 2 : 6;
  const center = project(CAMERA_TARGET);
  ctx.beginPath(); ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(177, 124, 82, .62)"; ctx.lineWidth = 1; ctx.stroke();
}

function polygon(ctx: CanvasRenderingContext2D, project: (point: Vec3) => ScreenPoint, points: readonly Vec3[], fill: string | CanvasGradient, stroke: string, alpha: number): void {
  const projected = points.map(project);
  ctx.beginPath(); ctx.moveTo(projected[0]!.x, projected[0]!.y);
  projected.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.closePath(); ctx.globalAlpha = alpha; ctx.fillStyle = fill; ctx.fill();
  ctx.globalAlpha = Math.min(1, alpha + .12); ctx.strokeStyle = stroke; ctx.lineWidth = .9; ctx.stroke(); ctx.globalAlpha = 1;
}

function line3d(ctx: CanvasRenderingContext2D, project: (point: Vec3) => ScreenPoint, a: Vec3, b: Vec3, color: string, alpha: number, width: number): void {
  const first = project(a), second = project(b);
  ctx.beginPath(); ctx.moveTo(first.x, first.y); ctx.lineTo(second.x, second.y);
  ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); ctx.globalAlpha = 1;
}

/** The twelve edges of a box, no faces — a surface that has not been decided yet. */
function wireBox(ctx: CanvasRenderingContext2D, project: (point: Vec3) => ScreenPoint, box: { min: Vec3; max: Vec3 }, color: string, alpha: number): void {
  const { min, max } = box;
  const corner = (sx: number, sy: number, sz: number): Vec3 => ({ x: sx < 0 ? min.x : max.x, y: sy < 0 ? min.y : max.y, z: sz < 0 ? min.z : max.z });
  // Corners 0-3 ring the bottom face, 4-7 the top, each keeping its own index, so the
  // twelve edges are two rings and four uprights. Drawn once each: an edge stroked
  // twice is an edge at twice the weight, and the shell is meant to be the faint thing.
  const corners: readonly Vec3[] = [corner(-1, -1, -1), corner(1, -1, -1), corner(1, 1, -1), corner(-1, 1, -1), corner(-1, -1, 1), corner(1, -1, 1), corner(1, 1, 1), corner(-1, 1, 1)];
  const edge = (from: number, to: number, weight: number): void => line3d(ctx, project, corners[from]!, corners[to]!, color, alpha * weight, .7);
  dashed(ctx, [2, 3], () => {
    for (let index = 0; index < 4; index += 1) {
      edge(index, (index + 1) % 4, 1);
      edge(index + 4, ((index + 1) % 4) + 4, 1);
      edge(index, index + 4, 0.8);
    }
  });
}

function dashed(ctx: CanvasRenderingContext2D, pattern: readonly number[], draw: () => void): void {
  ctx.setLineDash([...pattern]);
  draw();
  ctx.setLineDash([]);
}

/** Small technical type. Always set before drawing so nothing inherits a stale font. */
function label3d(ctx: CanvasRenderingContext2D, at: ScreenPoint, text: string, color: string, alpha: number, size: number): void {
  ctx.font = `${size}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textAlign = "left";
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillText(text, at.x + 7, at.y - 6);
  ctx.globalAlpha = 1;
}

/** The same box, grown evenly — the gap between a shell and a surface. */
function expand(box: { min: Vec3; max: Vec3 }, amount: number): { min: Vec3; max: Vec3 } {
  return {
    min: { x: box.min.x - amount, y: box.min.y - amount, z: box.min.z - amount },
    max: { x: box.max.x + amount, y: box.max.y + amount, z: box.max.z + amount },
  };
}

function subtract(a: Vec3, b: Vec3): Vec3 { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function cross(a: Vec3, b: Vec3): Vec3 { return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }; }
function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}
function scaleVec(v: Vec3, factor: number): Vec3 { return { x: v.x * factor, y: v.y * factor, z: v.z * factor }; }
function addVec(a: Vec3, b: Vec3): Vec3 { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }

function toward(from: Vec3, to: Vec3, fraction: number): Vec3 {
  return {
    x: from.x + (to.x - from.x) * fraction,
    y: from.y + (to.y - from.y) * fraction,
    z: from.z + (to.z - from.z) * fraction,
  };
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * The pose in the only units a reader can check it against: degrees on a dial.
 * Both axes accumulate past a turn, so each is wrapped to its own readable range —
 * yaw all the way round, pitch signed — and the readout is generated from the live
 * pose rather than a value the page would have had to invent.
 */
export function formatPoseReadout(yaw: number, pitch: number): string {
  // Round first, then wrap and read the sign off the rounded figure. Rounding last
  // leaves a value like -0.06° signed as a minus over a magnitude that prints 000, and
  // a yaw of 359.7 wraps to 360 — a dial with a mark that does not exist.
  const yawDegrees = wrap(Math.round(toDegrees(yaw)), 360);
  const pitchDegrees = Math.round(wrap(toDegrees(pitch) + 180, 360) - 180);
  const sign = pitchDegrees < 0 ? "−" : "+";
  return `YAW ${padDegrees(yawDegrees)}° · PITCH ${sign}${padDegrees(Math.abs(pitchDegrees))}°`;
}

function wrap(degrees: number, span: number): number {
  return ((degrees % span) + span) % span;
}
/** Three digits, so the readout does not shift width as the dial passes single digits. */
function padDegrees(value: number): string {
  return String(Math.round(value)).padStart(3, "0");
}

/**
 * Sample points from `min` to `max` at roughly `step` apart, with `max` always the last
 * value regardless of whether `step` evenly divides the range. A plain `for (v = min;
 * v <= max; v += step)` silently drops the last few percent of a surface whenever it
 * doesn't — that was the actual bug behind more than one "this surface isn't fully
 * covered" report: the loop stopped a fraction of a step short of the far edge and
 * nothing was ever sampled there. This is the fix applied everywhere at once, so it
 * cannot recur one surface at a time.
 */
function sampleRange(min: number, max: number, step: number): number[] {
  const values: number[] = [];
  for (let v = min; v < max - step * 0.5; v += step) values.push(v);
  values.push(max);
  return values;
}

export function makePointCloud(): Vec3[] {
  const points: Vec3[] = [];
  const grid = (xs: readonly number[], zs: readonly number[], y: number): void => xs.forEach((x) => zs.forEach((z) => points.push({ x, y, z })));
  sampleRange(-ROOM_WIDTH, ROOM_WIDTH, .22).forEach((x) => sampleRange(.1, ROOM_HEIGHT, .19).forEach((y) => points.push({ x, y, z: -ROOM_DEPTH + .025 })));
  sampleRange(-ROOM_DEPTH, ROOM_DEPTH, .24).forEach((z) => sampleRange(.12, ROOM_HEIGHT, .21).forEach((y) => points.push({ x: -ROOM_WIDTH + .025, y, z })));
  grid(sampleRange(-ROOM_WIDTH, ROOM_WIDTH, .38), sampleRange(-ROOM_DEPTH, ROOM_DEPTH, .4), .025);
  // Tabletop: matches its actual x-extent (-1.18..1.12, see drawFurniture/drawBox).
  grid(sampleRange(-1.18, 1.12, .13), sampleRange(-.42, 1.27, .14), 1.13);
  // The object on the table.
  grid(sampleRange(-.32, .32, .09), sampleRange(.2, .82, .09), 1.69);
  // The chair seat.
  grid(sampleRange(-.16, .16, .05), sampleRange(1.42, 1.7, .06), .49);
  // The lamp shade.
  grid(sampleRange(2.42, 2.98, .1), sampleRange(-2.62, -2.18, .1), 2.17);
  // The bench's own top rim — the books only cover the middle of it, so the exposed edge
  // of the surface around them was never sampled and read as a bare, dot-less box.
  grid(sampleRange(-2.65, -1.65, .12), sampleRange(-1.1, .2, .12), .75);
  // The books themselves — two boxes sitting on the bench that, unlike everything else on
  // this list, never got a surface sample of their own. Matches drawFurniture's bounds.
  grid(sampleRange(-2.4, -1.9, .07), sampleRange(-.95, -.35, .08), .84);
  grid(sampleRange(-2.32, -1.98, .06), sampleRange(-.86, -.44, .06), .92);
  return points;
}

function shade(color: string, factor: number): string {
  const rgba = color.match(/rgba?\(([^)]+)\)/);
  if (!rgba) return color;
  const [r, g, b, alpha] = rgba[1]!.split(",").map(Number);
  return `rgba(${Math.round(r! * factor)}, ${Math.round(g! * factor)}, ${Math.round(b! * factor)}, ${alpha ?? 1})`;
}
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }
