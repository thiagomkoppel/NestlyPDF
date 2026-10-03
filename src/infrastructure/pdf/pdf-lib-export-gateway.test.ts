import { PDFDocument, PDFPage } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";

import type { ExportElement } from "../../application/editor-application";
import { PdfLibExportGateway } from "./pdf-lib-export-gateway";

const createPdf = async (): Promise<Uint8Array> => {
  const document = await PDFDocument.create();
  document.addPage([300, 400]);
  document.addPage([500, 700]);
  return document.save();
};

const textElement = (id: string, pageId: string, text: string): ExportElement => ({
  id,
  pageId,
  type: "text",
  bounds: { x: 40, y: 50, width: 160, height: 40 },
  text,
  textAppearance: { fontSize: 16, color: "#111111" },
});

const whiteoutElement = (id: string, pageId: string): ExportElement => ({
  id,
  pageId,
  type: "whiteout",
  bounds: { x: 35, y: 45, width: 180, height: 50 },
});

describe("PdfLibExportGateway", () => {
  it("opens page metadata from browser PDF bytes", async () => {
    const gateway = new PdfLibExportGateway();

    const result = await gateway.open(await createPdf());

    expect(result).toMatchObject({
      ok: true,
      pages: [
        { id: "page-1", width: 300, height: 400, rotation: 0 },
        { id: "page-2", width: 500, height: 700, rotation: 0 },
      ],
    });
  });

  it("opens the document dates the file was saved with", async () => {
    const source = await PDFDocument.create();
    source.addPage([300, 400]);
    source.setCreationDate(new Date("2019-05-06T07:08:09Z"));
    source.setModificationDate(new Date("2020-06-07T08:09:10Z"));
    const gateway = new PdfLibExportGateway();

    const result = await gateway.open(await source.save());

    expect(result).toMatchObject({
      ok: true,
      documentDates: {
        creationDate: Date.parse("2019-05-06T07:08:09Z"),
        modificationDate: Date.parse("2020-06-07T08:09:10Z"),
      },
    });
  });

  it("stamps the chosen document dates on the exported file", async () => {
    const gateway = new PdfLibExportGateway();

    const result = await gateway.exportPdf({
      originalBytes: await createPdf(),
      pages: [{ id: "page-1", width: 300, height: 400, rotation: 0 }],
      elements: [textElement("text-1", "page-1", "Dated")],
      documentDates: {
        creationDate: Date.parse("2001-02-03T04:05:06Z"),
        modificationDate: Date.parse("2002-03-04T05:06:07Z"),
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const exported = await PDFDocument.load(result.bytes, { updateMetadata: false });
    expect(exported.getCreationDate()?.getTime()).toBe(Date.parse("2001-02-03T04:05:06Z"));
    expect(exported.getModificationDate()?.getTime()).toBe(Date.parse("2002-03-04T05:06:07Z"));
  });

  it("keeps the source metadata when no dates were chosen", async () => {
    const source = await PDFDocument.create();
    source.addPage([300, 400]);
    source.setCreationDate(new Date("2019-05-06T07:08:09Z"));
    source.setModificationDate(new Date("2020-06-07T08:09:10Z"));
    source.setProducer("Original Producer");
    const gateway = new PdfLibExportGateway();

    const result = await gateway.exportPdf({
      originalBytes: await source.save(),
      pages: [{ id: "page-1", width: 300, height: 400, rotation: 0 }],
      elements: [textElement("text-1", "page-1", "Kept")],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const exported = await PDFDocument.load(result.bytes, { updateMetadata: false });
    expect(exported.getCreationDate()?.getTime()).toBe(Date.parse("2019-05-06T07:08:09Z"));
    expect(exported.getModificationDate()?.getTime()).toBe(Date.parse("2020-06-07T08:09:10Z"));
    expect(exported.getProducer()).toBe("Original Producer");
  });

  it("keeps the dates the file arrived with when only one of them is chosen", async () => {
    const source = await PDFDocument.create();
    source.addPage([300, 400]);
    source.setCreationDate(new Date("2019-05-06T07:08:09Z"));
    source.setModificationDate(new Date("2020-06-07T08:09:10Z"));
    const gateway = new PdfLibExportGateway();

    const result = await gateway.exportPdf({
      originalBytes: await source.save(),
      pages: [{ id: "page-1", width: 300, height: 400, rotation: 0 }],
      elements: [],
      documentDates: { creationDate: Date.parse("2001-02-03T04:05:06Z") },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const exported = await PDFDocument.load(result.bytes, { updateMetadata: false });
    expect(exported.getCreationDate()?.getTime()).toBe(Date.parse("2001-02-03T04:05:06Z"));
    expect(exported.getModificationDate()?.getTime()).toBe(Date.parse("2020-06-07T08:09:10Z"));
  });

  it("exports text and whiteout overlays while preserving page count and dimensions", async () => {
    const originalBytes = await createPdf();
    const gateway = new PdfLibExportGateway();

    const result = await gateway.exportPdf({
      originalBytes,
      pages: [
        { id: "page-1", width: 300, height: 400, rotation: 0 },
        { id: "page-2", width: 500, height: 700, rotation: 0 },
      ],
      elements: [
        whiteoutElement("whiteout-1", "page-1"),
        textElement("text-1", "page-1", "Replacement"),
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.bytes).not.toEqual(originalBytes);
    const exported = await PDFDocument.load(result.bytes);
    expect(exported.getPageCount()).toBe(2);
    expect(exported.getPage(0).getWidth()).toBe(300);
    expect(exported.getPage(0).getHeight()).toBe(400);
    expect(exported.getPage(1).getWidth()).toBe(500);
    expect(exported.getPage(1).getHeight()).toBe(700);
  });

  it("exports multiline text as individual lines with preserved alignment, spacing, and underlines", async () => {
    const drawText = vi.spyOn(PDFPage.prototype, "drawText");
    const drawLine = vi.spyOn(PDFPage.prototype, "drawLine");
    const gateway = new PdfLibExportGateway();
    const result = await gateway.exportPdf({
      originalBytes: await createPdf(),
      pages: [{ id: "page-1", width: 300, height: 400, rotation: 0 }],
      elements: [
        {
          ...textElement("multiline", "page-1", "\nRua T 135 Paraíso\r\n\r\nBarra Mansa - RJ\n"),
          bounds: { x: 40, y: 50, width: 200, height: 100 },
          textAppearance: {
            fontSize: 16,
            color: "#112233",
            alignment: "center",
            lineHeight: 1.5,
            letterSpacing: 0,
            underline: true,
          },
        },
      ],
    });

    expect(result.ok).toBe(true);
    const multilineCalls = drawText.mock.calls.filter(([value]) =>
      ["", "Rua T 135 Paraíso", "Barra Mansa - RJ"].includes(value),
    );
    expect(multilineCalls.map(([value]) => value)).toEqual([
      "",
      "Rua T 135 Paraíso",
      "",
      "Barra Mansa - RJ",
      "",
    ]);
    expect(multilineCalls[1]?.[1]).toMatchObject({ y: 310 });
    expect(multilineCalls[3]?.[1]).toMatchObject({ y: 262 });
    expect(drawLine).toHaveBeenCalledTimes(2);
    drawText.mockRestore();
    drawLine.mockRestore();
  });
  it("embeds Patrick Hand once and uses it for multiline aligned text", async () => {
    const embedFont = vi.spyOn(PDFDocument.prototype, "embedFont");
    const drawText = vi.spyOn(PDFPage.prototype, "drawText");
    const gateway = new PdfLibExportGateway();

    const result = await gateway.exportPdf({
      originalBytes: await createPdf(),
      pages: [{ id: "page-1", width: 300, height: 400, rotation: 0 }],
      elements: [
        {
          ...textElement("patrick-1", "page-1", "John Doe\nJane Doe"),
          textAppearance: {
            fontSize: 22,
            color: "#000000",
            fontFamily: "Patrick Hand",
            alignment: "right",
            lineHeight: 1.2,
          },
        },
      ],
    });

    expect(result.ok).toBe(true);
    const customFontCallIndex = embedFont.mock.calls.findIndex(
      ([value]) => value instanceof Uint8Array,
    );
    expect(customFontCallIndex).toBeGreaterThanOrEqual(0);
    const customFontResult = embedFont.mock.results[customFontCallIndex];
    if (customFontResult?.type !== "return") {
      throw new Error("Patrick Hand embedding did not return a font.");
    }
    const customFont = await (customFontResult.value as unknown as Promise<unknown>);
    const patrickDraws = drawText.mock.calls.filter(
      ([value]) => value === "John Doe" || value === "Jane Doe",
    );
    expect(patrickDraws).toHaveLength(2);
    expect(patrickDraws.every(([, options]) => options?.font === customFont)).toBe(true);

    embedFont.mockRestore();
    drawText.mockRestore();
  });
  it("embeds only the Patrick Hand glyphs that were typed", async () => {
    const embedFont = vi.spyOn(PDFDocument.prototype, "embedFont");
    const gateway = new PdfLibExportGateway();

    const result = await gateway.exportPdf({
      originalBytes: await createPdf(),
      pages: [{ id: "page-1", width: 300, height: 400, rotation: 0 }],
      elements: [
        {
          ...textElement("patrick-subset", "page-1", "Ok"),
          textAppearance: { fontSize: 22, color: "#000000", fontFamily: "Patrick Hand" },
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const customFontCall = embedFont.mock.calls.find(([value]) => value instanceof Uint8Array);
    expect(customFontCall?.[1]).toMatchObject({ subset: true });
    // The full font file is ~215 KB; a two-glyph subset keeps the export far below that.
    expect(result.bytes.byteLength).toBeLessThan(40_000);
    embedFont.mockRestore();
  });
  it("fails safely for invalid PDF bytes", async () => {
    const result = await new PdfLibExportGateway().exportPdf({
      originalBytes: new Uint8Array([1, 2, 3]),
      pages: [],
      elements: [],
    });

    expect(result).toMatchObject({ ok: false, error: { code: "ExportFailed" } });
  });
});

const transparentPngDataUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l5n7WQAAAABJRU5ErkJggg==";

const typedSignatureElement = (id: string, pageId: string): ExportElement => ({
  id,
  pageId,
  type: "signature",
  bounds: { x: 70, y: 250, width: 180, height: 70 },
  text: "Ada Lovelace",
  textAppearance: { fontSize: 34, color: "#111111", fontFamily: "serif" },
  source: "type",
});

const imageInitialsElement = (id: string, pageId: string): ExportElement => ({
  id,
  pageId,
  type: "initials",
  bounds: { x: 70, y: 170, width: 90, height: 45 },
  image: { dataUrl: transparentPngDataUrl, mimeType: "image/png" },
  source: "draw",
});

const generalImageElement = (id: string, pageId: string): ExportElement => ({
  id,
  pageId,
  type: "image",
  bounds: { x: 30, y: 60, width: 80, height: 40 },
  image: { dataUrl: transparentPngDataUrl, mimeType: "image/png" },
});
describe("PdfLibExportGateway signature overlays", () => {
  it("embeds general image overlays while preserving the PDF", async () => {
    const originalBytes = await createPdf();
    const gateway = new PdfLibExportGateway();

    const result = await gateway.exportPdf({
      originalBytes,
      pages: [{ id: "page-1", width: 300, height: 400, rotation: 0 }],
      elements: [generalImageElement("image-1", "page-1")],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.bytes.length).toBeGreaterThan(originalBytes.length);
    const exported = await PDFDocument.load(result.bytes);
    expect(exported.getPageCount()).toBe(2);
  });
  it("embeds typed signatures and image initials while preserving the PDF", async () => {
    const originalBytes = await createPdf();
    const gateway = new PdfLibExportGateway();

    const result = await gateway.exportPdf({
      originalBytes,
      pages: [{ id: "page-1", width: 300, height: 400, rotation: 0 }],
      elements: [
        typedSignatureElement("signature-1", "page-1"),
        imageInitialsElement("initials-1", "page-1"),
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.bytes.length).toBeGreaterThan(originalBytes.length);
    const exported = await PDFDocument.load(result.bytes);
    expect(exported.getPageCount()).toBe(2);
    expect(exported.getPage(0).getWidth()).toBe(300);
  });
});

describe("PdfLibExportGateway annotation overlays", () => {
  it("exports checkmark, cross, and captured date overlays without changing pages", async () => {
    const originalBytes = await createPdf();
    const gateway = new PdfLibExportGateway();

    const result = await gateway.exportPdf({
      originalBytes,
      pages: [{ id: "page-1", width: 300, height: 400, rotation: 0 }],
      elements: [
        {
          id: "checkmark-1",
          pageId: "page-1",
          type: "checkmark",
          bounds: { x: 40, y: 60, width: 32, height: 32 },
        },
        {
          id: "cross-1",
          pageId: "page-1",
          type: "cross",
          bounds: { x: 90, y: 60, width: 32, height: 32 },
        },
        {
          id: "date-1",
          pageId: "page-1",
          type: "date",
          bounds: { x: 130, y: 60, width: 96, height: 28 },
          text: "07/31/2026",
          textAppearance: { fontSize: 16, color: "#111111" },
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.bytes.length).toBeGreaterThan(originalBytes.length);
    const exported = await PDFDocument.load(result.bytes);
    expect(exported.getPageCount()).toBe(2);
    expect(exported.getPage(0).getWidth()).toBe(300);
    expect(exported.getPage(0).getHeight()).toBe(400);
  });
});

/**
 * Pages whose visible area is not the whole media box. PDF.js renders the crop box, so overlays
 * must be exported into that same space or they land somewhere else in the downloaded file.
 */
const createCroppedPdf = async (): Promise<Uint8Array> => {
  const document = await PDFDocument.create();
  const page = document.addPage([612, 792]);
  // Visible area 612x768, its top edge 12 units below the media box top.
  page.setCropBox(0, 12, 612, 768);
  return document.save();
};

const createOffsetMediaBoxPdf = async (): Promise<Uint8Array> => {
  const document = await PDFDocument.create();
  const page = document.addPage();
  page.setMediaBox(0, 9, 612, 792);
  return document.save();
};

describe("PdfLibExportGateway cropped pages", () => {
  it("reports the visible page area rather than the media box", async () => {
    const gateway = new PdfLibExportGateway();

    const result = await gateway.open(await createCroppedPdf());

    expect(result).toMatchObject({
      ok: true,
      pages: [{ id: "page-1", width: 612, height: 768, rotation: 0 }],
    });
  });

  it("draws overlays against the visible top edge of a cropped page", async () => {
    const drawImage = vi.spyOn(PDFPage.prototype, "drawImage");
    const drawRectangle = vi.spyOn(PDFPage.prototype, "drawRectangle");
    const drawText = vi.spyOn(PDFPage.prototype, "drawText");
    const gateway = new PdfLibExportGateway();

    const result = await gateway.exportPdf({
      originalBytes: await createCroppedPdf(),
      pages: [{ id: "page-1", width: 612, height: 768, rotation: 0 }],
      elements: [
        {
          id: "signature-1",
          pageId: "page-1",
          type: "signature",
          bounds: { x: 40, y: 100, width: 200, height: 60 },
          image: { dataUrl: transparentPngDataUrl, mimeType: "image/png" },
        },
        {
          id: "whiteout-1",
          pageId: "page-1",
          type: "whiteout",
          bounds: { x: 40, y: 100, width: 200, height: 60 },
        },
        {
          id: "text-1",
          pageId: "page-1",
          type: "text",
          bounds: { x: 40, y: 100, width: 200, height: 60 },
          text: "Signed",
          textAppearance: { fontSize: 16, color: "#111111" },
        },
      ],
    });

    expect(result.ok).toBe(true);
    // The visible top edge sits at y = 780, so the overlay bottom belongs at 780 - 100 - 60.
    expect(drawImage.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ x: 40, y: 620, width: 200, height: 60 }),
    );
    expect(drawRectangle.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ x: 40, y: 620, width: 200, height: 60 }),
    );
    expect(drawText.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ x: 40, y: 664 }));
    drawImage.mockRestore();
    drawRectangle.mockRestore();
    drawText.mockRestore();
  });

  it("draws overlays against a media box that does not start at the origin", async () => {
    const drawImage = vi.spyOn(PDFPage.prototype, "drawImage");
    const gateway = new PdfLibExportGateway();

    const result = await gateway.exportPdf({
      originalBytes: await createOffsetMediaBoxPdf(),
      pages: [{ id: "page-1", width: 612, height: 792, rotation: 0 }],
      elements: [
        {
          id: "signature-1",
          pageId: "page-1",
          type: "signature",
          bounds: { x: 40, y: 0, width: 200, height: 60 },
          image: { dataUrl: transparentPngDataUrl, mimeType: "image/png" },
        },
      ],
    });

    expect(result.ok).toBe(true);
    // Visible top edge is 9 + 792 = 801.
    expect(drawImage.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ x: 40, y: 741, width: 200, height: 60 }),
    );
    drawImage.mockRestore();
  });
});
