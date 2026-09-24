import { detectCapabilities } from "./runtime/capabilities";
import { mountStudioApp } from "./studio/studio-app";
import { mountMarketingPage } from "./marketing/marketing-page";
import "./capture/capture.css";
import "./studio/studio.css";
import "./marketing/marketing.css";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("Veylune application root is missing");

const capabilities = detectCapabilities();
root.dataset.webgpu = capabilities.webgpu;
root.dataset.wasm = capabilities.wasm;
root.dataset.workers = capabilities.workers;
if (window.location.pathname.replace(/\/$/, "") === "/studio") {
  mountStudioApp(root, capabilities);
} else {
  mountMarketingPage(root);
}
