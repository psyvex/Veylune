//! Two-view midpoint triangulation plus reprojection-error gate for a
//! single correspondence, ported from the per-match body of
//! `apps/web/src/capture/triangulation.ts`'s `triangulateCorrespondences`
//! per ADR-013 / Stage 1.
//!
//! The match bookkeeping (`FeatureMatch`, looping over the whole match
//! list, the median-error/`accepted` aggregate) stays in TypeScript — it is
//! orchestration over this per-point math, not math itself, per ADR-013's
//! "capture/ retains orchestration... calling into WASM instead of local
//! pure-TS math."

use crate::reprojection::CameraPose;
use crate::CameraIntrinsics;

struct Ray {
    ox: f64, oy: f64, oz: f64,
    dx: f64, dy: f64, dz: f64,
}

fn unproject_ray(intrinsics: CameraIntrinsics, pose: CameraPose, px: f64, py: f64) -> Ray {
    let CameraIntrinsics { fx, fy, cx, cy } = intrinsics;
    let rx = (px - cx) / fx;
    let ry = (py - cy) / fy;
    let rz = 1.0_f64;
    let norm = rx.hypot(ry).hypot(rz);
    let (nrx, nry, nrz) = (rx / norm, ry / norm, rz / norm);
    let r = pose.rotation;
    let dx = r[0] * nrx + r[3] * nry + r[6] * nrz;
    let dy = r[1] * nrx + r[4] * nry + r[7] * nrz;
    let dz = r[2] * nrx + r[5] * nry + r[8] * nrz;
    Ray { ox: pose.translation[0], oy: pose.translation[1], oz: pose.translation[2], dx, dy, dz }
}

/// Parallax floor, not just an exact-parallel guard — see the TS
/// implementation's comment: below ~0.29° of intersection angle, depth is
/// noise that would otherwise pass every other gate.
const MIN_SIN_SQUARED_PARALLAX: f64 = 2.5e-5;

