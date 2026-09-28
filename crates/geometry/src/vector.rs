//! Small vector utilities shared by the bundle-adjustment step-clamping
//! logic in `apps/web/src/capture/bundle-optimizer.ts` (`clampVector`,
//! `norm`), ported per ADR-013 / Stage 1 task 12.

/// Euclidean norm of an arbitrary-length vector.
pub fn norm(vector: &[f64]) -> f64 {
    vector.iter().fold(0.0_f64, |acc, v| acc.hypot(*v))
}

/// Scales `vector` down so its norm is at most `max_norm`; a shorter or
/// zero vector passes through unchanged (`.map()` on a zero-length TS
/// `Float64Array` also just returns it as-is via the early return).
pub fn clamp_vector(vector: &[f64], max_norm: f64) -> Vec<f64> {
    let magnitude = norm(vector);
    if magnitude <= max_norm || magnitude == 0.0 {
        return vector.to_vec();
    }
    let scale = max_norm / magnitude;
    vector.iter().map(|v| v * scale).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn norm_of_a_3_4_5_triangle_is_5() {
        assert!((norm(&[3.0, 4.0]) - 5.0).abs() < 1e-9);
    }

    #[test]
    fn clamp_vector_passes_a_short_vector_through_unchanged() {
        assert_eq!(clamp_vector(&[0.1, 0.0, 0.0], 1.0), vec![0.1, 0.0, 0.0]);
    }

    #[test]
    fn clamp_vector_scales_a_long_vector_down_to_max_norm() {
        let clamped = clamp_vector(&[3.0, 4.0], 2.0);
        assert!((norm(&clamped) - 2.0).abs() < 1e-9);
        assert!((clamped[0] - 1.2).abs() < 1e-9);
    }

    #[test]
    fn clamp_vector_leaves_a_zero_vector_alone() {
        assert_eq!(clamp_vector(&[0.0, 0.0], 1.0), vec![0.0, 0.0]);
    }
}
