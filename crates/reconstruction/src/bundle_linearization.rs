//! Per-observation bundle-adjustment linearization (residual + camera/
//! landmark Jacobians), ported from `linearizeObservation` in
//! `apps/web/src/capture/bundle-linearization.ts` per ADR-013 / Stage 1
//! task 11. `linearizeBundle`'s loop over `BundleProblem` (camera/landmark
//! `Map` lookups, skipping unmatched observations) stays TS orchestration —
//! it is problem-graph bookkeeping, not math, per the same rule
//! `schur_block_solve.rs`'s module doc applies.

use veylune_geometry::distortion::{project_distorted_point_with_jacobian, RadialTangentialDistortion};
use veylune_geometry::reprojection::CameraPose;
use veylune_geometry::CameraIntrinsics;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ObservationLinearization {
    pub residual: [f64; 2],
    pub weight: f64,
    /// Column-major 2x6 (12 values) — all zero when `camera_fixed` was
    /// true, matching the TS behavior of never writing into this block for
    /// a fixed camera.
    pub camera_jacobian: [f64; 12],
    /// Column-major 2x3 (6 values).
    pub landmark_jacobian: [f64; 6],
    pub valid: bool,
}

/// One observation's resolved inputs — the `camera`/`landmark` `Map` lookups
/// in `linearizeBundle` have already happened by the time this is built;
/// this struct is exactly what {@link linearize_observation} takes, bundled
/// so a whole observation list can be batched (see
/// {@link linearize_observations}'s doc).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ObservationInput {
    pub intrinsics: CameraIntrinsics,
    pub distortion: RadialTangentialDistortion,
    pub camera_pose: CameraPose,
    pub camera_fixed: bool,
    pub landmark: [f64; 3],
    pub observed: [f64; 2],
    pub weight: f64,
}

/// Batches {@link linearize_observation} over a whole observation list —
/// same rationale as `apply_camera_steps`/`apply_landmark_steps` in
/// `bundle_optimizer.rs`: a real capture can have hundreds of observations
/// per iteration, and calling `linearize_observation` once per observation
/// across the WASM boundary would mean hundreds of boundary crossings
/// instead of one. The Rust-side work per observation is unchanged — this
/// is purely a call-count optimization for the WASM-routed caller
/// (`linearizeBundleRouted` in `bundle-linearization.ts`); the camera/
/// landmark `Map` lookups that produce `ObservationInput` stay TS.
pub fn linearize_observations(inputs: &[ObservationInput]) -> Vec<ObservationLinearization> {
    inputs
        .iter()
        .map(|input| linearize_observation(input.intrinsics, input.distortion, input.camera_pose, input.camera_fixed, input.landmark, input.observed, input.weight))
        .collect()
}

