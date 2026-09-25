/*
 * Tests read a couple of source files off disk to check them against the code that
 * has to agree with them (see the tone parity test in voxel-bloom.test.ts). Vitest
 * runs on Node, so the call is real; the app's tsconfig deliberately ships no Node
 * type package, so the two-argument read is declared here instead of pulling
 * @types/node into a browser bundle's type graph.
 */
declare module "node:fs" {
  export function readFileSync(path: URL | string, encoding: "utf8"): string;
}
