# 1. Product Vision

## 1.1 Product definition

VireForge is a local-first digital-human and 3D creative studio.

The primary workflow is:

Photos -> Analysis -> Reconstruction -> Digital Human -> Scene -> Animation -> Render -> Export

The user should not be forced to stop at a 3D model. The model is an editable creative asset.

## 1.2 Core user journey

### Minimal input

A user can provide one image.

The system should:

- detect whether a person is present
- estimate framing/quality
- segment the person
- estimate pose
- estimate depth
- construct a plausible body/appearance representation
- mark hidden or weakly supported regions as inferred
- present a quality/coverage report
- allow the user to improve the result by adding more views

### High-quality input

The user provides multiple angles.

Recommended capture:

- front
- left three-quarter
- left profile
- right profile
- right three-quarter
- back
- optional close-ups for face, hands, clothing, hair, or other details

The system should classify each image by viewpoint and coverage rather than simply counting files.

## 1.3 Product surfaces

### Capture
- drag/drop upload
- camera capture
- multi-angle guided capture
- framing guidance
- blur/lighting/occlusion checks
- duplicate-angle detection
- missing-view recommendations

### Reconstruction
- single-image mode
- multi-view mode
- progressive refinement
- confidence visualization
- observed/inferred visualization
- pause/resume/cancel
- local caching of intermediate results

### Avatar Studio
- body
- face
- hair
- clothing
- materials
- accessories
- proportions
- appearance controls

### Scene Studio
- environments
- props
- lighting
- cameras
- backgrounds
- fog/particles
- materials
- post effects

### Animation Studio
- rig
- pose editor
- keyframes
- animation clips
- procedural motion
- facial/eye controls
- hand controls
- physics controls
- motion capture

### Render/Export
- still image
- image sequence
- video
- GIF where supported
- GLB/glTF
- USDZ where supported
- project file
- future interchange formats

## 1.4 Product philosophy

The application should always expose uncertainty.

Example:

> Front body: observed
> Back body: inferred
> Right sleeve: partially observed
> Face: high confidence
> Hair rear: low confidence

Do not present an inferred region as if it were directly reconstructed from evidence.

## 1.5 Long-term capability map

```text
                     VireForge
                         |
        +----------------+----------------+
        |                |                |
      Avatar           Scene            Motion
        |                |                |
   body/face         environment       rig
   hair              props             pose
   clothing          lighting          animation
   materials         camera            mocap
        |                |                |
        +----------------+----------------+
                         |
                      Timeline
                         |
                +--------+--------+
                |                 |
              Image             Video
                |                 |
                +--------+--------+
                         |
                       Export
```

## 1.6 Explicit non-goals

The initial product will not:

- require cloud inference
- promise perfect reconstruction from one photograph
- depend on one proprietary reconstruction model
- build a marketplace before the core engine is stable
- silently upload user photographs
