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

  // U = A V diag(1/s), handle zero singular values. The tolerance is RELATIVE
  // to σ₁: an exact essential matrix has σ₃ = 0, so whatever Jacobi reports
  // there is numerical noise — on the order of 1e-10…1e-8 × σ₁ in practice. An
  // absolute cutoff sits right inside that noise band: when a noisy σ₃ slips
  // past it, A·v₃ (eigenvector noise, ~1e-6) is divided by ~1e-10 and the
  // resulting third column of U is garbage of norm ~1e-4 — which silently
  // turns the essential decomposition into t≈0 plus a rank-2 rotation, and
  // every downstream triangulation gate rejects every point.
  const rankTol = Ss[0]! * 1e-7;
  const U = identity3();
  const AV = mat3Mul(A, Vout);
  for (let c = 0; c < 3; c++) {
    const s = Ss[c]!;
    if (s <= rankTol) continue;
    for (let r = 0; r < 3; r++) U[r * 3 + c] = AV[r * 3 + c]! / s;
  }
  // For a rank-deficient σ₃, u₃ is only defined up to sign; left unfilled it
  // would silently stay at the identity default [0,0,1]. u₃ = u₁ × u₂
  // completes the proper (det +1) basis.
  if (Ss[2]! <= rankTol) {
    const u1x = U[0]!, u1y = U[3]!, u1z = U[6]!;
    const u2x = U[1]!, u2y = U[4]!, u2z = U[7]!;
    U[2] = u1y * u2z - u1z * u2y;
    U[5] = u1z * u2x - u1x * u2z;
    U[8] = u1x * u2y - u1y * u2x;
  }

  return { U, S: Ss, V: Vout };
}

// ── 8-point essential matrix ──────────────────────────────────────────────────

/** Gaussian elimination with partial pivoting on a 9×9 system. */
function solve9(M: readonly number[], b: readonly number[]): number[] | undefined {
  const a = [...M];
  const x = [...b];
  for (let col = 0; col < 9; col++) {
    let piv = col;
    let pivVal = Math.abs(a[col * 9 + col]!);
    for (let r = col + 1; r < 9; r++) {
      const v = Math.abs(a[r * 9 + col]!);
      if (v > pivVal) { pivVal = v; piv = r; }
    }
    if (pivVal < 1e-14) return undefined;
    if (piv !== col) {
      for (let c = col; c < 9; c++) { const t = a[col * 9 + c]!; a[col * 9 + c] = a[piv * 9 + c]!; a[piv * 9 + c] = t; }
      const t = x[col]!; x[col] = x[piv]!; x[piv] = t;
    }
    for (let r = col + 1; r < 9; r++) {
      const f = a[r * 9 + col]! / a[col * 9 + col]!;
      if (f === 0) continue;
      for (let c = col; c < 9; c++) a[r * 9 + c] = a[r * 9 + c]! - f * a[col * 9 + c]!;
      x[r] = x[r]! - f * x[col]!;
    }
  }
  const out = new Array<number>(9).fill(0);
  for (let r = 8; r >= 0; r--) {
    let s = x[r]!;
    for (let c = r + 1; c < 9; c++) s -= a[r * 9 + c]! * out[c]!;
    out[r] = s / a[r * 9 + r]!;
  }
  return out;
}

