import type { ModelArtifact, ModelManifest } from "./model";

export interface ModelRegistry {
  get(id: string): Promise<ModelManifest | undefined>;
  put(model: ModelArtifact): Promise<void>;
  remove(id: string): Promise<void>;
}

export class MemoryModelRegistry implements ModelRegistry {
  private readonly models = new Map<string, ModelManifest>();

  async get(id: string): Promise<ModelManifest | undefined> {
    return this.models.get(id);
  }

  async put(model: ModelArtifact): Promise<void> {
    this.models.set(model.manifest.id, model.manifest);
  }

  async remove(id: string): Promise<void> {
    this.models.delete(id);
  }
}
