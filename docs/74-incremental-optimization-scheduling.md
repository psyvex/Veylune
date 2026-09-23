# Incremental optimization scheduling

Live capture produces many tracking frames but only some frames materially change the reconstruction map. `OptimizationScheduler` is the boundary between those map mutations and background bundle adjustment.

The scheduler debounces bursts of keyframe insertions, enforces a minimum interval between optimization starts, and coalesces pending work to the newest reconstruction version. If an optimization is already running, a later version remains pending and is scheduled after the current run completes.

The scheduler does not decide whether a worker result is safe to commit. That remains the responsibility of the reconstruction controller, which must compare the result's input/version against the current reconstruction state before an atomic commit.

Disposal cancels queued work but deliberately does not attempt to interrupt an already-running promise. Worker cancellation belongs to the worker transport boundary.
