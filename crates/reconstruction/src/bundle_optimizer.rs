//! Pure numerical pieces of the Levenberg-Marquardt bundle-adjustment loop
//! in `apps/web/src/capture/bundle-optimizer.ts`, ported per ADR-013 /
//! Stage 1 task 12.
//!
//! `optimizeBundle` itself — the iterate/accept-reject loop, damping
//! schedule, `shouldCancel`/`onProgress` callbacks, and the string-`id`
//! lookups in `applyBundleStep`/`computeBundleResiduals` that walk a
//! `BundleProblem`'s camera/landmark arrays by id — stays TS orchestration,
//! same rule as `schur_block_solve.rs` and `bundle_linearization.rs`: this
//! crate ports the arithmetic those steps need, not the problem-graph
//! bookkeeping around them. `bundle-commit.ts` (the `LocalMap` transaction
//! merge) is orchestration/state-management, not math, and was not ported
//! for the same reason.

use crate::robust_loss::HuberLoss;
use crate::schur_block_solve::BlockMatrix;
use veylune_geometry::se3::{apply_se3_increment, Mat3, Se3Increment, Vec3};
use veylune_geometry::vector::clamp_vector;

/// `predictReduction` from `bundle-optimizer.ts` — the quadratic model's
/// predicted cost reduction for a proposed Schur-block step, used to
/// compute the Levenberg-Marquardt gain ratio.
#[allow(clippy::needless_range_loop)] // Mirrors bundle-optimizer.ts's index shape intentionally, for parity readability.
pub fn predict_reduction(
    camera_gradient: &[f64],
    camera_hessian: &BlockMatrix,
    landmark_gradient: &[f64],
    landmark_hessian: &BlockMatrix,
    camera_landmark: &BlockMatrix,
    camera_step: &[f64],
    landmark_step: &[f64],
) -> f64 {
    let mut linear = 0.0_f64;
    let mut quadratic = 0.0_f64;
    let camera_size = camera_step.len();
    let landmark_size = landmark_step.len();

    for i in 0..camera_size {
        linear += camera_gradient[i] * camera_step[i];
        for j in 0..camera_size {
            quadratic += 0.5 * camera_step[i] * camera_hessian.values[i * camera_size + j] * camera_step[j];
        }
    }
    for i in 0..landmark_size {
        linear += landmark_gradient[i] * landmark_step[i];
        for j in 0..landmark_size {
            quadratic += 0.5 * landmark_step[i] * landmark_hessian.values[i * landmark_size + j] * landmark_step[j];
        }
    }
    for i in 0..camera_size {
        for j in 0..landmark_size {
            quadratic += camera_step[i] * camera_landmark.values[i * landmark_size + j] * landmark_step[j];
        }
    }
    -(linear + quadratic)
}

/// `bundleCost`'s per-residual accumulation from `bundle-optimizer.ts`,
/// factored to take already-computed residuals/weights rather than a
/// `BundleProblem` (the `computeBundleResiduals` Map-lookup loop that
/// produces them stays TS — see this module's doc). Returns `f64::INFINITY`
/// for an invalid residual or a non-finite/non-positive weight, matching
/// the TS early return; `None` for an invalid `huberDelta` (the TS
/// `HuberLoss` constructor throws in that case).
pub fn bundle_cost(residuals: &[(f64, f64, bool)], weights: &[f64], huber_delta: f64) -> Option<f64> {
    let loss = HuberLoss::new(huber_delta)?;
    let mut cost = 0.0_f64;
    for (index, &(residual_x, residual_y, valid)) in residuals.iter().enumerate() {
        let weight = weights[index];
        if !valid || !weight.is_finite() || weight <= 0.0 {
            return Some(f64::INFINITY);
        }
        cost += loss.rho_squared(weight * (residual_x * residual_x + residual_y * residual_y));
    }
    Some(cost)
}

/// One camera's post-step pose.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CameraStepResult {
    pub rotation: Mat3,
    pub translation: Vec3,
}

