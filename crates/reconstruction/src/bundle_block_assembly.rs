//! Batched Gauss-Newton Hessian/gradient accumulation into Schur blocks,
//! ported from `apps/web/src/capture/bundle-block-assembly.ts`'s
//! `assembleBundleBlocks` per ADR-013 / Stage 1 task 13. This is the
//! single most expensive per-observation step in the bundle-adjustment
//! loop (an outer-product accumulation into dense camera/landmark/coupling
//! blocks for every observation), so it is ported as one batch call rather
//! than the per-observation shape the TS loop has — same rationale as
//! `linearize_observations`.
//!
//! `camera_index` is `None` for a fixed camera (the caller's index map
//! only contains non-fixed cameras — `linearization.cameraIds` is
//! `problem.cameras.filter(c => !c.fixed)`). A fixed camera's own
//! block/gradient contribution is skipped (nothing to solve for — its
//! `camera_jacobian` is already all-zero), but every observation's
//! `landmark_jacobian` contribution is always accumulated regardless of
//! whether its camera is fixed. An earlier version of this port (and the
//! TS it was ported from) skipped the *whole* observation whenever
//! `camera_index` was `None`, silently dropping every fixed anchor's
//! contribution to the landmarks it observes — fixed; see ADR-014 in
//! `docs/07-architecture-decisions.md` and Stage 1 task 13 in
//! `docs/75-production-task-pipeline.md` for the write-up.

use crate::schur_block_solve::BlockMatrix;
use crate::robust_loss::HuberLoss;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct AssemblyObservation {
    /// `None` when the observation's camera has no index in the caller's
    /// camera list — either the camera is genuinely absent, or (the
    /// pre-existing quirk above) it's fixed. Either way, the TS loop skips
    /// the whole observation, so this port does too.
    pub camera_index: Option<usize>,
    pub landmark_index: usize,
    pub residual: [f64; 2],
    /// The observation's own weight (`observation.weight`), pre-Huber —
    /// this function multiplies it by `HuberLoss::weight` itself, matching
    /// `mahalanobisSquared = weight * (rx² + ry²); weight *= huber.weight(mahalanobisSquared)`.
    pub weight: f64,
    /// Column-major 2x6 — all zero for a fixed camera (irrelevant here
    /// anyway, since a fixed camera's `camera_index` is always `None`).
    pub camera_jacobian: [f64; 12],
    /// Column-major 2x3.
    pub landmark_jacobian: [f64; 6],
}

#[derive(Debug, Clone)]
pub struct SchurBlocks {
    pub camera: BlockMatrix,
    pub camera_landmark: BlockMatrix,
    pub landmark: BlockMatrix,
    pub camera_gradient: Vec<f64>,
    pub landmark_gradient: Vec<f64>,
}

