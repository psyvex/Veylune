#![forbid(unsafe_code)]

mod job_controller;
pub use job_controller::JobController;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExecutionBackend {
    WebGpu,
    Wasm,
    Native,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum QualityTier {
    Preview,
    Balanced,
    High,
    Maximum,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CapabilityProfile {
    pub webgpu: bool,
    pub wasm_simd: bool,
    pub wasm_threads: bool,
    pub quality: QualityTier,
}

impl CapabilityProfile {
    pub fn preferred_backend(&self) -> ExecutionBackend {
        if self.webgpu {
            ExecutionBackend::WebGpu
        } else {
            ExecutionBackend::Wasm
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResourceClass {
    Small,
    Medium,
    Large,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ResourceBudget {
    pub memory_bytes: u64,
    pub intermediate_bytes: u64,
    pub class: ResourceClass,
}

impl ResourceBudget {
    pub const fn new(memory_bytes: u64, intermediate_bytes: u64, class: ResourceClass) -> Self {
        Self { memory_bytes, intermediate_bytes, class }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum JobState {
    Queued,
    Running,
    Cancelling,
    Cancelled,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuntimeError {
    InvalidTransition,
    ResourceLimitExceeded,
    Cancelled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct JobStatus {
    pub state: JobState,
    pub completed_steps: u32,
    pub total_steps: u32,
}

impl JobStatus {
    pub fn progress(&self) -> f32 {
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
    fn prefers_gpu_when_available() {
        let profile = CapabilityProfile {
            webgpu: true,
            wasm_simd: true,
            wasm_threads: true,
            quality: QualityTier::High,
        };
        assert_eq!(profile.preferred_backend(), ExecutionBackend::WebGpu);
    }

    #[test]
    fn falls_back_to_wasm_without_gpu() {
        let profile = CapabilityProfile {
            webgpu: false,
            wasm_simd: true,
            wasm_threads: false,
            quality: QualityTier::Balanced,
        };
        assert_eq!(profile.preferred_backend(), ExecutionBackend::Wasm);
    }

    #[test]
    fn progress_is_bounded() {
        let status = JobStatus {
            state: JobState::Running,
            completed_steps: 9,
            total_steps: 3,
        };
        assert_eq!(status.progress(), 1.0);
    }
}
