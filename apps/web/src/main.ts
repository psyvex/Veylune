import { detectCapabilities } from "./runtime/capabilities";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) {
  throw new Error("Veylune application root is missing");
}

const capabilities = detectCapabilities();

root.textContent = "Veylune foundation ready";
root.dataset.webgpu = capabilities.webgpu;
root.dataset.wasm = capabilities.wasm;
