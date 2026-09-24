type Vec3 = { x: number; y: number; z: number };
type ScreenPoint = { x: number; y: number; depth: number };
type SceneMode = 0 | 1 | 2;

const ROOM_WIDTH = 3.35;
const ROOM_DEPTH = 3.1;
const ROOM_HEIGHT = 2.75;
const CAMERA_TARGET: Vec3 = { x: 0, y: 0.75, z: 0 };
const KEYFRAMES: readonly Vec3[] = [
  { x: -4.15, y: 1.65, z: 1.7 },
  { x: 3.8, y: 1.8, z: 1.5 },
  { x: 0.15, y: 3.25, z: -4.15 },
];

export function mountSpatialScene(canvas: HTMLCanvasElement): { setStage(stage: number): void; dispose(): void } {
  const context = canvas.getContext("2d");
  if (!context) return { setStage: () => undefined, dispose: () => undefined };

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const cloud = makePointCloud();
  let mode: SceneMode = 0;
  let width = 1;
  let height = 1;
  let pixelRatio = 1;
  let frame = 0;
  let yaw = -0.52;
  let pitch = 0.14;
  let previousPointer: { x: number; y: number } | undefined;
  let dragging = false;
  let inView = true;
  let disposed = false;

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
    paintScene(context, width, height, now / 1000, mode, yaw, pitch, cloud);
    if (!reducedMotion && !document.hidden && inView) frame = requestAnimationFrame(render);
  };
  const startAnimation = (): void => {
    if (!reducedMotion && !document.hidden && inView && !frame) frame = requestAnimationFrame(render);
  };

  const onPointerDown = (event: PointerEvent): void => {
    dragging = true;
    previousPointer = { x: event.clientX, y: event.clientY };
    canvas.setPointerCapture?.(event.pointerId);
    canvas.classList.add("is-orbiting");
  };
  const onPointerMove = (event: PointerEvent): void => {
    if (!dragging || !previousPointer) return;
    const dx = event.clientX - previousPointer.x;
    const dy = event.clientY - previousPointer.y;
    yaw += dx * 0.008;
    pitch = clamp(pitch + dy * 0.0035, -0.28, 0.45);
    previousPointer = { x: event.clientX, y: event.clientY };
    if (reducedMotion) render(performance.now());
  };
  const onPointerUp = (): void => {
    dragging = false;
    previousPointer = undefined;
    canvas.classList.remove("is-orbiting");
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    const rotation = event.shiftKey ? 0.24 : 0.12;
    if (event.key === "ArrowLeft") yaw -= rotation;
    else if (event.key === "ArrowRight") yaw += rotation;
    else if (event.key === "ArrowUp") pitch = clamp(pitch - rotation * 0.55, -0.28, 0.45);
    else if (event.key === "ArrowDown") pitch = clamp(pitch + rotation * 0.55, -0.28, 0.45);
    else return;
    event.preventDefault();
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

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
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
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    },
  };
}

function paintScene(ctx: CanvasRenderingContext2D, width: number, height: number, time: number, mode: SceneMode, yaw: number, pitch: number, cloud: readonly Vec3[]): void {
  ctx.clearRect(0, 0, width, height);
  const project = projector(width, height, yaw + Math.sin(time * 0.17) * 0.035, pitch);
  drawRoomShell(ctx, project, mode);
  drawFloorGrid(ctx, project, mode);
  drawFurniture(ctx, project, mode);
  if (mode === 1) drawKeyframeCameras(ctx, project, time);
  if (mode === 2) drawRoomMesh(ctx, project);
  drawPointCloud(ctx, project, cloud, mode, time);
  if (mode === 0) drawCaptureSweep(ctx, project, time);
  if (mode === 2) drawRefinementPulse(ctx, project, time);
}

function projector(width: number, height: number, yaw: number, pitch: number): (point: Vec3) => ScreenPoint {
  const cosYaw = Math.cos(yaw), sinYaw = Math.sin(yaw);
  const cosPitch = Math.cos(pitch), sinPitch = Math.sin(pitch);
  const focal = Math.min(width * 0.84, height * 1.04);
  const targetY = height * 0.63;
  return ({ x, y, z }) => {
    const rotatedX = x * cosYaw - z * sinYaw;
    const rotatedZ = x * sinYaw + z * cosYaw;
    const centeredY = y - 0.82;
    const rotatedY = centeredY * cosPitch - rotatedZ * sinPitch;
    const depth = Math.max(3.5, 10.8 + centeredY * sinPitch + rotatedZ * cosPitch);
    const scale = focal / depth;
    return { x: width / 2 + rotatedX * scale, y: targetY - rotatedY * scale * 0.58, depth };
  };
}

