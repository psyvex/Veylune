import type { FeatureMatcher, FeatureSet } from "./features";
import { estimateTrackingConfidence, retainReliableMatches } from "./features";
import { verifyMatches, type CameraIntrinsics } from "./geometry";
import { LocalMap, validateSnapshot } from "./map";
import { PoseGraph, identityCameraPose, validatePoseGraph } from "./keyframe-pose";
import { triangulateCorrespondencesRouted, type CameraPose } from "./triangulation";
import type { LandmarkColor } from "./export-ply";
import { essentialFromPoses, epipolarInlierMask } from "./essential-matrix";
import { createReconstructionSession, validateReconstructionSession, type ReconstructionCalibration, type ReconstructionObservation, type ReconstructionSessionSnapshot } from "./reconstruction-session";
import { ZERO_DISTORTION } from "./distortion";
import { KeyframePolicy, poseRotationDeltaRad, poseTranslationDelta } from "./keyframe-policy";

export interface CaptureFrame { readonly id: string; readonly frameIndex: number; readonly timestampMs: number; readonly features: FeatureSet; /** Raw camera pixels, when kept — lets the pipeline sample true color for each newly triangulated landmark. */ readonly image?: ImageData; }
export interface CapturePipelineOptions { readonly intrinsics: CameraIntrinsics; readonly distortion?: ReconstructionCalibration["distortion"]; readonly maxMatchDistance?: number; readonly geometryThresholdPx?: number; readonly maxReprojectionErrorPx?: number; readonly minimumTrackingConfidence?: number; readonly keyframePolicy?: KeyframePolicy; }
export interface CaptureStepResult { readonly accepted: boolean; readonly keyframeInserted: boolean; readonly reason: "initialized" | "tracked" | "insufficient-features" | "insufficient-geometry" | "insufficient-parallax"; readonly confidence: number; readonly inliers: number; readonly session?: ReconstructionSessionSnapshot; }

