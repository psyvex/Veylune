#![forbid(unsafe_code)]

use serde::{Deserialize, Serialize};

pub const PROJECT_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct AssetId(pub u128);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum EvidenceState {
    Observed,
    Reconstructed,
    Inferred,
    Generated,
    Uncertain,
    Unavailable,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Confidence {
    pub geometry: f32,
    pub texture: f32,
    pub pose: f32,
    pub detail: f32,
}

impl Confidence {
    pub fn clamped(self) -> Self {
        Self {
            geometry: self.geometry.clamp(0.0, 1.0),
            texture: self.texture.clamp(0.0, 1.0),
            pose: self.pose.clamp(0.0, 1.0),
            detail: self.detail.clamp(0.0, 1.0),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectManifest {
    pub schema_version: u32,
    pub project_id: AssetId,
    pub title: String,
}

impl ProjectManifest {
    pub fn new(project_id: AssetId, title: impl Into<String>) -> Self {
        Self {
            schema_version: PROJECT_SCHEMA_VERSION,
            project_id,
            title: title.into(),
        }
    }
}
