import type * as THREE_NS from "three";
import type { OrbitControls as OrbitControls_NS } from "three/examples/jsm/controls/OrbitControls.js";
import type { ReconstructionSessionSnapshot } from "./reconstruction-session";
import type { LandmarkColor } from "./export-ply";

export type PointCloudLayer = "points" | "cameras" | "grid";

export interface PointCloudViewer {
  /** Feed the latest reconstruction snapshot in; a no-op viewer (WebGL unavailable) ignores it. */
  update(snapshot: ReconstructionSessionSnapshot | undefined, colors?: ReadonlyMap<string, LandmarkColor>): void;
  /** Move the camera 20% closer to / further from the orbit target. No-ops before WebGL is up. */
  zoomIn(): void;
  zoomOut(): void;
  /** Frame the whole point cloud: target = cloud center, distance fits its radius. */
  fit(): void;
  /** Back to the default framing. */
  resetView(): void;
  setAutoRotate(on: boolean): void;
  setLayer(layer: PointCloudLayer, visible: boolean): void;
  /** Float the view over the page (fixed overlay) for a big, inspectable canvas. */
  setExpanded(on: boolean): void;
  dispose(): void;
  /** False until three.js has loaded and WebGL initialized; a no-op viewer stays false forever. */
  readonly available: boolean;
}

const POINT_COLOR = 0x586fee; // matches --accent in design/tokens.css
const CAMERA_COLOR = 0x8fbcff;
const FRUSTUM_SIZE = 0.06;
const ZOOM_STEP = 0.8; // fraction of the current distance a zoom-in click travels
const FIT_DISTANCE_FACTOR = 2.4; // ~1/sin(fov/2) for the 55° camera — frames the radius

/** Viewer actions once three.js is live; empty while it is loading or when unavailable. */
type RealActions = Pick<PointCloudViewer, "zoomIn" | "zoomOut" | "fit" | "resetView" | "setAutoRotate" | "setLayer">;

/** Toolbar layout: DOM action name → button glyph and label. Toggle buttons carry a `layer`. */
const TOOLBAR: readonly { readonly action: string; readonly glyph: string; readonly label: string; readonly toggle?: PointCloudLayer }[] = [
  { action: "zoom-in", glyph: "+", label: "Zoom in" },
  { action: "zoom-out", glyph: "−", label: "Zoom out" },
  { action: "fit", glyph: "⊡", label: "Fit view to point cloud" },
  { action: "reset", glyph: "↺", label: "Reset view" },
  { action: "auto-rotate", glyph: "⟳", label: "Auto-rotate" },
  { action: "layer-points", glyph: "•", label: "Point cloud", toggle: "points" },
  { action: "layer-cameras", glyph: "◣", label: "Camera path", toggle: "cameras" },
  { action: "layer-grid", glyph: "▦", label: "Grid", toggle: "grid" },
  { action: "expand", glyph: "⤢", label: "Expand view" },
];

/**
 * Renders the live capture session's sparse point cloud and camera
 * trajectory (see reconstruction-session.ts) as a real, navigable 3D scene,
 * so a scan produces something visible rather than only progress numbers.
 *
 * The scene ships with a small on-canvas toolbar (zoom, fit, reset,
 * auto-rotate, layer toggles, expand-to-fullscreen) because drag-orbit and
 * wheel-zoom are undiscoverable in a 220px panel — first-time users read the
 * view as a dead image without visible controls. The toolbar is mounted up
 * front and stays disabled when WebGL is unavailable, so the DOM shape is
 * identical either way.
 *
 * three.js is loaded via a dynamic import, not a static one: it is a large
 * dependency that only the capture route needs, and a static import would
 * put its ~550KB into every page's main bundle, including the marketing
 * page and the rest of Studio, which never touch it. Per
 * docs/06-roadmap-and-acceptance.md's capability-aware fallback
 * requirement, a browser/device without WebGL (or a failed load) degrades
 * to a no-op viewer instead of a crash — `available` reports which one the
 * caller ended up with, once the load settles.
 */
