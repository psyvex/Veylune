import type { CapabilityProfile } from "../runtime/capabilities";
import { verifyDigest } from "./sha256";
import { selectInferenceBackend } from "./backend";
import type { InferenceBackend, ModelArtifact, ModelManifest } from "./model";
import type { ModelCache } from "./cache";

export class ModelManager {
  constructor(
    private readonly capabilities: CapabilityProfile,
    private readonly cache: ModelCache,
  ) {}

  selectBackend(manifest: ModelManifest): InferenceBackend | undefined {
    return selectInferenceBackend(this.capabilities, manifest);
  }

  async prepare(model: ModelArtifact): Promise<InferenceBackend> {
    const backend = this.selectBackend(model.manifest);
    if (!backend) throw new Error(`No compatible inference backend for model ${model.manifest.id}.`);

    const valid = await verifyDigest(model.bytes, model.manifest.digest);
    if (!valid) throw new Error(`Integrity verification failed for model ${model.manifest.id}.`);

    const key = `${model.manifest.id}@${model.manifest.version}:${model.manifest.digest}`;
    await this.cache.put(key, model.bytes);
    return backend;
  }

  async remove(model: ModelManifest): Promise<void> {
    const key = `${model.id}@${model.version}:${model.digest}`;
    await this.cache.delete(key);
  }
}