/// The camera-array half of `applyBundleStep` in `bundle-optimizer.ts`,
/// batched into a single call instead of one WASM call per camera —
/// `clampVector` and `applySE3Increment` are each called once per camera in
/// the TS version, which is fine there (call count == camera count, all in
/// one JS heap) but would mean one WASM boundary crossing per camera if
/// routed the same way `solveBundleSchurBlocks`/`predictReduction` were.
/// This function takes every camera's current pose and step at once and
/// returns every updated pose at once, so the *WASM call count* stays O(1)
/// regardless of how many cameras are being optimized.
///
/// `rotations`/`translations` and `camera_step` are all in the same
/// per-camera order (the caller's `cameraIds` order); `camera_step` is flat
/// `[rotation(3), translation(3)] * cameraCount`.
/// `translations` are camera world-space CENTERS, not a standard
/// world-to-camera `t` (see `reprojection.rs`'s `project_point`) — so
/// unlike `apply_se3_increment`'s SE3 group update (`t_new = ΔR*t + Δt`,
/// correct for a standard `t`), the center's Gauss-Newton step is a plain
/// world-frame add (`C_new = C + step`), matching
/// `bundle_linearization.rs`'s `d(q)/d(center) = -R` Jacobian (itself
/// derived assuming this additive update). The rotation update is
/// unaffected — `so3Exp(step)` left-multiplied onto the rotation is correct
/// for either translation convention, since it only concerns `R`.
pub fn apply_camera_steps(
    rotations: &[Mat3],
    translations: &[Vec3],
    camera_step: &[f64],
    max_rotation_step: f64,
    max_translation_step: f64,
) -> Vec<CameraStepResult> {
    rotations
        .iter()
        .zip(translations.iter())
        .enumerate()
        .map(|(i, (&rotation, &center))| {
            let offset = i * 6;
            let rotation_step = clamp_vector(&camera_step[offset..offset + 3], max_rotation_step);
            let translation_step = clamp_vector(&camera_step[offset + 3..offset + 6], max_translation_step);
            // Rotation-only SE3 increment: apply_se3_increment with a zero
            // input/output translation just left-multiplies so3Exp(step)
            // onto the rotation, which is what we want here.
            let increment = Se3Increment { rotation: [rotation_step[0], rotation_step[1], rotation_step[2]], translation: [0.0, 0.0, 0.0] };
            let (next_rotation, _) = apply_se3_increment(rotation, [0.0, 0.0, 0.0], increment);
            let next_center = [center[0] + translation_step[0], center[1] + translation_step[1], center[2] + translation_step[2]];
            CameraStepResult { rotation: next_rotation, translation: next_center }
        })
        .collect()
}

