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
function scale3(a: Mat3, s: number): Mat3 {
  return [a[0] * s, a[1] * s, a[2] * s, a[3] * s, a[4] * s, a[5] * s, a[6] * s, a[7] * s, a[8] * s];
}
function add3(a: Mat3, b: Mat3, c: Mat3): Mat3 {
  return [a[0] + b[0] + c[0], a[1] + b[1] + c[1], a[2] + b[2] + c[2], a[3] + b[3] + c[3], a[4] + b[4] + c[4], a[5] + b[5] + c[5], a[6] + b[6] + c[6], a[7] + b[7] + c[7], a[8] + b[8] + c[8]];
}
function multiply3(a: Mat3, b: Mat3): Mat3 {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6], a[0] * b[1] + a[1] * b[4] + a[2] * b[7], a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6], a[3] * b[1] + a[4] * b[4] + a[5] * b[7], a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6], a[6] * b[1] + a[7] * b[4] + a[8] * b[7], a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ];
}
function multiplyVec3(a: Mat3, v: Vec3): Vec3 { return [a[0] * v[0] + a[1] * v[1] + a[2] * v[2], a[3] * v[0] + a[4] * v[1] + a[5] * v[2], a[6] * v[0] + a[7] * v[1] + a[8] * v[2]]; }
