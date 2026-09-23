export type InferenceBackend = "webgpu" | "webnn" | "wasm";

export interface ModelManifest {
  readonly id: string;
  readonly version: string;
  readonly digest: string;
  readonly license: string;
  readonly inputSchema: string;
  readonly outputSchema: string;
  readonly supportedBackends: readonly InferenceBackend[];
  readonly minimumQualityTier: "preview" | "balanced" | "high" | "maximum";
}

export interface ModelArtifact {
  readonly manifest: ModelManifest;
  readonly bytes: ArrayBuffer;
}

export interface InferenceRequest<TInput> {
  readonly modelId: string;
  readonly input: TInput;
}

export interface InferenceResult<TOutput> {
  readonly output: TOutput;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly backend: InferenceBackend;
}

export interface InferenceRuntime<TInput, TOutput> {
  load(model: ModelArtifact): Promise<void>;
  run(request: InferenceRequest<TInput>): Promise<InferenceResult<TOutput>>;
  unload(modelId: string): Promise<void>;
}
