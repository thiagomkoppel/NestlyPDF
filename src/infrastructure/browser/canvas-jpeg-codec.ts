import type { EncodedJpeg, JpegCodec } from "../pdf/optimizer/pdf-structure-optimizer";
import type { RasterPixels } from "../pdf/optimizer/pixel-operations";

/** Several mobile browsers refuse canvases above ~16.7 million pixels. */
const MAX_CANVAS_PIXELS = 16_000_000;

/** The parts of a 2D canvas the codec needs, so tests can provide a double. */
export interface JpegCanvas {
  readonly width: number;
  readonly height: number;
  drawBitmap(bitmap: ImageBitmap): void;
  putRgba(rgba: Uint8ClampedArray<ArrayBuffer>): void;
  toJpeg(quality: number): Promise<Blob | null>;
  release(): void;
}

export interface CanvasJpegCodecEnvironment {
  readonly createCanvas: (width: number, height: number) => JpegCanvas | undefined;
  readonly decodeJpeg: (bytes: Uint8Array, width: number, height: number) => Promise<ImageBitmap>;
}

const createBrowserCanvas = (width: number, height: number): JpegCanvas | undefined => {
  const offscreen =
    typeof OffscreenCanvas === "undefined" ? undefined : new OffscreenCanvas(width, height);
  const element = offscreen === undefined ? window.document.createElement("canvas") : undefined;
  if (element !== undefined) {
    element.width = width;
    element.height = height;
  }
  const context = (offscreen ?? element)?.getContext("2d", { alpha: false });
  if (context === null || context === undefined) return undefined;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  return {
    width,
    height,
    drawBitmap: (bitmap) => {
      context.drawImage(bitmap, 0, 0, width, height);
    },
    putRgba: (rgba) => {
      context.putImageData(new ImageData(rgba, width, height), 0, 0);
    },
    toJpeg: (quality) => {
      if (offscreen !== undefined) return offscreen.convertToBlob({ type: "image/jpeg", quality });
      return new Promise((resolve) => {
        element?.toBlob(resolve, "image/jpeg", quality);
      });
    },
    release: () => {
      if (offscreen !== undefined) {
        offscreen.width = 0;
        offscreen.height = 0;
      } else if (element !== undefined) {
        element.width = 0;
        element.height = 0;
      }
    },
  };
};

const decodeBrowserJpeg = (
  bytes: Uint8Array,
  width: number,
  height: number,
): Promise<ImageBitmap> =>
  createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }), {
    // PDF colours are interpreted by the PDF colour space, not by the browser's display profile.
    colorSpaceConversion: "none",
    premultiplyAlpha: "none",
    resizeWidth: width,
    resizeHeight: height,
    resizeQuality: "high",
  });

const toRgba = (pixels: RasterPixels): Uint8ClampedArray<ArrayBuffer> => {
  const rgba = new Uint8ClampedArray(pixels.width * pixels.height * 4);
  for (let pixel = 0, source = 0, target = 0; pixel < pixels.width * pixels.height; pixel += 1) {
    if (pixels.channels === 1) {
      const gray = pixels.data[source] ?? 0;
      rgba[target] = gray;
      rgba[target + 1] = gray;
      rgba[target + 2] = gray;
      source += 1;
    } else {
      rgba[target] = pixels.data[source] ?? 0;
      rgba[target + 1] = pixels.data[source + 1] ?? 0;
      rgba[target + 2] = pixels.data[source + 2] ?? 0;
      source += 3;
    }
    rgba[target + 3] = 255;
    target += 4;
  }
  return rgba;
};

const encode = async (canvas: JpegCanvas, quality: number): Promise<EncodedJpeg | undefined> => {
  const blob = await canvas.toJpeg(quality);
  // A browser without a JPEG encoder silently falls back to PNG, which a PDF cannot embed as DCT.
  if (blob?.type !== "image/jpeg") return undefined;
  // Canvas encoders always write three-component (YCbCr) JPEGs.
  return { bytes: new Uint8Array(await blob.arrayBuffer()), components: 3 };
};

/** JPEG encoding through the browser's own canvas encoder. Nothing leaves the device. */
export class CanvasJpegCodec implements JpegCodec {
  readonly #environment: CanvasJpegCodecEnvironment;

  public constructor(
    environment: CanvasJpegCodecEnvironment = {
      createCanvas: createBrowserCanvas,
      decodeJpeg: decodeBrowserJpeg,
    },
  ) {
    this.#environment = environment;
  }

  public async transcodeJpeg(
    bytes: Uint8Array,
    width: number,
    height: number,
    quality: number,
  ): Promise<EncodedJpeg | undefined> {
    if (width * height > MAX_CANVAS_PIXELS) return undefined;
    const canvas = this.#environment.createCanvas(width, height);
    if (canvas === undefined) return undefined;
    try {
      const bitmap = await this.#environment.decodeJpeg(bytes, width, height);
      try {
        canvas.drawBitmap(bitmap);
      } finally {
        bitmap.close();
      }
      return await encode(canvas, quality);
    } catch {
      // A JPEG the browser cannot decode (CMYK, arithmetic coding, …) is kept as it is.
      return undefined;
    } finally {
      canvas.release();
    }
  }

  public async encodeJpeg(pixels: RasterPixels, quality: number): Promise<EncodedJpeg | undefined> {
    if (pixels.width * pixels.height > MAX_CANVAS_PIXELS) return undefined;
    const canvas = this.#environment.createCanvas(pixels.width, pixels.height);
    if (canvas === undefined) return undefined;
    try {
      canvas.putRgba(toRgba(pixels));
      return await encode(canvas, quality);
    } catch {
      return undefined;
    } finally {
      canvas.release();
    }
  }
}
