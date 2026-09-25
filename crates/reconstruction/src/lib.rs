#![forbid(unsafe_code)]

use veylune_core::{Confidence, EvidenceState};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReconstructionStage {
    Analysis,
    CoarseShape,
    Surface,
    Texture,
    Optimization,
    Ready,
}

#[derive(Debug, Clone)]
pub struct EvidenceRegion {
    pub state: EvidenceState,
    pub confidence: Confidence,
}

#[derive(Debug, Clone)]
pub struct ReconstructionProgress {
    pub stage: ReconstructionStage,
    pub completed_steps: u32,
    pub total_steps: u32,
}

impl ReconstructionProgress {
    pub fn fraction(&self) -> f32 {
        if self.total_steps == 0 {
            return 0.0;
        }
        (self.completed_steps as f32 / self.total_steps as f32).clamp(0.0, 1.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fraction_is_zero_with_no_total_steps() {
        let progress = ReconstructionProgress {
            stage: ReconstructionStage::Analysis,
            completed_steps: 0,
            total_steps: 0,
        };
        assert_eq!(progress.fraction(), 0.0);
    }

    #[test]
    fn fraction_is_clamped_when_completed_exceeds_total() {
        let progress = ReconstructionProgress {
            stage: ReconstructionStage::Ready,
            completed_steps: 12,
            total_steps: 10,
        };
        assert_eq!(progress.fraction(), 1.0);
    }

    #[test]
    fn fraction_reports_partial_progress() {
        let progress = ReconstructionProgress {
            stage: ReconstructionStage::Surface,
            completed_steps: 3,
            total_steps: 4,
        };
        assert_eq!(progress.fraction(), 0.75);
    }
}
