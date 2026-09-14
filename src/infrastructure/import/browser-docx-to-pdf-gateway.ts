import type {
  DocumentImportGateway,
  DocumentImportResult,
  EditorError,
  LocalPdfFile,
} from "../../application/editor-application";
import {
  rasterPagesToPdf,
  type RasterPage,
  type RasterPagesToPdfResult,
} from "../pdf/image-pages-to-pdf";

/** Upper bound on the source `.docx` size accepted for in-browser conversion. */
export const MAX_DOCX_BYTES = 25 * 1024 * 1024;

/** Device-pixel scale used when rasterizing each rendered page. */
const RASTER_SCALE = 2;

/**
 * Fraction of a page's content area a word processor typically fills before
 * breaking to the next page (~4% is left at the bottom for line-metric and
 * margin-collapsing slack). Used only to estimate the page count; the content is
 * then spread evenly across that many pages so the browser's slightly different
 * line metrics never spill a thin final page.
 */
const PAGE_PACK_TARGET = 0.96;

/** Ignore rects shorter than this (px) when collecting line boxes. */
const MIN_LINE_HEIGHT_PX = 3;

/** Two rects belong to the same visual line when they overlap vertically by more than this (px). */
const SAME_LINE_OVERLAP_PX = 4;

/** Fallback Letter page size in CSS pixels (96 dpi) when a section cannot be measured. */
const FALLBACK_PAGE_WIDTH_PX = 816;
const FALLBACK_PAGE_HEIGHT_PX = 1056;

/** CSS pixels are 96 per inch; PDF points are 72 per inch. */
const pxToPt = (px: number): number => (px * 72) / 96;

type RenderDocx = (
  data: Blob,
  bodyContainer: HTMLElement,
  styleContainer: HTMLElement | undefined,
  options: Record<string, unknown>,
) => Promise<unknown>;

type CaptureElement = (element: HTMLElement) => Promise<HTMLCanvasElement>;

type AssemblePages = (pages: readonly RasterPage[]) => Promise<RasterPagesToPdfResult>;

/** One rendered line box, measured from the top of its section (CSS pixels). */
export interface LineRect {
  readonly topPx: number;
  readonly bottomPx: number;
}

/** Rendered geometry of one docx-preview page section, in CSS pixels. */
export interface SectionMetrics {
  /** Rendered width of the section (the document page width). */
  readonly widthPx: number;
  /** Intended height of a single page (the section's `min-height`). */
  readonly pageHeightPx: number;
  /** Top padding of the section (the page's top margin). */
  readonly padTopPx: number;
  /** Bottom padding of the section (the page's bottom margin). */
  readonly padBottomPx: number;
  /** Total rendered height of the section, including content that overflows one page. */
  readonly totalHeightPx: number;
  /** Line boxes of the section content, top to bottom. */
  readonly lines: readonly LineRect[];
}

/** A vertical slice of a section that becomes one PDF page. */
export interface PageSegment {
  readonly startPx: number;
  readonly endPx: number;
}

export interface PageCompositionSpec {
  readonly sourceYpx: number;
  readonly sourceHeightPx: number;
  readonly destYpx: number;
  readonly pageWidthPx: number;
  readonly pageHeightPx: number;
}

type MeasureSection = (section: HTMLElement) => SectionMetrics;

type ComposePage = (source: HTMLCanvasElement, spec: PageCompositionSpec) => HTMLCanvasElement;

export interface DocxToPdfDependencies {
  readonly renderDocx: RenderDocx;
  readonly captureElement: CaptureElement;
  readonly measureSection: MeasureSection;
  readonly composePage: ComposePage;
  readonly assemblePages: AssemblePages;
  readonly documentRef: Document;
}

/**
 * Estimates how many pages the content occupies the way a word processor would,
 * then never fewer than the browser layout strictly needs.
 */
