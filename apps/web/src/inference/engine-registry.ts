import type { InferenceBackend } from "./model";
import type { InferenceEngine } from "./engine";

export interface EngineFactory {
  readonly backend: InferenceBackend;
  readonly runtimeId: string;
  create(): Promise<InferenceEngine>;
}

export class InferenceEngineRegistry {
  private readonly factories = new Map<InferenceBackend, EngineFactory>();

  register(factory: EngineFactory): void {
    if (this.factories.has(factory.backend)) {
      throw new Error(`An inference engine is already registered for ${factory.backend}.`);
    }
    this.factories.set(factory.backend, factory);
  }

  has(backend: InferenceBackend): boolean {
    return this.factories.has(backend);
  }

  async create(backend: InferenceBackend): Promise<InferenceEngine> {
    const factory = this.factories.get(backend);
    if (!factory) throw new Error(`No inference engine registered for ${backend}.`);
    return factory.create();
  }

  describe(): readonly { backend: InferenceBackend; runtimeId: string }[] {
    return [...this.factories.values()].map(({ backend, runtimeId }) => ({ backend, runtimeId }));
  }
}
