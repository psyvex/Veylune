import type { InferenceBackend, InferenceRequest, InferenceResult } from "./model";
import type { InferenceRuntimeAdapter } from "./runtime";

/** The ONNX tensor element types this engine abstraction actually needs to
 * carry — extend as a real model needs another one, not speculatively.
 * Widened from `Float32Array`-only after `models/movenet-singlepose-lightning/model-card.md`'s
 * "Integration gap" note: that model's real input is `int32`, and this
 * type had never been run against a real model until then. */
export type TensorDtype = "float32" | "int32" | "uint8";
export type TensorData = Float32Array | Int32Array | Uint8Array;

export interface TensorInput {
  readonly data: TensorData;
  readonly shape: readonly number[];
  /** Defaults to `"float32"` — every caller before this field existed
   * already meant float32, so this keeps them source-compatible. */
  readonly dtype?: TensorDtype;
}

export interface TensorOutput {
  /** Model outputs observed so far are all float32 (including MoveNet's,
   * despite its int32 input) — narrower than `TensorInput.data` on
   * purpose; widen only once a real model's output needs it. */
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