export const estimatePageCount = (contentHeightPx: number, areaHeightPx: number): number => {
  if (!(contentHeightPx > 0) || !(areaHeightPx > 0)) {
    return 1;
  }
  const rawPages = contentHeightPx / areaHeightPx;
  const packed = Math.round(rawPages / PAGE_PACK_TARGET);
  return Math.max(1, packed, Math.ceil(rawPages - 0.02));
};

/**
 * Splits a rendered section into page-sized vertical segments, breaking only in
 * the gaps between line boxes so a line is never cut in half. docx-preview only
 * splits sections on explicit page breaks, so the content is spread evenly
 * across its estimated page count — reproducing the source pagination without
 * ever spilling a thin final page from the browser's slightly taller layout.
 */
export const planSectionSegments = (metrics: SectionMetrics): PageSegment[] => {
  const { pageHeightPx, padTopPx, padBottomPx, totalHeightPx, lines } = metrics;
  const areaHeightPx = pageHeightPx - padTopPx - padBottomPx;
  const contentEndPx = Math.max(totalHeightPx - padBottomPx, padTopPx + 1);

  if (!(areaHeightPx > 0) || lines.length === 0) {
    return [{ startPx: padTopPx, endPx: contentEndPx }];
  }

  const ordered = [...lines].sort((a, b) => a.topPx - b.topPx);
  const startPx = Math.min(padTopPx, ordered[0]?.topPx ?? padTopPx);
  const estimatedPages = estimatePageCount(contentEndPx - startPx, areaHeightPx);
  const fillHeightPx = Math.min(areaHeightPx, (contentEndPx - startPx) / estimatedPages + 2);
  const segments: PageSegment[] = [];
  let cursor = startPx;
  let index = 0;
  let guard = 0;

  while (cursor < contentEndPx - 3 && guard < 10_000) {
    guard += 1;
    const limit = cursor + fillHeightPx;
    let next = index;
    let lastBottomPx = Number.NaN;
    for (
      let line = ordered[next];
      line !== undefined && line.bottomPx <= limit + 2;
      line = ordered[next]
    ) {
      lastBottomPx = line.bottomPx;
      next += 1;
    }
    if (Number.isNaN(lastBottomPx)) {
      // Not even one line fits the reduced limit (tall line / table): take one so we make progress.
      const forced = ordered[next];
      if (forced !== undefined) {
        lastBottomPx = forced.bottomPx;
        next += 1;
      } else {
        lastBottomPx = contentEndPx;
      }
    }
    const nextTopPx = ordered[next]?.topPx ?? contentEndPx;
    segments.push({
      startPx: cursor,
      endPx: Math.min(Math.max(nextTopPx, lastBottomPx), contentEndPx),
    });
    cursor = nextTopPx;
    index = next;
  }

  // Line quantisation can leave a thin remainder past the estimate; fold it back
  // into the previous page rather than emitting a near-empty trailing page.
  while (segments.length > Math.max(1, estimatedPages) && segments.length >= 2) {
    const last = segments[segments.length - 1];
    if (last === undefined || last.endPx - last.startPx >= areaHeightPx * 0.25) {
      break;
    }
    const prev = segments[segments.length - 2];
    if (prev === undefined) {
      break;
    }
    segments.splice(segments.length - 2, 2, { startPx: prev.startPx, endPx: last.endPx });
  }

  return segments.length > 0 ? segments : [{ startPx: padTopPx, endPx: contentEndPx }];
};

const defaultRenderDocx: RenderDocx = async (data, bodyContainer, styleContainer, options) => {
  const { renderAsync } = await import("docx-preview");
  return renderAsync(data, bodyContainer, styleContainer, options);
};

const defaultCaptureElement: CaptureElement = async (element) => {
  const { default: html2canvas } = await import("html2canvas");
  return html2canvas(element, {
    backgroundColor: "#ffffff",
    logging: false,
    scale: RASTER_SCALE,
    useCORS: false,
  });
};

const numericStyle = (value: string | undefined): number => {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
};

