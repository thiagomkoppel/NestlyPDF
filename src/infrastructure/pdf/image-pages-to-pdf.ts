import { PDFDocument } from "pdf-lib";

import type { EditorError } from "../../application/editor-application";

/**
 * A single rasterized page: PNG image bytes plus the physical page size, in PDF
 * points (1/72 inch), that the image should fill.
 */
export interface RasterPage {
  readonly pngBytes: Uint8Array;
  readonly widthPt: number;
  readonly heightPt: number;
}

export interface RasterPagesToPdfSuccess {
  readonly ok: true;
  readonly bytes: Uint8Array;
}

export interface RasterPagesToPdfFailure {
  readonly ok: false;
  readonly error: EditorError;
}

export type RasterPagesToPdfResult = RasterPagesToPdfSuccess | RasterPagesToPdfFailure;

const isPositiveFinite = (value: number): boolean => Number.isFinite(value) && value > 0;

/**
 * Assembles rasterized pages into a single PDF, one PNG image per page drawn to
 * fill the page box. The output has no selectable text by design (ADR-006).
 */
export const rasterPagesToPdf = async (
  pages: readonly RasterPage[],
): Promise<RasterPagesToPdfResult> => {
  if (pages.length === 0) {
    return {
      ok: false,
      error: {
        code: "DocumentConversionEmpty",
        message: "The document did not produce any pages to convert.",
      },
    };
  }

  try {
    const pdf = await PDFDocument.create();
    for (const page of pages) {
      if (
        page.pngBytes.length === 0 ||
        !isPositiveFinite(page.widthPt) ||
        !isPositiveFinite(page.heightPt)
      ) {
        return {
          ok: false,
          error: {
            code: "DocumentConversionFailed",
            message: "A page of this document could not be converted.",
          },
        };
      }
      const image = await pdf.embedPng(page.pngBytes);
      const pdfPage = pdf.addPage([page.widthPt, page.heightPt]);
      pdfPage.drawImage(image, {
        x: 0,
        y: 0,
        width: page.widthPt,
        height: page.heightPt,
      });
    }
    return { ok: true, bytes: await pdf.save() };
  } catch {
    return {
      ok: false,
      error: {
        code: "DocumentConversionFailed",
        message: "This document could not be converted to a PDF.",
      },
    };
  }
};
