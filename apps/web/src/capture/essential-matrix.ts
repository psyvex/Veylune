import type { CameraIntrinsics } from "./geometry";
import type { CameraPose } from "./triangulation";

// ── 3×3 Jacobi SVD ────────────────────────────────────────────────────────────
// Returns { U, S, V } such that A = U * diag(S) * V^T (row-major 9-element arrays)

function mat3Mul(A: number[], B: number[]): number[] {
  const C = new Array<number>(9).fill(0);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) C[r * 3 + c] += A[r * 3 + k]! * B[k * 3 + c]!;
  return C;
}

function mat3T(A: number[]): number[] {
  return [A[0]!, A[3]!, A[6]!, A[1]!, A[4]!, A[7]!, A[2]!, A[5]!, A[8]!];
}

function identity3(): number[] { return [1, 0, 0, 0, 1, 0, 0, 0, 1]; }

function svd3(A: number[]): { U: number[]; S: number[]; V: number[] } {
  // Compute V via Jacobi iterations on A^T A
  const AtA = mat3Mul(mat3T(A), A);
  let V = identity3();
  let M = [...AtA];

  for (let sweep = 0; sweep < 30; sweep++) {
    const pairs = [[0, 1], [0, 2], [1, 2]] as const;
    let converged = true;
    for (const [p, q] of pairs) {
      const Mpq = M[p * 3 + q]!;
      if (Math.abs(Mpq) < 1e-12) continue;
      converged = false;
      const Mpp = M[p * 3 + p]!, Mqq = M[q * 3 + q]!;
      const tau = (Mqq - Mpp) / (2 * Mpq);
      const t = tau >= 0 ? 1 / (tau + Math.sqrt(1 + tau * tau)) : 1 / (tau - Math.sqrt(1 + tau * tau));
      const c = 1 / Math.sqrt(1 + t * t), s = c * t;
      // Update M: J^T M J
      const J = identity3();
      J[p * 3 + p] = c; J[p * 3 + q] = s; J[q * 3 + p] = -s; J[q * 3 + q] = c;
      M = mat3Mul(mat3Mul(mat3T(J), M), J);
      V = mat3Mul(V, J);
    }
    if (converged) break;
  }

  const S = [Math.sqrt(Math.max(0, M[0]!)), Math.sqrt(Math.max(0, M[4]!)), Math.sqrt(Math.max(0, M[8]!))];
  // Sort descending
  const order = [0, 1, 2].sort((a, b) => S[b]! - S[a]!);
  const Vs = [V.slice(0, 3).map((_, i) => V[i * 3 + order[0]!]!), V.slice(0, 3).map((_, i) => V[i * 3 + order[1]!]!), V.slice(0, 3).map((_, i) => V[i * 3 + order[2]!]!)];
  const Vout = [Vs[0]![0]!, Vs[1]![0]!, Vs[2]![0]!, Vs[0]![1]!, Vs[1]![1]!, Vs[2]![1]!, Vs[0]![2]!, Vs[1]![2]!, Vs[2]![2]!];
  const Ss = [S[order[0]!]!, S[order[1]!]!, S[order[2]!]!];

  // U = A V diag(1/s), handle zero singular values
  const U = identity3();
  const AV = mat3Mul(A, Vout);
  for (let c = 0; c < 3; c++) {
    const s = Ss[c]!;
    if (s < 1e-10) continue;
    for (let r = 0; r < 3; r++) U[r * 3 + c] = AV[r * 3 + c]! / s;
  }

  return { U, S: Ss, V: Vout };
}

// ── 8-point essential matrix ──────────────────────────────────────────────────