function drawRoomShell(ctx: CanvasRenderingContext2D, project: (point: Vec3) => ScreenPoint, mode: SceneMode): void {
  const x = ROOM_WIDTH, z = ROOM_DEPTH, h = ROOM_HEIGHT;
  polygon(ctx, project, [{ x: -x, y: 0, z: -z }, { x, y: 0, z: -z }, { x, y: 0, z }, { x: -x, y: 0, z }], "rgba(196, 215, 203, .58)", "#7b998d", .95);
  polygon(ctx, project, [{ x: -x, y: 0, z: -z }, { x, y: 0, z: -z }, { x, y: h, z: -z }, { x: -x, y: h, z: -z }], mode === 2 ? "rgba(190, 211, 201, .3)" : "rgba(215, 223, 207, .18)", "#8da79a", .92);
  polygon(ctx, project, [{ x: -x, y: 0, z: -z }, { x: -x, y: 0, z }, { x: -x, y: h, z }, { x: -x, y: h, z: -z }], mode === 2 ? "rgba(209, 220, 202, .22)" : "rgba(218, 221, 203, .12)", "#9aab9b", .8);
  const edges: readonly [Vec3, Vec3][] = [
    [{ x: -x, y: 0, z: -z }, { x, y: 0, z: -z }], [{ x, y: 0, z: -z }, { x, y: 0, z }], [{ x, y: 0, z }, { x: -x, y: 0, z }], [{ x: -x, y: 0, z }, { x: -x, y: 0, z: -z }],
    [{ x: -x, y: h, z: -z }, { x, y: h, z: -z }], [{ x: -x, y: h, z: -z }, { x: -x, y: h, z }], [{ x: -x, y: h, z }, { x: -x, y: 0, z }], [{ x, y: h, z: -z }, { x, y: 0, z: -z }], [{ x: -x, y: h, z: -z }, { x: -x, y: 0, z: -z }],
  ];
  edges.forEach(([a, b], index) => line3d(ctx, project, a, b, index < 4 ? "#66877b" : "#779186", index < 4 ? .48 : .68, 1));
  const windowRect = [{ x: -1.6, y: .8, z: -z + .015 }, { x: .75, y: .8, z: -z + .015 }, { x: .75, y: 2.35, z: -z + .015 }, { x: -1.6, y: 2.35, z: -z + .015 }];
  polygon(ctx, project, windowRect, "rgba(248, 249, 237, .34)", "#8da699", .78);
  line3d(ctx, project, { x: -.42, y: .8, z: -z }, { x: -.42, y: 2.35, z: -z }, "#94a99d", .65, 1);
  line3d(ctx, project, { x: -1.6, y: 1.58, z: -z }, { x: .75, y: 1.58, z: -z }, "#94a99d", .65, 1);
}

function drawFloorGrid(ctx: CanvasRenderingContext2D, project: (point: Vec3) => ScreenPoint, mode: SceneMode): void {
  const lineColor = mode === 2 ? "#658d7d" : "#8ca596";
  for (let x = -ROOM_WIDTH; x <= ROOM_WIDTH; x += .5) line3d(ctx, project, { x, y: .012, z: -ROOM_DEPTH }, { x, y: .012, z: ROOM_DEPTH }, lineColor, mode === 2 ? .28 : .16, .75);
  for (let z = -ROOM_DEPTH; z <= ROOM_DEPTH; z += .5) line3d(ctx, project, { x: -ROOM_WIDTH, y: .012, z }, { x: ROOM_WIDTH, y: .012, z }, lineColor, mode === 2 ? .28 : .16, .75);
}

