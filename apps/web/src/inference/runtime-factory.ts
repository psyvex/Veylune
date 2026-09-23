import type { CapabilityProfile } from "../runtime/capabilities";
import type { InferenceBackend, InferenceRuntime } from "./model";
import type { ModelCache } from "./cache";
import { UnavailableInferenceRuntime } from "./runtime";
import { selectInferenceBackend } from "./backend";

export interface RuntimeFactory<TInput, TOutput> {
  create(backend: InferenceBackend): InferenceRuntime<TInput, TOutput>;
}

export class DefaultRuntimeFactory<TInput, TOutput> implements RuntimeFactory<TInput, TOutput> {
  constructor(
    private readonly capabilities: CapabilityProfile,
    private readonly cache: ModelCache,
  ) {}

  create(backend: InferenceBackend): InferenceRuntime<TInput, TOutput> {
    const supported = backend === "webgpu"
      ? this.capabilities.webgpu === "supported"
      : backend === "webnn"
        ? this.capabilities.webnn === "supported"
        : this.capabilities.wasm === "supported";

    if (!supported) throw new Error(`Inference backend ${backend} is not supported by this browser.`);
    return new UnavailableInferenceRuntime<TInput, TOutput>(backend, this.cache);
  }

  createForModel<TModelInput, TModelOutput>(
    model: { readonly supportedBackends: readonly InferenceBackend[] },
  ): InferenceRuntime<TModelInput, TModelOutput> {
    const backend = selectInferenceBackend(this.capabilities, model as Parameters<typeof selectInferenceBackend>[1]);
    if (!backend) throw new Error("No compatible inference backend is available.");
    return this.create(backend) as unknown as InferenceRuntime<TModelInput, TModelOutput>;
  }
}
