# Veylune

**Spatial capture, made tangible.**

Veylune is a browser-first, local-first spatial studio for capturing spaces, refining spatial maps, and organizing image sets. It turns camera views and source images into a focused workspace for spatial reconstruction, with room to expand into animation, scene creation, rendering, and export workflows.

The Studio keeps the work close to the user: camera capture provides live tracking guidance, image import supports local photo sets, and map refinement reports progress, cost, and cancellation state without requiring source files to leave the device.

## Product identity

- **Name:** Veylune
- **Positioning:** Spatial capture, made tangible.
- **Studio:** A private workspace for capture, image organization, and spatial refinement.
- **Brand mark:** Voxel Bloom, a monochrome cell-based identity rendered from one shared geometry source across the Studio, marketing surface, loader, splash, favicon, and app icons.
- **Design principle:** The identity stays geometric and monochrome; depth comes from tone rather than a fixed color palette.

## Architecture

- Rust core for geometry, reconstruction, numerical processing, and future physics.
- WebAssembly for browser execution.
- WebGPU for accelerated rendering and compute where available.
- TypeScript application layer for the Studio and marketing surface.
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
