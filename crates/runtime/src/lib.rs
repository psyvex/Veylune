#![forbid(unsafe_code)]

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
