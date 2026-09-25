/*
 * Tests read a couple of source files off disk to check them against the code that
 * has to agree with them (see the tone parity test in voxel-bloom.test.ts), and the
 * engine module falls back to reading the built .wasm file directly under Vitest's
 * jsdom environment (see src/engine/index.ts). Vitest runs on Node, so these calls
 * are real; the app's tsconfig deliberately ships no Node type package, so the
 * handful of signatures actually used are declared here instead of pulling
 * @types/node into a browser bundle's type graph.
 */
declare module "node:fs" {
  export function readFileSync(path: URL | string, encoding: "utf8"): string;
}

declare module "node:fs/promises" {
  export function readFile(path: string): Promise<Uint8Array>;
}

declare module "node:path" {
  export function join(...segments: string[]): string;
}

declare const process: { cwd(): string };
