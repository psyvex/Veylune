export interface ArtifactRecord {
  readonly id: string;
  readonly hash: string;
  readonly byteLength: number;
  readonly mediaType: string;
  readonly createdAt: string;
  readonly provenance?: string;
}

export interface ProjectRevision {
  readonly projectId: string;
  readonly revision: number;
  readonly schemaVersion: number;
  readonly parentRevision?: number;
  readonly artifactIds: readonly string[];
}

export interface StudioProjectRecord {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly assetIds: readonly string[];
}

export interface StoredArtifactData {
  readonly record: ArtifactRecord;
  readonly data: ArrayBuffer;
}

export interface ProjectStore {
  readRevision(projectId: string): Promise<ProjectRevision | undefined>;
  stageArtifact(record: ArtifactRecord, data: ArrayBuffer): Promise<void>;
  commitRevision(revision: ProjectRevision): Promise<void>;
  deleteProject(projectId: string): Promise<void>;
  listProjects(): Promise<readonly StudioProjectRecord[]>;
  writeProjectMetadata(project: StudioProjectRecord): Promise<void>;
  readArtifacts(artifactIds: readonly string[]): Promise<readonly StoredArtifactData[]>;
  deleteArtifacts(artifactIds: readonly string[]): Promise<void>;
}
