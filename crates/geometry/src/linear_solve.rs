//! Dense Cholesky solve for a symmetric positive-definite system, ported
//! from `apps/web/src/capture/linear-solve.ts` per ADR-013 / Stage 1.

#[derive(Debug, Clone)]
pub struct DenseLinearSystem {
    pub size: usize,
    /// Row-major `size x size`.
    pub matrix: Vec<f64>,
    pub rhs: Vec<f64>,
}

/// `undefined`/`None` on a non-positive-definite matrix (a zero or negative
/// pivot), a non-finite intermediate, or a malformed system — mirrors the
/// TS function's `undefined` return exactly rather than panicking.
pub fn solve_positive_definite(system: &DenseLinearSystem) -> Option<Vec<f64>> {
    let n = system.size;
    if n == 0 || system.matrix.len() != n * n || system.rhs.len() != n {
        return None;
    }
    let mut l = vec![0.0_f64; n * n];

    for i in 0..n {
        for j in 0..=i {
            let mut sum = system.matrix[i * n + j];
            for k in 0..j {
                sum -= l[i * n + k] * l[j * n + k];
            }
            if i == j {
                if !sum.is_finite() || sum <= 1e-12 {
                    return None;
                }
                l[i * n + j] = sum.sqrt();
            } else {
                let pivot = l[j * n + j];
                if !pivot.is_finite() || pivot == 0.0 {
                    return None;
                }
                l[i * n + j] = sum / pivot;
            }
        }
    }

    let mut y = vec![0.0_f64; n];
    for i in 0..n {
        let mut sum = system.rhs[i];
        for k in 0..i {
            sum -= l[i * n + k] * y[k];
        }
        y[i] = sum / l[i * n + i];
    }

    let mut x = vec![0.0_f64; n];
    for i in (0..n).rev() {
        let mut sum = y[i];
        for k in (i + 1)..n {
            sum -= l[k * n + i] * x[k];
        }
        x[i] = sum / l[i * n + i];
    }

    if x.iter().all(|v| v.is_finite()) {
        Some(x)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn solves_a_small_identity_system() {
        let system = DenseLinearSystem { size: 2, matrix: vec![1.0, 0.0, 0.0, 1.0], rhs: vec![3.0, -5.0] };
        assert_eq!(solve_positive_definite(&system), Some(vec![3.0, -5.0]));
    }

    #[test]
    fn solves_a_known_2x2_system() {
        // [[4, 2], [2, 3]] x = [10, 8] -> x = [1.75, 1.5]
        let system = DenseLinearSystem { size: 2, matrix: vec![4.0, 2.0, 2.0, 3.0], rhs: vec![10.0, 8.0] };
        let x = solve_positive_definite(&system).unwrap();
        assert!((x[0] - 1.75).abs() < 1e-9);
        assert!((x[1] - 1.5).abs() < 1e-9);
    }

    #[test]
    fn rejects_a_non_positive_definite_matrix() {
        let system = DenseLinearSystem { size: 2, matrix: vec![0.0, 0.0, 0.0, 0.0], rhs: vec![1.0, 1.0] };
        assert_eq!(solve_positive_definite(&system), None);
    }

    #[test]
    fn rejects_a_malformed_system() {
        let system = DenseLinearSystem { size: 2, matrix: vec![1.0, 0.0], rhs: vec![1.0, 1.0] };
        assert_eq!(solve_positive_definite(&system), None);
    }
}
