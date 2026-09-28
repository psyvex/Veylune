#![forbid(unsafe_code)]

use veylune_core::Confidence;

pub mod distortion;
pub mod linear_solve;
pub mod reprojection;
pub mod se3;
pub mod sparse_normal_equations;
pub mod triangulation;
pub mod vector;

/// Pinhole camera intrinsics, mirroring `apps/web/src/capture/geometry.ts`'s
/// `CameraIntrinsics`. `f64` to match the JS `number` port it validates
/// against (see `se3.rs`'s module doc for why this crate mixes `f32`
/// [`Bounds3`]/[`GeometryQuality`] with `f64` reconstruction-math ports).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CameraIntrinsics {
    pub fx: f64,
    pub fy: f64,
    pub cx: f64,
    pub cy: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Bounds3 {
    pub min: [f32; 3],
    pub max: [f32; 3],
}

impl Bounds3 {
    pub fn empty() -> Self {
        Self {
            min: [f32::INFINITY; 3],
            max: [f32::NEG_INFINITY; 3],
        }
    }

    pub fn include(&mut self, point: [f32; 3]) {
        for (axis, value) in point.into_iter().enumerate() {
            self.min[axis] = self.min[axis].min(value);
            self.max[axis] = self.max[axis].max(value);
        }
    }
}

#[derive(Debug, Clone)]
pub struct GeometryQuality {
    pub bounds: Bounds3,
    pub confidence: Confidence,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_bounds_has_no_volume() {
        let bounds = Bounds3::empty();
        assert!(bounds.min[0] > bounds.max[0]);
    }

    #[test]
    fn include_grows_bounds_to_cover_every_point() {
        let mut bounds = Bounds3::empty();
        bounds.include([1.0, -2.0, 3.0]);
        bounds.include([-1.0, 5.0, 0.0]);

        assert_eq!(bounds.min, [-1.0, -2.0, 0.0]);
        assert_eq!(bounds.max, [1.0, 5.0, 3.0]);
    }
}
