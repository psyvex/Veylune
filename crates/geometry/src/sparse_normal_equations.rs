//! Gauss-Newton normal-equation accumulation (`Jᵀ W J`, `Jᵀ W r`) into a
//! sparse upper-triangular representation, ported from
//! `apps/web/src/capture/sparse-normal-equations.ts` per ADR-013 / Stage 1.

use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SparseTriplet {
    pub row: usize,
    pub column: usize,
    pub value: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SparseNormalSystem {
    pub size: usize,
    /// Sorted by `(row, column)` — the TS `Map` iterates in insertion order,
    /// which isn't semantically meaningful, so the parity test sorts both
    /// sides before comparing; this crate just picks a canonical order.
    pub entries: Vec<SparseTriplet>,
    pub gradient: Vec<f64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NormalEquationsError {
    DimensionMismatch,
    InvalidRow,
}

#[allow(clippy::needless_range_loop)] // Mirrors the TS double-loop shape intentionally, for parity readability.
pub fn accumulate_normal_equations(
    jacobian_rows: &[Vec<f64>],
    residuals: &[f64],
    weights: &[f64],
) -> Result<SparseNormalSystem, NormalEquationsError> {
    if jacobian_rows.len() != residuals.len() || residuals.len() != weights.len() {
        return Err(NormalEquationsError::DimensionMismatch);
    }
    let size = jacobian_rows.first().map(|row| row.len()).unwrap_or(0);
    let mut matrix: BTreeMap<(usize, usize), f64> = BTreeMap::new();
    let mut gradient = vec![0.0_f64; size];

    for row_index in 0..jacobian_rows.len() {
        let values = &jacobian_rows[row_index];
        let residual = residuals[row_index];
        let weight_raw = weights[row_index];
        if values.len() != size || !residual.is_finite() || !weight_raw.is_finite() {
            return Err(NormalEquationsError::InvalidRow);
        }
        let weight = weight_raw.max(0.0);
        for i in 0..size {
            let ji = values[i];
            if !ji.is_finite() {
                return Err(NormalEquationsError::InvalidRow);
            }
            gradient[i] += weight * ji * residual;
            if ji == 0.0 {
                continue;
            }
            for j in i..size {
                let jj = values[j];
                if jj == 0.0 {
                    continue;
                }
                *matrix.entry((i, j)).or_insert(0.0) += weight * ji * jj;
            }
        }
    }

    let entries = matrix
        .into_iter()
        .map(|((row, column), value)| SparseTriplet { row, column, value })
        .collect();
    Ok(SparseNormalSystem { size, entries, gradient })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accumulates_a_single_row() {
        let jacobian = vec![vec![2.0, 3.0]];
        let system = accumulate_normal_equations(&jacobian, &[1.0], &[1.0]).unwrap();
        assert_eq!(system.gradient, vec![2.0, 3.0]);
        assert_eq!(
            system.entries,
            vec![
                SparseTriplet { row: 0, column: 0, value: 4.0 },
                SparseTriplet { row: 0, column: 1, value: 6.0 },
                SparseTriplet { row: 1, column: 1, value: 9.0 },
            ]
        );
    }

    #[test]
    fn rejects_mismatched_dimensions() {
        let jacobian = vec![vec![1.0]];
        assert_eq!(
            accumulate_normal_equations(&jacobian, &[1.0, 2.0], &[1.0, 1.0]),
            Err(NormalEquationsError::DimensionMismatch)
        );
    }

    #[test]
    fn rejects_a_non_finite_residual() {
        let jacobian = vec![vec![1.0]];
        assert_eq!(
            accumulate_normal_equations(&jacobian, &[f64::NAN], &[1.0]),
            Err(NormalEquationsError::InvalidRow)
        );
    }

    #[test]
    fn skips_zero_jacobian_entries_without_creating_triplets() {
        let jacobian = vec![vec![0.0, 5.0]];
        let system = accumulate_normal_equations(&jacobian, &[1.0], &[1.0]).unwrap();
        assert_eq!(system.entries, vec![SparseTriplet { row: 1, column: 1, value: 25.0 }]);
    }
}
