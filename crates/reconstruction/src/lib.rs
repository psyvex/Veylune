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
