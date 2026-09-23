import type { InferenceWorkerEvent, InferenceWorkerRequest } from "./worker-protocol";

const loadedModels = new Set<string>();
const cancelledJobs = new Set<string>();

self.addEventListener("message", async (event: MessageEvent<InferenceWorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === "load") {
      loadedModels.add(request.modelKey);
      emit({ type: "ready" });
      return;
    }
    if (request.type === "unload") {
      loadedModels.delete(request.modelKey);
      return;
    }
    if (request.type === "cancel") {
      cancelledJobs.add(request.jobId);
      return;
    }
    if (!loadedModels.has(request.modelKey)) {
      emit({ type: "error", jobId: request.jobId, code: "MODEL_NOT_LOADED", message: "The requested model is not loaded." });
      return;
    }
    if (cancelledJobs.has(request.jobId)) {
      cancelledJobs.delete(request.jobId);
      emit({ type: "error", jobId: request.jobId, code: "CANCELLED", message: "Inference job was cancelled." });
      return;
    }

    emit({ type: "progress", jobId: request.jobId, completed: 0, total: 1 });
    emit({ type: "error", jobId: request.jobId, code: "RUNTIME_UNAVAILABLE", message: "No concrete inference engine is installed in this build." });
  } catch (error) {
    emit({
      type: "error",
      jobId: request.type === "run" ? request.jobId : undefined,
      code: "WORKER_ERROR",
      message: error instanceof Error ? error.message : "Unknown worker error.",
    });
  }
});

function emit(event: InferenceWorkerEvent): void {
  self.postMessage(event);
}
