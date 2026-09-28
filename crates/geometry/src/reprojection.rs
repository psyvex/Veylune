//! Pinhole reprojection and reprojection error, ported from
//! `apps/web/src/capture/reprojection.ts` per ADR-013 / Stage 1.

use crate::se3::{Mat3, Vec3};
use crate::CameraIntrinsics;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CameraPose {
    pub rotation: Mat3,
    pub translation: Vec3,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ProjectedPoint {
    pub x: f64,
    pub y: f64,
    pub valid: bool,
}

/// `pose.translation` is the camera's world-space CENTER, not a standard
/// world-to-camera translation — matching `triangulation.rs`'s
/// `unproject_ray` and how `local-pose-estimator.ts` (the TS caller that
/// actually produces every real pose) builds it: `composePose` accumulates
/// world-center deltas by plain addition. This function computes
/// `q = R*(P - C)`, not `R*P + t` (see ADR-013 Stage 1 task 13's notes /
/// `docs/07-architecture-decisions.md` for the full writeup of this
/// convention mismatch and its fix).
pub fn project_point(point: [f64; 3], intrinsics: CameraIntrinsics, pose: CameraPose) -> ProjectedPoint {
    let [x, y, z] = point;
    let r = pose.rotation;
    let c = pose.translation;
    let (lx, ly, lz) = (x - c[0], y - c[1], z - c[2]);
    let camera_x = r[0] * lx + r[1] * ly + r[2] * lz;
    let camera_y = r[3] * lx + r[4] * ly + r[5] * lz;
    let camera_z = r[6] * lx + r[7] * ly + r[8] * lz;
    if !camera_x.is_finite() || !camera_y.is_finite() || !camera_z.is_finite() || camera_z <= 0.0 {
        return ProjectedPoint { x: 0.0, y: 0.0, valid: false };
    }
    ProjectedPoint {
        x: intrinsics.fx * camera_x / camera_z + intrinsics.cx,
        y: intrinsics.fy * camera_y / camera_z + intrinsics.cy,
        valid: true,
    }
}

pub fn reprojection_error_px(
    observed: [f64; 2],
    point: [f64; 3],
    intrinsics: CameraIntrinsics,
    pose: CameraPose,
) -> f64 {
    let projected = project_point(point, intrinsics, pose);
    if !projected.valid || !observed[0].is_finite() || !observed[1].is_finite() {
        return f64::INFINITY;
    }
    (projected.x - observed[0]).hypot(projected.y - observed[1])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn intrinsics() -> CameraIntrinsics {
        CameraIntrinsics { fx: 500.0, fy: 500.0, cx: 320.0, cy: 240.0 }
    }
    fn identity_pose() -> CameraPose {
        CameraPose { rotation: [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0], translation: [0.0, 0.0, 0.0] }
    }

    #[test]
    fn projects_a_point_in_front_of_the_camera() {
        let projected = project_point([0.2, -0.1, 2.0], intrinsics(), identity_pose());
        assert!(projected.valid);
        assert!((projected.x - (500.0 * 0.1 + 320.0)).abs() < 1e-9);
    }

    #[test]
    fn rejects_points_behind_the_camera() {
        let projected = project_point([0.2, -0.1, -2.0], intrinsics(), identity_pose());
        assert!(!projected.valid);
    }

    #[test]
    fn reprojection_error_is_zero_for_an_exact_observation() {
        let point = [0.2, -0.1, 2.0];
        let projected = project_point(point, intrinsics(), identity_pose());
        let error = reprojection_error_px([projected.x, projected.y], point, intrinsics(), identity_pose());
        assert!(error < 1e-9);
    }

    #[test]
    fn reprojection_error_is_infinite_when_the_point_is_invalid() {
        let error = reprojection_error_px([0.0, 0.0], [0.0, 0.0, -1.0], intrinsics(), identity_pose());
        assert!(error.is_infinite());
    }

    #[test]
    fn translation_is_treated_as_camera_center_not_a_standard_w2c_t() {
        // Camera center at (0.5, 0, 0), point at world (0.5, -0.1, 2.0) ->
        // camera-frame (0, -0.1, 2.0), i.e. straight ahead with a small y
        // offset. The old (wrong) R*P+t formula would instead compute
        // camera-frame (1.0, -0.1, 2.0) here — a very different pixel.
        let pose = CameraPose { rotation: [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0], translation: [0.5, 0.0, 0.0] };
        let projected = project_point([0.5, -0.1, 2.0], intrinsics(), pose);
        assert!(projected.valid);
        assert!((projected.x - intrinsics().cx).abs() < 1e-9);
        assert!((projected.y - (intrinsics().fy * -0.05 + intrinsics().cy)).abs() < 1e-9);
    }
}
