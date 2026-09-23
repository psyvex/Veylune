# 54. Deterministic Reconstruction Fixtures

A deterministic synthetic reconstruction fixture now exists for validating optimization plumbing without camera or network input.

The fixture contains a small set of positive-depth landmarks observed by two synthetic cameras with controlled sub-pixel offsets.

## Purpose

The fixture is intended to catch:

- invalid landmark identities
- missing observations
- non-finite coordinates
- insufficient-problem handling
- accidental mutation of the source map during rejected optimization

It is not a substitute for real bundle-adjustment accuracy tests. Once the numerical optimizer is implemented, this fixture should assert measurable reduction in reprojection error and preservation of positive depth.

## Production test layers

1. deterministic unit fixtures
2. synthetic known-pose reconstruction
3. noisy/outlier robustness tests
4. camera-distortion tests
5. device/browser performance tests
6. recorded real-scene regression sequences

The optimization gate must remain closed until the numerical implementation passes these layers.