function nullspace9(A: readonly number[][], n: number): number[] {
  // AtA is 9x9, find smallest eigenvector via 20 iterations of inverse power
  // (shift by epsilon of Frobenius norm to regularize)
  const AtA = new Array<number>(81).fill(0);
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) for (let k = 0; k < n; k++) AtA[r * 9 + c] += A[k]![r]! * A[k]![c]!;

  // Smallest eigenvector via deflation: remove the 8 largest then remainder is smallest
  // Simpler: power iteration on (AtA)^{-1}. We'll just do Gram-Schmidt deflation.
  // Actually: run power iteration on cofactor complement. Use random init + 40 iters.
  // For stability: normalize AtA and use (I - AtA/lambda_max) power iteration.
  let norm2 = 0;
  for (const v of AtA) norm2 += v * v;
  const scale = Math.sqrt(norm2) || 1;

  // Compute approximate largest eigenvalue via one power iteration round
  let v = new Array<number>(9).fill(0); v[0] = 1;
  for (let iter = 0; iter < 8; iter++) {
    const nv = new Array<number>(9).fill(0);
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) nv[r] += AtA[r * 9 + c]! * v[c]!;
    const nm = Math.hypot(...nv) || 1;
    v = nv.map(x => x / nm);
  }
  const lambdaMax = v.reduce((s, vi, i) => s + vi * AtA[i * 9 + i]! * vi, 0) || scale;

  // Now iterate on (lambdaMax*I - AtA) to get smallest eigenvector
  const B = AtA.map((x, i) => (Math.floor(i / 9) === i % 9 ? lambdaMax : 0) - x);
  v = new Array<number>(9).fill(0); v[0] = 1;
  for (let iter = 0; iter < 40; iter++) {
    const nv = new Array<number>(9).fill(0);
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) nv[r] += B[r * 9 + c]! * v[c]!;
    const nm = Math.hypot(...nv) || 1;
    v = nv.map(x => x / nm);
  }
  return v;
}

export function estimateEssentialMatrix(
  pts1: readonly { x: number; y: number }[],
  pts2: readonly { x: number; y: number }[],
  intrinsics: CameraIntrinsics,
): number[] | undefined {
  const n = Math.min(pts1.length, pts2.length);
  if (n < 8) return undefined;

  const { fx, fy, cx, cy } = intrinsics;
  // Normalize by K^{-1}
  const A: number[][] = [];
  for (let i = 0; i < n; i++) {
    const x1 = (pts1[i]!.x - cx) / fx, y1 = (pts1[i]!.y - cy) / fy;
    const x2 = (pts2[i]!.x - cx) / fx, y2 = (pts2[i]!.y - cy) / fy;
    A.push([x2 * x1, x2 * y1, x2, y2 * x1, y2 * y1, y2, x1, y1, 1]);
  }

  const f = nullspace9(A, n);
  const E_raw = [...f]; // 3x3 row-major

  // Enforce rank-2: SVD, set smallest singular value to 0, reconstruct
  const { U, S, V } = svd3(E_raw);
  const s = (S[0]! + S[1]!) / 2; // average of two largest (they should be equal for E)
  const Sigma = [s, 0, 0, 0, s, 0, 0, 0, 0];
  const E = mat3Mul(U, mat3Mul(Sigma, mat3T(V)));

  return E;
}

// ── Decompose E into 4 [R, t] candidates ─────────────────────────────────────

const W = [0, -1, 0, 1, 0, 0, 0, 0, 1]; // Hartley W matrix
const Wt = [0, 1, 0, -1, 0, 0, 0, 0, 1];

export function decomposeEssentialMatrix(E: number[]): Array<{ rotation: CameraPose["rotation"]; translation: CameraPose["translation"] }> {
  const { U, V } = svd3(E);
  const t1 = [U[2]!, U[5]!, U[8]!] as [number, number, number];
  const t2 = [-U[2]!, -U[5]!, -U[8]!] as [number, number, number];

  const R1raw = mat3Mul(U, mat3Mul(W, mat3T(V)));
  const R2raw = mat3Mul(U, mat3Mul(Wt, mat3T(V)));

  // Ensure det(R) = +1
  const det = (R: number[]) => R[0]! * (R[4]! * R[8]! - R[5]! * R[7]!) - R[1]! * (R[3]! * R[8]! - R[5]! * R[6]!) + R[2]! * (R[3]! * R[7]! - R[4]! * R[6]!);
  const fixDet = (R: number[]) => det(R) < 0 ? R.map(x => -x) : R;
  const R1 = fixDet(R1raw) as unknown as CameraPose["rotation"];
  const R2 = fixDet(R2raw) as unknown as CameraPose["rotation"];

  return [
    { rotation: R1, translation: t1 },
    { rotation: R1, translation: t2 },
    { rotation: R2, translation: t1 },
    { rotation: R2, translation: t2 },
  ];
}

// ── Cheirality check: pick candidate where most points in front of both cameras ─