export function mountPointCloudViewer(container: HTMLElement): PointCloudViewer {
  let real: (RealPointCloudViewer & RealActions) | undefined;
  let disposed = false;
  let pendingSnapshot: ReconstructionSessionSnapshot | undefined;
  let pendingColors: ReadonlyMap<string, LandmarkColor> | undefined;
  let hadUpdate = false;
  let expanded = false;
  let autoRotate = false;
  const layerState: Record<PointCloudLayer, boolean> = { points: true, cameras: true, grid: true };

  // --- Toolbar (mounted immediately; disabled until the real viewer lands) ---
  const toolbar = document.createElement("div");
  toolbar.className = "pcv-toolbar";
  toolbar.setAttribute("aria-label", "Point cloud view controls");
  const buttons = new Map<string, HTMLButtonElement>();
  for (const tool of TOOLBAR) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pcv-btn";
    button.dataset.pcvAction = tool.action;
    button.textContent = tool.glyph;
    button.title = tool.label;
    button.setAttribute("aria-label", tool.label);
    button.disabled = true;
    if (tool.toggle) button.setAttribute("aria-pressed", "true");
    toolbar.append(button);
    buttons.set(tool.action, button);
  }
  container.append(toolbar);

  const press = (action: string, on: boolean): void => { buttons.get(action)?.setAttribute("aria-pressed", String(on)); };

  const syncToolbar = (): void => {
    for (const button of buttons.values()) button.disabled = real === undefined;
    press("auto-rotate", autoRotate);
    press("layer-points", layerState.points);
    press("layer-cameras", layerState.cameras);
    press("layer-grid", layerState.grid);
    const expand = buttons.get("expand");
    if (expand) {
      expand.textContent = expanded ? "⤡" : "⤢";
      expand.title = expanded ? "Collapse view" : "Expand view";
      expand.setAttribute("aria-label", expand.title);
      expand.setAttribute("aria-pressed", String(expanded));
    }
  };

  const setExpanded = (on: boolean): void => {
    if (expanded === on) return;
    expanded = on;
    if (on) container.dataset.pcvExpanded = "true";
    else delete container.dataset.pcvExpanded;
    syncToolbar();
  };

  const onKeyDown = (event: KeyboardEvent): void => { if (event.key === "Escape") setExpanded(false); };
  document.addEventListener("keydown", onKeyDown);

  toolbar.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-pcv-action]");
    if (!button || button.disabled) return;
    switch (button.dataset.pcvAction) {
      case "zoom-in": real?.zoomIn(); break;
      case "zoom-out": real?.zoomOut(); break;
      case "fit": real?.fit(); break;
      case "reset": real?.resetView(); break;
      case "auto-rotate": autoRotate = !autoRotate; real?.setAutoRotate(autoRotate); press("auto-rotate", autoRotate); break;
      case "layer-points": case "layer-cameras": case "layer-grid": {
        const layer = (button.dataset.pcvAction === "layer-points" ? "points" : button.dataset.pcvAction === "layer-cameras" ? "cameras" : "grid") as PointCloudLayer;
        layerState[layer] = !layerState[layer];
        real?.setLayer(layer, layerState[layer]);
        press(button.dataset.pcvAction!, layerState[layer]);
        break;
      }
      case "expand": setExpanded(!expanded); break;
    }
  });

  void loadThree()
    .then(({ THREE, OrbitControls }) => {
      if (disposed) return;
      real = createRealViewer(THREE, OrbitControls, container);
      // The canvas took over — drop the "start a scan" placeholder text that
      // the old replaceChildren() mount used to clear (toolbar stays).
      for (const child of Array.from(container.children)) if (!child.classList.contains("pcv-toolbar") && child.tagName !== "CANVAS") child.remove();
      syncToolbar();
      if (hadUpdate) real.update(pendingSnapshot, pendingColors);
    })
    .catch(() => {
      // No WebGL, or the dynamic import itself failed (offline, blocked CDN
      // in a restrictive network policy, etc.): stay a no-op viewer.
    });

  return {
    get available() {
      return real !== undefined;
    },
    update(snapshot, colors) {
      hadUpdate = true;
      pendingSnapshot = snapshot;
      pendingColors = colors;
      real?.update(snapshot, colors);
    },
    zoomIn() { real?.zoomIn(); },
    zoomOut() { real?.zoomOut(); },
    fit() { real?.fit(); },
    resetView() { real?.resetView(); },
    setAutoRotate(on) { autoRotate = on; real?.setAutoRotate(on); syncToolbar(); },
    setLayer(layer, visible) { layerState[layer] = visible; real?.setLayer(layer, visible); syncToolbar(); },
    setExpanded,
    dispose() {
      disposed = true;
      document.removeEventListener("keydown", onKeyDown);
      toolbar.remove();
      real?.dispose();
    },
  };
}