/// `None` for an invalid `huber_delta` (`HuberLoss::new` failing), matching
/// the TS `HuberLoss` constructor's throw.
pub fn assemble_bundle_blocks(
    observations: &[AssemblyObservation],
    camera_count: usize,
    landmark_count: usize,
    damping: f64,
    huber_delta: f64,
) -> Option<SchurBlocks> {
    let robust_loss = HuberLoss::new(huber_delta)?;
    let camera_size = camera_count * 6;
    let landmark_size = landmark_count * 3;
    let mut camera = vec![0.0_f64; camera_size * camera_size];
    let mut camera_landmark = vec![0.0_f64; camera_size * landmark_size];
    let mut landmark = vec![0.0_f64; landmark_size * landmark_size];
    let mut camera_gradient = vec![0.0_f64; camera_size];
    let mut landmark_gradient = vec![0.0_f64; landmark_size];

    for observation in observations {
        // `camera_index` is `None` for a fixed camera (the caller's index
        // map only contains non-fixed cameras) — its camera block/gradient
        // is correctly skipped (nothing to solve for), but its
        // `landmark_jacobian` is real and must still constrain the
        // landmark. Previously the whole observation was skipped here,
        // silently dropping every fixed anchor's contribution to the
        // landmarks it observes — fixed per ADR-014's follow-up; see this
        // module's doc.
        let ci = observation.camera_index;
        let li = observation.landmark_index;
        let l_offset = li * 3;

        let mahalanobis_squared = observation.weight * (observation.residual[0] * observation.residual[0] + observation.residual[1] * observation.residual[1]);
        let weight = observation.weight * robust_loss.weight(mahalanobis_squared);

        for residual_index in 0..2 {
            let r = observation.residual[residual_index];
            if let Some(ci) = ci {
                let c_offset = ci * 6;
                for a in 0..6 {
                    let ja = observation.camera_jacobian[a * 2 + residual_index] * weight;
                    camera_gradient[c_offset + a] += ja * r;
                    for b in a..6 {
                        let jb = observation.camera_jacobian[b * 2 + residual_index];
                        let value = ja * jb;
                        camera[(c_offset + a) * camera_size + c_offset + b] += value;
                        if a != b {
                            camera[(c_offset + b) * camera_size + c_offset + a] += value;
                        }
                    }
                }
            }
            for a in 0..3 {
                let ja = observation.landmark_jacobian[a * 2 + residual_index] * weight;
                landmark_gradient[l_offset + a] += ja * r;
                for b in a..3 {
                    let jb = observation.landmark_jacobian[b * 2 + residual_index];
                    let value = ja * jb;
                    landmark[(l_offset + a) * landmark_size + l_offset + b] += value;
                    if a != b {
                        landmark[(l_offset + b) * landmark_size + l_offset + a] += value;
                    }
                }
                if let Some(ci) = ci {
                    let c_offset = ci * 6;
                    for b in 0..6 {
                        let jb = observation.camera_jacobian[b * 2 + residual_index];
                        camera_landmark[(c_offset + b) * landmark_size + l_offset + a] += jb * ja;
                    }
                }
            }
        }
    }

    for i in 0..camera_size {
        camera[i * camera_size + i] += damping;
    }
    for i in 0..landmark_size {
        landmark[i * landmark_size + i] += damping;
    }

    Some(SchurBlocks {
        camera: BlockMatrix { rows: camera_size, columns: camera_size, values: camera },
        camera_landmark: BlockMatrix { rows: camera_size, columns: landmark_size, values: camera_landmark },
        landmark: BlockMatrix { rows: landmark_size, columns: landmark_size, values: landmark },
        camera_gradient,
        landmark_gradient,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accumulates_a_single_observation_into_the_right_blocks() {
        let obs = AssemblyObservation {
            camera_index: Some(0),
            landmark_index: 0,
            residual: [1.0, 0.5],
            weight: 1.0,
            camera_jacobian: [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
            landmark_jacobian: [1.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        };
        let blocks = assemble_bundle_blocks(&[obs], 1, 1, 0.0, 10.0).unwrap();
        // Huber weight is 1 inside the quadratic region (delta=10, residual small),
        // so this reduces to a plain Gauss-Newton accumulation.
        assert!((blocks.camera_gradient[0] - 1.0).abs() < 1e-9); // ja*r = 1*1
        assert!((blocks.camera.values[0] - 1.0).abs() < 1e-9); // ja*jb = 1*1
        assert!((blocks.landmark_gradient[0] - 1.0).abs() < 1e-9);
    }

    #[test]
    fn a_fixed_camera_still_contributes_to_the_landmark_block_but_not_the_camera_block() {
        let obs = AssemblyObservation {
            camera_index: None, // fixed camera
            landmark_index: 0,
            residual: [1.0, 1.0],
            weight: 1.0,
            camera_jacobian: [1.0; 12], // irrelevant when camera_index is None, but non-zero to prove it's ignored
            landmark_jacobian: [1.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        };
        let blocks = assemble_bundle_blocks(&[obs], 1, 1, 0.0, 10.0).unwrap();
        // No camera to solve for -> camera block/gradient stay exactly zero.
        assert_eq!(blocks.camera_gradient, vec![0.0; 6]);
        assert_eq!(blocks.camera.values, vec![0.0; 36]);
        // The landmark still gets this observation's constraint (ja*r = 1*1 = 1).
        assert!((blocks.landmark_gradient[0] - 1.0).abs() < 1e-9);
        assert!((blocks.landmark.values[0] - 1.0).abs() < 1e-9); // ja*jb = 1*1
        // No camera exists to couple to, so the coupling block stays zero.
        assert_eq!(blocks.camera_landmark.values, vec![0.0; 18]);
    }

    #[test]
    fn a_landmark_seen_by_a_fixed_and_a_free_camera_accumulates_both_observations() {
        let fixed_obs = AssemblyObservation {
            camera_index: None,
            landmark_index: 0,
            residual: [1.0, 0.0],
            weight: 1.0,
            camera_jacobian: [0.0; 12],
            landmark_jacobian: [1.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        };
        let free_obs = AssemblyObservation {
            camera_index: Some(0),
            landmark_index: 0,
            residual: [1.0, 0.0],
            weight: 1.0,
            camera_jacobian: [0.0; 12],
            landmark_jacobian: [1.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        };
        let blocks = assemble_bundle_blocks(&[fixed_obs, free_obs], 1, 1, 0.0, 10.0).unwrap();
        // Both observations' landmark contributions accumulate: 1+1 = 2.
        assert!((blocks.landmark_gradient[0] - 2.0).abs() < 1e-9);
        assert!((blocks.landmark.values[0] - 2.0).abs() < 1e-9);
    }

    #[test]
    fn adds_damping_to_every_diagonal_entry() {
        let blocks = assemble_bundle_blocks(&[], 1, 1, 5.0, 10.0).unwrap();
        for i in 0..6 {
            assert_eq!(blocks.camera.values[i * 6 + i], 5.0);
        }
        for i in 0..3 {
            assert_eq!(blocks.landmark.values[i * 3 + i], 5.0);
        }
    }

    #[test]
    fn rejects_an_invalid_huber_delta() {
        assert!(assemble_bundle_blocks(&[], 1, 1, 0.0, 0.0).is_none());
    }

    #[test]
    fn camera_and_landmark_blocks_stay_symmetric() {
        let obs = AssemblyObservation {
            camera_index: Some(0),
            landmark_index: 0,
            residual: [0.3, -0.2],
            weight: 1.0,
            camera_jacobian: [1.0, 2.0, 0.0, 0.5, -1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
            landmark_jacobian: [1.0, 0.5, -0.3, 0.2, 0.1, 0.4],
        };
        let blocks = assemble_bundle_blocks(&[obs], 1, 1, 0.0, 10.0).unwrap();
        for a in 0..6 {
            for b in 0..6 {
                assert!((blocks.camera.values[a * 6 + b] - blocks.camera.values[b * 6 + a]).abs() < 1e-9);
            }
        }
        for a in 0..3 {
            for b in 0..3 {
                assert!((blocks.landmark.values[a * 3 + b] - blocks.landmark.values[b * 3 + a]).abs() < 1e-9);
            }
        }
    }
}
