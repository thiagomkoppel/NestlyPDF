/** Raw 8-bit pixel buffers as they come out of a decoded PDF image stream. */
export interface RasterPixels {
  readonly width: number;
  readonly height: number;
  /** 1 = gray, 3 = RGB. */
  readonly channels: 1 | 3;
  readonly data: Uint8Array;
}

const paeth = (left: number, up: number, upLeft: number): number => {
  const estimate = left + up - upLeft;
  const toLeft = Math.abs(estimate - left);
  const toUp = Math.abs(estimate - up);
  const toUpLeft = Math.abs(estimate - upLeft);
  if (toLeft <= toUp && toLeft <= toUpLeft) return left;
  if (toUp <= toUpLeft) return up;
  return upLeft;
};

/**
 * Reverses the PNG row predictors a PDF FlateDecode stream may declare (`/Predictor` >= 10).
 * Returns undefined when the data is shorter than the declared geometry.
 */
export const removePngPredictor = (
  data: Uint8Array,
  rowBytes: number,
  bytesPerPixel: number,
  rows: number,
): Uint8Array | undefined => {
  const stride = rowBytes + 1;
  if (data.length < stride * rows) return undefined;
  const output = new Uint8Array(rowBytes * rows);
  for (let row = 0; row < rows; row += 1) {
    const filter = data[row * stride] ?? 0;
    const source = row * stride + 1;
    const target = row * rowBytes;
    const previous = target - rowBytes;
    for (let column = 0; column < rowBytes; column += 1) {
      const raw = data[source + column] ?? 0;
      const left = column >= bytesPerPixel ? (output[target + column - bytesPerPixel] ?? 0) : 0;
      const up = row > 0 ? (output[previous + column] ?? 0) : 0;
      const upLeft =
        row > 0 && column >= bytesPerPixel ? (output[previous + column - bytesPerPixel] ?? 0) : 0;
      let value: number;
      switch (filter) {
        case 0:
          value = raw;
          break;
        case 1:
          value = raw + left;
          break;
        case 2:
          value = raw + up;
          break;
        case 3:
          value = raw + ((left + up) >> 1);
          break;
        case 4:
          value = raw + paeth(left, up, upLeft);
          break;
        default:
          return undefined;
      }
      output[target + column] = value & 0xff;
    }
  }
  return output;
};

const absoluteSignedByte = (value: number): number => (value < 128 ? value : 256 - value);

/**
 * PNG row prediction for Flate image streams (`/Predictor 15`). Each row picks the filter with
 * the smallest sum of absolute residuals — the same heuristic libpng uses — which typically
 * makes screenshots and masks compress several times better than unpredicted Flate.
 */
export const applyPngPredictor = (pixels: RasterPixels): Uint8Array => {
  const bytesPerPixel = pixels.channels;
  const rowBytes = pixels.width * bytesPerPixel;
  const output = new Uint8Array((rowBytes + 1) * pixels.height);
  const candidate = new Uint8Array(rowBytes);
  const best = new Uint8Array(rowBytes);
  const { data } = pixels;
  for (let row = 0; row < pixels.height; row += 1) {
    const current = row * rowBytes;
    const previous = current - rowBytes;
    let bestFilter = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let filter = 0; filter <= 4; filter += 1) {
      let score = 0;
      for (let column = 0; column < rowBytes; column += 1) {
        const raw = data[current + column] ?? 0;
        const left = column >= bytesPerPixel ? (data[current + column - bytesPerPixel] ?? 0) : 0;
        const up = row > 0 ? (data[previous + column] ?? 0) : 0;
        const upLeft =
          row > 0 && column >= bytesPerPixel ? (data[previous + column - bytesPerPixel] ?? 0) : 0;
        const predicted =
          filter === 0
            ? 0
            : filter === 1
              ? left
              : filter === 2
                ? up
                : filter === 3
                  ? (left + up) >> 1
                  : paeth(left, up, upLeft);
        const residual = (raw - predicted) & 0xff;
        candidate[column] = residual;
        score += absoluteSignedByte(residual);
        if (score >= bestScore) break;
      }
      if (score < bestScore) {
        bestScore = score;
        bestFilter = filter;
        best.set(candidate);
      }
    }
    const offset = row * (rowBytes + 1);
    output[offset] = bestFilter;
    output.set(best, offset + 1);
  }
  return output;
};