function nullspace9(A: readonly number[][], n: number): number[] {
  // AtA is 9x9, find smallest eigenvector via 20 iterations of inverse power
  // (shift by epsilon of Frobenius norm to regularize)
  const AtA = new Array<number>(81).fill(0);
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) for (let k = 0; k < n; k++) AtA[r * 9 + c] += A[k]![r]! * A[k]![c]!;

  // Smallest eigenvector via inverse iteration with a fixed tiny shift:
  // repeatedly solving (AtA + shift·I)·w = v amplifies each eigencomponent by
  // 1/(λᵢ+shift), so the null direction wins by orders of magnitude. Power
  // iteration cannot separate λ8 from λ9≈0 on exact 8-point systems, and
  // Rayleigh-quotient iteration locks onto whatever eigenvalue the start is
  // nearest — both returned the wrong vector in practice.
  let norm2 = 0;
  for (const v of AtA) norm2 += v * v;
  const scale = Math.sqrt(norm2) || 1;
  const shift = 1e-9 * scale;
  const M = AtA.map((x, i) => (Math.floor(i / 9) === i % 9 ? x + shift : x));

  const rayleigh = (vec: readonly number[]): number => {
    let s = 0;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) s += vec[r]! * AtA[r * 9 + c]! * vec[c]!;
    return s;
  };

  // Deterministic pseudo-random start — generic enough not to sit in an
  // invariant subspace of AtA.
  let v = Array.from({ length: 9 }, (_, i) => Math.sin(i * 2.7 + 1.3));
  const n0 = Math.hypot(...v) || 1;
  v = v.map((x) => x / n0);
  let bestV = v;
  let bestRho = rayleigh(v);
  for (let iter = 0; iter < 30; iter++) {
    const w = solve9(M, v);
    if (!w) break;
    const nw = Math.hypot(...w) || 1;
    v = w.map((x) => x / nw);
    const rho = rayleigh(v);
    if (rho < bestRho) { bestRho = rho; bestV = v; }
  }
  return bestV;
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

// ── RANSAC wrapper ────────────────────────────────────────────────────────────

export interface RobustEssentialResult {
  readonly E: number[];
  /** Per-point inlier mask, same length as input arrays */
  readonly inliers: readonly boolean[];
}

export function epipolarErrors(E: readonly number[], pts1: readonly { x: number; y: number }[], pts2: readonly { x: number; y: number }[], intrinsics: CameraIntrinsics): number[] {
  const { fx, fy, cx, cy } = intrinsics;
  const errors = new Array<number>(pts1.length);
  for (let i = 0; i < pts1.length; i++) {
    const x1 = (pts1[i]!.x - cx) / fx, y1 = (pts1[i]!.y - cy) / fy;
    const x2 = (pts2[i]!.x - cx) / fx, y2 = (pts2[i]!.y - cy) / fy;
    // First-order transfer error (Fischler & Bolles): d ≈ |x2^T E x1| / sqrt(a²+b²)
    // where a,b are first two components of E*x1 and E^T*x2 respectively
    const e1 = [
      E[0]! * x1 + E[1]! * y1 + E[2]!,
      E[3]! * x1 + E[4]! * y1 + E[5]!,
      E[6]! * x1 + E[7]! * y1 + E[8]!,
    ];
    const e2 = [
      E[0]! * x2 + E[3]! * y2 + E[6]!,
      E[1]! * x2 + E[4]! * y2 + E[7]!,
      E[2]! * x2 + E[5]! * y2 + E[8]!,
    ];
    const xTEy = x2 * e1[0]! + y2 * e1[1]! + e1[2]!;
    const denom = e1[0]! * e1[0]! + e1[1]! * e1[1]! + e2[0]! * e2[0]! + e2[1]! * e2[1]!;
    errors[i] = denom > 1e-18 ? (xTEy * xTEy) / denom : Number.POSITIVE_INFINITY;
  }
  return errors;
}

/**
 * RANSAC-fitted essential matrix. Samples random 8-point subsets, scores the
 * epipolar constraint over all correspondences, refits on the best inlier set.
 * Returns inlier mask so callers can drop outlier matches before triangulation.
 */
