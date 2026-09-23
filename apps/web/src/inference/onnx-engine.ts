import type { InferenceBackend } from "./model";
import type { InferenceEngine, TensorInput, TensorOutput } from "./engine";

export interface OnnxRuntimeModule {
  InferenceSession: { create(model: ArrayBuffer, options: { executionProviders: string[] }): Promise<OnnxSession> };
  Tensor: new (type: "float32", data: Float32Array, dims: readonly number[]) => OnnxTensor;
}

interface OnnxSession {
  run(feeds: Record<string, OnnxTensor>): Promise<Record<string, OnnxTensor>>;
  inputNames: readonly string[];
  outputNames: readonly string[];
  release?(): Promise<void>;
}

interface OnnxTensor { readonly data: Float32Array; readonly dims: readonly number[] }

export class OnnxInferenceEngine implements InferenceEngine {
  readonly backend: InferenceBackend;
  private session: OnnxSession | undefined;
  private readonly runtime: OnnxRuntimeModule;

  constructor(runtime: OnnxRuntimeModule, backend: InferenceBackend) {
    this.runtime = runtime;
    this.backend = backend;
  }

  async load(modelBytes: ArrayBuffer): Promise<void> {
    await this.unload();
    this.session = await this.runtime.InferenceSession.create(modelBytes, { executionProviders: [this.backend] });
  }

  async run(input: TensorInput): Promise<TensorOutput> {
    const session = this.session;
    if (!session) throw new Error("ONNX inference session is not loaded.");
    if (session.inputNames.length !== 1 || session.outputNames.length !== 1) throw new Error("The realtime adapter requires exactly one input and one output tensor.");
    const tensor = new this.runtime.Tensor("float32", input.data, input.shape);
    const outputs = await session.run({ [session.inputNames[0]!]: tensor });
    const output = outputs[session.outputNames[0]!];
    if (!output) throw new Error("ONNX runtime returned no output tensor.");
    return { data: output.data, shape: output.dims };
  }

  async unload(): Promise<void> {
    const session = this.session;
    this.session = undefined;
    await session?.release?.();
  }
}
