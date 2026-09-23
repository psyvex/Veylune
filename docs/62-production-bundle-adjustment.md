# 62. Production Bundle Adjustment Progress

This stage moves Veylune from isolated numerical primitives toward a complete local bundle-adjustment pipeline.

## Implemented in this stage

- SE(3) camera increments using the SO(3) exponential map.
- Camera and landmark finite-difference Jacobian linearization.
- Block normal-equation assembly for 6-DoF camera and 3-DoF landmark blocks.
- Independent 3x3 landmark-block inversion for Schur reduction.
- Reduced camera-system solve with guarded positive-definite factorization.
- Landmark back-substitution.
- Damped iterative optimization with bounded camera/landmark steps.
- Huber robust cost evaluation.
- Cost-increase rejection and adaptive damping.
- Synthetic numerical regression tests for core solver primitives.

## Safety model

The optimizer works on a cloned local problem. The caller receives a new candidate problem only after the numerical step has produced a finite, lower-cost state. No in-place mutation of the active map is required by the optimizer.

## Current limitations

This is a strong browser-oriented numerical foundation, but it is not yet the final high-performance BA implementation. The remaining production work includes:

1. replace repeated full-problem finite-difference evaluation with observation-local Jacobians
2. add analytic/automatic-differentiation Jacobians and compare them against the finite-difference reference
3. implement full LM gain-ratio acceptance rather than cost-only damping heuristics
4. add calibrated distortion parameters to the residual parameterization when calibration is optimized
5. add robust outlier gating and observation-level covariance/weight handling
6. add rank-deficiency and gauge diagnostics
7. move large linear algebra to WebAssembly/WebGPU or a dedicated worker where profiling demonstrates benefit
8. add recorded-scene regression datasets and device benchmarks

The current implementation should therefore be treated as a local optimization engine suitable for controlled experiments and regression development, with live-map activation gated by the project's validation suite.
