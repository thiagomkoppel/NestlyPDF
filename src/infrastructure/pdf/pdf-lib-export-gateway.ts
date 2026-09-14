import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import patrickHandFontDataUrl from "../../presentation/assets/fonts/PatrickHand-Regular.ttf?inline";

import type {
  ExportElement,
  PdfExportGateway,
  PdfExportRequest,
  PdfExportResult,
  PdfOpenResult,
} from "../../application/editor-application";
import {
  pageTopLeftRectToPdfRect,
  pageTopLeftTextToPdfPoint,
} from "../../application/editor-geometry";
import type { PageGeometry } from "../../application/editor-geometry";
import type { DocumentPage } from "../../domain/document-session";
import { applyDocumentDates, readDocumentDates } from "./document-dates";

/**
 * The area of a page a reader displays: the crop box clipped to the media box, exactly as
 * PDF.js resolves it. `getWidth()`/`getHeight()` describe the media box alone, so using them to
 * place overlays shifts every element on a cropped page — or on one whose media box does not
 * start at the origin — by the difference between the two top edges.
 */
const visiblePageBox = (page: PDFPage): PageGeometry => {
  const media = page.getMediaBox();
  const crop = page.getCropBox();
  const left = Math.max(media.x, crop.x);
  const bottom = Math.max(media.y, crop.y);
  const right = Math.min(media.x + media.width, crop.x + crop.width);
  const top = Math.min(media.y + media.height, crop.y + crop.height);
  if (right <= left || top <= bottom) {
    // A crop box that does not overlap the media box is malformed; the media box still renders.
    return { x: media.x, y: media.y, width: media.width, height: media.height };
  }
  return { x: left, y: bottom, width: right - left, height: top - bottom };
};

/**
 * The area of a page a reader displays: the crop box clipped to the media box, exactly as
 * PDF.js resolves it. `getWidth()`/`getHeight()` describe the media box alone, so using them to
 * place overlays shifts every element on a cropped page — or on one whose media box does not
 * start at the origin — by the difference between the two top edges.
 */
const visiblePageBox = (page: PDFPage): PageGeometry => {
  const media = page.getMediaBox();
  const crop = page.getCropBox();
  const left = Math.max(media.x, crop.x);
  const bottom = Math.max(media.y, crop.y);
  const right = Math.min(media.x + media.width, crop.x + crop.width);
  const top = Math.min(media.y + media.height, crop.y + crop.height);
  if (right <= left || top <= bottom) {
    // A crop box that does not overlap the media box is malformed; the media box still renders.
    return { x: media.x, y: media.y, width: media.width, height: media.height };
  }
  return { x: left, y: bottom, width: right - left, height: top - bottom };
};

const exportFailure = (message: string): PdfExportResult => ({
  ok: false,
  error: { code: "ExportFailed", message },
});

const openFailure = (message: string): PdfOpenResult => ({
  ok: false,
  error: { code: "InvalidPdf", message },
});