export function robustEstimateEssentialMatrix(
  pts1: readonly { x: number; y: number }[],
  pts2: readonly { x: number; y: number }[],
  intrinsics: CameraIntrinsics,
  options: { iterations?: number; thresholdPx?: number } = {},
): RobustEssentialResult | undefined {
  const n = Math.min(pts1.length, pts2.length);
  if (n < 8) return undefined;
  const iterations = options.iterations ?? 300;
  // Squared threshold in normalized coordinates
  const tNorm = (options.thresholdPx ?? 2.0) / Math.max(intrinsics.fx, 1);
  const thresholdSq = tNorm * tNorm;

  const sample = new Array<number>(8);
  let bestCount = -1;
  let bestSum = Number.POSITIVE_INFINITY;
  let bestE: number[] | undefined;
  let bestMask: boolean[] | undefined;

  for (let iter = 0; iter < iterations; iter++) {
    // Random 8 distinct indices
    const used = new Set<number>();
    for (let k = 0; k < 8; k++) {
      let idx = Math.floor(Math.random() * n);
      let guard = 0;
      while (used.has(idx) && guard++ < 20) idx = (idx + 1) % n;
      used.add(idx);
      sample[k] = idx;
    }
    const s1 = sample.map((i) => pts1[i]!);
    const s2 = sample.map((i) => pts2[i]!);
    const E = estimateEssentialMatrix(s1, s2, intrinsics);
    if (!E) continue;

    const errors = epipolarErrors(E, pts1, pts2, intrinsics);
    const mask = errors.map((e) => e <= thresholdSq);
    let count = 0;
    let sum = 0;
    for (let i = 0; i < n; i++) if (mask[i]) { count++; sum += errors[i]!; }

    // On small parallax (walking slowly, distant subject) several wrong models
    // — e.g. "pure forward drift" — keep every match inside a generous pixel
    // threshold, so the inlier COUNT alone cannot pick the winner: whichever
    // degenerate model was sampled first stuck, and odometry silently slid
    // along the optical axis while the scene barely parallaxed. Break ties by
    // total inlier residual — the true model's errors sit at pixel-
    // quantization noise, orders of magnitude below a near-miss impostor.
    if (count > bestCount || (count === bestCount && count > 0 && sum < bestSum)) {
      bestCount = count;
      bestSum = sum;
      bestE = E;
      bestMask = mask;
    }
  }

  if (!bestE || !bestMask || bestCount < 8) return undefined;

  // Refit on inliers (linear-time improvement over the 8-point model). The
  // algebraic LSQ is BIASED toward degenerate models at small parallax — on a
  // slow walk it happily returns "camera slid forward" with the same inlier
  // count as the true lateral motion but visibly worse residuals — so the
  // refit must EARN its place: only keep it when it is not worse than the
  // sampled winner on inlier count and total geometric error.
  const idx1: { x: number; y: number }[] = [];
  const idx2: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) if (bestMask[i]) { idx1.push(pts1[i]!); idx2.push(pts2[i]!); }
  const refit = (idx1.length >= 8 ? estimateEssentialMatrix(idx1, idx2, intrinsics) : undefined) ?? bestE;

  // Final inlier pass on the refit model
  const finalErrors = epipolarErrors(refit, pts1, pts2, intrinsics);
  const finalMask = finalErrors.map((e) => e <= thresholdSq);
  let finalCount = 0;
  let finalSum = 0;
  for (let i = 0; i < n; i++) if (finalMask[i]) { finalCount++; finalSum += finalErrors[i]!; }
  if (finalCount < 8) return { E: bestE, inliers: bestMask };
  if (finalCount === bestCount && finalSum > bestSum) return { E: bestE, inliers: bestMask };

  return { E: refit, inliers: finalMask };
}

/**
 * Essential matrix for a known camera-pose pair.
 * Convention: poses are world-to-camera (X_cam = R (X_world - C)).
 * Returns E such that x2^T E x1 = 0 for normalized coords in each camera.
 */
