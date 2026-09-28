import { describe, expect, it } from "vitest";
import { rgbaToNchwTensor, rgbaToNhwcTensor } from "./preprocess";

describe("rgbaToNchwTensor", () => {
  it("normalizes to [0,1] float32 in planar RGB order by default", () => {
    const rgba = Uint8Array.from([255, 0, 128, 255, 0, 255, 64, 255]); // 2 pixels
    const tensor = rgbaToNchwTensor(rgba, { width: 2, height: 1 });
    expect(tensor.shape).toEqual([1, 3, 1, 2]);
    expect(tensor.dtype).toBe("float32");
    // R plane: [1.0, 0.0]
    expect(tensor.data[0]).toBeCloseTo(1.0, 5);
    expect(tensor.data[1]).toBeCloseTo(0.0, 5);
  });

  it("rejects a frame size that doesn't match the declared dimensions", () => {
    expect(() => rgbaToNchwTensor(new Uint8Array(4), { width: 2, height: 1 })).toThrow();
  });
});

describe("rgbaToNhwcTensor", () => {
  it("produces an unnormalized int32 NHWC tensor by default (e.g. for MoveNet)", () => {
    const rgba = Uint8Array.from([255, 0, 128, 255, 0, 255, 64, 255]); // 2 pixels
    const tensor = rgbaToNhwcTensor(rgba, { width: 2, height: 1 });
    expect(tensor.shape).toEqual([1, 1, 2, 3]);
    expect(tensor.dtype).toBe("int32");
    expect(Array.from(tensor.data as Int32Array)).toEqual([255, 0, 128, 0, 255, 64]);
  });

  it("supports uint8 output on request", () => {
    const rgba = Uint8Array.from([10, 20, 30, 255]);
    const tensor = rgbaToNhwcTensor(rgba, { width: 1, height: 1, dtype: "uint8" });
    expect(tensor.dtype).toBe("uint8");
    expect(tensor.data).toBeInstanceOf(Uint8Array);
    expect(Array.from(tensor.data)).toEqual([10, 20, 30]);
  });

  it("rejects a frame size that doesn't match the declared dimensions", () => {
    expect(() => rgbaToNhwcTensor(new Uint8Array(4), { width: 2, height: 1 })).toThrow();
  });
});
