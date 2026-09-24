import { detectCapabilities } from "./runtime/capabilities";
import { mountCaptureApp } from "./capture/capture-app";
import "./capture/capture.css";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("Veylune application root is missing");

const capabilities = detectCapabilities();
root.dataset.webgpu = capabilities.webgpu;
root.dataset.wasm = capabilities.wasm;
root.dataset.workers = capabilities.workers;
mountCaptureApp(root, capabilities);
