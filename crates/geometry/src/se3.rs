//! SE(3) exponential map and pose increment, ported from
//! `apps/web/src/capture/se3.ts` per ADR-013 / Stage 1 of
//! `docs/75-production-task-pipeline.md`.
//!
//! `f64` throughout (not `f32`, unlike the rest of this crate) because the
//! port must numerically match the JavaScript `number` (IEEE 754 double)
//! implementation it is being validated against by
//! `apps/web/src/capture/se3-wasm-parity.test.ts` — the pure-TS
//! implementation stays the shipped path until that parity test has run
//! green in CI, per the ADR's migration gate.

pub type Vec3 = [f64; 3];
/// Row-major 3x3: `[r0c0, r0c1, r0c2, r1c0, r1c1, r1c2, r2c0, r2c1, r2c2]`.
pub type Mat3 = [f64; 9];

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Se3Increment {
    pub rotation: Vec3,
    pub translation: Vec3,
}

pub fn skew(v: Vec3) -> Mat3 {
    [0.0, -v[2], v[1], v[2], 0.0, -v[0], -v[1], v[0], 0.0]
}

fn identity3() -> Mat3 {
    [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0]
}

fn scale3(a: Mat3, s: f64) -> Mat3 {
    let mut out = [0.0; 9];
    for i in 0..9 {
        out[i] = a[i] * s;
    }
    out
}

fn add3(a: Mat3, b: Mat3, c: Mat3) -> Mat3 {
    let mut out = [0.0; 9];
    for i in 0..9 {
        out[i] = a[i] + b[i] + c[i];
    }
    out
}

fn multiply3(a: Mat3, b: Mat3) -> Mat3 {
    [
        a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
        a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
        a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
        a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
        a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
        a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
        a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
        a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
        a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
    ]
}

fn multiply_vec3(a: Mat3, v: Vec3) -> Vec3 {
    [
        a[0] * v[0] + a[1] * v[1] + a[2] * v[2],
        a[3] * v[0] + a[4] * v[1] + a[5] * v[2],
        a[6] * v[0] + a[7] * v[1] + a[8] * v[2],
    ]
}

pub fn so3_exp(omega: Vec3) -> Mat3 {
    let theta = (omega[0] * omega[0] + omega[1] * omega[1] + omega[2] * omega[2]).sqrt();
    let k = skew(omega);
    let k2 = multiply3(k, k);
    let a = if theta < 1e-8 {
        1.0 - theta * theta / 6.0
    } else {
        theta.sin() / theta
    };
    let b = if theta < 1e-8 {
        0.5 - theta * theta / 24.0
    } else {
        (1.0 - theta.cos()) / (theta * theta)
    };
    add3(identity3(), scale3(k, a), scale3(k2, b))
}

pub fn apply_se3_increment(rotation: Mat3, translation: Vec3, increment: Se3Increment) -> (Mat3, Vec3) {
    let delta_r = so3_exp(increment.rotation);
    let next_rotation = multiply3(delta_r, rotation);
    let rotated_translation = multiply_vec3(delta_r, translation);
    (
        next_rotation,
        [
            rotated_translation[0] + increment.translation[0],
            rotated_translation[1] + increment.translation[1],
            rotated_translation[2] + increment.translation[2],
        ],
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn so3_exp_of_zero_is_identity() {
        assert_eq!(so3_exp([0.0, 0.0, 0.0]), identity3());
    }

    #[test]
    fn so3_exp_matches_known_quarter_turn_about_z() {
        // 90° about +Z: x -> y, y -> -x, z -> z.
        let r = so3_exp([0.0, 0.0, std::f64::consts::FRAC_PI_2]);
        let rotated_x = multiply_vec3(r, [1.0, 0.0, 0.0]);
        assert!((rotated_x[0]).abs() < 1e-9);
        assert!((rotated_x[1] - 1.0).abs() < 1e-9);
        assert!((rotated_x[2]).abs() < 1e-9);
    }

    #[test]
    fn so3_exp_small_angle_branch_stays_finite_and_near_identity() {
        let r = so3_exp([1e-10, 0.0, 0.0]);
        for (i, id) in identity3().iter().enumerate() {
            assert!((r[i] - id).abs() < 1e-6);
        }
    }

    #[test]
    fn apply_se3_increment_composes_rotation_and_translation() {
        let (rotation, translation) = apply_se3_increment(
            identity3(),
            [1.0, 2.0, 3.0],
            Se3Increment { rotation: [0.0, 0.0, 0.0], translation: [1.0, 0.0, 0.0] },
        );
        assert_eq!(rotation, identity3());
        assert_eq!(translation, [2.0, 2.0, 3.0]);
    }
}
