# 19. Browser Capability Detection

## Principle

Veylune selects execution behavior from measured browser capabilities, not browser or device names.

## Capability profile

The browser layer should detect, where available:

- WebGPU availability
- WebGPU adapter limits/features
- WASM support
- WASM SIMD
- SharedArrayBuffer availability
- cross-origin isolation
- Web Workers
- OffscreenCanvas
- WebCodecs
- supported image formats
- storage availability/quota signals
- WebNN availability
- hardware concurrency
- coarse memory hints where exposed

Do not treat unavailable hints as failure. Unknown is a valid capability state.

## Tiers

### Tier 0 — Compatibility

CPU/WASM processing, reduced resolution, minimal concurrent work.

### Tier 1 — Accelerated

WASM SIMD and worker processing with optional GPU rendering.

### Tier 2 — WebGPU

GPU rendering and eligible compute/inference paths.

### Tier 3 — High capability

WebGPU + sufficient limits + parallel workers + advanced model/quality settings.

The tier is an internal policy result, not a permanent device classification.

## Runtime adaptation

A capability profile must be re-evaluated when relevant runtime conditions change, including GPU/device loss or storage pressure.

The application must be able to reduce quality without losing project data.

## Privacy

Capability detection must avoid fingerprinting-oriented collection. Use capabilities to make local execution decisions; do not transmit a detailed hardware fingerprint by default.

## Browser compatibility

Feature detection is mandatory. User-agent sniffing is not a correctness mechanism.
