//! Huber robust loss, ported from `apps/web/src/capture/robust-loss.ts`
//! per ADR-013 / Stage 1 task 11.

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct HuberLoss {
    delta: f64,
}

impl HuberLoss {
    /// `None` for a non-finite or non-positive delta, mirroring the TS
    /// constructor's `throw` — the caller decides what a construction
    /// failure means (the TS side still throws; see `wasm-bridge`).
    pub fn new(delta: f64) -> Option<Self> {
        if !delta.is_finite() || delta <= 0.0 {
            None
        } else {
            Some(Self { delta })
        }
    }

    pub fn rho_squared(&self, residual_squared: f64) -> f64 {
        if !residual_squared.is_finite() || residual_squared < 0.0 {
            return f64::INFINITY;
        }
        let delta_squared = self.delta * self.delta;
        if residual_squared <= delta_squared {
            residual_squared
        } else {
            2.0 * self.delta * residual_squared.sqrt() - delta_squared
        }
    }

    pub fn weight(&self, residual_squared: f64) -> f64 {
        if !residual_squared.is_finite() || residual_squared < 0.0 {
            return 0.0;
        }
        if residual_squared == 0.0 || residual_squared <= self.delta * self.delta {
            1.0
        } else {
            self.delta / residual_squared.sqrt()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_a_non_positive_delta() {
        assert_eq!(HuberLoss::new(0.0), None);
        assert_eq!(HuberLoss::new(-1.0), None);
        assert_eq!(HuberLoss::new(f64::NAN), None);
    }

    #[test]
    fn is_quadratic_inside_the_delta_threshold() {
        let loss = HuberLoss::new(1.0).unwrap();
        assert_eq!(loss.rho_squared(0.25), 0.25);
        assert_eq!(loss.weight(0.25), 1.0);
    }

    #[test]
    fn is_linear_beyond_the_delta_threshold() {
        let loss = HuberLoss::new(1.0).unwrap();
        // residual_squared = 4 -> |residual| = 2, delta = 1: rho = 2*1*2 - 1 = 3.
        assert_eq!(loss.rho_squared(4.0), 3.0);
        assert_eq!(loss.weight(4.0), 0.5);
    }

    #[test]
    fn treats_non_finite_or_negative_input_as_infinitely_bad() {
        let loss = HuberLoss::new(1.0).unwrap();
        assert_eq!(loss.rho_squared(f64::NAN), f64::INFINITY);
        assert_eq!(loss.rho_squared(-1.0), f64::INFINITY);
        assert_eq!(loss.weight(-1.0), 0.0);
    }
}