function drawFurniture(ctx: CanvasRenderingContext2D, project: (point: Vec3) => ScreenPoint, mode: SceneMode): void {
  const refinement = mode === 2;
  drawBox(ctx, project, { min: { x: -.95, y: .12, z: -.15 }, max: { x: .9, y: .94, z: 1.05 } }, refinement ? "rgba(119, 157, 137, .78)" : "rgba(169, 186, 164, .2)", "#668579", refinement ? .92 : .65);
  drawBox(ctx, project, { min: { x: -1.18, y: .93, z: -.42 }, max: { x: 1.12, y: 1.12, z: 1.27 } }, refinement ? "rgba(205, 183, 145, .9)" : "rgba(205, 183, 145, .34)", "#9c8d71", .88);
  for (const x of [-.82, .78]) for (const z of [-.25, 1.08]) {
    drawBox(ctx, project, { min: { x: x - .07, y: 0, z: z - .07 }, max: { x: x + .07, y: .94, z: z + .07 } }, refinement ? "rgba(143, 160, 137, .8)" : "rgba(143, 160, 137, .26)", "#708575", .7);
  }
  drawBox(ctx, project, { min: { x: -.32, y: 1.12, z: .2 }, max: { x: .3, y: 1.68, z: .82 } }, refinement ? "rgba(193, 155, 118, .88)" : "rgba(193, 155, 118, .3)", "#9e795b", .88);
  drawBox(ctx, project, { min: { x: -2.65, y: .1, z: -1.1 }, max: { x: -1.65, y: .74, z: .2 } }, refinement ? "rgba(152, 175, 159, .72)" : "rgba(152, 175, 159, .16)", "#81978a", .72);
}

function drawBox(ctx: CanvasRenderingContext2D, project: (point: Vec3) => ScreenPoint, box: { min: Vec3; max: Vec3 }, fill: string, stroke: string, alpha: number): void {
  const { min, max } = box;
  const p = [
    { x: min.x, y: min.y, z: min.z }, { x: max.x, y: min.y, z: min.z }, { x: max.x, y: max.y, z: min.z }, { x: min.x, y: max.y, z: min.z },
    { x: min.x, y: min.y, z: max.z }, { x: max.x, y: min.y, z: max.z }, { x: max.x, y: max.y, z: max.z }, { x: min.x, y: max.y, z: max.z },
  ];
  const faces = [[3, 2, 6, 7], [1, 5, 6, 2], [4, 5, 6, 7], [0, 1, 2, 3]];
  const faceColors = [fill, shade(fill, .82), shade(fill, 1.12), shade(fill, .94)];
  faces.forEach((face, index) => polygon(ctx, project, face.map((pointIndex) => p[pointIndex]!), faceColors[index]!, stroke, alpha));
}

function drawRoomMesh(ctx: CanvasRenderingContext2D, project: (point: Vec3) => ScreenPoint): void {
  for (let x = -ROOM_WIDTH; x <= ROOM_WIDTH; x += .35) line3d(ctx, project, { x, y: 0, z: -ROOM_DEPTH }, { x, y: ROOM_HEIGHT, z: -ROOM_DEPTH }, "#476f61", .38, .65);
  for (let y = .25; y < ROOM_HEIGHT; y += .25) line3d(ctx, project, { x: -ROOM_WIDTH, y, z: -ROOM_DEPTH }, { x: ROOM_WIDTH, y, z: -ROOM_DEPTH }, "#476f61", .34, .65);
  for (let z = -ROOM_DEPTH; z <= ROOM_DEPTH; z += .35) line3d(ctx, project, { x: -ROOM_WIDTH, y: 0, z }, { x: -ROOM_WIDTH, y: ROOM_HEIGHT, z }, "#688575", .26, .65);
  for (let y = .25; y < ROOM_HEIGHT; y += .25) line3d(ctx, project, { x: -ROOM_WIDTH, y, z: -ROOM_DEPTH }, { x: -ROOM_WIDTH, y, z: ROOM_DEPTH }, "#688575", .25, .65);
}

function drawKeyframeCameras(ctx: CanvasRenderingContext2D, project: (point: Vec3) => ScreenPoint, time: number): void {
  KEYFRAMES.forEach((camera, index) => {
    const wobble = Math.sin(time * 1.1 + index * 1.7) * .035;
    const origin = { ...camera, x: camera.x + wobble };
    const targets = [
      { x: -.75, y: .8, z: .2 }, { x: .2, y: 1.2, z: .7 }, { x: .75, y: .5, z: .4 },
    ];
    targets.forEach((target, rayIndex) => line3d(ctx, project, origin, target, rayIndex === 1 ? "#b17f55" : "#537f70", .58, 1.1));
    const screen = project(origin);
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = index === 1 ? "#b77f57" : "#4a8271";
    ctx.fill();
    ctx.strokeStyle = "#fffdf6";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const target = project(CAMERA_TARGET);
    const endpoint = project(targets[index]!);
    ctx.beginPath();
    ctx.arc(endpoint.x, endpoint.y, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = "#c2885f";
    ctx.fill();
  });
  [0, 1, 2].forEach((_, index) => {
    const from = project({ x: -.75 + index * .7, y: .8 + index * .16, z: .25 + index * .08 });
    const to = project({ x: .2 + index * .32, y: 1.2 - index * .14, z: .7 - index * .07 });
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y);
    ctx.strokeStyle = "rgba(182, 129, 88, .58)"; ctx.lineWidth = 1; ctx.setLineDash([3, 4]); ctx.stroke(); ctx.setLineDash([]);
  });
}

