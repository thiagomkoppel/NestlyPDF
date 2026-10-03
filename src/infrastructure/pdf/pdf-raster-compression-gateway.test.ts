import { PDFDocument } from "pdf-lib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PdfRasterCompressionGateway } from "./pdf-raster-compression-gateway";

const pdfjsMock = vi.hoisted(() => ({
  getDocument: vi.fn(),
}));

vi.mock("./pdfjs-runtime", () => ({ pdfjs: pdfjsMock }));

/** A real, minimal 1x1 JPEG so pdf-lib's embedJpg accepts the decoded canvas output. */
const ONE_PIXEL_JPEG_DATA_URL =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=";

interface PageFixture {
  readonly getViewport: ReturnType<typeof vi.fn>;
  readonly render: ReturnType<typeof vi.fn>;
  readonly cleanup: ReturnType<typeof vi.fn>;
}

const createPageFixture = (renderPromise: Promise<undefined> = Promise.resolve(undefined)) => {
  const renderTask = { promise: renderPromise, cancel: vi.fn() };
  const page: PageFixture = {
    getViewport: vi.fn(({ scale }: { readonly scale: number }) => ({
      width: 200 * scale,
      height: 100 * scale,
    })),
    render: vi.fn(() => renderTask),
    cleanup: vi.fn(),
  };
  return { page, renderTask };
};

type PageFixtureEntry = ReturnType<typeof createPageFixture>;

const pageAt = (pages: readonly PageFixtureEntry[], index: number): PageFixtureEntry => {
  const page = pages[index];
  if (page === undefined) throw new Error(`Missing page fixture at index ${String(index)}`);
  return page;
};

const createDocumentFixture = (pageCount: number) => {
  const pages = Array.from({ length: pageCount }, () => createPageFixture());
  const document = {
    numPages: pageCount,
    getPage: vi.fn((index: number) => Promise.resolve(pageAt(pages, index - 1).page)),
  };
  const loadingTask = { promise: Promise.resolve(document) };
  return { document, loadingTask, pages };
};

const createSinglePageDocumentFixture = (renderPromise: Promise<undefined>) => {
  const page = createPageFixture(renderPromise);
  const document = {
    numPages: 1,
    getPage: vi.fn(() => Promise.resolve(page.page)),
  };
  const loadingTask = { promise: Promise.resolve(document) };
  return { document, loadingTask, page };
};