async function loadThree(): Promise<{
  THREE: typeof THREE_NS;
  OrbitControls: typeof OrbitControls_NS;
}> {
  const [THREE, controls] = await Promise.all([
    import("three"),
    import("three/examples/jsm/controls/OrbitControls.js"),
  ]);
  return { THREE, OrbitControls: controls.OrbitControls };
}

interface RealPointCloudViewer {
  update(snapshot: ReconstructionSessionSnapshot | undefined, colors?: ReadonlyMap<string, LandmarkColor>): void;
  dispose(): void;
}

function createRealViewer(
  THREE: typeof THREE_NS,
  OrbitControls: typeof OrbitControls_NS,
  container: HTMLElement,
): RealPointCloudViewer & RealActions {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.01, 1000);
  camera.position.set(0.6, 0.6, 0.6);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotateSpeed = 1.2;

  const grid = new THREE.GridHelper(2, 20, 0x333831, 0x2a2e28);
  scene.add(grid);

  const pointsGeometry = new THREE.BufferGeometry();
  // Position and color arrive together per frame — seed both so a
  // vertexColors material never renders without its attribute.
  pointsGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(0), 3));
  pointsGeometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(0), 3));
  const pointsMaterial = new THREE.PointsMaterial({ size: 0.012, sizeAttenuation: true, vertexColors: true });
  const points = new THREE.Points(pointsGeometry, pointsMaterial);
  scene.add(points);

  const camerasGroup = new THREE.Group();
  scene.add(camerasGroup);
  const frustumGeometry = buildFrustumGeometry(THREE);
  const frustumMaterial = new THREE.LineBasicMaterial({ color: CAMERA_COLOR });

  // The map-growth auto-centering stops the moment the person touches the
  // controls — otherwise it would undo their zoom/pan a frame later.
  let userAdjusted = false;
  controls.addEventListener("start", () => { userAdjusted = true; });

  function resize(): void {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  const resizeObserver = new ResizeObserver(resize);
  // Observe the stage host only — the toolbar overlay must not drive renderer size.
  resizeObserver.observe(container);
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  container.prepend(renderer.domElement);
  resize();

  let frameHandle = 0;
  const renderLoop = (): void => {
    frameHandle = requestAnimationFrame(renderLoop);
    controls.update();
    renderer.render(scene, camera);
  };
  frameHandle = requestAnimationFrame(renderLoop);

  const scratchColor = new THREE.Color();

  function update(snapshot: ReconstructionSessionSnapshot | undefined, colors?: ReadonlyMap<string, LandmarkColor>): void {
    const landmarks = snapshot?.map.landmarks ?? [];
    const positions = new Float32Array(landmarks.length * 3);
    const colorValues = new Float32Array(landmarks.length * 3);
    let centerX = 0, centerY = 0, centerZ = 0;
    for (let i = 0; i < landmarks.length; i += 1) {
      const landmark = landmarks[i]!;
      positions[i * 3] = landmark.x; positions[i * 3 + 1] = landmark.y; positions[i * 3 + 2] = landmark.z;
      centerX += landmark.x; centerY += landmark.y; centerZ += landmark.z;
      const rgb = colors?.get(landmark.id);
      if (rgb) scratchColor.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace);
      else scratchColor.set(POINT_COLOR);
      colorValues[i * 3] = scratchColor.r; colorValues[i * 3 + 1] = scratchColor.g; colorValues[i * 3 + 2] = scratchColor.b;
    }
    pointsGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    pointsGeometry.setAttribute("color", new THREE.BufferAttribute(colorValues, 3));
    pointsGeometry.computeBoundingSphere();

    camerasGroup.clear();
    for (const keyframe of snapshot?.poses.poses ?? []) {
      const frustum = new THREE.LineSegments(frustumGeometry, frustumMaterial);
      frustum.matrixAutoUpdate = false;
      frustum.matrix.set(
        keyframe.pose.rotation[0], keyframe.pose.rotation[1], keyframe.pose.rotation[2], keyframe.pose.translation[0],
        keyframe.pose.rotation[3], keyframe.pose.rotation[4], keyframe.pose.rotation[5], keyframe.pose.translation[1],
        keyframe.pose.rotation[6], keyframe.pose.rotation[7], keyframe.pose.rotation[8], keyframe.pose.translation[2],
        0, 0, 0, 1,
      );
      camerasGroup.add(frustum);
    }

    // Keep the subject roughly centered as the map grows, without wrenching the
    // camera away from wherever the person is currently looking.
    if (landmarks.length > 0 && !userAdjusted) {
      controls.target.lerp(new THREE.Vector3(centerX / landmarks.length, centerY / landmarks.length, centerZ / landmarks.length), 0.05);
    }
  }

  /** Multiply the camera→target distance — wheel zoom with an explicit factor. */
  function zoom(factor: number): void {
    const offset = camera.position.clone().sub(controls.target);
    const distance = offset.length() * factor;
    if (!Number.isFinite(distance) || distance <= 0) return;
    camera.position.copy(controls.target).add(offset.normalize().multiplyScalar(Math.min(500, Math.max(0.02, distance))));
    userAdjusted = true;
    controls.update();
  }

  function fit(): void {
    const sphere = pointsGeometry.boundingSphere;
    if (!sphere || !Number.isFinite(sphere.radius)) return;
    const radius = Math.max(sphere.radius, 0.05);
    const direction = camera.position.clone().sub(controls.target);
    if (direction.lengthSq() < 1e-9) direction.set(0.6, 0.6, 0.6);
    controls.target.copy(sphere.center);
    camera.position.copy(sphere.center).add(direction.normalize().multiplyScalar(radius * FIT_DISTANCE_FACTOR));
    userAdjusted = true;
    controls.update();
  }

  function resetView(): void {
    camera.position.set(0.6, 0.6, 0.6);
    controls.target.set(0, 0, 0);
    userAdjusted = false;
    controls.update();
  }

  function setAutoRotate(on: boolean): void { controls.autoRotate = on; }

  function setLayer(layer: PointCloudLayer, visible: boolean): void {
    if (layer === "points") points.visible = visible;
    else if (layer === "cameras") camerasGroup.visible = visible;
    else grid.visible = visible;
  }

  function dispose(): void {
    cancelAnimationFrame(frameHandle);
    resizeObserver.disconnect();
    controls.dispose();
    pointsGeometry.dispose();
    pointsMaterial.dispose();
    frustumGeometry.dispose();
    frustumMaterial.dispose();
    renderer.dispose();
    container.replaceChildren();
  }

  return { update, dispose, zoomIn: () => zoom(ZOOM_STEP), zoomOut: () => zoom(1 / ZOOM_STEP), fit, resetView, setAutoRotate, setLayer };
}

/** A small open-ended pyramid (apex at the origin, base facing -Z) standing in for
 * a camera frustum, scaled by FRUSTUM_SIZE so it reads as a marker, not a shape. */
function buildFrustumGeometry(THREE: typeof THREE_NS): THREE_NS.BufferGeometry {
  const s = FRUSTUM_SIZE;
  const apex = new THREE.Vector3(0, 0, 0);
  const corners = [
    new THREE.Vector3(-s, -s * 0.75, -s * 1.4),
    new THREE.Vector3(s, -s * 0.75, -s * 1.4),
    new THREE.Vector3(s, s * 0.75, -s * 1.4),
    new THREE.Vector3(-s, s * 0.75, -s * 1.4),
  ];
  const segments: THREE_NS.Vector3[] = [];
  for (const corner of corners) segments.push(apex, corner);
  for (let i = 0; i < corners.length; i += 1) segments.push(corners[i]!, corners[(i + 1) % corners.length]!);
  return new THREE.BufferGeometry().setFromPoints(segments);
}
