import { afterEach, describe, expect, it, vi } from "vitest";

import type { LocalPdfFile } from "../../application/editor-application";
import type { RasterPage } from "../pdf/image-pages-to-pdf";

import {
  BrowserDocxToPdfGateway,
  estimatePageCount,
  MAX_DOCX_BYTES,
  planSectionSegments,
  type DocxToPdfDependencies,
  type LineRect,
  type PageCompositionSpec,
  type SectionMetrics,
} from "./browser-docx-to-pdf-gateway";

const docxFile = (overrides: Partial<LocalPdfFile> = {}): LocalPdfFile => ({
  name: "letter.docx",
  size: 4096,
  type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  arrayBuffer: () => Promise.resolve(new ArrayBuffer(4096)),
  ...overrides,
});

const fakeCanvas = (width = 1632, height = 7110): HTMLCanvasElement =>
  ({
    width,
    height,
    toDataURL: () => "data:image/png;base64,AAAA",
  }) as unknown as HTMLCanvasElement;

/** `count` lines of `lineHeightPx`, stacked with no gap, starting at `startPx`. */
const stackedLines = (startPx: number, lineHeightPx: number, count: number): LineRect[] =>
  Array.from({ length: count }, (_, index) => ({
    topPx: startPx + index * lineHeightPx,
    bottomPx: startPx + index * lineHeightPx + lineHeightPx,
  }));

const LETTER = {
  widthPx: 816,
  pageHeightPx: 1056,
  padTopPx: 96,
  padBottomPx: 96,
} as const;

const metricsWithLines = (lines: LineRect[]): SectionMetrics => ({
  ...LETTER,
  totalHeightPx: (lines.at(-1)?.bottomPx ?? LETTER.pageHeightPx) + LETTER.padBottomPx,
  lines,
});

const addSection = (container: HTMLElement): HTMLElement => {
  const section = container.ownerDocument.createElement("section");
  section.className = "docx";
  container.appendChild(section);
  return section;
};

