export interface PoseSample {
  readonly timestampMs: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly confidence: number;
}

export interface TemporalPoseState {
  readonly sample: PoseSample;
  readonly velocity: readonly [number, number, number];
}

export class TemporalPoseFilter {
  private state?: TemporalPoseState;

  update(sample: PoseSample): TemporalPoseState {
    if (!Number.isFinite(sample.timestampMs) || sample.timestampMs <= 0 || !Number.isFinite(sample.confidence)) {
      throw new Error("Invalid pose sample.");
    }
    if (!this.state) {
      this.state = { sample, velocity: [0, 0, 0] };
      return this.state;
    }

    const dt = (sample.timestampMs - this.state.sample.timestampMs) / 1000;
    if (dt <= 0 || dt > 1) return this.state;

    const alpha = Math.max(0.1, Math.min(0.8, sample.confidence));
    const predicted = this.state.velocity.map((v, index) => {
      const coordinate = index === 0 ? this.state!.sample.x : index === 1 ? this.state!.sample.y : this.state!.sample.z;
      return coordinate + v * dt;
    }) as [number, number, number];
    const observed: [number, number, number] = [sample.x, sample.y, sample.z];
    const next = observed.map((value, index) => predicted[index] + alpha * (value - predicted[index])) as [number, number, number];
    const velocity: [number, number, number] = [
      (next[0] - this.state.sample.x) / dt,
      (next[1] - this.state.sample.y) / dt,
      (next[2] - this.state.sample.z) / dt,
    ];
    this.state = { sample: { ...sample, x: next[0], y: next[1], z: next[2] }, velocity };
    return this.state;
  }

  reset(): void {
    this.state = undefined;
  }
}
