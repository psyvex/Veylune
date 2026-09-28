import type { InferenceBackend } from "../model";
import type { TensorDtype } from "../engine";

export type TensorLayout = "nchw" | "nhwc";

export interface VisionModelManifest {
  readonly id: string;
  readonly version: string;
  readonly format: "onnx";
  readonly digest: string;
  readonly license: string;
  readonly supportedBackends: readonly InferenceBackend[];
  readonly input: {
    readonly name: string;
    /** `nchw`: `[1, 3, H, W]`. `nhwc`: `[1, H, W, 3]`. Widened from an
     * NCHW-only assumption after `models/movenet-singlepose-lightning/model-card.md`'s
     * "Integration gap" note — that model is NHWC and this manifest shape
     * had never been checked against a real model until then. */
    readonly layout: TensorLayout;
    readonly shape: readonly [number, number, number, number];
    readonly dtype: TensorDtype;
    /** `"none"` for a model whose own graph does input scaling (e.g.
     * MoveNet) — the previous `"0-1" | "mean-std"` union had no way to
     * express that and would have forced a wrong pre-normalization step. */
    readonly normalization: "none" | "0-1" | "mean-std";
  };
  readonly output: {
    readonly name: string;
    readonly rank: number;
    readonly minValues: number;
    readonly maxValues: number;
  };
}

export function validateVisionManifest(manifest: VisionModelManifest): void {
  if (!manifest.id || !manifest.version || manifest.format !== "onnx") throw new Error("Invalid vision model identity.");
  if (!/^[a-f0-9]{64}$/i.test(manifest.digest)) throw new Error("Vision model digest must be SHA-256.");
  if (!manifest.license) throw new Error("Vision model license is required.");
  if (manifest.supportedBackends.length === 0) throw new Error("Vision model must declare a backend.");
  const { shape, layout } = manifest.input;
  if (shape[0] !== 1) throw new Error("Vision model input must have batch size 1.");
  const channels = layout === "nchw" ? shape[1] : shape[3];
  if (channels !== 3) throw new Error(`Vision model input must be RGB (3 channels) in its declared ${layout.toUpperCase()} layout.`);
  const [height, width] = layout === "nchw" ? [shape[2], shape[3]] : [shape[1], shape[2]];
  if (height <= 0 || width <= 0) throw new Error("Vision model dimensions must be positive.");
  if (manifest.output.rank <= 0 || manifest.output.minValues < 1 || manifest.output.maxValues < manifest.output.minValues) {
    throw new Error("Vision model output bounds are invalid.");
  }
}
