# 3. Reconstruction Pipeline

## 3.1 Design objective

Produce the highest-quality digital human possible from the available evidence while explicitly representing uncertainty.

The pipeline must support both:

1. single-image inference
2. multi-view reconstruction

## 3.2 Input normalization

For every image:

1. decode
2. validate dimensions
3. normalize color space
4. normalize orientation
5. create analysis resolution
6. preserve original for texture work
7. calculate image quality metrics

Quality metrics may include:

- blur
- exposure
- contrast
- compression artifacts
- subject size
- crop completeness
- occlusion
- background complexity

## 3.3 Subject analysis

Run:

- person detection
- person segmentation
- pose estimation
- face detection/landmarks
- optional hand landmarks
- optional hair segmentation
- optional clothing segmentation

Store results as versioned analysis artifacts.

## 3.4 View classification

Each image gets a viewpoint estimate:

```text
front
front-left
left
back-left
back
back-right
right
front-right
unknown
```

Also record viewpoint confidence.

Do not assume filename semantics.

## 3.5 Coverage analysis

Construct a coverage map over body/appearance regions.

Example:

```text
head
face
neck
torso
left arm
right arm
left hand
right hand
pelvis
left leg
right leg
feet
hair front
hair back
clothing front
clothing back
```

Each region stores:

- number of useful views
- visibility
- image quality
- occlusion
- confidence

## 3.6 Capture guidance

Before reconstruction, calculate the highest-value missing evidence.

Example:

```text
Current:
front = excellent
left = good
right = weak
back = missing

Recommendation:
Add a back photo.
Optional: add right profile.
```

The recommendation engine should prioritize information gain, not simply request a fixed number of photos.

## 3.7 Single-image pipeline

```text
Image
 |
 +-- segmentation
 +-- pose
 +-- face
 +-- depth
 |
v
Body/shape prior
 |
v
Visible geometry fitting
 |
v
Hidden geometry completion
 |
v
Texture projection
 |
v
Confidence classification
```

Single-image hidden regions must be marked inferred.

## 3.8 Multi-view pipeline

```text
Images
 |
v
Analysis
 |
v
View grouping
 |
v
Feature correspondences
 |
v
Camera estimation
 |
v
Per-view depth
 |
v
Depth/point fusion
 |
v
Surface reconstruction
 |
v
Mesh cleanup
 |
v
Texture projection
 |
v
Detail refinement
 |
v
Confidence
```

## 3.9 Camera estimation

Maintain a consistent coordinate convention across the entire engine.

Store:

- intrinsics
- extrinsics
- image resolution
- distortion parameters if available
- confidence/error metrics

Coordinate conversions must be tested explicitly.

## 3.10 Geometry stages

### Stage A: coarse body

Build a stable watertight-ish base representation.

### Stage B: observed surface

Use multi-view evidence where available.

### Stage C: inferred surface

Complete unseen regions using the chosen prior/model.

### Stage D: cleanup

- remove degenerate triangles
- repair normals
- remove isolated fragments
- detect self-intersections where practical
- validate topology
- generate LODs

## 3.11 Texture stages

1. identify visible texture regions
2. project observations into texture space
3. resolve conflicts
4. fill missing regions
5. generate maps
6. compress for runtime
7. retain source metadata

Potential maps:

- base color
- normal
- roughness
- metallic if applicable
- opacity
- emission where applicable

## 3.12 Confidence

Confidence is not a claim of scientific probability.

It is a product-level evidence score derived from:

- number of views
- view diversity
- image quality
- visibility
- model agreement
- reprojection consistency
- completion amount

Store separate dimensions where possible:

```text
geometryConfidence
textureConfidence
poseConfidence
identity/detailConfidence
```

## 3.13 Progressive reconstruction

The UI should show meaningful intermediate results:

```text
Stage 1  Analysis
Stage 2  Coarse shape
Stage 3  Surface refinement
Stage 4  Texture
Stage 5  Optimization
Stage 6  Ready
```

The user can cancel without losing earlier valid artifacts.

## 3.14 Quality gates

A reconstruction should fail or warn if:

- no reliable person was detected
- subject coverage is insufficient for requested quality
- camera estimation is unstable
- geometry contains unacceptable corruption
- memory budget cannot safely complete
- required model is unavailable

The system should prefer a lower-quality valid result over a corrupted result.
