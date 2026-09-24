class TestImageData {
  readonly data: Uint8ClampedArray;
  constructor(readonly width: number, readonly height: number) { this.data = new Uint8ClampedArray(width * height * 4); }
}

Object.defineProperty(globalThis, "ImageData", { configurable: true, value: TestImageData });
Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  configurable: true,
  value: function () {
    return {
      drawImage() {},
      getImageData: (x: number, y: number, width: number, height: number) => new TestImageData(width, height),
    };
  },
});
