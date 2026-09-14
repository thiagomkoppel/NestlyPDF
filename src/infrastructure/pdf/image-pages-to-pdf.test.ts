import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { rasterPagesToPdf, type RasterPage } from "./image-pages-to-pdf";

const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l5n7WQAAAABJRU5ErkJggg==";

const pngBytes = (): Uint8Array =>
  Uint8Array.from(atob(PNG_1X1), (character) => character.charCodeAt(0));

const page = (widthPt: number, heightPt: number): RasterPage => ({
  pngBytes: pngBytes(),
  widthPt,
  heightPt,
});

describe("rasterPagesToPdf", () => {
  it("assembles one PDF page per raster page at the requested point size", async () => {
    const result = await rasterPagesToPdf([page(612, 792), page(842, 595)]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bytes.subarray(0, 5)).toEqual(new Uint8Array([37, 80, 68, 70, 45]));

    const reopened = await PDFDocument.load(result.bytes);
    expect(reopened.getPageCount()).toBe(2);
    const [first, second] = reopened.getPages();
    expect(first?.getWidth()).toBeCloseTo(612);
    expect(first?.getHeight()).toBeCloseTo(792);
    expect(second?.getWidth()).toBeCloseTo(842);
    expect(second?.getHeight()).toBeCloseTo(595);
  });

  it("rejects an empty page list as a conversion with no output", async () => {
    const result = await rasterPagesToPdf([]);

    expect(result).toEqual({
      ok: false,
      error: {
        code: "DocumentConversionEmpty",
        message: "The document did not produce any pages to convert.",
      },
    });
  });

  it("rejects a page with an invalid size", async () => {
    const result = await rasterPagesToPdf([page(0, 792)]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("DocumentConversionFailed");
  });

  it("rejects a page with empty image bytes", async () => {
    const result = await rasterPagesToPdf([
      { pngBytes: new Uint8Array(), widthPt: 100, heightPt: 100 },
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("DocumentConversionFailed");
  });
});