fn midpoint_triangulate(r1: &Ray, r2: &Ray) -> Option<(f64, f64, f64)> {
    let d1d2 = r1.dx * r2.dx + r1.dy * r2.dy + r1.dz * r2.dz;
    let denom = 1.0 - d1d2 * d1d2;
    if denom < MIN_SIN_SQUARED_PARALLAX {
        return None;
    }
    let wx = r2.ox - r1.ox;
    let wy = r2.oy - r1.oy;
    let wz = r2.oz - r1.oz;
    let w_dot_d1 = wx * r1.dx + wy * r1.dy + wz * r1.dz;
    let w_dot_d2 = wx * r2.dx + wy * r2.dy + wz * r2.dz;
    let t1 = (w_dot_d1 - d1d2 * w_dot_d2) / denom;
    let t2 = (d1d2 * w_dot_d1 - w_dot_d2) / denom;
    if t1 < 0.01 || t2 < 0.01 {
        return None; // point must be in front of BOTH cameras
    }
    Some((
        (r1.ox + r1.dx * t1 + r2.ox + r2.dx * t2) / 2.0,
        (r1.oy + r1.dy * t1 + r2.oy + r2.dy * t2) / 2.0,
        (r1.oz + r1.dz * t1 + r2.oz + r2.dz * t2) / 2.0,
    ))
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct TriangulatedPoint {
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub reprojection_error_px: f64,
}

/// Triangulates one correspondence and gates it on reprojection error into
/// the reference camera, exactly like the TS per-match loop body. Returns
/// `None` for insufficient parallax, a point behind either camera, a
/// non-finite result, or reprojection error above `max_reprojection_error_px`.
pub fn triangulate_point(
    intrinsics: CameraIntrinsics,
    reference_pose: CameraPose,
    current_pose: CameraPose,
    reference_px: (f64, f64),
    current_px: (f64, f64),
    max_reprojection_error_px: f64,
) -> Option<TriangulatedPoint> {
    let r1 = unproject_ray(intrinsics, reference_pose, reference_px.0, reference_px.1);
    let r2 = unproject_ray(intrinsics, current_pose, current_px.0, current_px.1);
    let (x, y, z) = midpoint_triangulate(&r1, &r2)?;
    if !x.is_finite() || !y.is_finite() || !z.is_finite() {
        return None;
    }

    let r = reference_pose.rotation;
    let c = reference_pose.translation;
    let (lx, ly, lz) = (x - c[0], y - c[1], z - c[2]);
    let cam_z = r[6] * lx + r[7] * ly + r[8] * lz;
    if cam_z <= 0.0 {
        return None;
    }
    let proj_x = intrinsics.fx * (r[0] * lx + r[1] * ly + r[2] * lz) / cam_z + intrinsics.cx;
    let proj_y = intrinsics.fy * (r[3] * lx + r[4] * ly + r[5] * lz) / cam_z + intrinsics.cy;
    let error = (proj_x - reference_px.0).hypot(proj_y - reference_px.1);
    if error <= max_reprojection_error_px {
        Some(TriangulatedPoint { x, y, z, reprojection_error_px: error })
    } else {
        None
    }
}

/// Batches {@link triangulate_point} over a whole correspondence list — same
/// rationale as `apply_camera_steps`/`linearize_observations` in
/// `crates/reconstruction`: a keyframe insertion can triangulate tens to
/// hundreds of matches at once, and calling `triangulate_point` once per
/// match across the WASM boundary would mean that many boundary crossings
/// instead of one. `pairs` is `(reference_px, reference_py, current_px,
/// current_py)` per correspondence; the `FeatureMatch` bookkeeping
/// (`referenceIndex`/`currentIndex`, kept alongside each result) stays TS —
/// this only returns the per-point math result, in input order, `None`
/// where the point was rejected (same rejection reasons as the single-point
/// function).
pub fn triangulate_points(
    intrinsics: CameraIntrinsics,
    reference_pose: CameraPose,
    current_pose: CameraPose,
    pairs: &[(f64, f64, f64, f64)],
    max_reprojection_error_px: f64,
) -> Vec<Option<TriangulatedPoint>> {
    pairs
        .iter()
        .map(|&(rx, ry, cx, cy)| triangulate_point(intrinsics, reference_pose, current_pose, (rx, ry), (cx, cy), max_reprojection_error_px))
        .collect()
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
    fn translated_pose(tx: f64) -> CameraPose {
        CameraPose { rotation: [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0], translation: [tx, 0.0, 0.0] }
    }

    #[test]
    fn triangulates_a_point_with_good_parallax() {
        // Point at (0, 0, 2) seen from x=0 and x=0.3 baselines.
        let world = (0.0_f64, 0.0_f64, 2.0_f64);
        let px_ref = (intrinsics().fx * world.0 / world.2 + intrinsics().cx, intrinsics().fy * world.1 / world.2 + intrinsics().cy);
        let cam2 = translated_pose(0.3);
        let local_x = world.0 - cam2.translation[0];
        let px_cur = (intrinsics().fx * local_x / world.2 + intrinsics().cx, intrinsics().fy * world.1 / world.2 + intrinsics().cy);

        let result = triangulate_point(intrinsics(), identity_pose(), cam2, px_ref, px_cur, 2.0).unwrap();
        assert!((result.x - world.0).abs() < 1e-6);
        assert!((result.z - world.2).abs() < 1e-6);
        assert!(result.reprojection_error_px < 1e-6);
    }

    #[test]
    fn rejects_near_zero_parallax() {
        let px = (400.0, 260.0);
        assert!(triangulate_point(intrinsics(), identity_pose(), identity_pose(), px, px, 2.0).is_none());
    }

    #[test]
    fn triangulate_points_matches_calling_triangulate_point_per_pair_including_rejections() {
        let world = (0.0_f64, 0.0_f64, 2.0_f64);
        let px_ref = (intrinsics().fx * world.0 / world.2 + intrinsics().cx, intrinsics().fy * world.1 / world.2 + intrinsics().cy);
        let cam2 = translated_pose(0.3);
        let local_x = world.0 - cam2.translation[0];
        let px_cur = (intrinsics().fx * local_x / world.2 + intrinsics().cx, intrinsics().fy * world.1 / world.2 + intrinsics().cy);
        let zero_parallax = (400.0, 260.0);

        let pairs = [
            (px_ref.0, px_ref.1, px_cur.0, px_cur.1), // good
            (zero_parallax.0, zero_parallax.1, zero_parallax.0, zero_parallax.1), // rejected
        ];
        let batched = triangulate_points(intrinsics(), identity_pose(), cam2, &pairs, 2.0);
        assert_eq!(batched.len(), 2);
        assert_eq!(batched[0], triangulate_point(intrinsics(), identity_pose(), cam2, px_ref, px_cur, 2.0));
        assert_eq!(batched[1], None);
    }

    #[test]
    fn triangulate_points_of_an_empty_list_is_empty() {
        assert_eq!(triangulate_points(intrinsics(), identity_pose(), identity_pose(), &[], 2.0), vec![]);
    }
}
