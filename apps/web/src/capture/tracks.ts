import type { FeatureMatch, FeatureSet } from "./features";

export interface TrackObservation {
  readonly frameIndex: number;
  readonly featureIndex: number;
}

export interface FeatureTrack {
  readonly id: string;
  readonly observations: readonly TrackObservation[];
  readonly age: number;
  readonly lastFrameIndex: number;
}

export interface TrackUpdate {
  readonly tracks: readonly FeatureTrack[];
  readonly created: number;
  readonly retired: number;
}

export class FeatureTrackManager {
  private readonly tracks = new Map<string, FeatureTrack>();
  private nextId = 1;

  update(previous: FeatureSet | undefined, current: FeatureSet, matches: readonly FeatureMatch[], frameIndex: number): TrackUpdate {
    const byCurrent = new Map<number, FeatureTrack>();
    if (previous) {
      for (const match of matches) {
        const track = [...this.tracks.values()].find((candidate) => candidate.lastFrameIndex === frameIndex - 1 && candidate.observations.at(-1)?.featureIndex === match.referenceIndex);
        if (!track) continue;
        const updated: FeatureTrack = {
          ...track,
          observations: [...track.observations, { frameIndex, featureIndex: match.currentIndex }],
          age: track.age + 1,
          lastFrameIndex: frameIndex,
        };
        this.tracks.set(track.id, updated);
        byCurrent.set(match.currentIndex, updated);
      }
    }

    let created = 0;
    for (let index = 0; index < current.keypoints.length; index += 1) {
      if (byCurrent.has(index)) continue;
      const id = `track-${this.nextId++}`;
      this.tracks.set(id, {
        id,
        observations: [{ frameIndex, featureIndex: index }],
        age: 1,
        lastFrameIndex: frameIndex,
      });
      created += 1;
    }

    let retired = 0;
    for (const [id, track] of this.tracks) {
      if (track.lastFrameIndex < frameIndex - 1) {
        this.tracks.delete(id);
        retired += 1;
      }
    }

    return { tracks: [...this.tracks.values()], created, retired };
  }

  stable(minObservations = 3): readonly FeatureTrack[] {
    return [...this.tracks.values()].filter((track) => track.observations.length >= minObservations);
  }

  clear(): void {
    this.tracks.clear();
    this.nextId = 1;
  }
}
