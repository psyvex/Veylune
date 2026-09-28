import { installReconstructionWorker } from "./reconstruction-worker";
import { ensureReconstructionEngineReady } from "./reconstruction-engine-bootstrap.js";

// Non-blocking: the message handler installs immediately so jobs are never
// held up waiting on the WASM engine (nothing calls into it yet either —
// see reconstruction-engine-bootstrap.ts).
void ensureReconstructionEngineReady();
installReconstructionWorker(self);
