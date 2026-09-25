import type * as THREE_NS from "three";
import type { OrbitControls as OrbitControls_NS } from "three/examples/jsm/controls/OrbitControls.js";
import type { ReconstructionSessionSnapshot } from "./reconstruction-session";

export interface PointCloudViewer {
  /** Feed the latest reconstruction snapshot in; a no-op viewer (WebGL unavailable) ignores it. */
  update(snapshot: ReconstructionSessionSnapshot | undefined): void;
  dispose(): void;
  /** False until three.js has loaded and WebGL initialized; a no-op viewer stays false forever. */
  readonly available: boolean;
}

const POINT_COLOR = 0x586fee; // matches --accent in design/tokens.css
const CAMERA_COLOR = 0x8fbcff;
const FRUSTUM_SIZE = 0.06;

/**
 * Renders the live capture session's sparse point cloud and camera
 * trajectory (see reconstruction-session.ts) as a real, navigable 3D scene,
 * so a scan produces something visible rather than only progress numbers.
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
  let real: RealPointCloudViewer | undefined;
  let disposed = false;
  let pendingSnapshot: ReconstructionSessionSnapshot | undefined;
  let hadUpdate = false;

  void loadThree()
    .then(({ THREE, OrbitControls }) => {
      if (disposed) return;
      real = createRealViewer(THREE, OrbitControls, container);
      if (hadUpdate) real.update(pendingSnapshot);
    })
    .catch(() => {
      // No WebGL, or the dynamic import itself failed (offline, blocked CDN
      // in a restrictive network policy, etc.): stay a no-op viewer.
    });

  return {
    get available() {
      return real !== undefined;
    },
    update(snapshot) {
      hadUpdate = true;
      pendingSnapshot = snapshot;
      real?.update(snapshot);
    },
    dispose() {
      disposed = true;
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
  update(snapshot: ReconstructionSessionSnapshot | undefined): void;
  dispose(): void;
}

function createRealViewer(
  THREE: typeof THREE_NS,
  OrbitControls: typeof OrbitControls_NS,
  container: HTMLElement,
): RealPointCloudViewer {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.01, 1000);
  camera.position.set(0.6, 0.6, 0.6);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  const grid = new THREE.GridHelper(2, 20, 0x333831, 0x2a2e28);
  scene.add(grid);

  const pointsGeometry = new THREE.BufferGeometry();
  const pointsMaterial = new THREE.PointsMaterial({ color: POINT_COLOR, size: 0.012, sizeAttenuation: true });
  const points = new THREE.Points(pointsGeometry, pointsMaterial);
  scene.add(points);

  const camerasGroup = new THREE.Group();
  scene.add(camerasGroup);
  const frustumGeometry = buildFrustumGeometry(THREE);
  const frustumMaterial = new THREE.LineBasicMaterial({ color: CAMERA_COLOR });

  function resize(): void {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  container.replaceChildren(renderer.domElement);
  resize();

  let frameHandle = 0;
  const renderLoop = (): void => {
    frameHandle = requestAnimationFrame(renderLoop);
    controls.update();
    renderer.render(scene, camera);
  };
  frameHandle = requestAnimationFrame(renderLoop);

  function update(snapshot: ReconstructionSessionSnapshot | undefined): void {
    const landmarks = snapshot?.map.landmarks ?? [];
    const positions = new Float32Array(landmarks.length * 3);
    let centerX = 0, centerY = 0, centerZ = 0;
    for (let i = 0; i < landmarks.length; i += 1) {
      const landmark = landmarks[i]!;
      positions[i * 3] = landmark.x;
      positions[i * 3 + 1] = landmark.y;
      positions[i * 3 + 2] = landmark.z;
      centerX += landmark.x; centerY += landmark.y; centerZ += landmark.z;
    }
    pointsGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
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
    if (landmarks.length > 0) {
      controls.target.lerp(new THREE.Vector3(centerX / landmarks.length, centerY / landmarks.length, centerZ / landmarks.length), 0.05);
    }
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

  return { update, dispose };
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
