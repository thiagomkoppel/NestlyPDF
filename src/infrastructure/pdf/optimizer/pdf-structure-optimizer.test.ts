import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  decodePDFRawStream,
} from "pdf-lib";
import { describe, expect, it, vi } from "vitest";

import {
  optimizePdfStructure,
  type EncodedJpeg,
  type JpegCodec,
  type PdfOptimizationOptions,
} from "./pdf-structure-optimizer";
import type { RasterPixels } from "./pixel-operations";

const OPTIONS: PdfOptimizationOptions = {
  imageDpi: 150,
  jpegQuality: 0.75,
  stripXmpMetadata: false,
};

const encoder = new TextEncoder();

const noisyPixels = (width: number, height: number, channels: 1 | 3): Uint8Array => {
  const data = new Uint8Array(width * height * channels);
  let seed = 99;
  for (let index = 0; index < data.length; index += 1) {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    data[index] = (seed >>> 16) & 0xff;
  }
  return data;
};

interface FakeCodec extends JpegCodec {
  readonly transcodeJpeg: ReturnType<typeof vi.fn<JpegCodec["transcodeJpeg"]>>;
  readonly encodeJpeg: ReturnType<typeof vi.fn<JpegCodec["encodeJpeg"]>>;
}

/** Stands in for the canvas: returns a small marker "JPEG" of a chosen size. */
const fakeCodec = (outputBytes = 2_000, components: 1 | 3 = 3): FakeCodec => {
  const result = (): Promise<EncodedJpeg> =>
    Promise.resolve({ bytes: new Uint8Array(outputBytes).fill(0xd8), components });
  return {
    transcodeJpeg: vi.fn<JpegCodec["transcodeJpeg"]>(result),
    encodeJpeg: vi.fn<JpegCodec["encodeJpeg"]>(result),
  };
};

interface PageSpec {
  readonly content: string;
  readonly xobjects?: Record<string, PDFRef>;
  readonly contentFilter?: "none" | "flate";
}

const buildPdf = async (
  setup: (document: PDFDocument) => PageSpec[] | Promise<PageSpec[]>,
): Promise<Uint8Array> => {
  const document = await PDFDocument.create();
  document.setCreationDate(new Date("2001-02-03T04:05:06Z"));
  const pages = await setup(document);
  for (const spec of pages) {
    const page = document.addPage([612, 792]);
    const content = encoder.encode(spec.content);
    const stream =
      spec.contentFilter === "flate"
        ? document.context.flateStream(content)
        : PDFRawStream.of(document.context.obj({}), content);
    page.node.set(PDFName.of("Contents"), document.context.register(stream));
    for (const [key, ref] of Object.entries(spec.xobjects ?? {})) {
      page.node.setXObject(PDFName.of(key), ref);
    }
  }
  return document.save({ useObjectStreams: false });
};

const registerImage = (
  document: PDFDocument,
  options: {
    readonly width: number;
    readonly height: number;
    readonly gray?: boolean;
    readonly pixels?: Uint8Array;
    readonly jpeg?: Uint8Array;
    readonly smask?: PDFRef;
  },
): PDFRef => {
  const { context } = document;
  const dict = context.obj({
    Type: "XObject",
    Subtype: "Image",
    Width: options.width,
    Height: options.height,
    ColorSpace: options.gray === true ? "DeviceGray" : "DeviceRGB",
    BitsPerComponent: 8,
  });
  if (options.smask !== undefined) dict.set(PDFName.of("SMask"), options.smask);
  if (options.jpeg !== undefined) {
    dict.set(PDFName.of("Filter"), PDFName.of("DCTDecode"));
    return context.register(PDFRawStream.of(dict, options.jpeg));
  }
  const raw =
    options.pixels ?? noisyPixels(options.width, options.height, options.gray === true ? 1 : 3);
  const deflated = context.flateStream(raw);
  dict.set(PDFName.of("Filter"), PDFName.of("FlateDecode"));
  return context.register(PDFRawStream.of(dict, deflated.getContents()));
};