function triangulateLinear(R: CameraPose["rotation"], t: CameraPose["translation"], x1: number, y1: number, x2: number, y2: number): { z1: number; z2: number } {
  // Camera 1: P1 = [I | 0], Camera 2: P2 = [R | t]
  // Solve for depth using DLT (simple 4x3 system)
  const A = [
    [x1, 0, -1, 0, 0, 0],
    [0, y1, 0, -1, 0, 0],
    [x2 * (R[6]! - R[0]!), x2 * (R[7]! - R[1]!), x2 * (R[8]! - R[2]!) - 1, -R[6]! * t[0]! - R[7]! * t[1]! - R[8]! * t[2]!, -1, x2 * t[2]!],
    [y2 * (R[6]! - R[3]!), y2 * (R[7]! - R[4]!), y2 * (R[8]! - R[5]!) - 1, -R[6]! * t[0]! - R[7]! * t[1]! - R[8]! * t[2]!, -1, y2 * t[2]!],
  ];
  // Just use the simple midpoint approach for depth estimation
  // Ray 1: origin [0,0,0], dir = normalize([x1,y1,1])
  // Ray 2: origin = -R^T*t (camera 2 center in world), dir = R^T*normalize([x2,y2,1])
  const n1 = Math.hypot(x1, y1, 1); const d1x = x1 / n1, d1y = y1 / n1, d1z = 1 / n1;
  const n2 = Math.hypot(x2, y2, 1); const r2x = x2 / n2, r2y = y2 / n2, r2z = 1 / n2;
  // d2 = R^T * [r2x,r2y,r2z]
  const d2x = R[0]! * r2x + R[3]! * r2y + R[6]! * r2z;
  const d2y = R[1]! * r2x + R[4]! * r2y + R[7]! * r2z;
  const d2z = R[2]! * r2x + R[5]! * r2y + R[8]! * r2z;
  // Camera 2 center: C2 = -R^T * t
  const c2x = -(R[0]! * t[0]! + R[3]! * t[1]! + R[6]! * t[2]!);
  const c2y = -(R[1]! * t[0]! + R[4]! * t[1]! + R[7]! * t[2]!);
  const c2z = -(R[2]! * t[0]! + R[5]! * t[1]! + R[8]! * t[2]!);

  const b = d1x * d2x + d1y * d2y + d1z * d2z;
  const denom = 1 - b * b;
  if (Math.abs(denom) < 1e-8) return { z1: -1, z2: -1 };

  const w0 = c2x, w1 = c2y, w2 = c2z;
  const t1 = (w0 * d1x + w1 * d1y + w2 * d1z - b * (w0 * d2x + w1 * d2y + w2 * d2z)) / denom;
  const t2 = (b * (w0 * d1x + w1 * d1y + w2 * d1z) - (w0 * d2x + w1 * d2y + w2 * d2z)) / denom;

  // z in camera 1 = depth along optical axis = z coordinate of point
  const px = d1x * t1, py = d1y * t1, pz = d1z * t1;
  // z in camera 2 frame = R * (P - C2) in z direction
  const lx = px - c2x, ly = py - c2y, lz = pz - c2z;
  const z2 = R[6]! * lx + R[7]! * ly + R[8]! * lz;

  void A; void t2; // suppress unused
  return { z1: pz, z2 };
}

export function selectPoseByCheirality(
  candidates: ReturnType<typeof decomposeEssentialMatrix>,
  pts1: readonly { x: number; y: number }[],
  pts2: readonly { x: number; y: number }[],
  intrinsics: CameraIntrinsics,
  translationScale: number,
): { rotation: CameraPose["rotation"]; translation: CameraPose["translation"] } | undefined {
  const { fx, fy, cx, cy } = intrinsics;
  let best: (typeof candidates)[0] | undefined;
  let bestScore = -1;

  for (const candidate of candidates) {
    let score = 0;
    const sampleSize = Math.min(pts1.length, 20);
    for (let i = 0; i < sampleSize; i++) {
      const x1 = (pts1[i]!.x - cx) / fx, y1 = (pts1[i]!.y - cy) / fy;
      const x2 = (pts2[i]!.x - cx) / fx, y2 = (pts2[i]!.y - cy) / fy;
      const { z1, z2 } = triangulateLinear(candidate.rotation, candidate.translation, x1, y1, x2, y2);
      if (z1 > 0 && z2 > 0) score++;
    }
    if (score > bestScore) { bestScore = score; best = candidate; }
  }

  if (!best || bestScore === 0) return undefined;

  // Scale the translation: E gives unit-norm t, scale to match coordinate system
  const tMag = Math.hypot(...best.translation) || 1;
  const t = best.translation.map(v => v / tMag * translationScale) as unknown as CameraPose["translation"];
  return { rotation: best.rotation, translation: t };
}
