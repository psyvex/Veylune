# Live Capture to Reconstruction

The capture pipeline is now the bridge between camera/feature frames and the versioned reconstruction session. Camera acquisition remains in `camera.ts`; feature extraction and matching remain injectable so browser-local inference can supply the implementation without coupling capture state to a particular model runtime.

Each accepted frame passes through reliable-match filtering, geometric verification, and parallax-aware triangulation. Only after those checks does the pipeline add a keyframe, landmarks, and paired observations. A rejected frame leaves the last valid reconstruction session unchanged.

The first keyframe is valid without landmarks. This is intentional: a live capture session needs a stable reference frame before any second-view triangulation is possible.

The pipeline does not invent camera pose. The pose supplied to `process()` is an explicit upstream estimate, keeping pose estimation replaceable and preventing false precision from being hidden inside capture orchestration.

The resulting session can be handed directly to the worker/controller path for background bundle adjustment and atomic state commit.

## Live optimization synchronization

The capture pipeline remains the source of truth for newly tracked keyframes. The app synchronizes each accepted reconstruction snapshot into the worker controller before scheduling optimization. That advances the controller's expected map and pose versions, so a worker result becomes stale if capture adds state while optimization is running.

After an optimization commits, the candidate map and pose graph are applied back to the capture pipeline as one validated snapshot. Future triangulation therefore uses the refined reference pose, and the HUD reports the same map version the capture pipeline will continue from. A snapshot that is invalid or no longer advances the active versions is rejected without replacing live state.
