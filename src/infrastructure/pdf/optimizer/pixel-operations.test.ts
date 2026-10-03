import { describe, expect, it } from "vitest";

import {
  applyPngPredictor,
  downsamplePixels,
  hasFewDistinctColors,
  isGrayscaleRgb,
  removePngPredictor,
  rgbToGray,
  type RasterPixels,
} from "./pixel-operations";

const pseudoRandomPixels = (width: number, height: number, channels: 1 | 3): RasterPixels => {
  const data = new Uint8Array(width * height * channels);
  let seed = 12345;
  for (let index = 0; index < data.length; index += 1) {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    data[index] = (seed >>> 16) & 0xff;
  }
  return { width, height, channels, data };
};

describe("pixel operations", () => {
  it.each([1, 3] as const)("round-trips PNG prediction for %i-channel images", (channels) => {
    const pixels = pseudoRandomPixels(17, 9, channels);
    const predicted = applyPngPredictor(pixels);
    expect(predicted.length).toBe((17 * channels + 1) * 9);
    expect(removePngPredictor(predicted, 17 * channels, channels, 9)).toEqual(pixels.data);
  });

  it("picks a predictor that turns smooth gradients into near-zero residuals", () => {
    const width = 64;
    const data = new Uint8Array(width * 4);
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < width; column += 1) data[row * width + column] = column;
    }
    const predicted = applyPngPredictor({ width, height: 4, channels: 1, data });
    const residuals = [...predicted].filter((_, index) => index % (width + 1) !== 0);
    expect(residuals.filter((value) => value > 1)).toHaveLength(0);
  });

  it("rejects predictor data that is shorter than the declared image", () => {
    expect(removePngPredictor(new Uint8Array(5), 4, 1, 2)).toBeUndefined();
  });

  it("averages the source area covered by each output pixel", () => {
    const source: RasterPixels = {
      width: 4,
      height: 2,
      channels: 1,
      data: new Uint8Array([0, 100, 200, 200, 100, 200, 0, 0]),
    };
    expect(downsamplePixels(source, 2, 1)).toEqual({
      width: 2,
      height: 1,
      channels: 1,
      data: new Uint8Array([100, 100]),
    });
  });

  it("never upsamples", () => {
    const source = pseudoRandomPixels(3, 3, 3);
    expect(downsamplePixels(source, 30, 30)).toBe(source);
  });

  it("separates flat-colour artwork from photographic content", () => {
    const flat: RasterPixels = {
      width: 100,
      height: 100,
      channels: 3,
      data: new Uint8Array(100 * 100 * 3).map((_, index) => (index % 300 < 150 ? 20 : 240)),
    };
    expect(hasFewDistinctColors(flat)).toBe(true);
    expect(hasFewDistinctColors(pseudoRandomPixels(100, 100, 3))).toBe(false);
    // A gray scan uses nearly every level, so it must not be mistaken for line art.
    expect(hasFewDistinctColors(pseudoRandomPixels(100, 100, 1))).toBe(false);
  });

  it("recognises gray-only RGB data and stores it with one channel", () => {
    const gray: RasterPixels = {
      width: 2,
      height: 1,
      channels: 3,
      data: new Uint8Array([10, 11, 10, 200, 200, 201]),
    };
    expect(isGrayscaleRgb(gray)).toBe(true);
    expect(rgbToGray(gray)).toEqual({
      width: 2,
      height: 1,
      channels: 1,
      data: new Uint8Array([10, 200]),
    });
    expect(isGrayscaleRgb({ ...gray, data: new Uint8Array([10, 90, 10, 0, 0, 0]) })).toBe(false);
  });
});
