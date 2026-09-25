#![forbid(unsafe_code)]

use veylune_core::Confidence;

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