const buildGateway = (
  overrides: Partial<DocxToPdfDependencies> = {},
): {
  gateway: BrowserDocxToPdfGateway;
  assembled: RasterPage[][];
  composeSpecs: PageCompositionSpec[];
} => {
  const assembled: RasterPage[][] = [];
  const composeSpecs: PageCompositionSpec[] = [];
  const gateway = new BrowserDocxToPdfGateway({
    documentRef: document,
    renderDocx: (_data, container) => {
      addSection(container);
      return Promise.resolve();
    },
    measureSection: () => metricsWithLines(stackedLines(96, 20, 3)),
    captureElement: () => Promise.resolve(fakeCanvas()),
    composePage: (_source, spec) => {
      composeSpecs.push(spec);
      return fakeCanvas();
    },
    assemblePages: (pages) => {
      assembled.push([...pages]);
      return Promise.resolve({ ok: true, bytes: new Uint8Array([37, 80, 68, 70, 45]) });
    },
    ...overrides,
  });
  return { gateway, assembled, composeSpecs };
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("estimatePageCount", () => {
  it("packs content the way a word processor does", () => {
    expect(estimatePageCount(500, 864)).toBe(1);
    expect(estimatePageCount(864 * 3.9, 864)).toBe(4);
    expect(estimatePageCount(864 * 3.0, 864)).toBe(3);
  });

  it("never returns fewer pages than the layout strictly needs", () => {
    expect(estimatePageCount(864 * 2.2, 864)).toBe(3);
    expect(estimatePageCount(864 * 4.6, 864)).toBe(5);
  });

  it("returns one page for empty or degenerate input", () => {
    expect(estimatePageCount(0, 864)).toBe(1);
    expect(estimatePageCount(500, 0)).toBe(1);
  });
});

describe("planSectionSegments", () => {
  const area = LETTER.pageHeightPx - LETTER.padTopPx - LETTER.padBottomPx; // 864

  it("keeps content that fits one page as a single segment", () => {
    const segments = planSectionSegments(metricsWithLines(stackedLines(96, 20, 10)));
    expect(segments).toHaveLength(1);
    expect(segments[0]?.startPx).toBe(96);
  });

  it("splits flowing content into its estimated page count, never mid-line", () => {
    const lines = stackedLines(96, 20, 130); // ~2600px of content
    const metrics = metricsWithLines(lines);
    const segments = planSectionSegments(metrics);

    expect(segments).toHaveLength(estimatePageCount(metrics.totalHeightPx - 192, area));
    // Every break lands exactly on a line top: no line is cut.
    const lineTops = new Set(lines.map((line) => line.topPx));
    for (const segment of segments.slice(1)) {
      expect(lineTops.has(segment.startPx)).toBe(true);
    }
    // Segments are contiguous and cover all content.
    for (let index = 1; index < segments.length; index += 1) {
      expect(segments[index]?.startPx).toBe(segments[index - 1]?.endPx);
    }
    expect(segments[0]?.startPx).toBe(96);
    expect(segments.at(-1)?.endPx).toBe(metrics.totalHeightPx - LETTER.padBottomPx);
  });

  it("spreads content evenly so the final page is never a thin sliver", () => {
    // ~2.85 pages of content stays three pages, folding any line-quantised
    // remainder back rather than emitting a near-empty fourth page.
    const lines = stackedLines(96, 18, Math.round((area * 2.85) / 18));
    const segments = planSectionSegments(metricsWithLines(lines));

    expect(segments).toHaveLength(3);
    const heights = segments.map((segment) => segment.endPx - segment.startPx);
    expect(Math.min(...heights)).toBeGreaterThan(Math.max(...heights) * 0.6);
  });

  it("keeps every non-final page within the content area", () => {
    const segments = planSectionSegments(metricsWithLines(stackedLines(96, 18, 200)));
    for (const segment of segments.slice(0, -1)) {
      expect(segment.endPx - segment.startPx).toBeLessThanOrEqual(area + 24);
    }
  });

  it("makes progress even when a single line is taller than the page", () => {
    const tallLine: LineRect = { topPx: 96, bottomPx: 96 + 2000 };
    const segments = planSectionSegments(
      metricsWithLines([tallLine, { topPx: 2100, bottomPx: 2120 }]),
    );
    expect(segments.length).toBeGreaterThanOrEqual(2);
  });

  it("returns one segment when there are no measured lines", () => {
    const segments = planSectionSegments({
      ...LETTER,
      totalHeightPx: 4000,
      lines: [],
    });
    expect(segments).toEqual([{ startPx: 96, endPx: 4000 - 96 }]);
  });
});

describe("BrowserDocxToPdfGateway", () => {
  it("assembles one PDF page per planned segment", async () => {
    const { gateway, assembled, composeSpecs } = buildGateway({
      measureSection: () => metricsWithLines(stackedLines(96, 20, 130)), // ~3 pages
    });

    const result = await gateway.convertToPdf(docxFile());

    expect(result.ok).toBe(true);
    const planned = planSectionSegments(metricsWithLines(stackedLines(96, 20, 130)));
    expect(assembled[0]).toHaveLength(planned.length);
    expect(composeSpecs).toHaveLength(planned.length);
    // Content is always placed at the top margin, and pages are the document page size.
    for (const spec of composeSpecs) {
      expect(spec.destYpx).toBe(96 * 2); // padTop * scale (canvas 1632 / width 816)
      expect(spec.pageWidthPx).toBe(816 * 2);
      expect(spec.pageHeightPx).toBe(1056 * 2);
    }
    expect(assembled[0]?.[0]).toMatchObject({ widthPt: 612, heightPt: 792 });
  });

  it("keeps a short document to a single page", async () => {
    const { gateway, assembled } = buildGateway({
      measureSection: () => metricsWithLines(stackedLines(96, 20, 4)),
    });

    await gateway.convertToPdf(docxFile());

    expect(assembled[0]).toHaveLength(1);
  });

  it("produces one page per section for a document with explicit page breaks", async () => {
    const { gateway, assembled } = buildGateway({
      renderDocx: (_data, container) => {
        addSection(container);
        addSection(container);
        addSection(container);
        return Promise.resolve();
      },
      measureSection: () => metricsWithLines(stackedLines(96, 20, 5)),
    });

    await gateway.convertToPdf(docxFile());

    expect(assembled[0]).toHaveLength(3);
  });

  it("removes the scratch render container after a successful conversion", async () => {
    const { gateway } = buildGateway();

    await gateway.convertToPdf(docxFile());

    expect(document.body.children).toHaveLength(0);
  });

  it("removes the scratch render container after a failed conversion", async () => {
    const { gateway } = buildGateway({
      renderDocx: () => Promise.reject(new Error("render blew up")),
    });

    const result = await gateway.convertToPdf(docxFile());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("DocumentConversionFailed");
    expect(document.body.children).toHaveLength(0);
  });

  it("strips references to external resources before capturing a page", async () => {
    let capturedSrc: string | null = "unset";
    const { gateway } = buildGateway({
      renderDocx: (_data, container) => {
        const section = addSection(container);
        const image = container.ownerDocument.createElement("img");
        image.setAttribute("src", "https://tracker.example/pixel.png");
        section.appendChild(image);
        return Promise.resolve();
      },
      captureElement: (element) => {
        capturedSrc = element.querySelector("img")?.getAttribute("src") ?? null;
        return Promise.resolve(fakeCanvas());
      },
    });

    await gateway.convertToPdf(docxFile());

    expect(capturedSrc).toBeNull();
  });

  it("rejects a document larger than the conversion limit without rendering it", async () => {
    const renderDocx = vi.fn(() => Promise.resolve());
    const { gateway } = buildGateway({ renderDocx });

    const result = await gateway.convertToPdf(docxFile({ size: MAX_DOCX_BYTES + 1 }));

    expect(result.ok).toBe(false);
    expect(renderDocx).not.toHaveBeenCalled();
  });

  it("rejects an empty document", async () => {
    const { gateway } = buildGateway();

    const result = await gateway.convertToPdf(docxFile({ size: 0 }));

    expect(result.ok).toBe(false);
  });

  it("passes an assembly failure through unchanged", async () => {
    const { gateway } = buildGateway({
      assemblePages: () =>
        Promise.resolve({
          ok: false,
          error: { code: "DocumentConversionEmpty", message: "no pages" },
        }),
    });

    const result = await gateway.convertToPdf(docxFile());

    expect(result).toEqual({
      ok: false,
      error: { code: "DocumentConversionEmpty", message: "no pages" },
    });
  });

  it("falls back to one page when a section cannot be measured", async () => {
    const { gateway, assembled, composeSpecs } = buildGateway({
      renderDocx: (_data, container) => {
        container.appendChild(container.ownerDocument.createElement("p"));
        return Promise.resolve();
      },
      measureSection: () => ({
        widthPx: 0,
        pageHeightPx: 0,
        padTopPx: 0,
        padBottomPx: 0,
        totalHeightPx: 0,
        lines: [],
      }),
    });

    const result = await gateway.convertToPdf(docxFile());

    expect(result.ok).toBe(true);
    expect(assembled[0]).toHaveLength(1);
    expect(composeSpecs).toHaveLength(0); // whole capture used directly
  });
});
