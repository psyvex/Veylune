// Actually loads a model artifact through onnxruntime-web and runs one real
// inference pass against a synthetic input matching the manifest's declared
// inputSchema, checking the output against outputSchema — the "operator
// support / actual load success" verification docs/42-vision-model-selection.md's
// decision boundary requires before a model can move past `approvalStatus:
// "candidate"`. Digest-checks the artifact first (reuses the same logic as
// verify-model-digest.mjs) so a stale/wrong local file can't produce a
// false "it works".
//
// This does NOT flip the manifest's approvalStatus — that also needs a
// real-device/real-browser latency benchmark and (for a quantized model) an
// accuracy comparison against the fp32/fp16 variant, neither of which this
// script does. It only proves the graph loads and runs with the declared
// tensor shape/dtype, which is a real prerequisite, not the whole gate.
//
// Usage:
//   node tools/verify-model-inference.mjs models/<model-id>/manifest.json path/to/artifact.onnx

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// tools/ is a sibling of apps/web, not a descendant of it, so Node's ESM
// bare-specifier resolution (which only walks up from the importing file)
// never finds apps/web/node_modules/onnxruntime-web — this repo's only
// installed copy, since it's the one the browser bundle will actually use.
// Import it by resolved path instead of the bare "onnxruntime-web"
// specifier.
const here = dirname(fileURLToPath(import.meta.url));
const ortEntry = join(here, "..", "apps", "web", "node_modules", "onnxruntime-web", "dist", "ort.node.min.js");
const ort = await import(ortEntry);

const [manifestPath, artifactPath] = process.argv.slice(2);
if (!manifestPath || !artifactPath) {
  console.error("usage: verify-model-inference.mjs <manifest.json> <artifact-file>");
  process.exit(2);
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const bytes = await readFile(artifactPath);

const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
if (digest !== manifest.artifactDigest) {
  console.error(`digest mismatch for ${manifest.modelId} — refusing to run an unverified artifact`);
  console.error(`  manifest: ${manifest.artifactDigest}`);
  console.error(`  computed: ${digest}`);
  process.exit(1);
}

const { shape, dtype } = manifest.inputSchema;
const elementCount = shape.reduce((a, b) => a * b, 1);
const TypedArrayCtor = { int32: Int32Array, float32: Float32Array, uint8: Uint8Array }[dtype];
if (!TypedArrayCtor) {
  console.error(`verify-model-inference.mjs doesn't know how to build a ${dtype} tensor — extend TypedArrayCtor above`);
  process.exit(2);
}
const input = new TypedArrayCtor(elementCount).fill(128); // mid-gray synthetic frame

const createStart = Date.now();
const session = await ort.InferenceSession.create(bytes);
const createMs = Date.now() - createStart;

const tensor = new ort.Tensor(dtype, input, shape);
await session.run({ [session.inputNames[0]]: tensor }); // warmup (excluded from the steady-state timing below)

const runs = 10;
const runStart = Date.now();
let output;
for (let i = 0; i < runs; i += 1) {
  const result = await session.run({ [session.inputNames[0]]: tensor });
  output = result[session.outputNames[0]];
}
const avgRunMs = (Date.now() - runStart) / runs;

const expectedShape = manifest.outputSchema.shape;
const shapeMatches = output.dims.length === expectedShape.length && output.dims.every((d, i) => d === expectedShape[i]);
if (!shapeMatches) {
  console.error(`output shape mismatch: manifest says ${JSON.stringify(expectedShape)}, got ${JSON.stringify(output.dims)}`);
  process.exit(1);
}
const allFinite = Array.from(output.data).every((v) => Number.isFinite(v));
if (!allFinite) {
  console.error("output contains non-finite values");
  process.exit(1);
}

console.log(`ok: ${manifest.modelId} ${manifest.version} loaded and ran`);
console.log(`  output shape ${JSON.stringify(output.dims)}, all finite`);
console.log(`  session create: ${createMs}ms, steady-state inference (avg of ${runs}): ${avgRunMs.toFixed(1)}ms`);
console.log(`  runtime: onnxruntime-web Node/WASM backend on ${process.platform}/${process.arch} — NOT a target-device/browser benchmark`);