const collectLineRects = (section: HTMLElement): LineRect[] => {
  const owner = section.ownerDocument;
  const sectionTop = section.getBoundingClientRect().top;
  const raw: LineRect[] = [];
  const push = (rect: DOMRect): void => {
    if (rect.height > MIN_LINE_HEIGHT_PX) {
      raw.push({ topPx: rect.top - sectionTop, bottomPx: rect.bottom - sectionTop });
    }
  };

  const walker = owner.createTreeWalker(section, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if ((node.nodeValue ?? "").trim().length === 0) {
      continue;
    }
    const range = owner.createRange();
    range.selectNodeContents(node);
    for (const rect of Array.from(range.getClientRects())) {
      push(rect);
    }
  }
  for (const media of Array.from(section.querySelectorAll("img, svg, canvas, table"))) {
    push(media.getBoundingClientRect());
  }

  raw.sort((a, b) => a.topPx - b.topPx);
  const merged: LineRect[] = [];
  for (const rect of raw) {
    const last = merged.at(-1);
    const overlap =
      last === undefined
        ? 0
        : Math.min(rect.bottomPx, last.bottomPx) - Math.max(rect.topPx, last.topPx);
    if (last !== undefined && overlap > SAME_LINE_OVERLAP_PX) {
      merged[merged.length - 1] = {
        topPx: Math.min(last.topPx, rect.topPx),
        bottomPx: Math.max(last.bottomPx, rect.bottomPx),
      };
    } else {
      merged.push(rect);
    }
  }
  return merged;
};

const defaultMeasureSection: MeasureSection = (section) => {
  const view = section.ownerDocument.defaultView;
  const computed = view?.getComputedStyle(section);
  const rect = section.getBoundingClientRect();
  return {
    widthPx: numericStyle(computed?.width) || rect.width || section.offsetWidth,
    pageHeightPx: numericStyle(computed?.minHeight),
    padTopPx: numericStyle(computed?.paddingTop),
    padBottomPx: numericStyle(computed?.paddingBottom),
    totalHeightPx: Math.max(rect.height, section.scrollHeight, section.offsetHeight),
    lines: collectLineRects(section),
  };
};

const defaultComposePage: ComposePage = (source, spec) => {
  const canvas = source.ownerDocument.createElement("canvas");
  canvas.width = Math.max(1, Math.round(spec.pageWidthPx));
  canvas.height = Math.max(1, Math.round(spec.pageHeightPx));
  const context = canvas.getContext("2d");
  if (context !== null) {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const sourceHeight = Math.min(spec.sourceHeightPx, source.height - spec.sourceYpx);
    if (sourceHeight > 0) {
      context.drawImage(
        source,
        0,
        spec.sourceYpx,
        source.width,
        sourceHeight,
        0,
        spec.destYpx,
        canvas.width,
        sourceHeight,
      );
    }
  }
  return canvas;
};

const conversionError = (
  message: string,
  code: EditorError["code"] = "DocumentConversionFailed",
) => ({
  ok: false as const,
  error: { code, message },
});