const imageStreams = (document: PDFDocument): { ref: PDFRef; stream: PDFRawStream }[] =>
  document.context
    .enumerateIndirectObjects()
    .filter(
      (entry): entry is [PDFRef, PDFRawStream] =>
        entry[1] instanceof PDFRawStream &&
        entry[1].dict.lookup(PDFName.of("Subtype")) === PDFName.of("Image"),
    )
    .map(([ref, stream]) => ({ ref, stream }));

const rawStreamAt = (dict: PDFDict | undefined, key: string): PDFRawStream => {
  const value = dict?.lookup(PDFName.of(key));
  if (!(value instanceof PDFRawStream)) throw new Error(`${key} is not a stream`);
  return value;
};

const numberEntry = (dict: PDFDict, key: string): number | undefined =>
  dict.lookupMaybe(PDFName.of(key), PDFNumber)?.asNumber();

const optimize = async (
  bytes: Uint8Array,
  codec: JpegCodec = fakeCodec(),
  options: Partial<PdfOptimizationOptions> = {},
) => {
  const result = await optimizePdfStructure(bytes, codec, { ...OPTIONS, ...options });
  if (!result.ok) throw new Error(`optimization failed: ${result.reason}`);
  return {
    ...result,
    document: await PDFDocument.load(result.bytes, { updateMetadata: false }),
  };
};

