import { PDFDocument } from "pdf-lib";
import type { PDFDocumentProxy } from "pdfjs-dist";

import type {
  DocumentDates,
  PdfCompressionGateway,
  PdfCompressionProgress,
  PdfCompressionResult,
} from "../../application/editor-application";
import { applyDocumentDates } from "./document-dates";

const TARGET_DPI = 150;
const JPEG_QUALITY = 0.82;
const PDF_POINTS_PER_INCH = 72;

const cancelled = (): PdfCompressionResult => ({
  ok: false,
  cancelled: true,
  message: "PDF compression was cancelled.",
});

const failed = (): PdfCompressionResult => ({
  ok: false,
  cancelled: false,
  message: "The PDF could not be compressed in this browser.",
});

const bytesFromDataUrl = (dataUrl: string): Uint8Array => {
  const encoded = dataUrl.split(",")[1];
  if (encoded === undefined) throw new Error("Invalid canvas image.");
  const binary = atob(encoded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const releaseCanvas = (canvas: HTMLCanvasElement): void => {
  const context = canvas.getContext("2d");
  context?.clearRect(0, 0, canvas.width, canvas.height);
  canvas.width = 0;
  canvas.height = 0;
};

/** Raster compression deliberately flattens final edited pages, one page at a time. */
export class PdfRasterCompressionGateway implements PdfCompressionGateway {
  public async compress(request: {
    readonly bytes: Uint8Array;
    readonly onProgress?: (progress: PdfCompressionProgress) => void;
    readonly signal?: AbortSignal;
    readonly documentDates?: DocumentDates;
  }): Promise<PdfCompressionResult> {
    let renderedDocument: PDFDocumentProxy | undefined;
    try {
      if (request.signal?.aborted) return cancelled();
      const { pdfjs } = await import("./pdfjs-runtime");
      const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(request.bytes),
        disableAutoFetch: true,
        disableStream: true,
      });
      renderedDocument = await loadingTask.promise;
      const compressed = await PDFDocument.create();
      const scale = TARGET_DPI / PDF_POINTS_PER_INCH;

      for (let index = 1; index <= renderedDocument.numPages; index += 1) {
        if (request.signal?.aborted) return cancelled();
        const sourcePage = await renderedDocument.getPage(index);
        const naturalViewport = sourcePage.getViewport({ scale: 1 });
        const viewport = sourcePage.getViewport({ scale });
        const canvas = window.document.createElement("canvas");
        const context = canvas.getContext("2d", { alpha: false });
        if (context === null) {
          sourcePage.cleanup();
          releaseCanvas(canvas);
          return failed();
        }
        canvas.width = Math.max(1, Math.round(viewport.width));
        canvas.height = Math.max(1, Math.round(viewport.height));
        context.fillStyle = "rgb(255,255,255)";
        context.fillRect(0, 0, canvas.width, canvas.height);
        const renderTask = sourcePage.render({
          canvas,
          canvasContext: context,
          viewport,
          background: "rgb(255,255,255)",
        });
        const cancelRender = (): void => {
          renderTask.cancel();
        };
        request.signal?.addEventListener("abort", cancelRender, { once: true });
        try {
          await renderTask.promise;
        } catch (error) {
          sourcePage.cleanup();
          releaseCanvas(canvas);
          if (request.signal?.aborted) return cancelled();
          throw error;
        } finally {
          request.signal?.removeEventListener("abort", cancelRender);
        }
        if (request.signal?.aborted) {
          sourcePage.cleanup();
          releaseCanvas(canvas);
          return cancelled();
        }
        const imageBytes = bytesFromDataUrl(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
        const image = await compressed.embedJpg(imageBytes);
        const outputPage = compressed.addPage([naturalViewport.width, naturalViewport.height]);
        outputPage.drawImage(image, {
          x: 0,
          y: 0,
          width: naturalViewport.width,
          height: naturalViewport.height,
        });
        sourcePage.cleanup();
        releaseCanvas(canvas);
        request.onProgress?.({ currentPage: index, totalPages: renderedDocument.numPages });
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
      // The rebuilt document starts with pdf-lib's own Info dictionary, so the chosen dates have
      // to be stamped again here.
      applyDocumentDates(compressed, request.documentDates);
      return { ok: true, bytes: await compressed.save() };
    } catch (error) {
      if (request.signal?.aborted || (error instanceof Error && /cancel/i.test(error.name))) {
        return cancelled();
      }
      return failed();
    }
  }
}