const dataUrlToBytes = (dataUrl: string): Uint8Array => {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

/**
 * Neutralizes images that would make html2canvas reach the network during
 * capture. Embedded images (data: / blob:) are kept; anything else is removed so
 * conversion never contacts an external host (see FILE_SECURITY.md).
 */
const stripExternalReferences = (container: HTMLElement): void => {
  for (const image of Array.from(container.querySelectorAll("img"))) {
    const source = image.getAttribute("src") ?? "";
    if (!source.startsWith("data:") && !source.startsWith("blob:")) {
      image.removeAttribute("src");
      image.removeAttribute("srcset");
    }
  }
};

/**
 * Converts a `.docx` file to PDF entirely in the browser: it renders the
 * document into a hidden, inert DOM container, paginates each rendered section
 * at line boundaries so the PDF page count and per-page content match the
 * source, rasterizes each page, and assembles the images with `pdf-lib`
 * (ADR-006). The container is always removed and the source bytes are not
 * retained.
 */
export class BrowserDocxToPdfGateway implements DocumentImportGateway {
  readonly #deps: DocxToPdfDependencies;

  public constructor(deps: Partial<DocxToPdfDependencies> = {}) {
    this.#deps = {
      renderDocx: deps.renderDocx ?? defaultRenderDocx,
      captureElement: deps.captureElement ?? defaultCaptureElement,
      measureSection: deps.measureSection ?? defaultMeasureSection,
      composePage: deps.composePage ?? defaultComposePage,
      assemblePages: deps.assemblePages ?? rasterPagesToPdf,
      documentRef: deps.documentRef ?? globalThis.document,
    };
  }

  public async convertToPdf(file: LocalPdfFile): Promise<DocumentImportResult> {
    if (file.size <= 0) {
      return conversionError("This Word document is empty.");
    }
    if (file.size > MAX_DOCX_BYTES) {
      return conversionError(
        "This Word document is too large to convert in the browser. Save it as a PDF and try again.",
      );
    }

    const doc = this.#deps.documentRef;
    const container = doc.createElement("div");
    container.setAttribute("aria-hidden", "true");
    container.style.position = "absolute";
    container.style.left = "-100000px";
    container.style.top = "0";
    container.style.width = `${String(FALLBACK_PAGE_WIDTH_PX)}px`;
    container.style.background = "#ffffff";
    doc.body.appendChild(container);

    try {
      const buffer = await file.arrayBuffer();
      await this.#deps.renderDocx(new Blob([buffer]), container, undefined, {
        inWrapper: true,
        breakPages: true,
        ignoreLastRenderedPageBreak: false,
        renderComments: false,
        renderChanges: false,
        useBase64URL: true,
      });
      stripExternalReferences(container);

      const sections = Array.from(container.querySelectorAll<HTMLElement>("section.docx"));
      const targets = sections.length > 0 ? sections : [container];

      const pages: RasterPage[] = [];
      for (const target of targets) {
        pages.push(...(await this.#sectionToPages(target)));
      }

      const assembled = await this.#deps.assemblePages(pages);
      if (!assembled.ok) {
        return assembled;
      }
      return { ok: true, fileName: file.name, bytes: assembled.bytes };
    } catch {
      return conversionError("This Word document could not be converted to a PDF.");
    } finally {
      container.remove();
    }
  }

  async #sectionToPages(section: HTMLElement): Promise<RasterPage[]> {
    const metrics = this.#deps.measureSection(section);
    const canvas = await this.#deps.captureElement(section);
    const scale =
      metrics.widthPx > 0 && canvas.width > 0 ? canvas.width / metrics.widthPx : RASTER_SCALE;
    const areaHeightPx = metrics.pageHeightPx - metrics.padTopPx - metrics.padBottomPx;

    // Unmeasurable section: emit the whole capture as one page at its rendered aspect.
    if (!(areaHeightPx > 0) || metrics.lines.length === 0) {
      return [
        {
          pngBytes: dataUrlToBytes(canvas.toDataURL("image/png")),
          widthPt: pxToPt(metrics.widthPx > 0 ? metrics.widthPx : FALLBACK_PAGE_WIDTH_PX),
          heightPt: pxToPt(
            metrics.totalHeightPx > 0 ? metrics.totalHeightPx : FALLBACK_PAGE_HEIGHT_PX,
          ),
        },
      ];
    }

    const segments = planSectionSegments(metrics);
    const widthPt = pxToPt(metrics.widthPx);
    const heightPt = pxToPt(metrics.pageHeightPx);
    const pageWidthPx = metrics.widthPx * scale;
    const pageHeightPx = metrics.pageHeightPx * scale;
    const destYpx = metrics.padTopPx * scale;

    return segments.map((segment) => {
      const composed = this.#deps.composePage(canvas, {
        sourceYpx: segment.startPx * scale,
        sourceHeightPx: (segment.endPx - segment.startPx) * scale,
        destYpx,
        pageWidthPx,
        pageHeightPx,
      });
      return { pngBytes: dataUrlToBytes(composed.toDataURL("image/png")), widthPt, heightPt };
    });
  }
}