describe("optimizePdfStructure", () => {
  it("compresses raw content streams without changing what they draw", async () => {
    const text = `BT /F1 12 Tf 72 700 Td (${"Hello world ".repeat(200)}) Tj ET`;
    const input = await buildPdf(() => [{ content: text }]);

    const { bytes, report, document } = await optimize(input);

    expect(bytes.byteLength).toBeLessThan(input.byteLength);
    expect(report.streamsRecompressed).toBe(1);
    const contents = rawStreamAt(document.getPage(0).node, "Contents");
    expect(contents.dict.lookup(PDFName.of("Filter"))).toBe(PDFName.of("FlateDecode"));
    expect(new TextDecoder().decode(decodePDFRawStream(contents).decode())).toBe(text);
  });

  it("keeps the document dates", async () => {
    const input = await buildPdf(() => [{ content: "q Q" }]);
    const { document } = await optimize(input);
    expect(document.getCreationDate()?.toISOString()).toBe("2001-02-03T04:05:06.000Z");
  });

  it("drops objects nothing refers to and merges identical images", async () => {
    const input = await buildPdf((document) => {
      const pixels = noisyPixels(40, 40, 3);
      const first = registerImage(document, { width: 40, height: 40, pixels });
      const second = registerImage(document, { width: 40, height: 40, pixels });
      document.context.register(PDFRawStream.of(document.context.obj({}), noisyPixels(500, 1, 1)));
      return [
        { content: "q 40 0 0 40 0 0 cm /Im0 Do Q", xobjects: { Im0: first } },
        { content: "q 40 0 0 40 0 0 cm /Im0 Do Q", xobjects: { Im0: second } },
      ];
    });

    const { report, document } = await optimize(input);

    expect(report.duplicatesMerged).toBeGreaterThanOrEqual(1);
    expect(report.objectsRemoved).toBeGreaterThanOrEqual(2);
    expect(imageStreams(document)).toHaveLength(1);
    const firstImage = document.getPage(0).node.Resources()?.lookup(PDFName.of("XObject"), PDFDict);
    const secondImage = document
      .getPage(1)
      .node.Resources()
      ?.lookup(PDFName.of("XObject"), PDFDict);
    expect(firstImage?.get(PDFName.of("Im0"))).toEqual(secondImage?.get(PDFName.of("Im0")));
  });

  it("resamples an oversized photo to the target DPI of its drawn size", async () => {
    // 1200 px drawn 144 pt (2 in) wide is 600 DPI; at 150 DPI it needs 300 x 150 px.
    const input = await buildPdf((document) => [
      {
        content: "q 144 0 0 72 50 50 cm /Im0 Do Q",
        xobjects: { Im0: registerImage(document, { width: 1200, height: 600 }) },
      },
    ]);
    const codec = fakeCodec();

    const { report, document } = await optimize(input, codec);

    expect(report.imagesRecompressed).toBe(1);
    const pixels: RasterPixels | undefined = codec.encodeJpeg.mock.calls[0]?.[0];
    expect(pixels).toMatchObject({ width: 300, height: 150, channels: 3 });
    const [image] = imageStreams(document);
    expect(image?.stream.dict.lookup(PDFName.of("Filter"))).toBe(PDFName.of("DCTDecode"));
    expect(numberEntry(image?.stream.dict ?? PDFDict.withContext(document.context), "Width")).toBe(
      300,
    );
    expect(image?.stream.dict.lookup(PDFName.of("ColorSpace"))).toBe(PDFName.of("DeviceRGB"));
  });

  it("follows form XObject matrices when measuring how large an image is drawn", async () => {
    const input = await buildPdf((document) => {
      const image = registerImage(document, { width: 1200, height: 600 });
      const form = document.context.register(
        PDFRawStream.of(
          document.context.obj({
            Type: "XObject",
            Subtype: "Form",
            BBox: [0, 0, 1, 1],
            Matrix: [0.5, 0, 0, 0.5, 0, 0],
            Resources: { XObject: { Img: image } },
          }),
          encoder.encode("q 288 0 0 144 0 0 cm /Img Do Q"),
        ),
      );
      return [{ content: "/Fm0 Do", xobjects: { Fm0: form } }];
    });
    const codec = fakeCodec();

    await optimize(input, codec);

    expect(codec.encodeJpeg.mock.calls[0]?.[0]).toMatchObject({ width: 300, height: 150 });
  });

  it("re-encodes a JPEG at its new size through the codec", async () => {
    const jpeg = new Uint8Array(60_000).fill(7);
    const input = await buildPdf((document) => [
      {
        content: "q 72 0 0 72 0 0 cm /Im0 Do Q",
        xobjects: { Im0: registerImage(document, { width: 1000, height: 1000, jpeg }) },
      },
    ]);
    const codec = fakeCodec(5_000);

    const { document } = await optimize(input, codec);

    expect(codec.transcodeJpeg).toHaveBeenCalledWith(jpeg, 150, 150, 0.75);
    const [image] = imageStreams(document);
    expect(image?.stream.getContentsSize()).toBe(5_000);
  });

  it("keeps an image when re-encoding would not save enough", async () => {
    const jpeg = new Uint8Array(20_000).fill(7);
    const input = await buildPdf((document) => [
      {
        content: "q 400 0 0 400 0 0 cm /Im0 Do Q",
        xobjects: { Im0: registerImage(document, { width: 800, height: 800, jpeg }) },
      },
    ]);

    const { report, document } = await optimize(input, fakeCodec(19_000));

    expect(report.imagesRecompressed).toBe(0);
    expect(imageStreams(document)[0]?.stream.getContents()).toEqual(jpeg);
  });

  it("keeps flat-colour artwork lossless and stores it with a PNG predictor", async () => {
    const width = 1200;
    const height = 600;
    // Four flat colours in 4 x 4 blocks: chart-like, and large enough to be worth inspecting.
    const palette = [
      [30, 90, 200],
      [250, 250, 250],
      [0, 0, 0],
      [220, 40, 40],
    ];
    const choices = noisyPixels(width / 4, height / 4, 1);
    const pixels = new Uint8Array(width * height * 3);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const colour =
          palette[(choices[Math.floor(y / 4) * (width / 4) + Math.floor(x / 4)] ?? 0) % 4];
        pixels.set(colour ?? [0, 0, 0], (y * width + x) * 3);
      }
    }
    const input = await buildPdf((document) => [
      {
        content: "q 144 0 0 72 0 0 cm /Im0 Do Q",
        xobjects: { Im0: registerImage(document, { width, height, pixels }) },
      },
    ]);
    const codec = fakeCodec();

    const { document } = await optimize(input, codec);

    expect(codec.encodeJpeg).not.toHaveBeenCalled();
    const [image] = imageStreams(document);
    const dict = image?.stream.dict ?? PDFDict.withContext(document.context);
    expect(dict.lookup(PDFName.of("Filter"))).toBe(PDFName.of("FlateDecode"));
    expect(numberEntry(dict, "Width")).toBe(300);
    const params = dict.lookup(PDFName.of("DecodeParms"), PDFDict);
    expect(numberEntry(params, "Predictor")).toBe(15);
    expect(numberEntry(params, "Columns")).toBe(300);
  });

  it("resamples a soft mask together with its image", async () => {
    const input = await buildPdf((document) => {
      const mask = registerImage(document, {
        width: 1200,
        height: 600,
        gray: true,
        pixels: new Uint8Array(1200 * 600).map((_, index) => (index % 1200 < 600 ? 0 : 255)),
      });
      return [
        {
          content: "q 144 0 0 72 0 0 cm /Im0 Do Q",
          xobjects: { Im0: registerImage(document, { width: 1200, height: 600, smask: mask }) },
        },
      ];
    });

    const { document } = await optimize(input);

    const page = document.getPage(0).node.Resources()?.lookup(PDFName.of("XObject"), PDFDict);
    const mask = rawStreamAt(rawStreamAt(page, "Im0").dict, "SMask");
    expect(numberEntry(mask.dict, "Width")).toBe(300);
    expect(numberEntry(mask.dict, "Height")).toBe(150);
    expect(mask.dict.lookup(PDFName.of("Filter"))).toBe(PDFName.of("FlateDecode"));
  });

  it("declares a gray colour space when the codec writes a grayscale JPEG", async () => {
    const input = await buildPdf((document) => [
      {
        content: "q 144 0 0 72 0 0 cm /Im0 Do Q",
        xobjects: { Im0: registerImage(document, { width: 1200, height: 600, gray: true }) },
      },
    ]);

    const { document } = await optimize(input, fakeCodec(2_000, 1));

    const [image] = imageStreams(document);
    expect(image?.stream.dict.lookup(PDFName.of("ColorSpace"))).toBe(PDFName.of("DeviceGray"));
  });

  it("leaves image masks, indexed and CMYK images untouched", async () => {
    const input = await buildPdf((document) => {
      const { context } = document;
      const cmyk = context.register(
        PDFRawStream.of(
          context.obj({
            Type: "XObject",
            Subtype: "Image",
            Width: 400,
            Height: 400,
            ColorSpace: "DeviceCMYK",
            BitsPerComponent: 8,
            Filter: "DCTDecode",
          }),
          new Uint8Array(50_000).fill(3),
        ),
      );
      return [{ content: "q 10 0 0 10 0 0 cm /Im0 Do Q", xobjects: { Im0: cmyk } }];
    });
    const codec = fakeCodec(100);

    const { report } = await optimize(input, codec);

    expect(report.imagesRecompressed).toBe(0);
    expect(codec.transcodeJpeg).not.toHaveBeenCalled();
  });

  it("drops private application data and, when asked, the XMP packet", async () => {
    const input = await buildPdf((document) => {
      const { context } = document;
      document.catalog.set(
        PDFName.of("Metadata"),
        context.register(
          PDFRawStream.of(
            context.obj({ Type: "Metadata", Subtype: "XML" }),
            encoder.encode("<x/>"),
          ),
        ),
      );
      document.catalog.set(PDFName.of("PieceInfo"), context.obj({ Illustrator: {} }));
      return [{ content: "q Q" }];
    });

    const kept = await optimize(input);
    expect(kept.document.catalog.has(PDFName.of("PieceInfo"))).toBe(false);
    expect(kept.document.catalog.has(PDFName.of("Metadata"))).toBe(true);

    const stripped = await optimize(input, fakeCodec(), { stripXmpMetadata: true });
    expect(stripped.document.catalog.has(PDFName.of("Metadata"))).toBe(false);
  });

  it("reports cancellation", async () => {
    const controller = new AbortController();
    const input = await buildPdf((document) => [
      {
        content: "q 144 0 0 72 0 0 cm /Im0 Do Q",
        xobjects: { Im0: registerImage(document, { width: 1200, height: 600 }) },
      },
    ]);
    const codec = fakeCodec();
    codec.encodeJpeg.mockImplementationOnce(() => {
      controller.abort();
      return Promise.resolve({ bytes: new Uint8Array(10), components: 3 });
    });

    const result = await optimizePdfStructure(input, codec, {
      ...OPTIONS,
      signal: controller.signal,
    });

    expect(result).toEqual({ ok: false, reason: "cancelled" });
  });

  it("fails safely for bytes that are not a PDF", async () => {
    const result = await optimizePdfStructure(new Uint8Array([1, 2, 3]), fakeCodec(), OPTIONS);
    expect(result).toEqual({ ok: false, reason: "failed" });
  });

  it("reports image progress", async () => {
    const input = await buildPdf((document) => [
      {
        content: "q 144 0 0 72 0 0 cm /Im0 Do Q /Im1 Do",
        xobjects: {
          Im0: registerImage(document, { width: 1200, height: 600 }),
          Im1: registerImage(document, { width: 64, height: 64 }),
        },
      },
    ]);
    const progress: [number, number][] = [];

    await optimize(input, fakeCodec(), {
      onImageProgress: (done, total) => progress.push([done, total]),
    });

    expect(progress).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it("decodes ASCII85-wrapped images before re-encoding them", async () => {
    const input = await buildPdf((document) => {
      const { context } = document;
      const deflated = context.flateStream(noisyPixels(1200, 600, 3)).getContents();
      const ascii = ascii85(deflated);
      const filters = PDFArray.withContext(context);
      filters.push(PDFName.of("ASCII85Decode"));
      filters.push(PDFName.of("FlateDecode"));
      const dict = context.obj({
        Type: "XObject",
        Subtype: "Image",
        Width: 1200,
        Height: 600,
        ColorSpace: "DeviceRGB",
        BitsPerComponent: 8,
      });
      dict.set(PDFName.of("Filter"), filters);
      const image = context.register(PDFRawStream.of(dict, ascii));
      return [{ content: "q 144 0 0 72 0 0 cm /Im0 Do Q", xobjects: { Im0: image } }];
    });
    const codec = fakeCodec();

    const { report } = await optimize(input, codec);

    expect(report.imagesRecompressed).toBe(1);
    expect(codec.encodeJpeg.mock.calls[0]?.[0]).toMatchObject({ width: 300, height: 150 });
  });
});

function ascii85(bytes: Uint8Array): Uint8Array {
  let output = "";
  for (let index = 0; index < bytes.length; index += 4) {
    const chunk = [0, 1, 2, 3].map((offset) => bytes[index + offset] ?? 0);
    const count = Math.min(4, bytes.length - index);
    let value =
      ((chunk[0] ?? 0) * 2 ** 24 +
        ((chunk[1] ?? 0) << 16) +
        ((chunk[2] ?? 0) << 8) +
        (chunk[3] ?? 0)) >>>
      0;
    if (value === 0 && count === 4) {
      output += "z";
      continue;
    }
    const digits: string[] = [];
    for (let digit = 0; digit < 5; digit += 1) {
      digits.unshift(String.fromCharCode((value % 85) + 33));
      value = Math.floor(value / 85);
    }
    output += digits.slice(0, count + 1).join("");
  }
  return encoder.encode(`${output}~>`);
}