const parseHexColor = (
  value: string | undefined,
): { readonly red: number; readonly green: number; readonly blue: number } => {
  const normalized = value?.match(/^#?([0-9a-fA-F]{6})$/)?.[1] ?? "000000";
  return {
    red: Number.parseInt(normalized.slice(0, 2), 16) / 255,
    green: Number.parseInt(normalized.slice(2, 4), 16) / 255,
    blue: Number.parseInt(normalized.slice(4, 6), 16) / 255,
  };
};

const pageNumberFromPageId = (pageId: string): number | undefined => {
  const match = /^page-(\d+)$/.exec(pageId);
  if (match === null) {
    return undefined;
  }
  return Number.parseInt(match[1] ?? "", 10);
};

const dataUrlBytes = (dataUrl: string): Uint8Array => {
  const base64 = dataUrl.split(",")[1];
  if (base64 === undefined) {
    throw new Error("Invalid data URL.");
  }
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const PATRICK_HAND_FONT_FAMILY = "Patrick Hand";

const patrickHandFontBytes = (): Uint8Array => dataUrlBytes(patrickHandFontDataUrl);

const fontForElement = (
  element: ExportElement,
  fallback: PDFFont,
  cursive: PDFFont,
  patrickHand: PDFFont | undefined,
): PDFFont => {
  if (element.type === "signature" || element.type === "initials") {
    return cursive;
  }
  return element.textAppearance?.fontFamily === PATRICK_HAND_FONT_FAMILY &&
    patrickHand !== undefined
    ? patrickHand
    : fallback;
};
const drawCheckmark = (
  page: PDFPage,
  rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  _hex = "#000000",
): void => {
  const thickness = Math.max(2, Math.min(rect.width, rect.height) * 0.12);
  const colorParts = parseHexColor(_hex);
  const color = rgb(colorParts.red, colorParts.green, colorParts.blue);
  page.drawLine({
    start: { x: rect.x + rect.width * 0.16, y: rect.y + rect.height * 0.46 },
    end: { x: rect.x + rect.width * 0.4, y: rect.y + rect.height * 0.2 },
    thickness,
    color,
  });
  page.drawLine({
    start: { x: rect.x + rect.width * 0.4, y: rect.y + rect.height * 0.2 },
    end: { x: rect.x + rect.width * 0.84, y: rect.y + rect.height * 0.82 },
    thickness,
    color,
  });
};

const drawCross = (
  page: PDFPage,
  rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  _hex = "#000000",
): void => {
  const thickness = Math.max(2, Math.min(rect.width, rect.height) * 0.12);
  const colorParts = parseHexColor(_hex);
  const color = rgb(colorParts.red, colorParts.green, colorParts.blue);
  page.drawLine({
    start: { x: rect.x + rect.width * 0.18, y: rect.y + rect.height * 0.18 },
    end: { x: rect.x + rect.width * 0.82, y: rect.y + rect.height * 0.82 },
    thickness,
    color,
  });
  page.drawLine({
    start: { x: rect.x + rect.width * 0.18, y: rect.y + rect.height * 0.82 },
    end: { x: rect.x + rect.width * 0.82, y: rect.y + rect.height * 0.18 },
    thickness,
    color,
  });
};

export class PdfLibExportGateway implements PdfExportGateway {
  public async open(bytes: Uint8Array): Promise<PdfOpenResult> {
    try {
      const document = await PDFDocument.load(bytes, { ignoreEncryption: false });
      const pages = document.getPages().map<DocumentPage>((page, index) => {
        const view = visiblePageBox(page);
        return {
          id: `page-${String(index + 1)}`,
          width: view.width,
          height: view.height,
          rotation: page.getRotation().angle,
        };
      });
      return { ok: true, pages };
    } catch {
      return openFailure("The PDF could not be opened in the browser.");
    }
  }

  public async exportPdf(request: PdfExportRequest): Promise<PdfExportResult> {
    try {
      // `updateMetadata` rewrites the Info dictionary with pdf-lib's own producer and a
      // "modified now" stamp. Exporting must not invent metadata the user did not choose.
      const document = await PDFDocument.load(request.originalBytes, {
        ignoreEncryption: false,
        updateMetadata: false,
      });
      const font = await document.embedFont(StandardFonts.Helvetica);
      const signatureFont = await document.embedFont(StandardFonts.TimesRomanItalic);
      const usesPatrickHand = request.elements.some(
        (element) => element.textAppearance?.fontFamily === PATRICK_HAND_FONT_FAMILY,
      );
      const patrickHand = usesPatrickHand
        ? await (async (): Promise<PDFFont> => {
            document.registerFontkit(fontkit);
            return document.embedFont(patrickHandFontBytes());
          })()
        : undefined;
      for (const element of request.elements) {
        await this.#drawElement(document, element, font, signatureFont, patrickHand);
      }
      applyDocumentDates(document, request.documentDates);
      const bytes = await document.save();
      return { ok: true, bytes };
    } catch {
      return exportFailure("The edited PDF could not be generated.");
    }
  }

  async #drawElement(
    document: PDFDocument,
    element: ExportElement,
    font: PDFFont,
    signatureFont: PDFFont,
    patrickHand: PDFFont | undefined,
  ): Promise<void> {
    const pageNumber = pageNumberFromPageId(element.pageId);
    if (pageNumber === undefined) {
      return;
    }
    const page = document.getPages()[pageNumber - 1];
    if (page === undefined) {
      return;
    }
    if (element.type === "whiteout") {
      const rect = pageTopLeftRectToPdfRect(element.bounds, visiblePageBox(page));
      page.drawRectangle({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        color: rgb(1, 1, 1),
        opacity: 1,
      });
      return;
    }

    if (element.type === "checkmark" || element.type === "cross") {
      const rect = pageTopLeftRectToPdfRect(element.bounds, visiblePageBox(page));
      if (element.type === "checkmark") {
        drawCheckmark(page, rect, element.color);
      } else {
        drawCross(page, rect, element.color);
      }
      return;
    }
    if (element.image !== undefined) {
      const imageBytes = dataUrlBytes(element.image.dataUrl);
      const embeddedImage =
        element.image.mimeType === "image/png"
          ? await document.embedPng(imageBytes)
          : await document.embedJpg(imageBytes);
      const rect = pageTopLeftRectToPdfRect(element.bounds, visiblePageBox(page));
      page.drawImage(embeddedImage, {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      });
      return;
    }

    const text = element.text ?? "";
    if (text.trim().length === 0) {
      return;
    }
    const fontSize = element.textAppearance?.fontSize ?? 16;
    const colorParts = parseHexColor(element.textAppearance?.color);
    const activeFont = fontForElement(element, font, signatureFont, patrickHand);
    const start = pageTopLeftTextToPdfPoint({
      bounds: element.bounds,
      page: visiblePageBox(page),
      fontSize,
    });
    const appearance = element.textAppearance;
    const characterSpacing = appearance?.letterSpacing ?? 0;
    const resolvedLineHeight = fontSize * (appearance?.lineHeight ?? 1.2);
    const alignment = appearance?.alignment ?? "left";
    const color = rgb(colorParts.red, colorParts.green, colorParts.blue);
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      const lineWidth =
        activeFont.widthOfTextAtSize(line, fontSize) +
        Math.max(0, line.length - 1) * characterSpacing;
      const x =
        alignment === "center"
          ? start.x + (element.bounds.width - lineWidth) / 2
          : alignment === "right"
            ? start.x + element.bounds.width - lineWidth
            : start.x;
      const y = start.y - resolvedLineHeight * index;
      if (characterSpacing === 0) {
        page.drawText(line, { x, y, size: fontSize, font: activeFont, color });
      } else {
        let characterX = x;
        for (const character of line) {
          page.drawText(character, { x: characterX, y, size: fontSize, font: activeFont, color });
          characterX += activeFont.widthOfTextAtSize(character, fontSize) + characterSpacing;
        }
      }
      if (appearance?.underline && line.length > 0) {
        page.drawLine({
          start: { x, y: y - Math.max(1, fontSize * 0.12) },
          end: { x: x + lineWidth, y: y - Math.max(1, fontSize * 0.12) },
          color,
          thickness: Math.max(0.75, fontSize * 0.055),
        });
      }
    });
  }
}
