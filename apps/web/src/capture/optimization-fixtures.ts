import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Landmark } from "./map";
import type { BundleAdjustmentObservation } from "./bundle-adjustment";

export interface SyntheticFixture {
  readonly landmarks: readonly Landmark[];
  readonly observations: readonly BundleAdjustmentObservation[];
}

interface FixtureFile {
  readonly fixtureId: string;
  readonly version: string;
  readonly landmarks: readonly Landmark[];
  readonly observations: readonly BundleAdjustmentObservation[];
}

/**
 * Loads the checked-in synthetic bundle-adjustment fixture from
 * `benchmarks/fixtures/` (per `docs/23-benchmark-contract.md`'s "fixture
 * version" reproducibility field), instead of hardcoding the same numbers
 * inline in this module — the same data can now be a reviewable, versioned
 * artifact that a future benchmark record can cite by `fixtureId`/`version`.
 * Node-only (reads the file off disk directly, like `engine/node-loader.ts`);
 * this fixture is dev/test tooling, never imported by the shipped browser
 * bundle.
 */
export async function loadSyntheticOptimizationFixture(): Promise<SyntheticFixture> {
  const path = join(process.cwd(), "..", "..", "benchmarks", "fixtures", "bundle-adjustment-synthetic-v1.json");
  const bytes = await readFile(path);
  const file = JSON.parse(new TextDecoder("utf-8").decode(bytes)) as FixtureFile;
  return { landmarks: file.landmarks, observations: file.observations };
}
