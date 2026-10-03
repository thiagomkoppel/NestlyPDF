import type {
  DocumentDates,
  PdfCompressionGateway,
  PdfCompressionLevel,
  PdfCompressionProgress,
  PdfCompressionResult,
} from "../../application/editor-application";
import {
  optimizePdfStructure,
  type JpegCodec,
  type PdfOptimizationOptions,
} from "./optimizer/pdf-structure-optimizer";

/**
 * Presets follow the long-standing Ghostscript/Acrobat convention: 150 DPI is the "ebook"
 * quality that still prints well on office printers; ~110 DPI reads cleanly on any screen.
 */
export const COMPRESSION_PRESETS: Readonly<
  Record<"balanced" | "strong", Omit<PdfOptimizationOptions, "signal" | "onImageProgress">>
> = {
  balanced: { imageDpi: 150, jpegQuality: 0.75, stripXmpMetadata: false },
  strong: { imageDpi: 110, jpegQuality: 0.6, stripXmpMetadata: true },
};

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

interface CompressionRequest {
  readonly bytes: Uint8Array;
  readonly level?: PdfCompressionLevel;
  readonly onProgress?: (progress: PdfCompressionProgress) => void;
  readonly signal?: AbortSignal;
  readonly documentDates?: DocumentDates;
}

/**
 * Compression that keeps the PDF a PDF. Images are resampled to what the page actually needs
 * and re-encoded, raw streams are compressed, duplicates merged and dead objects dropped, so
 * text stays selectable and vector art stays sharp. Only `maximum` may fall back to flattening
 * pages into images, and only when that really is smaller.
 */
export class PdfSmartCompressionGateway implements PdfCompressionGateway {
  readonly #codec: JpegCodec;
  readonly #flatten: PdfCompressionGateway;

  public constructor(codec: JpegCodec, flatten: PdfCompressionGateway) {
    this.#codec = codec;
    this.#flatten = flatten;
  }

  public async compress(request: CompressionRequest): Promise<PdfCompressionResult> {
    if (request.signal?.aborted) return cancelled();
    const level = request.level ?? "balanced";
    const preset = COMPRESSION_PRESETS[level === "balanced" ? "balanced" : "strong"];
    const optimized = await optimizePdfStructure(request.bytes, this.#codec, {
      ...preset,
      ...(request.signal === undefined ? {} : { signal: request.signal }),
      onImageProgress: (done, total) => {
        request.onProgress?.({ currentPage: done, totalPages: total, unit: "image" });
      },
    });
    if (!optimized.ok && optimized.reason === "cancelled") return cancelled();
    if (level !== "maximum") {
      // An encrypted PDF cannot be restructured; reporting failure lets the user keep the
      // original instead of receiving a file that only looks compressed.
      return optimized.ok ? { ok: true, bytes: optimized.bytes } : failed();
    }

    // Maximum: flatten too, and keep whichever is smaller. Ties go to the structured PDF
    // because it keeps text selectable.
    const flattened = await this.#flatten.compress({
      bytes: request.bytes,
      ...(request.onProgress === undefined ? {} : { onProgress: request.onProgress }),
      ...(request.signal === undefined ? {} : { signal: request.signal }),
      ...(request.documentDates === undefined ? {} : { documentDates: request.documentDates }),
    });
    if (!flattened.ok) {
      if (flattened.cancelled) return cancelled();
      return optimized.ok ? { ok: true, bytes: optimized.bytes } : flattened;
    }
    if (optimized.ok && optimized.bytes.byteLength <= flattened.bytes.byteLength) {
      return { ok: true, bytes: optimized.bytes };
    }
    return flattened;
  }
}
