import type { InferenceBackend, InferenceRequest, InferenceResult } from "./model";
import type { InferenceRuntimeAdapter } from "./runtime";

export interface TensorInput {
  readonly data: Float32Array;
  readonly shape: readonly number[];
}

export interface TensorOutput {
  readonly data: Float32Array;
  readonly shape: readonly number[];
}

export interface InferenceEngine {
  readonly backend: InferenceBackend;
  load(modelBytes: ArrayBuffer): Promise<void>;
  run(input: TensorInput): Promise<TensorOutput>;
  unload(): Promise<void>;
}

export class EngineRuntimeAdapter implements InferenceRuntimeAdapter<TensorInput, TensorOutput> {
  readonly backend: InferenceBackend;

  constructor(private readonly engine: InferenceEngine) {
    this.backend = engine.backend;
  }

  async load(model: { readonly bytes: ArrayBuffer }): Promise<void> {
    await this.engine.load(model.bytes);
  }

  async run(request: InferenceRequest<TensorInput>): Promise<InferenceResult<TensorOutput>> {
    const output = await this.engine.run(request.input);
    return {
      output,
      modelId: request.modelId,
      modelVersion: "runtime",
      backend: this.backend,
    };
  }

  async unload(_modelId: string): Promise<void> {
    await this.engine.unload();
  }
}
