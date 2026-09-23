export type JobState = "queued" | "running" | "cancelling" | "cancelled" | "completed" | "failed";

export interface JobError {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
}

export interface JobProgress {
  readonly completed: number;
  readonly total: number;
}

export interface JobStatus {
  readonly id: string;
  readonly state: JobState;
  readonly progress: JobProgress;
  readonly error?: JobError;
}

export interface JobRequest<TInput> {
  readonly id: string;
  readonly operation: string;
  readonly input: TInput;
}

export type JobEvent<TOutput> =
  | { readonly type: "progress"; readonly status: JobStatus }
  | { readonly type: "completed"; readonly status: JobStatus; readonly output: TOutput }
  | { readonly type: "failed"; readonly status: JobStatus };

export interface JobTransport<TInput, TOutput> {
  submit(request: JobRequest<TInput>): Promise<void>;
  cancel(id: string): Promise<void>;
  subscribe(listener: (event: JobEvent<TOutput>) => void): () => void;
}
