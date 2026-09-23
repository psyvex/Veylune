import type { InferenceBackend, InferenceRequest, InferenceResult, ModelArtifact } from "./model";
import type { ModelCache } from "./cache";
import { verifyDigest } from "./sha256";

export interface InferenceRuntimeAdapter<TInput, TOutput> {
  readonly backend: InferenceBackend;
  load(model: ModelArtifact): Promise<void>;
  run(request: InferenceRequest<TInput>): Promise<InferenceResult<TOutput>>;
  unload(modelId: string): Promise<void>;
}

export class UnavailableInferenceRuntime<TInput, TOutput> implements InferenceRuntimeAdapter<TInput, TOutput> {
  constructor(public readonly backend: InferenceBackend, private readonly cache: ModelCache) {}

  async load(model: ModelArtifact): Promise<void> {
    if (!(await verifyDigest(model.bytes, model.manifest.digest))) {
      throw new Error(`Integrity verification failed for ${model.manifest.id}.`);
    }
    const key = `${model.manifest.id}@${model.manifest.version}:${model.manifest.digest}`;
    await this.cache.put(key, model.bytes);
    throw new Error(`Inference backend ${this.backend} is not installed in this build.`);
  }

  async run(_request: InferenceRequest<TInput>): Promise<InferenceResult<TOutput>> {
    throw new Error(`Inference backend ${this.backend} is unavailable.`);
  }

  async unload(_modelId: string): Promise<void> {}
}
