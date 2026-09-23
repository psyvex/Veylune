export type Vec3 = readonly [number, number, number];
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

export interface SE3Increment {
  readonly rotation: Vec3;
  readonly translation: Vec3;
}

export function skew(v: Vec3): Mat3 {
  return [0, -v[2], v[1], v[2], 0, -v[0], -v[1], v[0], 0];
}

export function so3Exp(omega: Vec3): Mat3 {
  const theta = Math.hypot(...omega);
  const K = skew(omega);
  const K2 = multiply3(K, K);
  const a = theta < 1e-8 ? 1 - theta * theta / 6 : Math.sin(theta) / theta;
  const b = theta < 1e-8 ? 0.5 - theta * theta / 24 : (1 - Math.cos(theta)) / (theta * theta);
  return add3(identity3(), scale3(K, a), scale3(K2, b));
}

export function applySE3Increment(rotation: Mat3, translation: Vec3, increment: SE3Increment): { rotation: Mat3; translation: Vec3 } {
  const deltaR = so3Exp(increment.rotation);
  const nextRotation = multiply3(deltaR, rotation);
  const rotatedTranslation = multiplyVec3(deltaR, translation);
  return {
    rotation: nextRotation,
    translation: [rotatedTranslation[0] + increment.translation[0], rotatedTranslation[1] + increment.translation[1], rotatedTranslation[2] + increment.translation[2]],
  };
}

function identity3(): Mat3 { return [1, 0, 0, 0, 1, 0, 0, 0, 1]; }
function scale3(a: Mat3, s: number): Mat3 { return a.map((v) => v * s) as Mat3; }
function add3(...mats: Mat3[]): Mat3 { return mats[0].map((_, i) => mats.reduce((sum, matrix) => sum + matrix[i]!, 0)) as Mat3; }
function multiply3(a: Mat3, b: Mat3): Mat3 {
  const out = new Array<number>(9).fill(0);
  for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) for (let k = 0; k < 3; k += 1) out[r * 3 + c] += a[r * 3 + k]! * b[k * 3 + c]!;
  return out as Mat3;
}
function multiplyVec3(a: Mat3, v: Vec3): Vec3 { return [a[0]! * v[0] + a[1]! * v[1] + a[2]! * v[2], a[3]! * v[0] + a[4]! * v[1] + a[5]! * v[2], a[6]! * v[0] + a[7]! * v[1] + a[8]! * v[2]]; }