function drawPointCloud(ctx: CanvasRenderingContext2D, project: (point: Vec3) => ScreenPoint, points: readonly Vec3[], mode: SceneMode, time: number): void {
  const scanY = ROOM_HEIGHT - (time * .34 % 3.2);
  const pulse = .72 + Math.sin(time * 2.4) * .12;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!;
    if (mode === 0 && point.y < scanY - .16) continue;
    const screen = project(point);
    const size = screen.depth < 9 ? 1.65 : 1.1;
    ctx.globalAlpha = (mode === 2 ? .46 : mode === 1 ? .76 : pulse) * (index % 5 === 0 ? 1 : .68);
    ctx.beginPath(); ctx.arc(screen.x, screen.y, size, 0, Math.PI * 2);
    ctx.fillStyle = mode === 1 && index % 9 === 0 ? "#b57e56" : mode === 2 ? "#4d7868" : "#497a6b";
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawCaptureSweep(ctx: CanvasRenderingContext2D, project: (point: Vec3) => ScreenPoint, time: number): void {
  const y = ROOM_HEIGHT - (time * .34 % 3.2);
  const left = project({ x: -ROOM_WIDTH, y, z: -ROOM_DEPTH });
  const right = project({ x: ROOM_WIDTH, y, z: -ROOM_DEPTH });
  ctx.beginPath(); ctx.moveTo(left.x, left.y); ctx.lineTo(right.x, right.y);
  ctx.strokeStyle = "rgba(183, 128, 86, .74)"; ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(left.x, left.y + 8); ctx.lineTo(right.x, right.y + 8);
  ctx.strokeStyle = "rgba(183, 128, 86, .14)"; ctx.lineWidth = 9; ctx.stroke();
}

function drawRefinementPulse(ctx: CanvasRenderingContext2D, project: (point: Vec3) => ScreenPoint, time: number): void {
  const radius = 4 + (Math.sin(time * 1.5) + 1) * 2;
  const center = project(CAMERA_TARGET);
  ctx.beginPath(); ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(177, 124, 82, .62)"; ctx.lineWidth = 1; ctx.stroke();
}

function polygon(ctx: CanvasRenderingContext2D, project: (point: Vec3) => ScreenPoint, points: readonly Vec3[], fill: string, stroke: string, alpha: number): void {
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

function makePointCloud(): Vec3[] {
  const points: Vec3[] = [];
  for (let x = -ROOM_WIDTH; x <= ROOM_WIDTH; x += .22) for (let y = .1; y <= ROOM_HEIGHT; y += .19) points.push({ x, y, z: -ROOM_DEPTH + .025 });
  for (let z = -ROOM_DEPTH; z <= ROOM_DEPTH; z += .24) for (let y = .12; y <= ROOM_HEIGHT; y += .21) points.push({ x: -ROOM_WIDTH + .025, y, z });
  for (let x = -ROOM_WIDTH; x <= ROOM_WIDTH; x += .38) for (let z = -ROOM_DEPTH; z <= ROOM_DEPTH; z += .4) points.push({ x, y: .025, z });
  for (let x = -.95; x <= .95; x += .13) for (let z = -.42; z <= 1.27; z += .14) points.push({ x, y: 1.13, z });
  for (let x = -.32; x <= .32; x += .09) for (let z = .2; z <= .82; z += .09) points.push({ x, y: 1.69, z });
  return points;
}

function shade(color: string, factor: number): string {
  const rgba = color.match(/rgba?\(([^)]+)\)/);
  if (!rgba) return color;
  const [r, g, b, alpha] = rgba[1]!.split(",").map(Number);
  return `rgba(${Math.round(r! * factor)}, ${Math.round(g! * factor)}, ${Math.round(b! * factor)}, ${alpha ?? 1})`;
}
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }
