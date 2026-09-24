# Veylune

Production-grade, local-first 3D reconstruction and creative engine.

Veylune is a browser-first system for reconstructing detailed 3D representations from user-provided images, with room to expand into animation, scene creation, rendering, and export workflows.

The web capture workspace provides a live camera preview, plain-language tracking guidance, and a responsive map-refinement panel with progress, cost, and cancellation feedback. Capture continues while map refinement runs in the background.

## Architecture

- Rust core for geometry, reconstruction, numerical processing, and future physics.
- WebAssembly for browser execution.
- WebGPU for accelerated rendering and compute where available.
- TypeScript/React application layer for the Studio.
- Capability-driven ML execution with WebGPU and WASM fallbacks.
- Model-independent reconstruction interfaces.
- glTF/GLB as a primary 3D interchange format.

## Repository layout

```text
apps/          Application frontends
crates/        Rust engine crates
packages/      TypeScript packages
models/        Model manifests and metadata
benchmarks/    Performance and quality benchmarks
docs/          Architecture and research documentation
tools/         Development and model tooling
```

## Development principle

Quality and production suitability take priority over development speed. Models and algorithms remain candidates until they pass benchmark, compatibility, stability, and licensing checks.
