import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";

import type {
  PdfCompressionGateway,
  PdfCompressionProgress,
  PdfCompressionResult,
} from "../../application/editor-application";
import type { JpegCodec } from "./optimizer/pdf-structure-optimizer";
import { PdfSmartCompressionGateway } from "./pdf-smart-compression-gateway";

const noise = (length: number): Uint8Array => {
  const data = new Uint8Array(length);
  let seed = 7;
  for (let index = 0; index < length; index += 1) {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    data[index] = (seed >>> 16) & 0xff;
  }
  return data;
};

/** One page with a 1200 x 600 photo drawn 2 x 1 inches (600 DPI). */
const photoPdf = async (): Promise<Uint8Array> => {
  const document = await PDFDocument.create();
  const { context } = document;
  const image = context.register(
    PDFRawStream.of(
      context.obj({
        Type: "XObject",
        Subtype: "Image",
        Width: 1200,
        Height: 600,
        ColorSpace: "DeviceRGB",
        BitsPerComponent: 8,
        Filter: "FlateDecode",
      }),
      context.flateStream(noise(1200 * 600 * 3)).getContents(),
    ),
  );
  const page = document.addPage([612, 792]);
  page.node.setXObject(PDFName.of("Im0"), image);
  page.node.set(
    PDFName.of("Contents"),
    context.register(context.flateStream("q 144 0 0 72 0 0 cm /Im0 Do Q")),
  );
  return document.save();
};

const codec = (): JpegCodec & {
  encodeJpeg: ReturnType<typeof vi.fn<JpegCodec["encodeJpeg"]>>;
} => ({
  transcodeJpeg: vi.fn<JpegCodec["transcodeJpeg"]>(() => Promise.resolve(undefined)),
  encodeJpeg: vi.fn<JpegCodec["encodeJpeg"]>(() =>
    Promise.resolve({ bytes: new Uint8Array(1_000).fill(1), components: 3 }),
  ),
});

const flattenReturning = (result: PdfCompressionResult) => {
  const compress = vi.fn<PdfCompressionGateway["compress"]>(() => Promise.resolve(result));
  const gateway: PdfCompressionGateway = { compress };
  return { gateway, compress };
};

describe("PdfSmartCompressionGateway", () => {
  it.each([
    ["balanced", 300, 150],
    ["strong", 220, 110],
  ] as const)("resamples images for the %s level", async (level, width, height) => {
    const jpeg = codec();
    const flatten = flattenReturning({ ok: true, bytes: new Uint8Array(1) });
    const gateway = new PdfSmartCompressionGateway(jpeg, flatten.gateway);

    const result = await gateway.compress({ bytes: await photoPdf(), level });

    expect(result.ok).toBe(true);
    expect(jpeg.encodeJpeg.mock.calls[0]?.[0]).toMatchObject({ width, height });
    expect(flatten.compress).not.toHaveBeenCalled();
  });

  it("keeps a structured PDF on Maximum when flattening is not smaller", async () => {
    const flatten = flattenReturning({ ok: true, bytes: new Uint8Array(10_000_000) });
    const gateway = new PdfSmartCompressionGateway(codec(), flatten.gateway);

    const result = await gateway.compress({ bytes: await photoPdf(), level: "maximum" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const document = await PDFDocument.load(result.bytes);
    expect(document.getPageCount()).toBe(1);
    expect(result.bytes.byteLength).toBeLessThan(10_000_000);
  });

  it("uses the flattened PDF on Maximum when it is smaller", async () => {
    const flattenedBytes = new Uint8Array([37, 80, 68, 70]);
    const flatten = flattenReturning({ ok: true, bytes: flattenedBytes });
    const gateway = new PdfSmartCompressionGateway(codec(), flatten.gateway);
    const dates = { creationDate: 1_000 };

    const result = await gateway.compress({
      bytes: await photoPdf(),
      level: "maximum",
      documentDates: dates,
    });

    expect(result).toEqual({ ok: true, bytes: flattenedBytes });
    expect(flatten.compress).toHaveBeenCalledWith(
      expect.objectContaining({ documentDates: dates }),
    );
  });

  it("reports cancellation from the flattening step", async () => {
    const flatten = flattenReturning({ ok: false, cancelled: true, message: "x" });
    const gateway = new PdfSmartCompressionGateway(codec(), flatten.gateway);

    const result = await gateway.compress({ bytes: await photoPdf(), level: "maximum" });

    expect(result).toEqual({
      ok: false,
      cancelled: true,
      message: "PDF compression was cancelled.",
    });
  });

  it("returns cancelled immediately for an aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const gateway = new PdfSmartCompressionGateway(
      codec(),
      flattenReturning({ ok: true, bytes: new Uint8Array(1) }).gateway,
    );

    const result = await gateway.compress({ bytes: await photoPdf(), signal: controller.signal });

    expect(result).toMatchObject({ ok: false, cancelled: true });
  });

  it("fails without a download for input it cannot restructure", async () => {
    const gateway = new PdfSmartCompressionGateway(
      codec(),
      flattenReturning({ ok: true, bytes: new Uint8Array(1) }).gateway,
    );

    const result = await gateway.compress({ bytes: new Uint8Array([1, 2, 3]) });

    expect(result).toEqual({
      ok: false,
      cancelled: false,
      message: "The PDF could not be compressed in this browser.",
    });
  });

  it("reports progress per image", async () => {
    const progress: PdfCompressionProgress[] = [];
    const gateway = new PdfSmartCompressionGateway(
      codec(),
      flattenReturning({ ok: true, bytes: new Uint8Array(1) }).gateway,
    );

    await gateway.compress({
      bytes: await photoPdf(),
      onProgress: (update) => progress.push(update),
    });

    expect(progress).toEqual([{ currentPage: 1, totalPages: 1, unit: "image" }]);
  });
});
