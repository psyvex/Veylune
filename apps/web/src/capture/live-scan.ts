import { CameraFrameScheduler, type CameraFrame } from "./camera-frames";
import { openCamera, type CameraConstraints, type CameraSession } from "./camera";

export interface LiveScanState { readonly running: boolean; readonly frames: number; readonly accepted: number; readonly rejected: number; readonly lastTimestampMs?: number; readonly error?: string; }
export interface LiveScanControllerOptions { readonly camera: CameraConstraints; readonly maxFps?: number; readonly maxWidth?: number; readonly maxHeight?: number; readonly process(frame: CameraFrame): Promise<boolean> | boolean; readonly onState?: (state: LiveScanState) => void; }

export class LiveScanController {
  private session?: CameraSession; private scheduler?: CameraFrameScheduler; private state: LiveScanState = { running: false, frames: 0, accepted: 0, rejected: 0 };
  constructor(private readonly options: LiveScanControllerOptions) {}
  getState(): LiveScanState { return this.state; }
  async start(): Promise<void> { if (this.session) return; try { this.session = await openCamera(this.options.camera); this.scheduler = new CameraFrameScheduler(this.session.video, (frame) => this.process(frame), { maxFps: this.options.maxFps, maxWidth: this.options.maxWidth, maxHeight: this.options.maxHeight }); this.setState({ running: true, error: undefined }); this.scheduler.start(); } catch (error) { this.session?.stop(); this.session = undefined; this.scheduler = undefined; this.setState({ running: false, error: error instanceof Error ? error.message : "Unable to open camera." }); throw error; } }
  stop(): void { this.scheduler?.stop(); this.scheduler = undefined; this.session?.stop(); this.session = undefined; this.setState({ running: false }); }
  private async process(frame: CameraFrame): Promise<void> { try { const accepted = await this.options.process(frame); this.setState({ frames: this.state.frames + 1, accepted: this.state.accepted + (accepted ? 1 : 0), rejected: this.state.rejected + (accepted ? 0 : 1), lastTimestampMs: frame.timestampMs }); } catch (error) { this.setState({ running: false, error: error instanceof Error ? error.message : "Frame processing failed." }); this.stop(); } }
  private setState(update: Partial<LiveScanState>): void { this.state = { ...this.state, ...update }; this.options.onState?.(this.state); }
}