pub fn linearize_observation(
    intrinsics: CameraIntrinsics,
    distortion: RadialTangentialDistortion,
    camera_pose: CameraPose,
    camera_fixed: bool,
    landmark: [f64; 3],
    observed: [f64; 2],
    weight: f64,
) -> ObservationLinearization {
    // camera_pose.translation is the camera's world-space CENTER (see
    // reprojection.rs's project_point for the full explanation):
    // q = R*(P - C).
    let r = camera_pose.rotation;
    let c = camera_pose.translation;
    let (lx, ly, lz) = (landmark[0] - c[0], landmark[1] - c[1], landmark[2] - c[2]);
    let x = r[0] * lx + r[1] * ly + r[2] * lz;
    let y = r[3] * lx + r[4] * ly + r[5] * lz;
    let z = r[6] * lx + r[7] * ly + r[8] * lz;

    let mut camera_jacobian = [0.0_f64; 12];
    let mut landmark_jacobian = [0.0_f64; 6];

    let Some(projected) = project_distorted_point_with_jacobian([x, y, z], intrinsics, distortion) else {
        return ObservationLinearization { residual: [0.0, 0.0], weight, camera_jacobian, landmark_jacobian, valid: false };
    };

    let j = projected.jacobian;
    // A left rotation increment changes the camera point by omega x q = -[q]x omega.
    let rotation_derivative = [0.0, z, -y, -z, 0.0, x, y, -x, 0.0];
    for row in 0..2 {
        let row_offset = row * 3;
        for column in 0..3 {
            if !camera_fixed {
                camera_jacobian[column * 2 + row] = j[row_offset] * rotation_derivative[column]
                    + j[row_offset + 1] * rotation_derivative[3 + column]
                    + j[row_offset + 2] * rotation_derivative[6 + column];
                // d(q)/d(center) = -R (q = R*(P - C)) — the negative of the
                // landmark block below, not the identity a standard-t
                // parameterization would give.
                camera_jacobian[(3 + column) * 2 + row] = -(j[row_offset] * r[column]
                    + j[row_offset + 1] * r[3 + column]
                    + j[row_offset + 2] * r[6 + column]);
            }
            landmark_jacobian[column * 2 + row] = j[row_offset] * r[column]
                + j[row_offset + 1] * r[3 + column]
                + j[row_offset + 2] * r[6 + column];
        }
    }
    let residual = [projected.pixel[0] - observed[0], projected.pixel[1] - observed[1]];
    let valid = weight.is_finite()
        && weight > 0.0
        && residual.iter().chain(camera_jacobian.iter()).chain(landmark_jacobian.iter()).all(|v: &f64| v.is_finite());

    ObservationLinearization { residual, weight, camera_jacobian, landmark_jacobian, valid }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn intrinsics() -> CameraIntrinsics {
        CameraIntrinsics { fx: 500.0, fy: 500.0, cx: 320.0, cy: 240.0 }
    }
    fn identity_distortion() -> RadialTangentialDistortion {
        RadialTangentialDistortion { k1: 0.0, k2: 0.0, k3: 0.0, p1: 0.0, p2: 0.0 }
    }
    fn identity_pose() -> CameraPose {
        CameraPose { rotation: [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0], translation: [0.0, 0.0, 0.0] }
    }

    #[test]
    fn translation_is_camera_center_and_its_jacobian_block_is_negative_r() {
        // Camera center at (0.5, 0, 0): world point (0.5, -0.1, 2.0) sits
        // straight ahead of this camera (camera-frame x=0), same fixture as
        // reprojection.rs's equivalent test.
        let pose = CameraPose { rotation: [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0], translation: [0.5, 0.0, 0.0] };
        let result = linearize_observation(intrinsics(), identity_distortion(), pose, false, [0.5, -0.1, 2.0], [intrinsics().cx, intrinsics().fy * -0.05 + intrinsics().cy], 1.0);
        assert!(result.valid);
        assert!(result.residual[0].abs() < 1e-9);
        assert!(result.residual[1].abs() < 1e-9);
        // d(pixel_x)/d(center_x) = -fx/z = -500/2 = -250 (rotation is
        // identity here, so this is the whole R contribution).
        assert!((result.camera_jacobian[6] - -250.0).abs() < 1e-6);
    }

    #[test]
    fn linearize_observations_matches_calling_linearize_observation_per_entry() {
        let landmark_a = [0.2, -0.1, 2.0];
        let landmark_b = [-0.3, 0.4, 3.0];
        let inputs = vec![
            ObservationInput { intrinsics: intrinsics(), distortion: identity_distortion(), camera_pose: identity_pose(), camera_fixed: false, landmark: landmark_a, observed: [400.0, 250.0], weight: 1.0 },
            ObservationInput { intrinsics: intrinsics(), distortion: identity_distortion(), camera_pose: identity_pose(), camera_fixed: true, landmark: landmark_b, observed: [300.0, 260.0], weight: 2.0 },
        ];
        let batched = linearize_observations(&inputs);
        assert_eq!(batched.len(), 2);
        for (input, result) in inputs.iter().zip(batched.iter()) {
            let individual = linearize_observation(input.intrinsics, input.distortion, input.camera_pose, input.camera_fixed, input.landmark, input.observed, input.weight);
            assert_eq!(*result, individual);
        }
    }

    #[test]
    fn linearize_observations_of_an_empty_list_is_empty() {
        assert_eq!(linearize_observations(&[]), vec![]);
    }

    #[test]
    fn zero_residual_for_an_exact_observation() {
        let landmark = [0.2, -0.1, 2.0];
        let px = intrinsics().fx * landmark[0] / landmark[2] + intrinsics().cx;
        let py = intrinsics().fy * landmark[1] / landmark[2] + intrinsics().cy;
        let result = linearize_observation(intrinsics(), identity_distortion(), identity_pose(), false, landmark, [px, py], 1.0);
        assert!(result.valid);
        assert!(result.residual[0].abs() < 1e-9);
        assert!(result.residual[1].abs() < 1e-9);
    }

    #[test]
    fn fixed_camera_gets_a_zero_camera_jacobian() {
        let landmark = [0.2, -0.1, 2.0];
        let result = linearize_observation(intrinsics(), identity_distortion(), identity_pose(), true, landmark, [400.0, 250.0], 1.0);
        assert_eq!(result.camera_jacobian, [0.0; 12]);
        // Landmark jacobian is still populated for a fixed camera.
        assert!(result.landmark_jacobian.iter().any(|v| *v != 0.0));
    }

    #[test]
    fn invalid_for_a_point_behind_the_camera() {
        let result = linearize_observation(intrinsics(), identity_distortion(), identity_pose(), false, [0.1, 0.1, -1.0], [320.0, 240.0], 1.0);
        assert!(!result.valid);
    }

    #[test]
    fn invalid_for_a_non_positive_weight() {
        let landmark = [0.2, -0.1, 2.0];
        let result = linearize_observation(intrinsics(), identity_distortion(), identity_pose(), false, landmark, [400.0, 250.0], 0.0);
        assert!(!result.valid);
    }
}