const context = {
  fillStyle: "",
  fillRect: vi.fn(),
  clearRect: vi.fn(),
} as unknown as CanvasRenderingContext2D;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(ONE_PIXEL_JPEG_DATA_URL);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PdfRasterCompressionGateway", () => {
  it("rasterizes every page into a flattened PDF and reports progress in order", async () => {
    const fixture = createDocumentFixture(2);
    pdfjsMock.getDocument.mockReturnValueOnce(fixture.loadingTask);
    const gateway = new PdfRasterCompressionGateway();
    const progress: { currentPage: number; totalPages: number; unit?: string }[] = [];

    const result = await gateway.compress({
      bytes: new Uint8Array([37, 80, 68, 70]),
      onProgress: (update) => progress.push(update),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(progress).toEqual([
      { currentPage: 1, totalPages: 2, unit: "page" },
      { currentPage: 2, totalPages: 2, unit: "page" },
    ]);
    expect(pageAt(fixture.pages, 0).page.cleanup).toHaveBeenCalledTimes(1);
    expect(pageAt(fixture.pages, 1).page.cleanup).toHaveBeenCalledTimes(1);

    const output = await PDFDocument.load(result.bytes);
    expect(output.getPageCount()).toBe(2);
    expect(output.getPage(0).getSize()).toEqual({ width: 200, height: 100 });
  });

  it("stamps the chosen document dates on the rebuilt PDF", async () => {
    const fixture = createDocumentFixture(1);
    pdfjsMock.getDocument.mockReturnValueOnce(fixture.loadingTask);
    const gateway = new PdfRasterCompressionGateway();

    const result = await gateway.compress({
      bytes: new Uint8Array([37, 80, 68, 70]),
      documentDates: {
        creationDate: Date.parse("2001-02-03T04:05:06Z"),
        modificationDate: Date.parse("2002-03-04T05:06:07Z"),
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const output = await PDFDocument.load(result.bytes, { updateMetadata: false });
    expect(output.getCreationDate()?.getTime()).toBe(Date.parse("2001-02-03T04:05:06Z"));
    expect(output.getModificationDate()?.getTime()).toBe(Date.parse("2002-03-04T05:06:07Z"));
  });

  it("returns cancelled without opening the document when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const gateway = new PdfRasterCompressionGateway();

    const result = await gateway.compress({
      bytes: new Uint8Array([37, 80, 68, 70]),
      signal: controller.signal,
    });

    expect(result).toEqual({
      ok: false,
      cancelled: true,
      message: "PDF compression was cancelled.",
    });
    expect(pdfjsMock.getDocument).not.toHaveBeenCalled();
  });

  it("stops before rendering the next page once the signal aborts mid-loop", async () => {
    const fixture = createDocumentFixture(3);
    pdfjsMock.getDocument.mockReturnValueOnce(fixture.loadingTask);
    const controller = new AbortController();
    const gateway = new PdfRasterCompressionGateway();

    const result = await gateway.compress({
      bytes: new Uint8Array([37, 80, 68, 70]),
      signal: controller.signal,
      onProgress: ({ currentPage }) => {
        if (currentPage === 1) controller.abort();
      },
    });

    expect(result).toEqual({
      ok: false,
      cancelled: true,
      message: "PDF compression was cancelled.",
    });
    expect(fixture.document.getPage).toHaveBeenCalledTimes(1);
  });

  it("cancels the in-flight render task and resolves cancelled when the signal aborts during render", async () => {
    let rejectRender: (error: unknown) => void = () => undefined;
    const renderPromise = new Promise<undefined>((_resolve, reject) => {
      rejectRender = reject;
    });
    const fixture = createSinglePageDocumentFixture(renderPromise);
    pdfjsMock.getDocument.mockReturnValueOnce(fixture.loadingTask);
    const controller = new AbortController();
    const gateway = new PdfRasterCompressionGateway();

    const compressing = gateway.compress({
      bytes: new Uint8Array([37, 80, 68, 70]),
      signal: controller.signal,
    });
    await vi.waitFor(() => {
      expect(fixture.page.page.render).toHaveBeenCalled();
    });
    controller.abort();
    rejectRender(Object.assign(new Error("cancelled"), { name: "RenderingCancelledException" }));

    await expect(compressing).resolves.toEqual({
      ok: false,
      cancelled: true,
      message: "PDF compression was cancelled.",
    });
    expect(fixture.page.renderTask.cancel).toHaveBeenCalledTimes(1);
  });

  it("returns a failed result when the canvas 2d context is unavailable", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const fixture = createDocumentFixture(1);
    pdfjsMock.getDocument.mockReturnValueOnce(fixture.loadingTask);
    const gateway = new PdfRasterCompressionGateway();

    const result = await gateway.compress({ bytes: new Uint8Array([37, 80, 68, 70]) });

    expect(result).toEqual({
      ok: false,
      cancelled: false,
      message: "The PDF could not be compressed in this browser.",
    });
  });

  it("returns a failed result when a page render task rejects for a reason other than cancellation", async () => {
    const fixture = createSinglePageDocumentFixture(Promise.reject(new Error("boom")));
    pdfjsMock.getDocument.mockReturnValueOnce(fixture.loadingTask);
    const gateway = new PdfRasterCompressionGateway();

    const result = await gateway.compress({ bytes: new Uint8Array([37, 80, 68, 70]) });

    expect(result).toEqual({
      ok: false,
      cancelled: false,
      message: "The PDF could not be compressed in this browser.",
    });
  });

  it("returns a failed result when the source PDF cannot be opened", async () => {
    pdfjsMock.getDocument.mockReturnValueOnce({ promise: Promise.reject(new Error("bad pdf")) });
    const gateway = new PdfRasterCompressionGateway();

    const result = await gateway.compress({ bytes: new Uint8Array([37, 80, 68, 70]) });

    expect(result).toEqual({
      ok: false,
      cancelled: false,
      message: "The PDF could not be compressed in this browser.",
    });
  });
});
