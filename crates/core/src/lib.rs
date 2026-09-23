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

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn confidence_is_clamped() {
        let confidence = Confidence {
            geometry: -1.0,
            texture: 0.5,
            pose: 2.0,
            detail: 1.0,
        }
        .clamped();

        assert_eq!(confidence.geometry, 0.0);
        assert_eq!(confidence.texture, 0.5);
        assert_eq!(confidence.pose, 1.0);
        assert_eq!(confidence.detail, 1.0);
    }

    #[test]
    fn project_manifest_starts_at_current_schema() {
        let project = ProjectManifest::new(AssetId(1), "Foundation");
        assert_eq!(project.schema_version, PROJECT_SCHEMA_VERSION);
    }
}
