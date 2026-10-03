import { describe, expect, it, vi } from "vitest";

import {
  CanvasJpegCodec,
  type CanvasJpegCodecEnvironment,
  type JpegCanvas,
} from "./canvas-jpeg-codec";

const blobOf = (type: string, bytes: number[]): Blob => new Blob([new Uint8Array(bytes)], { type });

const fakeCanvas = (
  width: number,
  height: number,
  output: Blob | null = blobOf("image/jpeg", [0xff, 0xd8, 0xff]),
) => {
  const canvas = {
    width,
    height,
    drawBitmap: vi.fn<JpegCanvas["drawBitmap"]>(),
    putRgba: vi.fn<JpegCanvas["putRgba"]>(),
    toJpeg: vi.fn<JpegCanvas["toJpeg"]>(() => Promise.resolve(output)),
    release: vi.fn<JpegCanvas["release"]>(),
  };
  return canvas;
};

const environment = (canvas: ReturnType<typeof fakeCanvas> | undefined) => {
  const close = vi.fn();
  const bitmap = { close } as unknown as ImageBitmap;
  const env = {
    createCanvas: vi.fn<CanvasJpegCodecEnvironment["createCanvas"]>(() => canvas),
    decodeJpeg: vi.fn<CanvasJpegCodecEnvironment["decodeJpeg"]>(() => Promise.resolve(bitmap)),
  };
  return { env, bitmap, close };
};

describe("CanvasJpegCodec", () => {
  it("decodes at the target size, encodes at the requested quality and releases everything", async () => {
    const canvas = fakeCanvas(300, 150);
    const { env, bitmap, close } = environment(canvas);
    const codec = new CanvasJpegCodec(env);
    const source = new Uint8Array([1, 2, 3]);

    const result = await codec.transcodeJpeg(source, 300, 150, 0.7);

    expect(env.decodeJpeg).toHaveBeenCalledWith(source, 300, 150);
    expect(canvas.drawBitmap).toHaveBeenCalledWith(bitmap);
    expect(canvas.toJpeg).toHaveBeenCalledWith(0.7);
    expect(result).toEqual({ bytes: new Uint8Array([0xff, 0xd8, 0xff]), components: 3 });
    expect(close).toHaveBeenCalled();
    expect(canvas.release).toHaveBeenCalled();
  });

  it("expands gray pixels to opaque RGBA for the canvas", async () => {
    const canvas = fakeCanvas(2, 1);
    const codec = new CanvasJpegCodec(environment(canvas).env);

    await codec.encodeJpeg(
      { width: 2, height: 1, channels: 1, data: new Uint8Array([10, 200]) },
      0.8,
    );

    expect(canvas.putRgba).toHaveBeenCalledWith(
      new Uint8ClampedArray([10, 10, 10, 255, 200, 200, 200, 255]),
    );
  });

  it("gives up when the browser falls back to another format", async () => {
    const canvas = fakeCanvas(2, 1, blobOf("image/png", [1]));
    const codec = new CanvasJpegCodec(environment(canvas).env);

    const result = await codec.encodeJpeg(
      { width: 2, height: 1, channels: 3, data: new Uint8Array(6) },
      0.8,
    );

    expect(result).toBeUndefined();
    expect(canvas.release).toHaveBeenCalled();
  });

  it("keeps the original when the browser cannot decode the JPEG", async () => {
    const canvas = fakeCanvas(10, 10);
    const { env } = environment(canvas);
    env.decodeJpeg.mockRejectedValueOnce(new Error("CMYK"));
    const codec = new CanvasJpegCodec(env);

    expect(await codec.transcodeJpeg(new Uint8Array(1), 10, 10, 0.7)).toBeUndefined();
    expect(canvas.release).toHaveBeenCalled();
  });

  it("refuses canvases larger than mobile browsers allow", async () => {
    const { env } = environment(fakeCanvas(1, 1));
    const codec = new CanvasJpegCodec(env);

    expect(await codec.transcodeJpeg(new Uint8Array(1), 5_000, 5_000, 0.7)).toBeUndefined();
    expect(env.createCanvas).not.toHaveBeenCalled();
  });

  it("gives up when no 2D canvas is available", async () => {
    const codec = new CanvasJpegCodec(environment(undefined).env);
    expect(
      await codec.encodeJpeg({ width: 1, height: 1, channels: 3, data: new Uint8Array(3) }, 0.8),
    ).toBeUndefined();
  });
});
