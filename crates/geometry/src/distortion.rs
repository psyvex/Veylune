//! Radial-tangential lens distortion, ported from
//! `apps/web/src/capture/distortion.ts` per ADR-013 / Stage 1 of
//! `docs/75-production-task-pipeline.md`. `f64` throughout to match the
//! JavaScript `number` implementation this is validated against by
//! `apps/web/src/capture/distortion-reprojection-wasm-parity.test.ts`.

use crate::CameraIntrinsics;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct RadialTangentialDistortion {
    pub k1: f64,
    pub k2: f64,
    pub k3: f64,
    pub p1: f64,
    pub p2: f64,
}

pub const ZERO_DISTORTION: RadialTangentialDistortion =
    RadialTangentialDistortion { k1: 0.0, k2: 0.0, k3: 0.0, p1: 0.0, p2: 0.0 };

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct DistortedPointWithJacobian {
    pub point: [f64; 2],
    /// `[d(dx)/dx, d(dx)/dy, d(dy)/dx, d(dy)/dy]`.
    pub jacobian: [f64; 4],
}

pub fn distort_normalized_point(x: f64, y: f64, d: RadialTangentialDistortion) -> [f64; 2] {
    let r2 = x * x + y * y;
    let radial = 1.0 + d.k1 * r2 + d.k2 * r2 * r2 + d.k3 * r2 * r2 * r2;
    [
        x * radial + 2.0 * d.p1 * x * y + d.p2 * (r2 + 2.0 * x * x),
        y * radial + d.p1 * (r2 + 2.0 * y * y) + 2.0 * d.p2 * x * y,
    ]
}

pub fn distort_normalized_point_with_jacobian(
    x: f64,
    y: f64,
    d: RadialTangentialDistortion,
) -> DistortedPointWithJacobian {
    let r2 = x * x + y * y;
    let r4 = r2 * r2;
    let radial = 1.0 + d.k1 * r2 + d.k2 * r4 + d.k3 * r4 * r2;
    let radial_slope = d.k1 + 2.0 * d.k2 * r2 + 3.0 * d.k3 * r4;
    let radial_x = 2.0 * x * radial_slope;
    let radial_y = 2.0 * y * radial_slope;
    let point = [
        x * radial + 2.0 * d.p1 * x * y + d.p2 * (r2 + 2.0 * x * x),
        y * radial + d.p1 * (r2 + 2.0 * y * y) + 2.0 * d.p2 * x * y,
    ];
    let jacobian = [
        radial + x * radial_x + 2.0 * d.p1 * y + 6.0 * d.p2 * x,
        x * radial_y + 2.0 * d.p1 * x + 2.0 * d.p2 * y,
        y * radial_x + 2.0 * d.p1 * x + 2.0 * d.p2 * y,
        radial + y * radial_y + 6.0 * d.p1 * y + 2.0 * d.p2 * x,
    ];
    DistortedPointWithJacobian { point, jacobian }
}

pub fn project_distorted_point(
    point: [f64; 3],
    intrinsics: CameraIntrinsics,
    d: RadialTangentialDistortion,
) -> Option<[f64; 2]> {
    let [x, y, z] = point;
    if !x.is_finite() || !y.is_finite() || !z.is_finite() || z <= 0.0 {
        return None;
    }
    let normalized = distort_normalized_point(x / z, y / z, d);
    Some([
        intrinsics.fx * normalized[0] + intrinsics.cx,
        intrinsics.fy * normalized[1] + intrinsics.cy,
    ])
}

pub struct ProjectedPointWithJacobian {
    pub pixel: [f64; 2],
    /// Row-major 2x3: d(pixel)/d(point), rows = [x, y], cols = [X, Y, Z].
    pub jacobian: [f64; 6],
}

pub fn project_distorted_point_with_jacobian(
    point: [f64; 3],
    intrinsics: CameraIntrinsics,
    d: RadialTangentialDistortion,
) -> Option<ProjectedPointWithJacobian> {
    let [x, y, z] = point;
    if !x.is_finite() || !y.is_finite() || !z.is_finite() || z <= 0.0 {
        return None;
    }
    let nx = x / z;
    let ny = y / z;
    let distorted = distort_normalized_point_with_jacobian(nx, ny, d);
    let j = distorted.jacobian;
    let jx_x = j[0] / z;
    let jx_y = j[1] / z;
    let jy_x = j[2] / z;
    let jy_y = j[3] / z;
    let jx_z = -(jx_x * x + jx_y * y) / z;
    let jy_z = -(jy_x * x + jy_y * y) / z;
    let jacobian = [
        intrinsics.fx * jx_x, intrinsics.fx * jx_y, intrinsics.fx * jx_z,
        intrinsics.fy * jy_x, intrinsics.fy * jy_y, intrinsics.fy * jy_z,
    ];
    if !distorted.point.iter().chain(jacobian.iter()).all(|v: &f64| v.is_finite()) {
        return None;
    }
    Some(ProjectedPointWithJacobian {
        pixel: [
            intrinsics.fx * distorted.point[0] + intrinsics.cx,
            intrinsics.fy * distorted.point[1] + intrinsics.cy,
        ],
        jacobian,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn intrinsics() -> CameraIntrinsics {
        CameraIntrinsics { fx: 500.0, fy: 500.0, cx: 320.0, cy: 240.0 }
    }

    #[test]
    fn zero_distortion_is_identity() {
        assert_eq!(distort_normalized_point(0.3, -0.2, ZERO_DISTORTION), [0.3, -0.2]);
    }

    #[test]
    fn project_distorted_point_rejects_points_behind_camera() {
        assert_eq!(project_distorted_point([0.1, 0.1, -1.0], intrinsics(), ZERO_DISTORTION), None);
    }

    #[test]
    fn project_distorted_point_matches_pinhole_projection_without_distortion() {
        let projected = project_distorted_point([0.2, -0.1, 2.0], intrinsics(), ZERO_DISTORTION).unwrap();
        assert!((projected[0] - (500.0 * 0.1 + 320.0)).abs() < 1e-9);
        assert!((projected[1] - (500.0 * -0.05 + 240.0)).abs() < 1e-9);
    }

    #[test]
    fn jacobian_variant_agrees_with_plain_projection() {
        let d = RadialTangentialDistortion { k1: 0.1, k2: -0.02, k3: 0.0, p1: 0.001, p2: -0.002 };
        let point = [0.15, 0.2, 1.5];
        let plain = project_distorted_point(point, intrinsics(), d).unwrap();
        let jac = project_distorted_point_with_jacobian(point, intrinsics(), d).unwrap();
        assert!((plain[0] - jac.pixel[0]).abs() < 1e-9);
        assert!((plain[1] - jac.pixel[1]).abs() < 1e-9);
    }
}