export class CapturePipeline {
  private readonly map = new LocalMap(); private readonly poses = new PoseGraph(); private reference: CaptureFrame | undefined; private referencePose: CameraPose | undefined; private referenceTimestampMs = 0; private observations: ReconstructionObservation[] = []; private session: ReconstructionSessionSnapshot | undefined; private readonly options: Required<CapturePipelineOptions>; private readonly keyframeMemory: { id: string; frameIndex: number; features: FeatureSet; signature: number[] }[] = []; private readonly landmarkColors = new Map<string, LandmarkColor>(); loopClosures = 0;
  constructor(options: CapturePipelineOptions) { this.options = { distortion: ZERO_DISTORTION, maxMatchDistance: 1.2, geometryThresholdPx: 16, maxReprojectionErrorPx: 12, minimumTrackingConfidence: 0.0, keyframePolicy: new KeyframePolicy(), ...options }; }
  initialize(frame: CaptureFrame, pose: CameraPose = identityCameraPose()): CaptureStepResult { if (frame.features.keypoints.length < 4) return { accepted: false, keyframeInserted: false, reason: "insufficient-features", confidence: 0, inliers: 0 }; this.map.addKeyframe({ id: frame.id, frameIndex: frame.frameIndex, timestampMs: frame.timestampMs, landmarkIds: [], pose }); this.poses.add({ id: frame.id, frameIndex: frame.frameIndex, timestampMs: frame.timestampMs, pose, fixed: true }); this.reference = frame; this.referencePose = pose; this.referenceTimestampMs = frame.timestampMs; this.session = createReconstructionSession(this.map.snapshot(), this.poses.snapshot(), [], { intrinsics: this.options.intrinsics, distortion: this.options.distortion }, frame.timestampMs); return { accepted: true, keyframeInserted: true, reason: "initialized", confidence: 1, inliers: frame.features.keypoints.length, session: this.session }; }
  process(frame: CaptureFrame, matcher: FeatureMatcher, pose: CameraPose): CaptureStepResult { const reference = this.reference; const referencePose = this.referencePose; if (!reference || !referencePose || !this.session) return this.initialize(frame, pose); if (frame.features.keypoints.length < 4) return { accepted: false, keyframeInserted: false, reason: "insufficient-features", confidence: 0, inliers: 0, session: this.session }; const matches = retainReliableMatches(matcher.match(reference.features, frame.features), this.options.maxMatchDistance); const geometry = verifyMatches(reference.features.keypoints, frame.features.keypoints, matches, this.options.geometryThresholdPx); const confidence = Math.min(estimateTrackingConfidence(geometry.inliers), geometry.confidence); if (matches.length < 2) return { accepted: false, keyframeInserted: false, reason: "insufficient-geometry", confidence, inliers: geometry.inliers.length, session: this.session }; let verifiedInliers = geometry.inliers; if (geometry.inliers.length >= 8) { const p1 = geometry.inliers.map((m) => reference.features.keypoints[m.referenceIndex]!); const p2 = geometry.inliers.map((m) => frame.features.keypoints[m.currentIndex]!); const mask = epipolarInlierMask(essentialFromPoses(referencePose, pose), p1, p2, this.options.intrinsics, 3); const filtered = geometry.inliers.filter((_, i) => mask[i]); if (filtered.length >= 6) verifiedInliers = filtered; } const triangulation = triangulateCorrespondencesRouted(reference.features.keypoints, frame.features.keypoints, verifiedInliers, this.options.intrinsics, referencePose, pose, this.options.maxReprojectionErrorPx); const insert = this.options.keyframePolicy.shouldInsert({ confidence, inliers: geometry.inliers.length, translationDelta: poseTranslationDelta(referencePose, pose), rotationDeltaRad: poseRotationDeltaRad(referencePose, pose), elapsedMs: Math.max(0, frame.timestampMs - this.referenceTimestampMs) }); if (!insert) return { accepted: true, keyframeInserted: false, reason: "tracked", confidence, inliers: geometry.inliers.length, session: this.session }; this.map.addKeyframe({ id: frame.id, frameIndex: frame.frameIndex, timestampMs: frame.timestampMs, landmarkIds: [], pose }); this.poses.add({ id: frame.id, frameIndex: frame.frameIndex, timestampMs: frame.timestampMs, pose, fixed: false }); const landmarkIds: string[] = []; for (let index = 0; index < triangulation.points.length; index += 1) { const point = triangulation.points[index]!; const landmarkId = `lm:${reference.id}:${frame.id}:${index}`; if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !(point.z > 0)) continue; this.map.upsertLandmark(landmarkId, point, frame.frameIndex, 2); landmarkIds.push(landmarkId); const a = reference.features.keypoints[point.match.referenceIndex]!; const b = frame.features.keypoints[point.match.currentIndex]!; const color = samplePairColor(reference.image, a, frame.image, b); if (color) this.landmarkColors.set(landmarkId, color); this.observations.push({ id: `obs:${reference.id}:${frame.id}:${index}:a`, keyframeId: reference.id, landmarkId, x: a.x, y: a.y }, { id: `obs:${reference.id}:${frame.id}:${index}:b`, keyframeId: frame.id, landmarkId, x: b.x, y: b.y }); } const currentMap = this.map.snapshot(); const updatedMap = { ...currentMap, keyframes: currentMap.keyframes.map((keyframe) => keyframe.id === frame.id ? { ...keyframe, landmarkIds } : keyframe) }; if (!this.map.commitSnapshot(currentMap.version, updatedMap)) throw new Error("Capture map changed while committing frame."); this.reference = frame; this.referencePose = pose; this.referenceTimestampMs = frame.timestampMs; this.renormalizeDepth(); this.cullOldKeyframes(); this.detectLoopClosure(frame, matcher); this.session = createReconstructionSession(this.map.snapshot(), this.poses.snapshot(), this.observations, { intrinsics: this.options.intrinsics, distortion: this.options.distortion }, frame.timestampMs); return { accepted: true, keyframeInserted: true, reason: "tracked", confidence, inliers: geometry.inliers.length, session: this.session }; }
  /** BoW-lite loop closure: spatial-histogram place signatures pick a revisit
   * candidate, descriptor matching + existing landmark observations turn it
   * into loop edges for bundle adjustment. One candidate check per keyframe. */
  private detectLoopClosure(frame: CaptureFrame, matcher: FeatureMatcher): void {
    const signature = spatialSignature(frame.features);
    for (const entry of this.keyframeMemory) {
      if (frame.frameIndex - entry.frameIndex < 6) continue;
      if (histogramIntersection(signature, entry.signature) < 0.85) continue;
      const matches = retainReliableMatches(matcher.match(entry.features, frame.features), this.options.maxMatchDistance);
      if (matches.length < 12) break;
      const loopGeometry = verifyMatches(entry.features.keypoints, frame.features.keypoints, matches, this.options.geometryThresholdPx);
      if (loopGeometry.inliers.length < 12) break;
      const observationGrid = new Map<string, string>();
      for (const observation of this.observations) if (observation.keyframeId === entry.id) observationGrid.set(`${Math.round(observation.x)},${Math.round(observation.y)}`, observation.landmarkId);
      const links: { landmarkId: string; x: number; y: number }[] = [];
      const linked = new Set<string>();
      for (const inlier of loopGeometry.inliers) {
        const old = entry.features.keypoints[inlier.referenceIndex]; const current = frame.features.keypoints[inlier.currentIndex];
        if (!old || !current) continue;
        let landmarkId: string | undefined;
        for (let dx = -2; dx <= 2 && !landmarkId; dx++) for (let dy = -2; dy <= 2 && !landmarkId; dy++) landmarkId = observationGrid.get(`${Math.round(old.x) + dx},${Math.round(old.y) + dy}`);
        if (landmarkId && !linked.has(landmarkId)) { linked.add(landmarkId); links.push({ landmarkId, x: current.x, y: current.y }); }
      }
      if (links.length >= 6 && this.closeLoop(frame.id, links)) this.loopClosures += 1;
      break;
    }
    this.keyframeMemory.push({ id: frame.id, frameIndex: frame.frameIndex, features: frame.features, signature });
    if (this.keyframeMemory.length > 60) this.keyframeMemory.shift();
  }
  /** Monocular scale is arbitrary; keep the median landmark depth in a sane
   * band so a long scan can't inflate the map to absurd size or collapse it.
   * Uniform world scaling preserves geometry (all points and camera centers
   * move together). */
  private renormalizeDepth(targetDepth = 3, minDepth = 0.5, maxDepth = 25): void {
    const referencePose = this.referencePose; if (!referencePose) return;
    const map = this.map.snapshot(); const poses = this.poses.snapshot();
    if (map.landmarks.length < 6) return;
    const R = referencePose.rotation, C = referencePose.translation;
    const depths = map.landmarks.map((l) => R[6]! * (l.x - C[0]!) + R[7]! * (l.y - C[1]!) + R[8]! * (l.z - C[2]!)).filter((z) => Number.isFinite(z) && z > 0).sort((a, b) => a - b);
    if (depths.length < 6) return;
    const median = depths[Math.floor(depths.length / 2)]!;
    if (median >= minDepth && median <= maxDepth) return;
    const s = Math.max(0.7, Math.min(1.4, targetDepth / median));
    const scalePoint = (t: CameraPose["translation"]): CameraPose["translation"] => [t[0]! * s, t[1]! * s, t[2]! * s];
    const scaledMap = { ...map, landmarks: map.landmarks.map((l) => ({ ...l, x: l.x * s, y: l.y * s, z: l.z * s })), keyframes: map.keyframes.map((k) => k.pose ? { ...k, pose: { rotation: k.pose.rotation, translation: scalePoint(k.pose.translation) } } : k) };
    const scaledPoses = { ...poses, poses: poses.poses.map((p) => ({ ...p, pose: { rotation: p.pose.rotation, translation: scalePoint(p.pose.translation) } })) };
    if (!validateSnapshot(scaledMap) || !validatePoseGraph(scaledPoses)) return;
    if (!this.map.commitSnapshot(map.version, scaledMap)) return;
    if (!this.poses.commit(poses.version, scaledPoses)) throw new Error("Pose graph changed while renormalizing scale.");
    this.referencePose = { rotation: referencePose.rotation, translation: scalePoint(referencePose.translation) };
  }
  snapshot(): ReconstructionSessionSnapshot | undefined { return this.session; }
  /** Per-landmark RGB sampled from the live frames when each point was
   * triangulated. Keys survive bundle-adjustment commits (landmark ids are
   * stable), so it stays valid for the PLY export after the scan stops. */
  colors(): ReadonlyMap<string, LandmarkColor> { return this.landmarkColors; }
  /** Recent mapped keyframes (newest first) with their stored descriptors,
   * for relocalizing after a tracking blackout. Poses are looked up live so a
   * bundle-adjusted candidate can't re-anchor onto a stale pose. */
  relocalizationFrames(limit = 40): { id: string; pose: CameraPose; features: FeatureSet; signature: number[] }[] {
    const out: { id: string; pose: CameraPose; features: FeatureSet; signature: number[] }[] = [];
    for (let index = this.keyframeMemory.length - 1; index >= 0 && out.length < limit; index -= 1) {
      const entry = this.keyframeMemory[index]!;
      const pose = this.poses.get(entry.id)?.pose;
      if (pose) out.push({ id: entry.id, pose, features: entry.features, signature: entry.signature });
    }
    return out;
  }
  /** Re-anchor tracking onto a relocalized pose WITHOUT discarding the map:
   * the frame becomes a new (free, not fixed) keyframe and the tracking
   * reference, so geometry captured before the blackout still refines. */
  reanchor(frame: CaptureFrame, pose: CameraPose): CaptureStepResult {
    if (frame.features.keypoints.length < 4 || !this.reference || !this.session) return this.initialize(frame, pose);
    this.map.addKeyframe({ id: frame.id, frameIndex: frame.frameIndex, timestampMs: frame.timestampMs, landmarkIds: [], pose });
    this.poses.add({ id: frame.id, frameIndex: frame.frameIndex, timestampMs: frame.timestampMs, pose, fixed: false });
    this.reference = frame; this.referencePose = pose; this.referenceTimestampMs = frame.timestampMs;
    this.session = createReconstructionSession(this.map.snapshot(), this.poses.snapshot(), this.observations, { intrinsics: this.options.intrinsics, distortion: this.options.distortion }, frame.timestampMs);
    return { accepted: true, keyframeInserted: true, reason: "tracked", confidence: 1, inliers: frame.features.keypoints.length, session: this.session };
  }
  /** Long scans grow keyframes, poses and observations without bound. Once a
   * scan is closed, the oldest keyframes contribute almost nothing to new
   * triangulation (the reference window is the last keyframe) but dominate
   * memory and bundle-adjustment cost. Drop to the newest `maxKeyframes`,
   * keeping the reference keyframe, and drop observations that pointed at
   * culled frames. Landmarks survive — their 3D positions still render. If
   * anything fails validation the cull is skipped entirely. */
  private cullOldKeyframes(maxKeyframes = 240): void {
    const map = this.map.snapshot();
    if (map.keyframes.length <= maxKeyframes) return;
    const keep = new Set(map.keyframes.slice(map.keyframes.length - maxKeyframes).map((keyframe) => keyframe.id));
    if (this.reference) keep.add(this.reference.id);
    const culledMap = { ...map, keyframes: map.keyframes.filter((keyframe) => keep.has(keyframe.id)) };
    const poses = this.poses.snapshot();
    const culledPoses = { ...poses, poses: poses.poses.filter((entry) => keep.has(entry.id)) };
    const previousObservations = this.observations;
    this.observations = previousObservations.filter((observation) => keep.has(observation.keyframeId));
    if (!validateSnapshot(culledMap) || !validatePoseGraph(culledPoses) || !this.map.commitSnapshot(map.version, culledMap)) {
      this.observations = previousObservations;
      return;
    }
    if (!this.poses.commit(poses.version, culledPoses)) throw new Error("Pose graph changed while culling keyframes.");
    this.session = createReconstructionSession(this.map.snapshot(), this.poses.snapshot(), this.observations, this.session?.calibration ?? { intrinsics: this.options.intrinsics, distortion: this.options.distortion }, this.session?.createdAtMs ?? Date.now());
  }
  /** Attach loop-closure observations (current keyframe ↔ already-mapped
   * landmarks) so the next bundle adjustment pulls the drifted trajectory
   * back onto the original geometry. */
  closeLoop(keyframeId: string, links: readonly { readonly landmarkId: string; readonly x: number; readonly y: number }[]): boolean {
    if (!this.session || links.length === 0) return false;
    const map = this.map.snapshot();
    if (!map.keyframes.some((keyframe) => keyframe.id === keyframeId)) return false;
    const landmarkIds = new Set(map.landmarks.map((landmark) => landmark.id));
    const linked = new Set(this.observations.filter((observation) => observation.keyframeId === keyframeId).map((observation) => observation.landmarkId));
    let added = 0;
    for (const link of links) {
      if (linked.has(link.landmarkId) || !landmarkIds.has(link.landmarkId)) continue;
      if (!Number.isFinite(link.x) || !Number.isFinite(link.y)) continue;
      this.observations.push({ id: `loop:${keyframeId}:${link.landmarkId}`, keyframeId, landmarkId: link.landmarkId, x: link.x, y: link.y });
      linked.add(link.landmarkId);
      added += 1;
    }
    if (added === 0) return false;
    this.session = createReconstructionSession(this.map.snapshot(), this.poses.snapshot(), this.observations, { intrinsics: this.options.intrinsics, distortion: this.options.distortion }, Date.now());
    return true;
  }
  applyOptimizedSnapshot(snapshot: ReconstructionSessionSnapshot): boolean {
    const currentMap = this.map.snapshot(); const currentPoses = this.poses.snapshot();
    if (!validateReconstructionSession(snapshot) || !validateSnapshot(snapshot.map) || !validatePoseGraph(snapshot.poses) || snapshot.map.version !== currentMap.version + 1 || snapshot.poses.version !== currentPoses.version + 1) return false;
    if (!this.map.commitSnapshot(currentMap.version, snapshot.map)) return false;
    if (!this.poses.commit(currentPoses.version, snapshot.poses)) throw new Error("Pose graph changed while applying optimized reconstruction.");
    this.observations = snapshot.observations.map((observation) => ({ ...observation }));
    this.session = createReconstructionSession(this.map.snapshot(), this.poses.snapshot(), this.observations, snapshot.calibration, snapshot.createdAtMs);
    if (this.reference) this.referencePose = this.poses.get(this.reference.id)?.pose ?? this.referencePose;
    return true;
  }
  reset(): void { this.map.clear(); this.reference = undefined; this.referencePose = undefined; this.referenceTimestampMs = 0; this.observations = []; this.session = undefined; this.keyframeMemory.length = 0; this.landmarkColors.clear(); this.loopClosures = 0; }
}