/**
 * Area-average downsampling. Each output pixel is the mean of the source pixels it covers, which
 * keeps thin strokes in scanned text visible instead of dropping them the way nearest-neighbour
 * sampling would.
 */
export const downsamplePixels = (
  source: RasterPixels,
  width: number,
  height: number,
): RasterPixels => {
  const targetWidth = Math.max(1, Math.min(source.width, Math.round(width)));
  const targetHeight = Math.max(1, Math.min(source.height, Math.round(height)));
  if (targetWidth === source.width && targetHeight === source.height) return source;
  const { channels } = source;
  const output = new Uint8Array(targetWidth * targetHeight * channels);
  const xRatio = source.width / targetWidth;
  const yRatio = source.height / targetHeight;
  const sums = new Float64Array(channels);
  const sourceData = source.data;
  for (let y = 0; y < targetHeight; y += 1) {
    const rowStart = Math.floor(y * yRatio);
    const rowEnd = Math.max(rowStart + 1, Math.floor((y + 1) * yRatio));
    for (let x = 0; x < targetWidth; x += 1) {
      const columnStart = Math.floor(x * xRatio);
      const columnEnd = Math.max(columnStart + 1, Math.floor((x + 1) * xRatio));
      sums.fill(0);
      for (let sourceY = rowStart; sourceY < rowEnd; sourceY += 1) {
        let offset = (sourceY * source.width + columnStart) * channels;
        for (let sourceX = columnStart; sourceX < columnEnd; sourceX += 1) {
          for (let channel = 0; channel < channels; channel += 1) {
            sums[channel] = (sums[channel] ?? 0) + (sourceData[offset + channel] ?? 0);
          }
          offset += channels;
        }
      }
      const weight = (rowEnd - rowStart) * (columnEnd - columnStart);
      const outputOffset = (y * targetWidth + x) * channels;
      for (let channel = 0; channel < channels; channel += 1) {
        output[outputOffset + channel] = Math.round((sums[channel] ?? 0) / weight);
      }
    }
  }
  return { width: targetWidth, height: targetHeight, channels, data: output };
};

/**
 * True when the image looks like a screenshot, chart or line art (few distinct colours). Those
 * stay lossless: JPEG would blur their hard edges and is usually larger for them anyway.
 */
export const hasFewDistinctColors = (
  pixels: RasterPixels,
  // A gray scan always has close to 256 levels, so gray line art has to be judged stricter.
  limit = pixels.channels === 1 ? 32 : 256,
): boolean => {
  const totalPixels = pixels.width * pixels.height;
  const step = Math.max(1, Math.floor(totalPixels / 65_536));
  const seen = new Set<number>();
  for (let pixel = 0; pixel < totalPixels; pixel += step) {
    const offset = pixel * pixels.channels;
    const key =
      pixels.channels === 1
        ? (pixels.data[offset] ?? 0)
        : ((pixels.data[offset] ?? 0) << 16) |
          ((pixels.data[offset + 1] ?? 0) << 8) |
          (pixels.data[offset + 2] ?? 0);
    seen.add(key);
    if (seen.size > limit) return false;
  }
  return true;
};

/** Gray-only RGB data (every pixel has R = G = B) can be stored with one channel. */
export const isGrayscaleRgb = (pixels: RasterPixels, tolerance = 2): boolean => {
  if (pixels.channels === 1) return true;
  const { data } = pixels;
  for (let offset = 0; offset < data.length; offset += 3) {
    const red = data[offset] ?? 0;
    const green = data[offset + 1] ?? 0;
    const blue = data[offset + 2] ?? 0;
    if (Math.abs(red - green) > tolerance || Math.abs(green - blue) > tolerance) return false;
  }
  return true;
};

export const rgbToGray = (pixels: RasterPixels): RasterPixels => {
  if (pixels.channels === 1) return pixels;
  const gray = new Uint8Array(pixels.width * pixels.height);
  for (let pixel = 0, offset = 0; pixel < gray.length; pixel += 1, offset += 3) {
    gray[pixel] = Math.round(
      ((pixels.data[offset] ?? 0) +
        (pixels.data[offset + 1] ?? 0) +
        (pixels.data[offset + 2] ?? 0)) /
        3,
    );
  }
  return { width: pixels.width, height: pixels.height, channels: 1, data: gray };
};