export function essentialFromPoses(pose1: CameraPose, pose2: CameraPose): number[] {
  const R1 = pose1.rotation, R2 = pose2.rotation, C1 = pose1.translation, C2 = pose2.translation;
  // R_rel = R2 * R1^T
  const Rrel = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) Rrel[r * 3 + c] = R2[r * 3]! * R1[c * 3]! + R2[r * 3 + 1]! * R1[c * 3 + 1]! + R2[r * 3 + 2]! * R1[c * 3 + 2]!;
  // t_rel = R2 * (C1 - C2)
  const d = [C1[0]! - C2[0]!, C1[1]! - C2[1]!, C1[2]! - C2[2]!];
  const tx = R2[0]! * d[0]! + R2[1]! * d[1]! + R2[2]! * d[2]!;
  const ty = R2[3]! * d[0]! + R2[4]! * d[1]! + R2[5]! * d[2]!;
  const tz = R2[6]! * d[0]! + R2[7]! * d[1]! + R2[8]! * d[2]!;
  // E = [t]x * Rrel
  const txmat = [0, -tz, ty, tz, 0, -tx, -ty, tx, 0];
  return mat3Mul(txmat, Rrel);
}

/**
 * E from a relative pose pair, same slot values the estimator carries:
 * rotation = R₂R₁ᵀ, translation = R₂(C₁−C₂). (Essential matrices ignore the
 * length of t, so any scaled t gives the same epipolar geometry.)
 */
export function essentialFromRelativePose(rotation: readonly number[], translation: readonly number[]): number[] {
  const [tx, ty, tz] = [translation[0]!, translation[1]!, translation[2]!];
  return mat3Mul([0, -tz, ty, tz, 0, -tx, -ty, tx, 0], [...rotation]);
}

/** Indices of points whose first-order transfer error is within thresholdPx. */
export function epipolarInlierMask(
  E: readonly number[],
  pts1: readonly { x: number; y: number }[],
  pts2: readonly { x: number; y: number }[],
  intrinsics: CameraIntrinsics,
  thresholdPx = 2.5,
): boolean[] {
  // Errors are squared normalized-coordinate distances; threshold in same units
  const tNorm = thresholdPx / Math.max(intrinsics.fx, 1);
  return epipolarErrors(E, pts1, pts2, intrinsics).map((e) => e <= tNorm * tNorm);
}

// ── Decompose E into 4 [R, t] candidates ─────────────────────────────────────

const W = [0, -1, 0, 1, 0, 0, 0, 0, 1]; // Hartley W matrix
const Wt = [0, 1, 0, -1, 0, 0, 0, 0, 1];

export function decomposeEssentialMatrix(E: number[]): Array<{ rotation: CameraPose["rotation"]; translation: CameraPose["translation"] }> {
  const { U, V } = svd3(E);
  const t1 = [U[2]!, U[5]!, U[8]!] as [number, number, number];
  const t2 = [-U[2]!, -U[5]!, -U[8]!] as [number, number, number];

  // det(U W Vᵀ) = det(U)·det(W)·det(V) with det(W) = det(Wᵀ) = +1, so both
  // rotations are proper exactly when det(V) = det(U). Flipping V's third
  // column enforces that WITHOUT touching the (R, t) pairing — negating a
  // whole improper R (the previous fixDet) yields −R, a different
  // 180°-offset rotation that no longer agrees with t, and cheirality happily
  // scores the inconsistent pair.
  const det = (R: number[]) => R[0]! * (R[4]! * R[8]! - R[5]! * R[7]!) - R[1]! * (R[3]! * R[8]! - R[5]! * R[6]!) + R[2]! * (R[3]! * R[7]! - R[4]! * R[6]!);
  const Vc = det(U) * det(V) < 0 ? [V[0]!, V[1]!, -V[2]!, V[3]!, V[4]!, -V[5]!, V[6]!, V[7]!, -V[8]!] : V;

  const R1 = mat3Mul(U, mat3Mul(W, mat3T(Vc))) as unknown as CameraPose["rotation"];
  const R2 = mat3Mul(U, mat3Mul(Wt, mat3T(Vc))) as unknown as CameraPose["rotation"];

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
    // t comes from a unit column of U; a short one means the decomposition was
    // fed something degenerate — scoring it would "select" a pose built from
    // pure noise.
    if (Math.hypot(...candidate.translation) < 0.5) continue;
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
