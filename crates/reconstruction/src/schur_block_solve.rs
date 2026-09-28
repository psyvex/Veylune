//! Schur-complement solve for a bundle-adjustment system whose landmark
//! Hessian blocks are independent 3x3 blocks, ported from
//! `apps/web/src/capture/schur-block-solve.ts` (the module
//! `bundle-optimizer.ts` actually calls) per ADR-013 / Stage 1 task 11.
//!
//! `schur.ts` and `schur-blocks.ts`/`schur-backsubstitution.ts` are *not*
//! ported here: `schur.ts`'s `prepareSchurSystem` has no production caller
//! and its own success path returns `status: "singular"` unconditionally
//! (apparent dead code with a latent bug — not this port's job to fix or
//! carry forward). `schur-blocks.ts`/`schur-backsubstitution.ts` are a
//! second, factored Schur implementation exercised only by
//! `bundle-linearization.test.ts`/`numerical.test.ts` as a cross-check, not
//! the shipped path (`bundle-optimizer.ts` imports `schur-block-solve.ts`
//! only) — porting a second, non-shipped implementation of the same math
//! was left for a follow-up rather than doubling this port's surface area
//! for no shipped-path benefit.

use veylune_geometry::linear_solve::{solve_positive_definite, DenseLinearSystem};

#[derive(Debug, Clone)]
pub struct BlockMatrix {
    pub rows: usize,
    pub columns: usize,
    /// Row-major, length `rows * columns`.
    pub values: Vec<f64>,
}