export /** Average the two observation pixels' colors — the point's true appearance
 * under both views. Out-of-frame samples are skipped, not guessed. */
function samplePairColor(referenceImage: ImageData | undefined, a: { x: number; y: number }, frameImage: ImageData | undefined, b: { x: number; y: number }): LandmarkColor | undefined {
  const left = samplePixelColor(referenceImage, a);
  const right = samplePixelColor(frameImage, b);
  if (!left || !right) return undefined;
  return [(left[0] + right[0]) >> 1, (left[1] + right[1]) >> 1, (left[2] + right[2]) >> 1];
}

function samplePixelColor(image: ImageData | undefined, point: { x: number; y: number }): LandmarkColor | undefined {
  if (!image) return undefined;
  const x = Math.round(point.x), y = Math.round(point.y);
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return undefined;
  const i = (y * image.width + x) * 4;
  return [image.data[i]!, image.data[i + 1]!, image.data[i + 2]!];
}

export function spatialSignature(features: FeatureSet): number[] {
  const bins = new Array<number>(16).fill(0);
  let maxX = 1, maxY = 1;
  for (const kp of features.keypoints) { if (kp.x > maxX) maxX = kp.x; if (kp.y > maxY) maxY = kp.y; }
  for (const kp of features.keypoints) {
    const gx = Math.min(3, Math.floor((kp.x / maxX) * 4));
    const gy = Math.min(3, Math.floor((kp.y / maxY) * 4));
    bins[gy * 4 + gx] += 1;
  }
  const total = features.keypoints.length || 1;
  return bins.map((count) => count / total);
}

export function histogramIntersection(a: readonly number[], b: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.min(a[i]!, b[i]!);
  return sum;
}
