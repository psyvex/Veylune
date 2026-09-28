// @vitest-environment node
//
// onnxruntime-web's Node backend does a runtime `Buffer`-realm check that
// fails under this project's default jsdom test environment (a Buffer
// constructed in Node's real global scope isn't recognized as one from
// inside jsdom's separate VM context) — this file needs the real Node
// environment, not jsdom, to exercise the actual native binding.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OnnxInferenceEngine, type OnnxRuntimeModule } from "./onnx-engine";
import { rgbaToNhwcTensor } from "./vision/preprocess";
import { sha256Hex } from "./sha256";

/**
 * Proves this app's OWN `OnnxInferenceEngine` — not raw `onnxruntime-web`,
 * which `tools/verify-model-inference.mjs` already checked — can actually
 * load and run the real MoveNet artifact, closing the "Integration gap"
 * `models/movenet-singlepose-lightning/model-card.md` flagged: before the
 * `TensorInput`/`TensorDtype` widening this test exercises, this engine
 * could only construct `float32` tensors and had no way to feed this
 * model's `int32` NHWC input at all.
 *
 * Model weights are policy-excluded from this repo (`models/README.md`) —
 * this test looks for them at a fixed scratch path and skips (not fails)
 * when absent, rather than fetching over the network during a test run.
 * Populate it locally to actually exercise this test:
 *
 *   curl -L -o /tmp/movenet_test.onnx \
 *     https://huggingface.co/Xenova/movenet-singlepose-lightning/resolve/main/onnx/model_quantized.onnx
 */

const ARTIFACT_PATH = "/tmp/movenet_test.onnx";
const EXPECTED_DIGEST = "5021097f4e9a4be612f2feb1d7d998f4a07b2ab3dbee0e8717e059c00315587f";

async function loadOrtNode(): Promise<OnnxRuntimeModule> {
  // Same resolved-path import as tools/verify-model-inference.mjs — see
  // that file's comment for why the bare "onnxruntime-web" specifier
  // doesn't resolve from every location in this workspace.
  // `import.meta.url`-relative resolution doesn't work here specifically:
  // under vitest it resolves to an internal http: URL, not a real file:
  // one, so this resolves from `process.cwd()` (vitest's cwd is this
  // package's root) instead.
  const entry = join(process.cwd(), "node_modules", "onnxruntime-web", "dist", "ort.node.min.js");
  const ort = (await import(entry)) as unknown as OnnxRuntimeModule;
  return ort;
}

describe("OnnxInferenceEngine + MoveNet (real artifact, real onnxruntime-web)", () => {
  it("loads the real model and runs real NHWC int32 inference through this app's own engine abstraction", async () => {
    let bytes: Awaited<ReturnType<typeof readFile>>;
    try {
      bytes = await readFile(ARTIFACT_PATH);
    } catch {
      console.warn(`Skipping: ${ARTIFACT_PATH} not present locally. See this file's header comment to populate it.`);
      return;
    }
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const digest = await sha256Hex(arrayBuffer);
    expect(digest).toBe(EXPECTED_DIGEST); // refuse to trust an unverified local file

    const ort = await loadOrtNode();
    const engine = new OnnxInferenceEngine(ort, "wasm");
    // onnxruntime-web's Node backend wants a Buffer/Uint8Array here, not a
    // detached ArrayBuffer — `OnnxInferenceEngine.load`'s `ArrayBuffer`
    // parameter type matches the browser path (a `fetch()` response's
    // `.arrayBuffer()`); Node's `readFile` result already satisfies it at
    // runtime since `Buffer` is a `Uint8Array` subclass, so pass it as-is
    // rather than the copy above (which the underlying native binding
    // rejects).
    await engine.load(bytes as unknown as ArrayBuffer);

    // A mid-gray synthetic 192x192 RGBA frame — same shape rgbaToNhwcTensor expects.
    const rgba = new Uint8Array(192 * 192 * 4).fill(128);
    const tensor = rgbaToNhwcTensor(rgba, { width: 192, height: 192, dtype: "int32" });
    expect(tensor.shape).toEqual([1, 192, 192, 3]);
    expect(tensor.dtype).toBe("int32");

    const output = await engine.run(tensor);
    expect(output.shape).toEqual([1, 1, 17, 3]);
    expect(output.data.length).toBe(51);
    expect(Array.from(output.data).every((v) => Number.isFinite(v))).toBe(true);

    await engine.unload();
  });
});