/// The landmark-array half of `applyBundleStep` — same batching rationale
/// as {@link apply_camera_steps}. `landmarks`/`landmark_step` are in the
/// caller's `landmarkIds` order; `landmark_step` is flat `[x, y, z] *
/// landmarkCount`. Depth is floored at `1e-5`, matching the TS
/// `Math.max(1e-5, landmark.z + step[2])`.
pub fn apply_landmark_steps(landmarks: &[Vec3], landmark_step: &[f64], max_landmark_step: f64) -> Vec<Vec3> {
    landmarks
        .iter()
        .enumerate()
        .map(|(i, &landmark)| {
            let offset = i * 3;
            let step = clamp_vector(&landmark_step[offset..offset + 3], max_landmark_step);
            [landmark[0] + step[0], landmark[1] + step[1], (landmark[2] + step[2]).max(1e-5)]
        })
        .collect()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BundleAdjustmentStatus {
    NotRun,
    Insufficient,
}

/// `prepareBundleAdjustment` from `bundle-adjustment.ts` — a landmark/
/// observation-count threshold gate.
pub fn prepare_bundle_adjustment(landmark_count: usize, observation_count: usize) -> BundleAdjustmentStatus {
    if landmark_count < 3 || observation_count < 8 {
        BundleAdjustmentStatus::Insufficient
    } else {
        BundleAdjustmentStatus::NotRun
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn identity_block(size: usize) -> BlockMatrix {
        let mut values = vec![0.0; size * size];
        for i in 0..size {
            values[i * size + i] = 1.0;
        }
        BlockMatrix { rows: size, columns: size, values }
    }

    fn identity_pose() -> (Mat3, Vec3) {
        ([1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0], [0.0, 0.0, 0.0])
    }

    #[test]
    fn apply_camera_steps_applies_a_translation_only_increment() {
        let (rotation, translation) = identity_pose();
        let step = [0.0, 0.0, 0.0, 1.0, 2.0, 3.0]; // zero rotation, translation increment
        let result = apply_camera_steps(&[rotation], &[translation], &step, 10.0, 10.0);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].rotation, rotation);
        assert_eq!(result[0].translation, [1.0, 2.0, 3.0]);
    }

    #[test]
    fn apply_camera_steps_clamps_a_translation_beyond_max_step() {
        let (rotation, translation) = identity_pose();
        let step = [0.0, 0.0, 0.0, 3.0, 4.0, 0.0]; // norm 5
        let result = apply_camera_steps(&[rotation], &[translation], &step, 10.0, 2.0);
        let applied_norm = (result[0].translation[0].powi(2) + result[0].translation[1].powi(2) + result[0].translation[2].powi(2)).sqrt();
        assert!((applied_norm - 2.0).abs() < 1e-9);
    }

    #[test]
    fn apply_camera_steps_processes_every_camera_in_order() {
        let (rotation, translation) = identity_pose();
        let step = [0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 2.0, 0.0];
        let result = apply_camera_steps(&[rotation, rotation], &[translation, translation], &step, 10.0, 10.0);
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].translation, [1.0, 0.0, 0.0]);
        assert_eq!(result[1].translation, [0.0, 2.0, 0.0]);
    }

    #[test]
    fn apply_camera_steps_center_update_is_a_plain_add_not_se3_composed_with_rotation() {
        // A nonzero rotation step combined with a translation step: the
        // center must land at old_center + translation_step exactly, NOT
        // at so3Exp(rotation_step) * old_center + translation_step (the
        // SE3-composed rule, correct for a standard w2c `t` but wrong for
        // a world-space center).
        let rotation = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0];
        let center = [5.0, 0.0, 0.0]; // far enough from origin that the two rules diverge visibly
        let step = [0.0, 0.0, std::f64::consts::FRAC_PI_2, 1.0, 0.0, 0.0]; // 90 deg yaw + translation
        let result = apply_camera_steps(&[rotation], &[center], &step, 10.0, 10.0);
        assert_eq!(result[0].translation, [6.0, 0.0, 0.0]); // 5 + 1, not a rotated 5
    }

    #[test]
    fn apply_landmark_steps_adds_the_clamped_step() {
        let result = apply_landmark_steps(&[[1.0, 2.0, 3.0]], &[0.5, -0.5, 0.1], 10.0);
        assert_eq!(result, vec![[1.5, 1.5, 3.1]]);
    }

    #[test]
    fn apply_landmark_steps_floors_depth_at_a_small_positive_epsilon() {
        let result = apply_landmark_steps(&[[0.0, 0.0, 0.1]], &[0.0, 0.0, -5.0], 10.0);
        assert_eq!(result[0][2], 1e-5);
    }

    #[test]
    fn predict_reduction_of_a_pure_gradient_descent_step_is_negative_the_linear_term() {
        // Identity Hessians, zero coupling: quadratic term is 0.5*|step|^2 per block.
        let camera_hessian = identity_block(2);
        let landmark_hessian = identity_block(2);
        let coupling = BlockMatrix { rows: 2, columns: 2, values: vec![0.0; 4] };
        let reduction = predict_reduction(&[1.0, 1.0], &camera_hessian, &[0.0, 0.0], &landmark_hessian, &coupling, &[1.0, 1.0], &[0.0, 0.0]);
        // linear = 1*1 + 1*1 = 2, quadratic = 0.5*(1*1*1 + 1*1*1) = 1 -> -(2+1) = -3
        assert!((reduction - -3.0).abs() < 1e-9);
    }

    #[test]
    fn bundle_cost_is_infinite_for_an_invalid_residual() {
        let cost = bundle_cost(&[(0.1, 0.1, false)], &[1.0], 1.0).unwrap();
        assert!(cost.is_infinite());
    }

    #[test]
    fn bundle_cost_sums_huber_loss_over_valid_residuals() {
        let cost = bundle_cost(&[(0.1, 0.0, true), (0.2, 0.0, true)], &[1.0, 1.0], 10.0).unwrap();
        // Both residuals are well inside the Huber quadratic region (delta=10), so
        // this is just the sum of squared residual magnitudes.
        assert!((cost - (0.01 + 0.04)).abs() < 1e-9);
    }

    #[test]
    fn bundle_cost_rejects_an_invalid_huber_delta() {
        assert_eq!(bundle_cost(&[(0.0, 0.0, true)], &[1.0], 0.0), None);
    }

    #[test]
    fn prepare_bundle_adjustment_reports_insufficient_below_thresholds() {
        assert_eq!(prepare_bundle_adjustment(2, 100), BundleAdjustmentStatus::Insufficient);
        assert_eq!(prepare_bundle_adjustment(100, 7), BundleAdjustmentStatus::Insufficient);
        assert_eq!(prepare_bundle_adjustment(3, 8), BundleAdjustmentStatus::NotRun);
    }
}
