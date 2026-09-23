# Live Capture to Reconstruction

The capture pipeline is now the bridge between camera/feature frames and the versioned reconstruction session. Camera acquisition remains in `camera.ts`; feature extraction and matching remain injectable so browser-local inference can supply the implementation without coupling capture state to a particular model runtime.

Each accepted frame passes through reliable-match filtering, geometric verification, and parallax-aware triangulation. Only after those checks does the pipeline add a keyframe, landmarks, and paired observations. A rejected frame leaves the last valid reconstruction session unchanged.

The first keyframe is valid without landmarks. This is intentional: a live capture session needs a stable reference frame before any second-view triangulation is possible.

The pipeline does not invent camera pose. The pose supplied to `process()` is an explicit upstream estimate, keeping pose estimation replaceable and preventing false precision from being hidden inside capture orchestration.

The resulting session can be handed directly to the worker/controller path for background bundle adjustment and atomic state commit.
