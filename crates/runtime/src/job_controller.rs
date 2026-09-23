use crate::{JobState, JobStatus, ResourceBudget, RuntimeError};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct JobController {
    status: JobStatus,
    budget: ResourceBudget,
    reserved_memory: u64,
    reserved_intermediate: u64,
}

impl JobController {
    pub const fn new(total_steps: u32, budget: ResourceBudget) -> Self {
        Self {
            status: JobStatus {
                state: JobState::Queued,
                completed_steps: 0,
                total_steps,
            },
            budget,
            reserved_memory: 0,
            reserved_intermediate: 0,
        }
    }

    pub const fn status(&self) -> JobStatus {
        self.status
    }

    pub fn start(&mut self) -> Result<(), RuntimeError> {
        match self.status.state {
            JobState::Queued => {
                self.status.state = JobState::Running;
                Ok(())
            }
            _ => Err(RuntimeError::InvalidTransition),
        }
    }

    pub fn reserve(
        &mut self,
        memory_bytes: u64,
        intermediate_bytes: u64,
    ) -> Result<(), RuntimeError> {
        let memory = self
            .reserved_memory
            .checked_add(memory_bytes)
            .ok_or(RuntimeError::ResourceLimitExceeded)?;
        let intermediate = self
            .reserved_intermediate
            .checked_add(intermediate_bytes)
            .ok_or(RuntimeError::ResourceLimitExceeded)?;
        if memory > self.budget.memory_bytes || intermediate > self.budget.intermediate_bytes {
            return Err(RuntimeError::ResourceLimitExceeded);
        }
        self.reserved_memory = memory;
        self.reserved_intermediate = intermediate;
        Ok(())
    }

    pub fn release(&mut self, memory_bytes: u64, intermediate_bytes: u64) {
        self.reserved_memory = self.reserved_memory.saturating_sub(memory_bytes);
        self.reserved_intermediate = self
            .reserved_intermediate
            .saturating_sub(intermediate_bytes);
    }

    pub fn request_cancel(&mut self) -> Result<(), RuntimeError> {
        match self.status.state {
            JobState::Running => {
                self.status.state = JobState::Cancelling;
                Ok(())
            }
            JobState::Queued => {
                self.status.state = JobState::Cancelled;
                Ok(())
            }
            _ => Err(RuntimeError::InvalidTransition),
        }
    }

    pub fn complete_step(&mut self) -> Result<(), RuntimeError> {
        if self.status.state != JobState::Running {
            return Err(if self.status.state == JobState::Cancelling {
                RuntimeError::Cancelled
            } else {
                RuntimeError::InvalidTransition
            });
        }
        self.status.completed_steps = self
            .status
            .completed_steps
            .saturating_add(1)
            .min(self.status.total_steps);
        Ok(())
    }

    pub fn finish(&mut self) -> Result<(), RuntimeError> {
        match self.status.state {
            JobState::Running if self.status.completed_steps >= self.status.total_steps => {
                self.status.state = JobState::Completed;
                Ok(())
            }
            JobState::Cancelling => {
                self.status.state = JobState::Cancelled;
                Ok(())
            }
            JobState::Running => Err(RuntimeError::InvalidTransition),
            _ => Err(RuntimeError::InvalidTransition),
        }
    }

    pub fn fail(&mut self) -> Result<(), RuntimeError> {
        match self.status.state {
            JobState::Running | JobState::Cancelling => {
                self.status.state = JobState::Failed;
                Ok(())
            }
            _ => Err(RuntimeError::InvalidTransition),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{CapabilityProfile, ExecutionBackend, QualityTier, ResourceClass};

    #[test]
    fn enforces_lifecycle_and_resource_budget() {
        let budget = ResourceBudget::new(100, 50, ResourceClass::Small);
        let mut job = JobController::new(2, budget);
        assert_eq!(job.start(), Ok(()));
        assert_eq!(job.reserve(80, 40), Ok(()));
        assert_eq!(job.reserve(21, 0), Err(RuntimeError::ResourceLimitExceeded));
        assert_eq!(job.complete_step(), Ok(()));
        assert_eq!(job.finish(), Err(RuntimeError::InvalidTransition));
        assert_eq!(job.complete_step(), Ok(()));
        assert_eq!(job.finish(), Ok(()));
        assert_eq!(job.status().state, JobState::Completed);
    }

    #[test]
    fn cancellation_is_terminal_after_request() {
        let budget = ResourceBudget::new(100, 100, ResourceClass::Small);
        let mut job = JobController::new(1, budget);
        job.start().unwrap();
        job.request_cancel().unwrap();
        assert_eq!(job.finish(), Ok(()));
        assert_eq!(job.status().state, JobState::Cancelled);
        assert_eq!(job.complete_step(), Err(RuntimeError::InvalidTransition));
    }

    #[test]
    fn capability_selection_remains_unchanged() {
        let profile = CapabilityProfile {
            webgpu: true,
            wasm_simd: true,
            wasm_threads: true,
            quality: QualityTier::High,
        };
        assert_eq!(profile.preferred_backend(), ExecutionBackend::WebGpu);
    }
}
