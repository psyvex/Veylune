class TestImageData {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  // Supports both real ImageData shapes: new ImageData(width, height) and
  // new ImageData(data, width, height). Silently dropping the passed pixels
  // (as the old two-arg-only version did) made every pixel-level test a test
  // against an all-black image.
  constructor(dataOrWidth: Uint8ClampedArray | number, widthOrHeight: number, height?: number) {
    if (dataOrWidth instanceof Uint8ClampedArray) {
      this.data = dataOrWidth; this.width = widthOrHeight; this.height = height!;
    } else {
      this.width = dataOrWidth; this.height = widthOrHeight; this.data = new Uint8ClampedArray(dataOrWidth * widthOrHeight * 4);
    }
  }
}

Object.defineProperty(globalThis, "ImageData", { configurable: true, value: TestImageData });
// A file that opts into the real Node test environment (`// @vitest-environment
// node`, e.g. a test that needs a genuine Node-realm Buffer for a native
// binding) has no HTMLCanvasElement at all — this setup file still runs for
// it, so guard rather than assume jsdom's DOM globals exist everywhere.
if (typeof HTMLCanvasElement !== "undefined") {
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: function () {
      return {
        drawImage() {},
        getImageData: (x: number, y: number, width: number, height: number) => new TestImageData(width, height),
      };
    },
  });
}
