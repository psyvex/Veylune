import { detectCapabilities } from "./runtime/capabilities";
import { mountStudioApp } from "./studio/studio-app";
import { mountMarketingPage } from "./marketing/marketing-page";
import { mountVeyluneSplash } from "./branding/splash";
import { applyEngineCapabilityAttributes } from "./engine/capability-attributes.js";
import "./design/tokens.css";
import "./design/components.css";
import "./branding/voxel-bloom.css";
import "./capture/capture.css";
import "./studio/studio.css";
import "./marketing/marketing.css";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("Veylune application root is missing");

const capabilities = detectCapabilities();
root.dataset.webgpu = capabilities.webgpu;
root.dataset.wasm = capabilities.wasm;
root.dataset.workers = capabilities.workers;

// Load the Rust/WASM engine (ADR-013) and record which backend it selects for
// this browser, so the capability profile is visible end to end from Rust
// runtime logic through to a DOM attribute, per Phase 0's acceptance criteria.
// See capability-attributes.test.ts for the integration test covering this hop.
void applyEngineCapabilityAttributes(root, capabilities);
// Offline shell (public/sw.js): production only — a registered SW would serve
// stale bundles from the dev server. All project data already lives in
// IndexedDB, so caching the bundle is what makes the app usable offline.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    // ?v=<build id> — a new URL is a new service worker to the browser, so
    // every deploy installs, activates and deletes the previous cache.
    void navigator.serviceWorker.register(`/sw.js?v=${__VEYLUNE_BUILD__}`, { scope: "/" }).catch(() => undefined);
  });
}
if (/^\/studio(\/|$)/.test(window.location.pathname)) {
  // The app mounts first and the splash covers it, so the sequence hides work
  // that is already happening instead of delaying it. Ordering it this way also
  // means a boot failure is never buried behind an overlay: if the app throws,
  // no splash is ever added to the page.
  mountStudioApp(root, capabilities);
  mountVeyluneSplash(document.body, { label: "Loading Veylune" });
} else {
  mountMarketingPage(root);
}