#[derive(Debug, Clone)]
pub struct SchurBlocks {
    pub camera: BlockMatrix,
    pub camera_landmark: BlockMatrix,
    pub landmark: BlockMatrix,
    pub camera_gradient: Vec<f64>,
    pub landmark_gradient: Vec<f64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SchurStatus {
    Solved,
    Singular,
    Insufficient,
}

#[derive(Debug, Clone)]
pub struct SchurBlockSolveResult {
    pub status: SchurStatus,
    pub camera_step: Vec<f64>,
    pub landmark_step: Vec<f64>,
}

fn insufficient(camera_size: usize, landmark_size: usize) -> SchurBlockSolveResult {
    SchurBlockSolveResult { status: SchurStatus::Insufficient, camera_step: vec![0.0; camera_size], landmark_step: vec![0.0; landmark_size] }
}
fn singular(camera_size: usize, landmark_size: usize) -> SchurBlockSolveResult {
    SchurBlockSolveResult { status: SchurStatus::Singular, camera_step: vec![0.0; camera_size], landmark_step: vec![0.0; landmark_size] }
}

fn invert3(a: &[f64]) -> Option<[f64; 9]> {
    let determinant = a[0] * (a[4] * a[8] - a[5] * a[7]) - a[1] * (a[3] * a[8] - a[5] * a[6]) + a[2] * (a[3] * a[7] - a[4] * a[6]);
    if !determinant.is_finite() || determinant.abs() < 1e-12 {
        return None;
    }
    Some([
        (a[4] * a[8] - a[5] * a[7]) / determinant,
        (a[2] * a[7] - a[1] * a[8]) / determinant,
        (a[1] * a[5] - a[2] * a[4]) / determinant,
        (a[5] * a[6] - a[3] * a[8]) / determinant,
        (a[0] * a[8] - a[2] * a[6]) / determinant,
        (a[2] * a[3] - a[0] * a[5]) / determinant,
        (a[3] * a[7] - a[4] * a[6]) / determinant,
        (a[1] * a[6] - a[0] * a[7]) / determinant,
        (a[0] * a[4] - a[1] * a[3]) / determinant,
    ])
}
fn mul3(a: &[f64; 9], v: &[f64]) -> [f64; 3] {
    [
        a[0] * v[0] + a[1] * v[1] + a[2] * v[2],
        a[3] * v[0] + a[4] * v[1] + a[5] * v[2],
        a[6] * v[0] + a[7] * v[1] + a[8] * v[2],
    ]
}
fn dot3(a: &[f64], b: &[f64; 3]) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

#[allow(clippy::needless_range_loop)] // Mirrors schur-block-solve.ts's index shape intentionally, for parity readability.
pub fn solve_bundle_schur_blocks(blocks: &SchurBlocks, damping: f64) -> SchurBlockSolveResult {
    let camera_size = blocks.camera.rows;
    let landmark_size = blocks.landmark.rows;
    if camera_size == 0 || landmark_size == 0 || !landmark_size.is_multiple_of(3) {
        return insufficient(camera_size, landmark_size);
    }

    let mut reduced = blocks.camera.values.clone();
    for i in 0..camera_size {
        reduced[i * camera_size + i] += damping;
    }
    let mut reduced_gradient = blocks.camera_gradient.clone();
    let landmark_count = landmark_size / 3;
    let mut inverses: Vec<[f64; 9]> = Vec::with_capacity(landmark_count);

    for block in 0..landmark_count {
        let offset = block * 3;
        let mut c = [0.0_f64; 9];
        for r in 0..3 {
            for col in 0..3 {
                c[r * 3 + col] = blocks.landmark.values[(offset + r) * landmark_size + offset + col] + if r == col { damping } else { 0.0 };
            }
        }
        let inverse = match invert3(&c) {
            Some(inv) => inv,
            None => return singular(camera_size, landmark_size),
        };
        inverses.push(inverse);

        let bg = mul3(&inverse, &blocks.landmark_gradient[offset..offset + 3]);
        for i in 0..camera_size {
            let bi = &blocks.camera_landmark.values[i * landmark_size + offset..i * landmark_size + offset + 3];
            reduced_gradient[i] -= dot3(bi, &bg);
            for j in 0..camera_size {
                let bj = &blocks.camera_landmark.values[j * landmark_size + offset..j * landmark_size + offset + 3];
                reduced[i * camera_size + j] -= dot3(bi, &mul3(&inverse, bj));
            }
        }
    }

    let rhs: Vec<f64> = reduced_gradient.iter().map(|v| -v).collect();
    let camera_step = match solve_positive_definite(&DenseLinearSystem { size: camera_size, matrix: reduced, rhs }) {
        Some(step) => step,
        None => return singular(camera_size, landmark_size),
    };

    let mut landmark_step = vec![0.0_f64; landmark_size];
    for block in 0..landmark_count {
        let offset = block * 3;
        let mut rhs = [
            blocks.landmark_gradient[offset],
            blocks.landmark_gradient[offset + 1],
            blocks.landmark_gradient[offset + 2],
        ];
        for camera in 0..camera_size {
            let b = &blocks.camera_landmark.values[camera * landmark_size + offset..camera * landmark_size + offset + 3];
            for component in 0..3 {
                rhs[component] += b[component] * camera_step[camera];
            }
        }
        let local = mul3(&inverses[block], &rhs);
        landmark_step[offset] = -local[0];
        landmark_step[offset + 1] = -local[1];
        landmark_step[offset + 2] = -local[2];
    }

    SchurBlockSolveResult { status: SchurStatus::Solved, camera_step, landmark_step }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn identity_camera(size: usize) -> BlockMatrix {
        let mut values = vec![0.0; size * size];
        for i in 0..size {
            values[i * size + i] = 1.0;
        }
        BlockMatrix { rows: size, columns: size, values }
    }

    #[test]
    fn reports_insufficient_for_an_empty_system() {
        let blocks = SchurBlocks {
            camera: BlockMatrix { rows: 0, columns: 0, values: vec![] },
            camera_landmark: BlockMatrix { rows: 0, columns: 0, values: vec![] },
            landmark: BlockMatrix { rows: 0, columns: 0, values: vec![] },
            camera_gradient: vec![],
            landmark_gradient: vec![],
        };
        let result = solve_bundle_schur_blocks(&blocks, 1e-3);
        assert_eq!(result.status, SchurStatus::Insufficient);
    }

    #[test]
    fn solves_a_decoupled_camera_and_landmark_block() {
        // camera_landmark is all zero, so this degenerates to two independent solves.
        let blocks = SchurBlocks {
            camera: identity_camera(2),
            camera_landmark: BlockMatrix { rows: 2, columns: 3, values: vec![0.0; 6] },
            landmark: identity_camera(3),
            camera_gradient: vec![2.0, -4.0],
            landmark_gradient: vec![1.0, 1.0, 1.0],
        };
        let result = solve_bundle_schur_blocks(&blocks, 0.0);
        assert_eq!(result.status, SchurStatus::Solved);
        assert!((result.camera_step[0] - -2.0).abs() < 1e-9);
        assert!((result.camera_step[1] - 4.0).abs() < 1e-9);
        assert!((result.landmark_step[0] - -1.0).abs() < 1e-9);
    }

    #[test]
    fn reports_singular_when_a_landmark_block_is_degenerate() {
        let blocks = SchurBlocks {
            camera: identity_camera(1),
            camera_landmark: BlockMatrix { rows: 1, columns: 3, values: vec![0.0; 3] },
            landmark: BlockMatrix { rows: 3, columns: 3, values: vec![0.0; 9] },
            camera_gradient: vec![1.0],
            landmark_gradient: vec![1.0, 1.0, 1.0],
        };
        let result = solve_bundle_schur_blocks(&blocks, 0.0); // no damping -> singular 3x3 block
        assert_eq!(result.status, SchurStatus::Singular);
    }
}
