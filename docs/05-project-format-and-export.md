# 5. Project Model and Export

## 5.1 Project philosophy

A VireForge project is a creative document, not merely a mesh.

It must be possible to reconstruct the editing state without embedding every runtime cache.

## 5.2 Project structure

Conceptually:

```text
Project
 |
 +-- metadata
 +-- source images
 +-- analyses
 +-- avatar assets
 +-- scene
 +-- materials
 +-- animations
 +-- timeline
 +-- cameras
 +-- lights
 +-- render settings
 +-- export settings
 +-- pipeline/model versions
```

## 5.3 Asset model

Core asset categories:

```text
Avatar
Body
Face
Hair
Clothing
Accessory
Prop
Environment
Material
Animation
Camera
Light
```

Assets have stable IDs.

Instances reference assets rather than duplicating them.

## 5.4 Scene model

A scene contains:

- asset instances
- transforms
- parent/child relationships
- camera
- lights
- environment
- render settings
- timeline bindings

## 5.5 Timeline

Timeline should support:

- keyframes
- animation clips
- camera tracks
- light tracks
- material tracks
- visibility
- effect parameters
- scene transitions

Future extension points:

- audio tracks
- markers
- motion-capture tracks
- procedural tracks

## 5.6 Export categories

### Image

Target:

- PNG
- JPEG
- WebP

Capabilities:

- transparent background
- resolution selection
- supersampling
- shadows
- depth of field
- color management

### Video

Target:

- WebM
- MP4 where browser/platform encoding permits
- image sequence fallback

The renderer should separate frame generation from codec selection.

### 3D

Target:

- GLB
- glTF
- USDZ where practical
- additional interchange formats only when licensing/tooling justifies them

## 5.7 GLB pipeline

```text
Scene/Avatar
 |
v
Validate
 |
v
Optimize geometry
 |
v
Generate/validate normals
 |
v
Generate LODs
 |
v
Compress textures
 |
v
Compress mesh where appropriate
 |
v
Write glTF
 |
v
Pack GLB
 |
v
Validate output
```

## 5.8 Export validation

Every export should be validated for:

- missing buffers
- invalid indices
- invalid normals
- invalid UVs
- broken material references
- unsupported extensions
- corrupt binary structure

## 5.9 Render determinism

The offline renderer should aim for deterministic output for the same:

- project version
- asset versions
- pipeline version
- render settings
- device/profile where deterministic execution is possible

GPU-dependent numerical differences should be documented where unavoidable.

## 5.10 Future export options

Possible future additions:

- USD/USDZ
- FBX through a dedicated conversion path if licensing/tooling permits
- Alembic
- sprite sheets
- turntable GIF
- social-media presets
- transparent video where supported
