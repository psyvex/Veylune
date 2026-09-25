// Computes a sha256:<hex> digest for a model artifact and checks it against the
// artifactDigest field in that model's manifest.json, per
// docs/21-model-registry-and-provenance.md's integrity verification requirement.
//
// Usage:
//   node tools/verify-model-digest.mjs models/<model-id>/manifest.json path/to/artifact.onnx

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const [manifestPath, artifactPath] = process.argv.slice(2);

if (!manifestPath || !artifactPath) {
  console.error("usage: verify-model-digest.mjs <manifest.json> <artifact-file>");
  process.exit(2);
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const bytes = await readFile(artifactPath);
const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

if (digest !== manifest.artifactDigest) {
  console.error(`digest mismatch for ${manifest.modelId ?? "(unknown model)"}`);
  console.error(`  manifest: ${manifest.artifactDigest}`);
  console.error(`  computed: ${digest}`);
  process.exit(1);
}

console.log(`ok: ${manifest.modelId} ${manifest.version} matches ${digest}`);
