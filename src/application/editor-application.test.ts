import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  DateProvider,
  DocumentImportGateway,
  DocumentImportResult,
  DownloadAdapter,
  DownloadRequest,
  IdGenerator,
  LocalPdfFile,
  LocalPdfFileReader,
  LocalPdfReadResult,
  PdfCompressionGateway,
  PdfExportGateway,
  PdfExportRequest,
  PdfExportResult,
  PdfOpenResult,
  PdfRenderDocumentGateway,
  PdfRenderDocumentResult,
} from "./editor-application";
import {
  classifyDocumentSize,
  classifyOpenableFile,
  MAX_TEXT_FONT_SIZE,
  MIN_TEXT_FONT_SIZE,
  PdfEditorApplication,
  validateImageFile,
  validateSignatureImageFile,
} from "./editor-application";

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

const deferred = <T>(): Deferred<T> => {
  let resolvePromise: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
};

class TestIds implements IdGenerator {
  #next = 1;

  public nextId(prefix: string): string {
    const id = `${prefix}-${String(this.#next)}`;
    this.#next += 1;
    return id;
  }
}

const file: LocalPdfFile = {
  name: "contract.pdf",
  size: 5,
  type: "application/pdf",
  arrayBuffer: () => Promise.resolve(new ArrayBuffer(5)),
};

describe("PdfEditorApplication export", () => {
  let readResult: LocalPdfReadResult;
  let openResult: PdfOpenResult;
  let exportResult: PdfExportResult;
  let reader: LocalPdfFileReader;
  let gateway: PdfExportGateway;
  let downloader: DownloadAdapter;
  let exportRequests: PdfExportRequest[];
  let downloadRequests: DownloadRequest[];
  let app: PdfEditorApplication;

  beforeEach(async () => {
    readResult = {
      ok: true,
      fileName: "contract.pdf",
      bytes: new Uint8Array([37, 80, 68, 70, 45]),
    };
    openResult = {
      ok: true,
      pages: [{ id: "page-1", width: 300, height: 400, rotation: 0 }],
    };
    exportResult = { ok: true, bytes: new Uint8Array([1, 2, 3]) };
    reader = { read: vi.fn(() => Promise.resolve(readResult)) };
    exportRequests = [];
    downloadRequests = [];

    gateway = {
      open: vi.fn(() => Promise.resolve(openResult)),
      exportPdf: (request) => {
        exportRequests.push(request);
        return Promise.resolve(exportResult);
      },
    };
    downloader = {
      download: (request) => {
        downloadRequests.push(request);
      },
    };
    app = new PdfEditorApplication(reader, gateway, downloader, new TestIds());
    await app.openFile(file);
  });

  it("navigates ordered pages by stable ID without affecting history or dirty state", async () => {
    openResult = {
      ok: true,
      pages: [
        { id: "first", width: 300, height: 400, rotation: 0 },
        { id: "middle", width: 400, height: 300, rotation: 0 },
        { id: "last", width: 300, height: 500, rotation: 0 },
      ],
    };
    await app.openFile(file);

    expect(app.selectPage("middle").state).toMatchObject({
      currentPageNumber: 2,
      currentPage: { id: "middle" },
      isDirty: false,
    });
    expect(app.previousPage().state.currentPage?.id).toBe("first");
    expect(app.nextPage().state.currentPage?.id).toBe("middle");
    expect(app.nextPage().state.currentPage?.id).toBe("last");
    expect(app.nextPage().state.currentPage?.id).toBe("last");
    expect(app.snapshot().canUndo).toBe(false);
    expect(app.selectPage("missing").state.error?.code).toBe("OperationRejected");
  });
  it.each(["text", "checkmark", "cross"] as const)(
    "records %s color changes as one undoable element update",
    (type) => {
      const added =
        type === "text"
          ? app.addText({ x: 10, y: 20 }, "Colour history")
          : type === "checkmark"
            ? app.addCheckmark({ x: 10, y: 20 })
            : app.addCross({ x: 10, y: 20 });
      const elementId = added.state.selectedElementId;
      expect(elementId).toBeDefined();
      if (elementId === undefined) {
        return;
      }
      expect(added.state.selectedElement?.color).toBe("#000000");

      const changed = app.updateElementColor(elementId, "#c62828");
      expect(changed.state.selectedElement?.color).toBe("#c62828");

      const undone = app.undo();
      expect(undone.state.selectedElement?.id).toBe(elementId);
      expect(undone.state.selectedElement?.color).toBe("#000000");

      const redone = app.redo();
      expect(redone.state.selectedElement?.id).toBe(elementId);
      expect(redone.state.selectedElement?.color).toBe("#c62828");
    },
  );
  it.each(["text", "date", "checkmark", "cross"] as const)(
    "preserves %s color through move and resize history",
    (type) => {
      const added =
        type === "text"
          ? app.addText({ x: 10, y: 20 }, "Ink")
          : type === "date"
            ? app.addDate({ x: 10, y: 20 })
            : type === "checkmark"
              ? app.addCheckmark({ x: 10, y: 20 })
              : app.addCross({ x: 10, y: 20 });
      const elementId = added.state.selectedElementId;
      const startBounds = added.state.selectedElement?.bounds;
      expect(elementId).toBeDefined();
      expect(startBounds).toBeDefined();
      if (elementId === undefined || startBounds === undefined) {
        return;
      }

      app.updateElementColor(elementId, "#c62828");
      const moved = app.commitMoveElement(elementId, startBounds, {
        ...startBounds,
        x: startBounds.x + 24,
        y: startBounds.y + 16,
      });
      const movedBounds = moved.state.selectedElement?.bounds;
      expect(moved.state.selectedElement?.color).toBe("#c62828");
      expect(movedBounds).toBeDefined();
      if (movedBounds === undefined) {
        return;
      }

      const resized = app.commitResizeElement(elementId, movedBounds, {
        ...movedBounds,
        width: movedBounds.width + 20,
        height: movedBounds.height + 12,
      });
      expect(resized.state.selectedElement?.color).toBe("#c62828");
      expect(app.undo().state.selectedElement?.color).toBe("#c62828");
      expect(app.undo().state.selectedElement?.color).toBe("#c62828");
      expect(app.redo().state.selectedElement?.color).toBe("#c62828");
      expect(app.redo().state.selectedElement?.color).toBe("#c62828");
    },
  );
  it("accepts explicit initial geometry for compact placement", () => {
    const text = app.addText({ x: 10, y: 20 }, "Text", { width: 200, height: 52 });
    expect(text.state.selectedElement?.bounds).toEqual({ x: 10, y: 20, width: 200, height: 52 });

    const checkmark = app.addCheckmark({ x: 80, y: 90 }, 44);
    expect(checkmark.state.selectedElement?.bounds).toEqual({
      x: 58,
      y: 68,
      width: 44,
      height: 44,
    });

    const date = app.addDate({ x: 30, y: 40 }, { width: 144, height: 40 });
    expect(date.state.selectedElement?.bounds).toEqual({ x: 30, y: 40, width: 144, height: 40 });
  });

  it("resizes text bounds without changing the Style-tab font size", () => {
    const added = app.addText({ x: 10, y: 20 }, "Fixed text");
    const elementId = added.state.selectedElementId;
    expect(elementId).toBeDefined();
    if (elementId === undefined) {
      return;
    }

    app.updateTextFontSize(elementId, 24);
    const resized = app.commitResizeElement(
      elementId,
      { x: 10, y: 20, width: 160, height: 40 },
      { x: 10, y: 20, width: 240, height: 80 },
    );
    expect(resized.state.selectedElement).toMatchObject({
      bounds: { x: 10, y: 20, width: 240, height: 80 },
      textAppearance: { fontSize: 24 },
    });

    expect(app.undo().state.selectedElement).toMatchObject({
      bounds: { x: 10, y: 20, width: 160, height: 40 },
      textAppearance: { fontSize: 24 },
    });
  });
  it("keeps color history intact after coalesced text edits", () => {
    const added = app.addText({ x: 10, y: 20 }, "Original");
    const elementId = added.state.selectedElementId;
    expect(elementId).toBeDefined();
    if (elementId === undefined) {
      return;
    }

    app.updateElementColor(elementId, "#c62828");
    app.updateText(elementId, "First edit");
    app.updateText(elementId, "Final edit");

    expect(app.undo().state.selectedElement).toMatchObject({
      text: "Original",
      color: "#c62828",
    });
    expect(app.undo().state.selectedElement).toMatchObject({
      text: "Original",
      color: "#000000",
    });
    expect(app.redo().state.selectedElement).toMatchObject({ color: "#c62828" });
    expect(app.redo().state.selectedElement).toMatchObject({
      text: "Final edit",
      color: "#c62828",
    });
  });
  it("preserves Patrick Hand through history, duplication, and session-local paste", () => {
    const added = app.addText({ x: 10, y: 20 }, "John Doe");
    const elementId = added.state.selectedElementId;
    expect(elementId).toBeDefined();
    if (elementId === undefined) return;

    app.updateTextAppearance(elementId, { fontFamily: "Patrick Hand" });
    expect(app.undo().state.selectedElement).toMatchObject({
      textAppearance: { fontFamily: undefined },
    });
    expect(app.redo().state.selectedElement).toMatchObject({
      textAppearance: { fontFamily: "Patrick Hand" },
    });

    expect(app.duplicateElement(elementId).state.selectedElement).toMatchObject({
      textAppearance: { fontFamily: "Patrick Hand" },
    });
    app.selectElement(elementId);
    app.copySelectedElement();
    expect(app.pasteCopiedElement().state.selectedElement).toMatchObject({
      textAppearance: { fontFamily: "Patrick Hand" },
    });
  });
  it("preserves text color and appearance through size and resize history", () => {
    const added = app.addText({ x: 10, y: 20 }, "Styled text");
    const elementId = added.state.selectedElementId;
    expect(elementId).toBeDefined();
    if (elementId === undefined) {
      return;
    }

    app.updateTextAppearance(elementId, {
      fontFamily: "Georgia",
      bold: true,
      italic: true,
      underline: true,
      alignment: "center",
      lineHeight: 1.5,
      letterSpacing: 1,
    });
    app.updateElementColor(elementId, "#c62828");
    const resizedFont = app.updateTextFontSize(elementId, 24);
    expect(resizedFont.state.selectedElement).toMatchObject({
      color: "#c62828",
      textAppearance: {
        fontSize: 24,
        fontFamily: "Georgia",
        bold: true,
        italic: true,
        underline: true,
        alignment: "center",
        lineHeight: 1.5,
        letterSpacing: 1,
      },
    });

    const resized = app.commitTextResizeElement(
      elementId,
      { bounds: { x: 10, y: 20, width: 160, height: 40 }, fontSize: 24 },
      { bounds: { x: 10, y: 20, width: 220, height: 55 }, fontSize: 32 },
    );
    expect(resized.state.selectedElement).toMatchObject({
      color: "#c62828",
      bounds: { width: 220, height: 55 },
      textAppearance: { fontSize: 32, fontFamily: "Georgia", bold: true },
    });

    expect(app.undo().state.selectedElement).toMatchObject({
      color: "#c62828",
      bounds: { width: 160, height: 40 },
      textAppearance: { fontSize: 24, fontFamily: "Georgia", bold: true },
    });
    expect(app.redo().state.selectedElement).toMatchObject({
      color: "#c62828",
      bounds: { width: 220, height: 55 },
      textAppearance: { fontSize: 32, fontFamily: "Georgia", bold: true },
    });
  });

  it("preserves full text appearance through duplicate and session-local paste history", () => {
    const added = app.addText({ x: 10, y: 20 }, "Copied text");
    const elementId = added.state.selectedElementId;
    expect(elementId).toBeDefined();
    if (elementId === undefined) {
      return;
    }
    app.updateTextAppearance(elementId, { fontFamily: "Georgia", bold: true, alignment: "right" });
    app.updateElementColor(elementId, "#c62828");

    const duplicate = app.duplicateElement(elementId);
    expect(duplicate.state.selectedElement).toMatchObject({
      color: "#c62828",
      textAppearance: { fontFamily: "Georgia", bold: true, alignment: "right" },
    });
    expect(app.undo().state.visibleElements).toHaveLength(1);
    expect(app.redo().state.selectedElement).toMatchObject({ color: "#c62828" });

    app.selectElement(elementId);
    app.copySelectedElement();
    const pasted = app.pasteCopiedElement();
    expect(pasted.state.selectedElement).toMatchObject({
      color: "#c62828",
      textAppearance: { fontFamily: "Georgia", bold: true, alignment: "right" },
    });
    expect(app.undo().state.visibleElements).toHaveLength(2);
    expect(app.redo().state.selectedElement).toMatchObject({ color: "#c62828" });
  });

  it("reorders current-page layers through history and exports the same back-to-front order", async () => {
    const text = app.addText({ x: 10, y: 20 }, "Text").state.selectedElementId;
    const whiteout = app.addWhiteout({ x: 30, y: 40, width: 80, height: 40 }).state
      .selectedElementId;
    const checkmark = app.addCheckmark({ x: 50, y: 60 }).state.selectedElementId;
    expect(text).toBeDefined();
    expect(whiteout).toBeDefined();
    expect(checkmark).toBeDefined();
    if (text === undefined || whiteout === undefined || checkmark === undefined) {
      return;
    }

    const reordered = app.reorderCurrentPageLayers(text, 0);
    expect(reordered.state.visibleElements.map((element) => element.id)).toEqual([
      whiteout,
      checkmark,
      text,
    ]);
    expect(app.undo().state.visibleElements.map((element) => element.id)).toEqual([
      text,
      whiteout,
      checkmark,
    ]);
    expect(app.redo().state.visibleElements.map((element) => element.id)).toEqual([
      whiteout,
      checkmark,
      text,
    ]);

    await app.exportCurrentPdf();
    expect(exportRequests.at(-1)?.elements.map((element) => element.id)).toEqual([
      whiteout,
      checkmark,
      text,
    ]);
  });
  it("supports at least fifteen consecutive committed geometry changes with undo and redo", () => {
    const added = app.addCheckmark({ x: 10, y: 20 });
    const elementId = added.state.selectedElementId;
    expect(elementId).toBeDefined();
    if (elementId === undefined) {
      return;
    }
    app.updateElementColor(elementId, "#c62828");

    for (let index = 1; index <= 16; index += 1) {
      app.resizeElement(elementId, { width: 28 + index, height: 28 + index });
    }
    expect(app.snapshot().state.selectedElement).toMatchObject({
      color: "#c62828",
      bounds: { width: 44, height: 44 },
    });

    for (let index = 0; index < 16; index += 1) {
      app.undo();
    }
    expect(app.snapshot().state.selectedElement).toMatchObject({
      color: "#c62828",
      bounds: { width: 28, height: 28 },
    });

    for (let index = 0; index < 16; index += 1) {
      app.redo();
    }
    expect(app.snapshot().state.selectedElement).toMatchObject({
      color: "#c62828",
      bounds: { width: 44, height: 44 },
    });
  });
  it("exports from a copy of original bytes and keeps the editor session open", async () => {
    app.addWhiteout({ x: 40, y: 50, width: 120, height: 30 });
    app.addText({ x: 45, y: 55 }, "Replacement");

    const snapshot = await app.exportCurrentPdf();
    const exportRequest = exportRequests[0];
    expect(exportRequest).toBeDefined();
    if (exportRequest === undefined) {
      return;
    }

    expect(exportRequest.originalBytes).toEqual(new Uint8Array([37, 80, 68, 70, 45]));
    expect(exportRequest.originalBytes).not.toBe(readResult.ok ? readResult.bytes : undefined);
    expect(exportRequest.elements.map((element) => element.type)).toEqual(["whiteout", "text"]);
    const downloadRequest = downloadRequests[0];
    expect(downloadRequest).toBeDefined();
    if (downloadRequest === undefined) {
      return;
    }
    expect(downloadRequest).toMatchObject({
      filename: "contract-edited.pdf",
      mimeType: "application/pdf",
    });
    expect(snapshot.state.status).toBe("ready");
    expect(snapshot.state.isDirty).toBe(false);
    expect(snapshot.state.visibleElements).toHaveLength(2);
    expect(snapshot.canExport).toBe(true);
  });

  it("reports the document dates carried in by the PDF gateway", async () => {
    openResult = {
      ok: true,
      pages: [{ id: "page-1", width: 300, height: 400, rotation: 0 }],
      documentDates: { creationDate: 1_700_000_000_000, modificationDate: 1_700_000_600_000 },
    };

    const snapshot = await app.openFile(file);

    expect(snapshot.state.sourceDocumentDates).toEqual({
      creationDate: 1_700_000_000_000,
      modificationDate: 1_700_000_600_000,
    });
    expect(snapshot.state.documentDates).toEqual({
      creationDate: 1_700_000_000_000,
      modificationDate: 1_700_000_600_000,
    });
    expect(snapshot.state.isDirty).toBe(false);
  });

  it("exports the document dates chosen for the file", async () => {
    const snapshot = app.setDocumentDates({
      creationDate: 1_500_000_000_000,
      modificationDate: 1_600_000_000_000,
    });

    expect(snapshot.state.documentDates).toEqual({
      creationDate: 1_500_000_000_000,
      modificationDate: 1_600_000_000_000,
    });
    expect(snapshot.state.isDirty).toBe(true);

    await app.exportCurrentPdf({ filename: "dated.pdf" });

    expect(exportRequests.at(-1)?.documentDates).toEqual({
      creationDate: 1_500_000_000_000,
      modificationDate: 1_600_000_000_000,
    });
    expect(app.snapshot().state.isDirty).toBe(false);
  });

  it("leaves export dates to the gateway until the user chooses them", async () => {
    await app.exportCurrentPdf({ filename: "undated.pdf" });

    expect(exportRequests.at(-1)?.documentDates).toEqual({});
  });

  it("rejects document dates no calendar date can represent", () => {
    const snapshot = app.setDocumentDates({ creationDate: Number.NaN });

    expect(snapshot.state.error).toMatchObject({ code: "OperationRejected" });
    expect(snapshot.state.documentDates).toEqual({});
  });

  it("rejects document dates while no document is open", () => {
    const closed = new PdfEditorApplication(reader, gateway, downloader, new TestIds());

    const snapshot = closed.setDocumentDates({ creationDate: 1_500_000_000_000 });

    expect(snapshot.state.error).toMatchObject({ code: "NoActiveDocument" });
  });

  it("forwards chosen document dates to the compression gateway", async () => {
    const compress = vi.fn(() =>
      Promise.resolve({ ok: true as const, bytes: new Uint8Array([1, 2]) }),
    );
    const compressionGateway: PdfCompressionGateway = { compress };
    app = new PdfEditorApplication(
      reader,
      gateway,
      downloader,
      new TestIds(),
      undefined,
      undefined,
      compressionGateway,
    );
    await app.openFile(file);
    app.setDocumentDates({ creationDate: 1_500_000_000_000 });

    await app.exportCurrentPdf({ mode: "compressed", filename: "completed.pdf" });

    expect(compress).toHaveBeenCalledWith(
      expect.objectContaining({ documentDates: { creationDate: 1_500_000_000_000 } }),
    );
  });

  it("downloads compressed final export bytes only when compression reduces the file", async () => {
    const compress = vi.fn(() =>
      Promise.resolve({ ok: true as const, bytes: new Uint8Array([1, 2]) }),
    );
    const compressionGateway: PdfCompressionGateway = { compress };
    app = new PdfEditorApplication(
      reader,
      gateway,
      downloader,
      new TestIds(),
      undefined,
      undefined,
      compressionGateway,
    );
    await app.openFile(file);
    app.addText({ x: 45, y: 55 }, "Replacement");

    const snapshot = await app.exportCurrentPdf({ mode: "compressed", filename: "completed.pdf" });

    expect(compress).toHaveBeenCalledWith(
      expect.objectContaining({ bytes: new Uint8Array([1, 2, 3]) }),
    );
    expect(downloadRequests).toEqual([
      { bytes: new Uint8Array([1, 2]), filename: "completed.pdf", mimeType: "application/pdf" },
    ]);
    expect(snapshot.state.isDirty).toBe(false);
  });

  it("does not download a compressed export when it is not smaller than the final PDF", async () => {
    const compressionGateway: PdfCompressionGateway = {
      compress: vi.fn(() =>
        Promise.resolve({ ok: true as const, bytes: new Uint8Array([1, 2, 3]) }),
      ),
    };
    app = new PdfEditorApplication(
      reader,
      gateway,
      downloader,
      new TestIds(),
      undefined,
      undefined,
      compressionGateway,
    );
    await app.openFile(file);
    app.addText({ x: 45, y: 55 }, "Replacement");

    const snapshot = await app.exportCurrentPdf({ mode: "compressed" });

    expect(snapshot.state.error).toMatchObject({ code: "CompressionNotBeneficial" });
    expect(snapshot.state.isDirty).toBe(true);
    expect(downloadRequests).toEqual([]);
  });
  it("keeps the editor ready when compression reports an error", async () => {
    const compressionGateway: PdfCompressionGateway = {
      compress: vi.fn(() =>
        Promise.resolve({ ok: false as const, cancelled: false, message: "Compression failed." }),
      ),
    };
    app = new PdfEditorApplication(
      reader,
      gateway,
      downloader,
      new TestIds(),
      undefined,
      undefined,
      compressionGateway,
    );
    await app.openFile(file);

    const snapshot = await app.exportCurrentPdf({ mode: "compressed" });

    expect(snapshot.state).toMatchObject({
      status: "ready",
      error: { code: "CompressionFailed", message: "Compression failed." },
    });
    expect(snapshot.canExport).toBe(true);
    expect(downloadRequests).toEqual([]);
  });

  it("keeps the editor ready when compression is cancelled", async () => {
    const compressionGateway: PdfCompressionGateway = {
      compress: vi.fn(() =>
        Promise.resolve({
          ok: false as const,
          cancelled: true,
          message: "Ignored cancellation detail.",
        }),
      ),
    };
    app = new PdfEditorApplication(
      reader,
      gateway,
      downloader,
      new TestIds(),
      undefined,
      undefined,
      compressionGateway,
    );
    await app.openFile(file);

    const snapshot = await app.exportCurrentPdf({ mode: "compressed" });

    expect(snapshot.state).toMatchObject({
      status: "ready",
      error: { code: "CompressionFailed", message: "PDF compression was cancelled." },
    });
    expect(snapshot.canExport).toBe(true);
    expect(downloadRequests).toEqual([]);
  });
  it("skips empty text while preserving stable whiteout-before-text ordering", async () => {
    const emptyTextId = app.addText({ x: 10, y: 10 }, "   ").state.selectedElementId;
    app.addWhiteout({ x: 10, y: 20, width: 90, height: 30 });
    app.addText({ x: 10, y: 25 }, "Visible");

    expect(emptyTextId).toBeDefined();
    await app.exportCurrentPdf();
    const exportRequest = exportRequests[0];
    expect(exportRequest).toBeDefined();
    if (exportRequest === undefined) {
      return;
    }

    expect(exportRequest.elements.map((element) => [element.type, element.text])).toEqual([
      ["whiteout", undefined],
      ["text", "Visible"],
    ]);
  });

  it("updates selected text font size, clamps it, marks dirty, and includes it in export", async () => {
    const added = app.addText({ x: 45, y: 55 }, "Sized text");
    const elementId = added.state.selectedElementId;
    expect(elementId).toBeDefined();
    if (elementId === undefined) {
      return;
    }

    const sized = app.updateTextFontSize(elementId, 24);
    expect(sized.state.isDirty).toBe(true);
    expect(sized.state.selectedElement?.textAppearance?.fontSize).toBe(24);

    await app.exportCurrentPdf();
    expect(exportRequests[0]?.elements[0]?.textAppearance?.fontSize).toBe(24);
  });

  it("clamps text font size updates to the supported range and rejects non-finite input", () => {
    const elementId = app.addText({ x: 45, y: 55 }, "Sized text").state.selectedElementId;
    expect(elementId).toBeDefined();
    if (elementId === undefined) {
      return;
    }

    expect(
      app.updateTextFontSize(elementId, 2).state.selectedElement?.textAppearance?.fontSize,
    ).toBe(MIN_TEXT_FONT_SIZE);
    expect(
      app.updateTextFontSize(elementId, 240).state.selectedElement?.textAppearance?.fontSize,
    ).toBe(MAX_TEXT_FONT_SIZE);
    const rejected = app.updateTextFontSize(elementId, Number.NaN);
    expect(rejected.state.error).toMatchObject({ code: "InvalidTextAppearance" });
  });

  it("preserves text font size when text content changes and when text is duplicated", () => {
    const elementId = app.addText({ x: 45, y: 55 }, "Sized text").state.selectedElementId;
    expect(elementId).toBeDefined();
    if (elementId === undefined) {
      return;
    }

    app.updateTextFontSize(elementId, 32);
    const edited = app.updateText(elementId, "Changed text");
    expect(edited.state.selectedElement?.textAppearance?.fontSize).toBe(32);
    const duplicated = app.duplicateElement(elementId);
    expect(duplicated.state.selectedElement?.textAppearance?.fontSize).toBe(32);
  });

  it("clears selection without marking dirty or adding command history", async () => {
    const added = app.addText({ x: 45, y: 55 }, "Selectable");
    const elementId = added.state.selectedElementId;
    expect(elementId).toBeDefined();
    await app.exportCurrentPdf();

    const cleared = app.clearSelection();

    expect(cleared.state.selectedElementId).toBeUndefined();
    expect(cleared.state.selectedElement).toBeUndefined();
    expect(cleared.state.isDirty).toBe(false);
    expect(cleared.canUndo).toBe(true);
    expect(cleared.canRedo).toBe(false);
    const undone = app.undo();
    expect(undone.state.visibleElements).toHaveLength(0);
  });
  it("preserves dirty state and session when export fails", async () => {
    app.addText({ x: 45, y: 55 }, "Replacement");
    exportResult = { ok: false, error: { code: "ExportFailed", message: "Nope" } };

    const snapshot = await app.exportCurrentPdf();

    expect(snapshot.state.error).toMatchObject({ code: "ExportFailed" });
    expect(snapshot.state.status).toBe("ready");
    expect(snapshot.state.isDirty).toBe(true);
    expect(snapshot.state.visibleElements).toHaveLength(1);
    expect(downloadRequests).toEqual([]);
  });

  it("rejects export when no PDF is open", async () => {
    app = new PdfEditorApplication(reader, gateway, downloader, new TestIds());

    const snapshot = await app.exportCurrentPdf();

    expect(snapshot.state.error).toMatchObject({ code: "NoActiveDocument" });
    expect(exportRequests).toEqual([]);
  });
});

describe("PdfEditorApplication render document lifecycle", () => {
  it.each([
    [99, "normal"],
    [100, "large"],
    [499, "large"],
    [500, "very-large"],
  ] as const)("classifies %s pages as %s", (pageCount, expected) => {
    expect(classifyDocumentSize(pageCount)).toBe(expected);
  });

  it("reports large-document preparation after page count discovery", async () => {
    const pages = Array.from({ length: 500 }, (_, index) => ({
      id: `page-${String(index + 1)}`,
      width: 300,
      height: 400,
      rotation: 0 as const,
    }));
    const onProgress = vi.fn();
    const application = new PdfEditorApplication(
      {
        read: () =>
          Promise.resolve({
            ok: true,
            fileName: "large.pdf",
            bytes: new Uint8Array([37, 80, 68, 70, 45]),
          }),
      },
      {
        open: () => Promise.resolve({ ok: true, pages }),
        exportPdf: () => Promise.resolve({ ok: true, bytes: new Uint8Array([1]) }),
      },
      { download: vi.fn() },
      new TestIds(),
      {
        openRenderDocument: () => Promise.resolve({ ok: true, documentId: "render-large" }),
        disposeRenderDocument: vi.fn(),
      },
    );

    const snapshot = await application.openFile(file, onProgress);

    expect(onProgress).toHaveBeenCalledWith({
      phase: "preparing-large-document",
      pageCount: 500,
      sizeClass: "very-large",
    });
    expect(snapshot.state).toMatchObject({ status: "ready", pageCount: 500 });
  });

  it("does not report large-document preparation for a normal PDF", async () => {
    const onProgress = vi.fn();
    const application = new PdfEditorApplication(
      {
        read: () =>
          Promise.resolve({
            ok: true,
            fileName: "normal.pdf",
            bytes: new Uint8Array([37, 80, 68, 70, 45]),
          }),
      },
      {
        open: () =>
          Promise.resolve({
            ok: true,
            pages: [{ id: "page-1", width: 300, height: 400, rotation: 0 }],
          }),
        exportPdf: () => Promise.resolve({ ok: true, bytes: new Uint8Array([1]) }),
      },
      { download: vi.fn() },
      new TestIds(),
    );

    await application.openFile(file, onProgress);

    expect(onProgress).not.toHaveBeenCalled();
  });

  it("opens a render document from copied bytes and exposes an opaque render id", async () => {
    const sourceBytes = new Uint8Array([37, 80, 68, 70, 45]);
    const renderBytes: Uint8Array[] = [];
    const renderGateway: PdfRenderDocumentGateway = {
      openRenderDocument: (bytes) => {
        renderBytes.push(bytes);
        return Promise.resolve({ ok: true, documentId: "render-1" });
      },
      disposeRenderDocument: vi.fn(),
    };
    const application = new PdfEditorApplication(
      { read: () => Promise.resolve({ ok: true, fileName: "visible.pdf", bytes: sourceBytes }) },
      {
        open: () =>
          Promise.resolve({
            ok: true,
            pages: [{ id: "page-1", width: 300, height: 400, rotation: 0 }],
          }),
        exportPdf: () => Promise.resolve({ ok: true, bytes: new Uint8Array([1]) }),
      },
      { download: vi.fn() },
      new TestIds(),
      renderGateway,
    );

    const snapshot = await application.openFile(file);

    expect(snapshot.state.renderDocumentId).toBe("render-1");
    expect(renderBytes[0]).toEqual(sourceBytes);
    expect(renderBytes[0]).not.toBe(sourceBytes);
  });

  it("disposes the active render document when the editor closes", async () => {
    const disposeRenderDocument = vi.fn();
    const application = new PdfEditorApplication(
      {
        read: () =>
          Promise.resolve({
            ok: true,
            fileName: "visible.pdf",
            bytes: new Uint8Array([37, 80, 68, 70, 45]),
          }),
      },
      {
        open: () =>
          Promise.resolve({
            ok: true,
            pages: [{ id: "page-1", width: 300, height: 400, rotation: 0 }],
          }),
        exportPdf: () => Promise.resolve({ ok: true, bytes: new Uint8Array([1]) }),
      },
      { download: vi.fn() },
      new TestIds(),
      {
        openRenderDocument: () => Promise.resolve({ ok: true, documentId: "render-1" }),
        disposeRenderDocument,
      },
    );

    await application.openFile(file);
    const snapshot = application.closeDocument();

    expect(disposeRenderDocument).toHaveBeenCalledWith("render-1");
    expect(snapshot.state.status).toBe("empty");
    expect(snapshot.state.renderDocumentId).toBeUndefined();
  });

  it("maps render document load failures to a recoverable editor error", async () => {
    const renderResult: PdfRenderDocumentResult = {
      ok: false,
      error: { code: "RenderFailed", message: "The PDF page renderer could not open this file." },
    };
    const application = new PdfEditorApplication(
      {
        read: () =>
          Promise.resolve({
            ok: true,
            fileName: "visible.pdf",
            bytes: new Uint8Array([37, 80, 68, 70, 45]),
          }),
      },
      {
        open: () =>
          Promise.resolve({
            ok: true,
            pages: [{ id: "page-1", width: 300, height: 400, rotation: 0 }],
          }),
        exportPdf: () => Promise.resolve({ ok: true, bytes: new Uint8Array([1]) }),
      },
      { download: vi.fn() },
      new TestIds(),
      {
        openRenderDocument: () => Promise.resolve(renderResult),
        disposeRenderDocument: vi.fn(),
      },
    );

    const snapshot = await application.openFile(file);

    expect(snapshot.state.status).toBe("error");
    expect(snapshot.state.error).toEqual(renderResult.error);
    expect(snapshot.canExport).toBe(false);
  });

  it("ignores and disposes an open that finishes after the document is closed", async () => {
    const pendingRender = deferred<PdfRenderDocumentResult>();
    const disposeRenderDocument = vi.fn();
    const openRenderDocument = vi.fn(() => pendingRender.promise);
    const application = new PdfEditorApplication(
      {
        read: () =>
          Promise.resolve({
            ok: true,
            fileName: "large.pdf",
            bytes: new Uint8Array([37, 80, 68, 70, 45]),
          }),
      },
      {
        open: () =>
          Promise.resolve({
            ok: true,
            pages: [{ id: "page-1", width: 300, height: 400, rotation: 0 }],
          }),
        exportPdf: () => Promise.resolve({ ok: true, bytes: new Uint8Array([1]) }),
      },
      { download: vi.fn() },
      new TestIds(),
      { openRenderDocument, disposeRenderDocument },
    );

    const opening = application.openFile(file);
    await vi.waitFor(() => {
      expect(openRenderDocument).toHaveBeenCalledTimes(1);
    });
    application.closeDocument();
    pendingRender.resolve({ ok: true, documentId: "stale-render" });
    await opening;

    expect(disposeRenderDocument).toHaveBeenCalledWith("stale-render");
    expect(application.snapshot().state.status).toBe("empty");
  });

  it("keeps a replacement document when an older open finishes later", async () => {
    const pendingFirstRender = deferred<PdfRenderDocumentResult>();
    const disposeRenderDocument = vi.fn();
    const openRenderDocument = vi
      .fn<PdfRenderDocumentGateway["openRenderDocument"]>()
      .mockImplementationOnce(() => pendingFirstRender.promise)
      .mockResolvedValueOnce({ ok: true, documentId: "replacement-render" });
    const application = new PdfEditorApplication(
      {
        read: (selectedFile) =>
          Promise.resolve({
            ok: true,
            fileName: selectedFile.name,
            bytes: new Uint8Array([37, 80, 68, 70, 45]),
          }),
      },
      {
        open: () =>
          Promise.resolve({
            ok: true,
            pages: [{ id: "page-1", width: 300, height: 400, rotation: 0 }],
          }),
        exportPdf: () => Promise.resolve({ ok: true, bytes: new Uint8Array([1]) }),
      },
      { download: vi.fn() },
      new TestIds(),
      { openRenderDocument, disposeRenderDocument },
    );
    const replacementFile = { ...file, name: "replacement.pdf" };

    const firstOpening = application.openFile(file);
    await vi.waitFor(() => {
      expect(openRenderDocument).toHaveBeenCalledTimes(1);
    });
    const replacementSnapshot = await application.openFile(replacementFile);
    pendingFirstRender.resolve({ ok: true, documentId: "stale-render" });
    await firstOpening;

    expect(replacementSnapshot.state).toMatchObject({
      status: "ready",
      fileName: "replacement.pdf",
      renderDocumentId: "replacement-render",
    });
    expect(application.snapshot().state.fileName).toBe("replacement.pdf");
    expect(disposeRenderDocument).toHaveBeenCalledWith("stale-render");
  });
});

describe("PdfEditorApplication signature and initials overlays", () => {
  let exportRequests: PdfExportRequest[];
  let app: PdfEditorApplication;

  beforeEach(async () => {
    exportRequests = [];
    app = new PdfEditorApplication(
      {
        read: () =>
          Promise.resolve({
            ok: true,
            fileName: "sign.pdf",
            bytes: new Uint8Array([37, 80, 68, 70, 45]),
          }),
      },
      {
        open: () =>
          Promise.resolve({
            ok: true,
            pages: [{ id: "page-1", width: 300, height: 400, rotation: 0 }],
          }),
        exportPdf: (request) => {
          exportRequests.push(request);
          return Promise.resolve({ ok: true as const, bytes: new Uint8Array([1, 2, 3]) });
        },
      },
      { download: vi.fn() },
      new TestIds(),
    );
    await app.openFile(file);
  });

  it("adds drawn, typed, uploaded signature, and initials overlays to the export plan", async () => {
    const pngDataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l5n7WQAAAABJRU5ErkJggg==";

    app.addDrawnSignature(
      { x: 20, y: 30 },
      { dataUrl: pngDataUrl, mimeType: "image/png", width: 200, height: 80, source: "draw" },
    );
    app.addTypedSignature({ x: 30, y: 40 }, { text: "Ada Lovelace", fontFamily: "serif" });
    app.addUploadedSignature(
      { x: 40, y: 50 },
      { dataUrl: pngDataUrl, mimeType: "image/png", width: 100, height: 50, source: "upload" },
    );
    app.addDrawnInitials(
      { x: 50, y: 60 },
      { dataUrl: pngDataUrl, mimeType: "image/png", width: 80, height: 40, source: "draw" },
    );
    const snapshot = app.addTypedInitials({ x: 60, y: 70 }, { text: "AL", fontFamily: "hand" });

    expect(snapshot.state.isDirty).toBe(true);
    expect(snapshot.state.visibleElements.map((element) => element.type)).toEqual([
      "signature",
      "signature",
      "signature",
      "initials",
      "initials",
    ]);
    await app.exportCurrentPdf();
    expect(
      exportRequests[0]?.elements.map((element) => [element.type, element.source, element.text]),
    ).toEqual([
      ["signature", "draw", undefined],
      ["signature", "type", "Ada Lovelace"],
      ["signature", "upload", undefined],
      ["initials", "draw", undefined],
      ["initials", "type", "AL"],
    ]);
  });

  it("moves, resizes, duplicates, selects, and deletes signature elements through the shared element lifecycle", () => {
    const added = app.addTypedSignature({ x: 20, y: 30 }, { text: "Ada", fontFamily: "cursive" });
    const elementId = added.state.selectedElementId;
    expect(elementId).toBeDefined();
    if (elementId === undefined) {
      return;
    }

    expect(app.selectElement(elementId).state.isDirty).toBe(true);
    const moved = app.moveElement(elementId, { x: 70, y: 80 });
    expect(moved.state.selectedElement?.bounds).toMatchObject({ x: 70, y: 80 });
    const resized = app.resizeElement(elementId, { width: 180, height: 60 });
    expect(resized.state.selectedElement?.bounds).toMatchObject({ width: 180, height: 60 });
    const duplicated = app.duplicateElement(elementId);
    expect(duplicated.state.visibleElements).toHaveLength(2);
    expect(duplicated.state.selectedElement?.bounds).toMatchObject({ x: 82, y: 92 });
    const deleted = app.deleteElement(elementId);
    expect(deleted.state.visibleElements).toHaveLength(1);
    expect(deleted.state.isDirty).toBe(true);
  });

  it.each(["text", "whiteout", "signature", "initials"] as const)(
    "undoes and redoes add for %s overlays with stable identity",
    (type) => {
      const added =
        type === "text"
          ? app.addText({ x: 10, y: 20 }, "Undo me")
          : type === "whiteout"
            ? app.addWhiteout({ x: 10, y: 20, width: 80, height: 40 })
            : type === "signature"
              ? app.addTypedSignature({ x: 10, y: 20 }, { text: "Ada", fontFamily: "serif" })
              : app.addTypedInitials({ x: 10, y: 20 }, { text: "AL", fontFamily: "hand" });
      const elementId = added.state.selectedElementId;
      expect(elementId).toBeDefined();
      expect(added.canUndo).toBe(true);
      expect(added.canRedo).toBe(false);

      const undone = app.undo();
      expect(undone.state.visibleElements).toHaveLength(0);
      expect(undone.state.selectedElementId).toBeUndefined();
      expect(undone.state.isDirty).toBe(false);
      expect(undone.canRedo).toBe(true);

      const redone = app.redo();
      expect(redone.state.visibleElements).toHaveLength(1);
      expect(redone.state.selectedElementId).toBe(elementId);
      expect(redone.state.selectedElement?.id).toBe(elementId);
      expect(redone.state.selectedElement?.type).toBe(type);
      expect(redone.state.isDirty).toBe(true);
    },
  );

  it.each(["text", "whiteout", "signature", "initials"] as const)(
    "undoes and redoes delete for %s overlays by restoring the same element",
    (type) => {
      const added =
        type === "text"
          ? app.addText({ x: 10, y: 20 }, "Delete me")
          : type === "whiteout"
            ? app.addWhiteout({ x: 10, y: 20, width: 80, height: 40 })
            : type === "signature"
              ? app.addTypedSignature({ x: 10, y: 20 }, { text: "Ada", fontFamily: "serif" })
              : app.addTypedInitials({ x: 10, y: 20 }, { text: "AL", fontFamily: "hand" });
      const element = added.state.selectedElement;
      expect(element).toBeDefined();
      if (element === undefined) {
        return;
      }
      app.deleteElement(element.id);
      expect(app.snapshot().state.visibleElements).toHaveLength(0);

      const undone = app.undo();
      expect(undone.state.selectedElementId).toBe(element.id);
      expect(undone.state.selectedElement).toEqual(element);

      const redone = app.redo();
      expect(redone.state.visibleElements).toHaveLength(0);
      expect(redone.state.selectedElementId).toBeUndefined();
    },
  );

  it.each(["text", "whiteout", "signature", "initials"] as const)(
    "undoes and redoes duplicate for %s overlays with original and duplicate selection policy",
    (type) => {
      const added =
        type === "text"
          ? app.addText({ x: 10, y: 20 }, "Copy me")
          : type === "whiteout"
            ? app.addWhiteout({ x: 10, y: 20, width: 80, height: 40 })
            : type === "signature"
              ? app.addTypedSignature({ x: 10, y: 20 }, { text: "Ada", fontFamily: "serif" })
              : app.addTypedInitials({ x: 10, y: 20 }, { text: "AL", fontFamily: "hand" });
      const originalId = added.state.selectedElementId;
      expect(originalId).toBeDefined();
      if (originalId === undefined) {
        return;
      }
      const duplicated = app.duplicateElement(originalId);
      const duplicateId = duplicated.state.selectedElementId;
      expect(duplicateId).toBeDefined();
      expect(duplicateId).not.toBe(originalId);
      expect(duplicated.state.visibleElements).toHaveLength(2);

      const undone = app.undo();
      expect(undone.state.visibleElements.map((element) => element.id)).toEqual([originalId]);
      expect(undone.state.selectedElementId).toBe(originalId);

      const redone = app.redo();
      expect(redone.state.visibleElements.map((element) => element.id)).toEqual([
        originalId,
        duplicateId,
      ]);
      expect(redone.state.selectedElementId).toBe(duplicateId);
    },
  );

  it("undoing a newly added text element removes it even after initial text edits", () => {
    const added = app.addText({ x: 10, y: 20 }, "Text");
    const elementId = added.state.selectedElementId;
    expect(elementId).toBeDefined();
    if (elementId === undefined) {
      return;
    }
    app.updateText(elementId, "");
    app.updateText(elementId, "History text");

    const undone = app.undo();

    expect(undone.state.visibleElements).toHaveLength(0);
    expect(undone.state.selectedElementId).toBeUndefined();
  });
  it("redoing an added text element restores later text updates on the same element", () => {
    const added = app.addText({ x: 10, y: 20 }, "Text");
    const elementId = added.state.selectedElementId;
    expect(elementId).toBeDefined();
    if (elementId === undefined) {
      return;
    }
    app.updateText(elementId, "Typed after creation");
    app.updateTextFontSize(elementId, 28);

    app.undo();
    const redone = app.redo();

    expect(redone.state.selectedElement?.id).toBe(elementId);
    expect(redone.state.selectedElement?.text).toBe("Typed after creation");
    expect(redone.state.selectedElement?.textAppearance?.fontSize).toBe(28);
  });
  it("undoes and redoes committed text resize geometry and font size", async () => {
    const added = app.addText({ x: 10, y: 20 }, "Resize me");
    const elementId = added.state.selectedElementId;
    expect(elementId).toBeDefined();
    if (elementId === undefined) {
      return;
    }
    await app.exportCurrentPdf();

    const resized = app.commitTextResizeElement(
      elementId,
      { bounds: { x: 10, y: 20, width: 160, height: 40 }, fontSize: 16 },
      { bounds: { x: 10, y: 20, width: 240, height: 60 }, fontSize: 24 },
    );
    expect(resized.state.selectedElement?.bounds).toEqual({ x: 10, y: 20, width: 240, height: 60 });
    expect(resized.state.selectedElement?.textAppearance?.fontSize).toBe(24);
    expect(resized.canUndo).toBe(true);
    expect(resized.state.isDirty).toBe(true);

    const undone = app.undo();
    expect(undone.state.selectedElement?.bounds).toEqual({ x: 10, y: 20, width: 160, height: 40 });
    expect(undone.state.selectedElement?.textAppearance?.fontSize).toBe(16);
    expect(undone.state.isDirty).toBe(false);

    const redone = app.redo();
    expect(redone.state.selectedElement?.bounds).toEqual({ x: 10, y: 20, width: 240, height: 60 });
    expect(redone.state.selectedElement?.textAppearance?.fontSize).toBe(24);
    expect(redone.state.isDirty).toBe(true);

    await app.exportCurrentPdf();
    expect(exportRequests.at(-1)?.elements[0]?.textAppearance?.fontSize).toBe(24);
  });

  it("undoes and redoes committed date resize geometry and font size", async () => {
    const added = app.addDate({ x: 30, y: 40 });
    const elementId = added.state.selectedElementId;
    expect(elementId).toBeDefined();
    if (elementId === undefined) {
      return;
    }
    await app.exportCurrentPdf();

    const resized = app.commitTextResizeElement(
      elementId,
      { bounds: { x: 30, y: 40, width: 96, height: 28 }, fontSize: 16 },
      { bounds: { x: 30, y: 40, width: 192, height: 56 }, fontSize: 32 },
    );
    expect(resized.state.selectedElement).toMatchObject({
      id: elementId,
      type: "date",
      bounds: { x: 30, y: 40, width: 192, height: 56 },
      textAppearance: { fontSize: 32 },
    });
    expect(resized.state.isDirty).toBe(true);

    const undone = app.undo();
    expect(undone.state.selectedElement).toMatchObject({
      id: elementId,
      type: "date",
      bounds: { x: 30, y: 40, width: 96, height: 28 },
      textAppearance: { fontSize: 16 },
    });
    expect(undone.state.isDirty).toBe(false);

    const redone = app.redo();
    expect(redone.state.selectedElement).toMatchObject({
      id: elementId,
      type: "date",
      bounds: { x: 30, y: 40, width: 192, height: 56 },
      textAppearance: { fontSize: 32 },
    });
    expect(redone.state.isDirty).toBe(true);

    await app.exportCurrentPdf();
    const exportedDate = exportRequests.at(-1)?.elements.find((element) => element.type === "date");
    expect(exportedDate).toMatchObject({
      id: elementId,
      bounds: { x: 30, y: 40, width: 192, height: 56 },
      textAppearance: { fontSize: 32 },
    });
  });

  it("does not create a date resize history entry for an unchanged geometry and font size", () => {
    const added = app.addDate({ x: 30, y: 40 });
    const elementId = added.state.selectedElementId;
    expect(elementId).toBeDefined();
    if (elementId === undefined) {
      return;
    }

    app.commitTextResizeElement(
      elementId,
      { bounds: { x: 30, y: 40, width: 96, height: 28 }, fontSize: 16 },
      { bounds: { x: 30, y: 40, width: 96, height: 28 }, fontSize: 16 },
    );
    const undone = app.undo();

    expect(undone.state.visibleElements.some((element) => element.id === elementId)).toBe(false);
  });
  it("previews text resize without creating history until commit", () => {
    const added = app.addText({ x: 10, y: 20 }, "Preview me");
    const elementId = added.state.selectedElementId;
    expect(elementId).toBeDefined();
    if (elementId === undefined) {
      return;
    }
    app.undo();
    app.redo();
    const beforePreviewUndoCount = app.snapshot().canUndo;

    const previewed = app.previewTextResizeElement(
      elementId,
      { x: 10, y: 20, width: 320, height: 80 },
      32,
    );

    expect(previewed.state.selectedElement?.bounds).toEqual({
      x: 0,
      y: 20,
      width: 300,
      height: 80,
    });
    expect(previewed.state.selectedElement?.textAppearance?.fontSize).toBe(32);
    expect(previewed.canUndo).toBe(beforePreviewUndoCount);
    const undone = app.undo();
    expect(undone.state.visibleElements).toHaveLength(0);
  });

  it("makes font-size inspector commits undoable and clamps the committed value", () => {
    const added = app.addText({ x: 10, y: 20 }, "Size me");
    const elementId = added.state.selectedElementId;
    expect(elementId).toBeDefined();
    if (elementId === undefined) {
      return;
    }

    const sized = app.updateTextFontSize(elementId, 240);
    expect(sized.state.selectedElement?.textAppearance?.fontSize).toBe(MAX_TEXT_FONT_SIZE);

    const undone = app.undo();
    expect(undone.state.selectedElement?.textAppearance?.fontSize).toBe(16);

    const redone = app.redo();
    expect(redone.state.selectedElement?.textAppearance?.fontSize).toBe(MAX_TEXT_FONT_SIZE);
  });
  it("clears redo after a divergent edit", () => {
    app.addText({ x: 10, y: 20 }, "First");
    expect(app.undo().canRedo).toBe(true);

    const divergent = app.addWhiteout({ x: 20, y: 30, width: 80, height: 40 });

    expect(divergent.canRedo).toBe(false);
    expect(app.redo().state.visibleElements.map((element) => element.type)).toEqual(["whiteout"]);
  });

  it("keeps history through export and updates dirty state by revision", async () => {
    app.addText({ x: 10, y: 20 }, "Saved");
    expect(app.snapshot().state.isDirty).toBe(true);

    const exported = await app.exportCurrentPdf();
    expect(exported.state.isDirty).toBe(false);
    expect(exported.canUndo).toBe(true);

    const undone = app.undo();
    expect(undone.state.isDirty).toBe(true);
    expect(undone.canRedo).toBe(true);

    const redone = app.redo();
    expect(redone.state.isDirty).toBe(false);
  });

  it("enforces the command history limit", () => {
    for (let index = 0; index < 101; index += 1) {
      app.addText({ x: 10, y: 20 }, `Text ${String(index)}`);
    }

    for (let index = 0; index < 100; index += 1) {
      app.undo();
    }

    const snapshot = app.snapshot();
    expect(snapshot.canUndo).toBe(false);
    expect(snapshot.state.visibleElements).toHaveLength(1);
    expect(snapshot.state.visibleElements[0]?.text).toBe("Text 0");
  });

  it("resets history when the document is replaced or closed", async () => {
    app.addText({ x: 10, y: 20 }, "Reset me");
    expect(app.snapshot().canUndo).toBe(true);

    await app.openFile(file);
    expect(app.snapshot().canUndo).toBe(false);
    expect(app.snapshot().canRedo).toBe(false);

    app.addText({ x: 10, y: 20 }, "Close me");
    expect(app.closeDocument()).toMatchObject({ canUndo: false, canRedo: false });
  });
  it("duplicates every supported overlay type through the shared element lifecycle", () => {
    const adders = [
      () => app.addText({ x: 10, y: 20 }, "Text"),
      () => app.addWhiteout({ x: 20, y: 30, width: 90, height: 40 }),
      () => app.addTypedSignature({ x: 30, y: 40 }, { text: "Ada", fontFamily: "cursive" }),
      () => app.addTypedInitials({ x: 40, y: 50 }, { text: "AL", fontFamily: "hand" }),
    ] as const;

    for (const add of adders) {
      const added = add();
      const elementId = added.state.selectedElementId;
      const selected = added.state.selectedElement;
      expect(elementId).toBeDefined();
      expect(selected).toBeDefined();
      if (elementId === undefined || selected === undefined) {
        return;
      }

      const duplicated = app.duplicateElement(elementId);

      expect(duplicated.state.isDirty).toBe(true);
      expect(duplicated.state.selectedElementId).not.toBe(elementId);
      expect(duplicated.state.selectedElement?.type).toBe(selected.type);
      expect(duplicated.state.selectedElement?.bounds).toMatchObject({
        x: selected.bounds.x + 12,
        y: selected.bounds.y + 12,
      });
    }
  });

  it("deletes every supported overlay type, clears selection, and excludes them from export", async () => {
    const addedIds = [
      app.addText({ x: 10, y: 20 }, "Text").state.selectedElementId,
      app.addWhiteout({ x: 20, y: 30, width: 90, height: 40 }).state.selectedElementId,
      app.addTypedSignature({ x: 30, y: 40 }, { text: "Ada", fontFamily: "cursive" }).state
        .selectedElementId,
      app.addTypedInitials({ x: 40, y: 50 }, { text: "AL", fontFamily: "hand" }).state
        .selectedElementId,
    ];

    for (const elementId of addedIds) {
      expect(elementId).toBeDefined();
      if (elementId === undefined) {
        return;
      }
      app.selectElement(elementId);
      const deleted = app.deleteElement(elementId);
      expect(deleted.state.isDirty).toBe(true);
      expect(deleted.state.selectedElementId).toBeUndefined();
      expect(deleted.state.selectedElement).toBeUndefined();
      expect(deleted.state.visibleElements.some((element) => element.id === elementId)).toBe(false);
    }

    await app.exportCurrentPdf();
    expect(exportRequests[0]?.elements).toEqual([]);
  });

  it("adds annotations with shared lifecycle, deterministic dates, clipboard, history, and export", async () => {
    const localReadResult: LocalPdfReadResult = {
      ok: true,
      fileName: "contract.pdf",
      bytes: new Uint8Array([37, 80, 68, 70, 45]),
    };
    const localOpenResult: PdfOpenResult = {
      ok: true,
      pages: [{ id: "page-1", width: 300, height: 400, rotation: 0 }],
    };
    const localReader: LocalPdfFileReader = {
      read: vi.fn(() => Promise.resolve(localReadResult)),
    };
    exportRequests = [];

    const localGateway: PdfExportGateway = {
      open: vi.fn(() => Promise.resolve(localOpenResult)),
      exportPdf: (request) => {
        exportRequests.push(request);
        return Promise.resolve({ ok: true as const, bytes: new Uint8Array([1, 2, 3]) });
      },
    };
    const localDownloader: DownloadAdapter = { download: vi.fn() };
    const dateProvider: DateProvider = { today: () => new Date(2026, 6, 31) };
    app = new PdfEditorApplication(
      localReader,
      localGateway,
      localDownloader,
      new TestIds(),
      undefined,
      dateProvider,
    );
    await app.openFile(file);

    const checkmark = app.addCheckmark({ x: 80, y: 90 });
    const checkmarkId = checkmark.state.selectedElementId;
    expect(checkmark.state.selectedElement).toMatchObject({
      type: "checkmark",
      pageId: "page-1",
      bounds: { x: 66, y: 76, width: 28, height: 28 },
    });
    const cross = app.addCross({ x: 120, y: 140 });
    const crossId = cross.state.selectedElementId;
    expect(cross.state.selectedElement).toMatchObject({
      type: "cross",
      pageId: "page-1",
      bounds: { x: 106, y: 126, width: 28, height: 28 },
    });
    const date = app.addDate({ x: 150, y: 180 });
    const dateId = date.state.selectedElementId;
    expect(date.state.selectedElement).toMatchObject({
      type: "date",
      pageId: "page-1",
      text: "07/31/2026",
      textAppearance: { fontSize: 16 },
    });
    expect(date.state.isDirty).toBe(true);
    expect(checkmarkId).toBeDefined();
    expect(crossId).toBeDefined();
    expect(dateId).toBeDefined();
    if (checkmarkId === undefined || crossId === undefined || dateId === undefined) {
      return;
    }

    app.previewMoveElement(crossId, { x: 140, y: 150 });
    const movedCross = app.commitMoveElement(
      crossId,
      { x: 106, y: 126, width: 28, height: 28 },
      { x: 140, y: 150, width: 28, height: 28 },
    );
    expect(movedCross.state.selectedElement).toMatchObject({
      id: crossId,
      type: "cross",
      bounds: { x: 140, y: 150, width: 28, height: 28 },
    });

    const resizedCheckmark = app.resizeElement(checkmarkId, { width: 56, height: 120 });
    expect(resizedCheckmark.state.selectedElement).toMatchObject({
      id: checkmarkId,
      type: "checkmark",
      bounds: { x: 66, y: 76, width: 120, height: 120 },
    });

    const resizedDate = app.commitTextResizeElement(
      dateId,
      { bounds: { x: 150, y: 180, width: 96, height: 28 }, fontSize: 16 },
      { bounds: { x: 150, y: 180, width: 144, height: 42 }, fontSize: 24 },
    );
    expect(resizedDate.state.selectedElement).toMatchObject({
      id: dateId,
      type: "date",
      text: "07/31/2026",
      bounds: { x: 150, y: 180, width: 144, height: 42 },
      textAppearance: { fontSize: 24 },
    });

    app.selectElement(dateId);
    app.copySelectedElement();
    expect(app.snapshot().canPaste).toBe(true);
    const pastedDate = app.pasteCopiedElement();
    const pastedDateId = pastedDate.state.selectedElementId;
    expect(pastedDateId).toBeDefined();
    expect(pastedDate.state.selectedElement).toMatchObject({
      type: "date",
      text: "07/31/2026",
      bounds: { x: 156, y: 196, width: 144, height: 42 },
    });

    const undoPaste = app.undo();
    expect(undoPaste.state.visibleElements.some((element) => element.id === pastedDateId)).toBe(
      false,
    );
    const redoPaste = app.redo();
    expect(redoPaste.state.selectedElementId).toBe(pastedDateId);

    app.selectElement(checkmarkId);
    const duplicated = app.duplicateElement(checkmarkId);
    expect(duplicated.state.selectedElement).toMatchObject({ type: "checkmark" });
    const duplicateId = duplicated.state.selectedElementId;
    expect(duplicateId).toBeDefined();
    if (duplicateId === undefined) {
      return;
    }
    const deleted = app.deleteElement(duplicateId);
    expect(deleted.state.visibleElements.some((element) => element.id === duplicateId)).toBe(false);
    expect(app.undo().state.selectedElementId).toBe(duplicateId);

    exportRequests = [];
    await app.exportCurrentPdf();
    expect(exportRequests[0]?.elements.map((element) => element.type)).toEqual([
      "checkmark",
      "cross",
      "date",
      "date",
      "checkmark",
    ]);
    expect(exportRequests[0]?.elements.find((element) => element.type === "date")?.text).toBe(
      "07/31/2026",
    );
    expect(app.snapshot().state.isDirty).toBe(false);
  });
  it("adds image overlays centered on the click, clamps them, and includes them in export", async () => {
    const pngDataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l5n7WQAAAABJRU5ErkJggg==";

    const snapshot = app.addImage(
      { x: 150, y: 200 },
      { dataUrl: pngDataUrl, mimeType: "image/png", width: 120, height: 60 },
    );

    expect(snapshot.state.selectedElement?.type).toBe("image");
    expect(snapshot.state.selectedElement?.bounds).toEqual({
      x: 90,
      y: 170,
      width: 120,
      height: 60,
    });
    expect(snapshot.state.selectedElement?.image).toEqual({
      dataUrl: pngDataUrl,
      mimeType: "image/png",
    });
    expect(snapshot.state.isDirty).toBe(true);

    await app.exportCurrentPdf();
    expect(exportRequests[0]?.elements.at(-1)).toMatchObject({
      type: "image",
      image: { dataUrl: pngDataUrl, mimeType: "image/png" },
    });
  });

  it("preserves image aspect ratio during resize, duplicate, copy, paste, undo, and redo", () => {
    const jpgDataUrl = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2w==";
    const added = app.addImage(
      { x: 100, y: 100 },
      { dataUrl: jpgDataUrl, mimeType: "image/jpeg", width: 200, height: 100 },
    );
    const imageId = added.state.selectedElementId;
    expect(imageId).toBeDefined();
    if (imageId === undefined) {
      return;
    }

    const resized = app.resizeElement(imageId, { width: 80, height: 200 });
    expect(resized.state.selectedElement?.bounds).toMatchObject({ width: 80, height: 40 });

    const duplicated = app.duplicateElement(imageId);
    expect(duplicated.state.selectedElement?.type).toBe("image");
    expect(duplicated.state.selectedElement?.image?.mimeType).toBe("image/jpeg");

    app.copySelectedElement();
    expect(app.snapshot().canPaste).toBe(true);
    const pasted = app.pasteCopiedElement();
    const pastedId = pasted.state.selectedElementId;
    expect(pastedId).toBeDefined();
    expect(pasted.state.selectedElement?.type).toBe("image");
    expect(pasted.state.selectedElement?.id).not.toBe(imageId);

    const undone = app.undo();
    expect(undone.state.visibleElements.some((element) => element.id === pastedId)).toBe(false);
    const redone = app.redo();
    expect(redone.state.selectedElementId).toBe(pastedId);
    expect(redone.state.selectedElement?.image?.dataUrl).toBe(jpgDataUrl);
  });

  it("records image move and resize as later history entries while preserving identity and payload", async () => {
    const pngDataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l5n7WQAAAABJRU5ErkJggg==";
    const added = app.addImage(
      { x: 100, y: 100 },
      { dataUrl: pngDataUrl, mimeType: "image/png", width: 100, height: 50 },
    );
    const imageId = added.state.selectedElementId;
    const startBounds = added.state.selectedElement?.bounds;
    expect(imageId).toBeDefined();
    expect(startBounds).toEqual({ x: 50, y: 75, width: 100, height: 50 });
    if (imageId === undefined || startBounds === undefined) {
      return;
    }

    await app.exportCurrentPdf();
    expect(app.snapshot().state.isDirty).toBe(false);

    const movePreview = app.previewMoveElement(imageId, { x: 72, y: 91 });
    expect(movePreview.state.selectedElement?.bounds).toEqual({ ...startBounds, x: 72, y: 91 });
    const moved = app.commitMoveElement(imageId, startBounds, { ...startBounds, x: 72, y: 91 });
    expect(moved.state.selectedElement).toMatchObject({
      id: imageId,
      bounds: { ...startBounds, x: 72, y: 91 },
      image: { dataUrl: pngDataUrl, mimeType: "image/png" },
    });
    expect(moved.state.isDirty).toBe(true);

    const movedBounds = moved.state.selectedElement?.bounds;
    expect(movedBounds).toEqual({ ...startBounds, x: 72, y: 91 });
    if (movedBounds === undefined) {
      return;
    }
    app.previewResizeElement(imageId, { ...movedBounds, width: 180, height: 110 });
    const resized = app.commitResizeElement(imageId, movedBounds, {
      ...movedBounds,
      width: 180,
      height: 110,
    });
    expect(resized.state.selectedElement).toMatchObject({
      id: imageId,
      bounds: { x: 72, y: 91, width: 180, height: 90 },
      image: { dataUrl: pngDataUrl, mimeType: "image/png" },
    });

    const undoResize = app.undo();
    expect(undoResize.state.selectedElement).toMatchObject({
      id: imageId,
      bounds: movedBounds,
      image: { dataUrl: pngDataUrl, mimeType: "image/png" },
    });
    const undoMove = app.undo();
    expect(undoMove.state.selectedElement).toMatchObject({
      id: imageId,
      bounds: startBounds,
      image: { dataUrl: pngDataUrl, mimeType: "image/png" },
    });
    expect(undoMove.state.isDirty).toBe(false);
    exportRequests = [];
    await app.exportCurrentPdf();
    expect(exportRequests[0]?.elements.at(-1)?.bounds).toEqual(startBounds);

    const undoAdd = app.undo();
    expect(undoAdd.state.visibleElements.some((element) => element.id === imageId)).toBe(false);

    const redoAdd = app.redo();
    expect(redoAdd.state.selectedElement).toMatchObject({ id: imageId, bounds: startBounds });
    const redoMove = app.redo();
    expect(redoMove.state.selectedElement).toMatchObject({ id: imageId, bounds: movedBounds });
    const redoResize = app.redo();
    expect(redoResize.state.selectedElement).toMatchObject({
      id: imageId,
      bounds: { x: 72, y: 91, width: 180, height: 90 },
      image: { dataUrl: pngDataUrl, mimeType: "image/png" },
    });
    exportRequests = [];
    await app.exportCurrentPdf();
    expect(exportRequests[0]?.elements.at(-1)?.bounds).toEqual({
      x: 72,
      y: 91,
      width: 180,
      height: 90,
    });
  });

  it("restores image geometry on cancelled move or resize without adding history", () => {
    const pngDataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l5n7WQAAAABJRU5ErkJggg==";
    const added = app.addImage(
      { x: 100, y: 100 },
      { dataUrl: pngDataUrl, mimeType: "image/png", width: 100, height: 50 },
    );
    const imageId = added.state.selectedElementId;
    const startBounds = added.state.selectedElement?.bounds;
    expect(imageId).toBeDefined();
    expect(startBounds).toBeDefined();
    if (imageId === undefined || startBounds === undefined) {
      return;
    }

    app.previewMoveElement(imageId, { x: 90, y: 105 });
    const cancelledMove = app.previewMoveElement(imageId, { x: startBounds.x, y: startBounds.y });
    expect(cancelledMove.state.selectedElement).toMatchObject({ id: imageId, bounds: startBounds });
    const undoAfterMoveCancel = app.undo();
    expect(
      undoAfterMoveCancel.state.visibleElements.some((element) => element.id === imageId),
    ).toBe(false);

    const restored = app.redo();
    expect(restored.state.selectedElement?.bounds).toEqual(startBounds);
    app.previewResizeElement(imageId, { ...startBounds, width: 180, height: 110 });
    const cancelledResize = app.previewResizeElement(imageId, startBounds);
    expect(cancelledResize.state.selectedElement).toMatchObject({
      id: imageId,
      bounds: startBounds,
    });
    const undoAfterResizeCancel = app.undo();
    expect(
      undoAfterResizeCancel.state.visibleElements.some((element) => element.id === imageId),
    ).toBe(false);
  });
  it("commits image resize history from the starting bounds after live preview", async () => {
    const pngDataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l5n7WQAAAABJRU5ErkJggg==";
    const added = app.addImage(
      { x: 100, y: 100 },
      { dataUrl: pngDataUrl, mimeType: "image/png", width: 100, height: 50 },
    );
    const imageId = added.state.selectedElementId;
    expect(imageId).toBeDefined();
    if (imageId === undefined) {
      return;
    }
    const startBounds = added.state.selectedElement?.bounds;
    expect(startBounds).toEqual({ x: 50, y: 75, width: 100, height: 50 });
    if (startBounds === undefined) {
      return;
    }

    const preview = app.previewResizeElement(imageId, { ...startBounds, width: 160, height: 90 });
    expect(preview.state.selectedElement?.bounds).toEqual({ x: 50, y: 75, width: 160, height: 80 });
    expect(preview.state.isDirty).toBe(true);

    const committed = app.commitResizeElement(imageId, startBounds, {
      ...startBounds,
      width: 160,
      height: 90,
    });
    expect(committed.state.selectedElement?.bounds).toEqual({
      x: 50,
      y: 75,
      width: 160,
      height: 80,
    });

    const undone = app.undo();
    expect(undone.state.selectedElement?.bounds).toEqual(startBounds);
    const redone = app.redo();
    expect(redone.state.selectedElement?.bounds).toEqual({ x: 50, y: 75, width: 160, height: 80 });

    await app.exportCurrentPdf();
    expect(exportRequests[0]?.elements.at(-1)?.bounds).toEqual({
      x: 50,
      y: 75,
      width: 160,
      height: 80,
    });
  });
  it("clears copied image data when the image document session is replaced or closed", async () => {
    const pngDataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l5n7WQAAAABJRU5ErkJggg==";
    app.addImage(
      { x: 50, y: 50 },
      { dataUrl: pngDataUrl, mimeType: "image/png", width: 20, height: 20 },
    );
    app.copySelectedElement();
    expect(app.snapshot().canPaste).toBe(true);

    await app.openFile(file);
    expect(app.snapshot().canPaste).toBe(false);

    app.addImage(
      { x: 50, y: 50 },
      { dataUrl: pngDataUrl, mimeType: "image/png", width: 20, height: 20 },
    );
    app.copySelectedElement();
    expect(app.closeDocument().canPaste).toBe(false);
  });

  it("validates general image uploads without reading or persisting content", () => {
    expect(validateImageFile({ name: "logo.png", size: 1000, type: "image/png" })).toBeUndefined();
    expect(
      validateImageFile({ name: "photo.jpeg", size: 1000, type: "image/jpeg" }),
    ).toBeUndefined();
    expect(validateImageFile({ name: "stamp.webp", size: 1000, type: "image/webp" })).toMatchObject(
      {
        code: "UnsupportedImage",
      },
    );
    expect(
      validateImageFile({ name: "large.jpg", size: 6 * 1024 * 1024, type: "image/jpeg" }),
    ).toMatchObject({
      code: "ImageTooLarge",
    });
  });
  it("validates signature image uploads without reading or persisting content", () => {
    expect(
      validateSignatureImageFile({ name: "sig.png", size: 1000, type: "image/png" }),
    ).toBeUndefined();
    expect(
      validateSignatureImageFile({ name: "sig.gif", size: 1000, type: "image/gif" }),
    ).toMatchObject({ code: "UnsupportedSignatureImage" });
    expect(
      validateSignatureImageFile({ name: "sig.jpg", size: 3 * 1024 * 1024, type: "image/jpeg" }),
    ).toMatchObject({ code: "SignatureImageTooLarge" });
  });
  it("applies mixed visibility and lock state as single undoable page-level commands", async () => {
    const first = app.addText({ x: 10, y: 20 }, "Visible").state.selectedElementId;
    const second = app.addCheckmark({ x: 70, y: 80 }).state.selectedElementId;
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (first === undefined || second === undefined) return;

    app.setElementVisibility(second, false);
    app.setElementLocked(first, true);
    await app.exportCurrentPdf();
    const hidden = app.setAllCurrentPageElementsVisibility(false);

    expect(hidden.state.visibleElements).toEqual([]);
    expect(hidden.state.selectedElementId).toBeUndefined();
    expect(hidden.state.isDirty).toBe(true);
    expect(hidden.canUndo).toBe(true);
    expect(app.undo().state.elements).toMatchObject([
      { id: first, visible: true, locked: true },
      { id: second, visible: false, locked: false },
    ]);
    expect(app.redo().state.visibleElements).toEqual([]);

    const locked = app.setAllCurrentPageElementsLocked(true);
    expect(locked.state.elements).toMatchObject([
      { id: first, locked: true },
      { id: second, locked: true },
    ]);
    expect(app.previewMoveElement(first, { x: 120, y: 120 }).state.error?.code).toBe(
      "OperationRejected",
    );
    expect(app.undo().state.elements).toMatchObject([
      { id: first, locked: true },
      { id: second, locked: false },
    ]);
  });

  it("excludes hidden elements from export while locked visible elements export normally", async () => {
    const visible = app.addText({ x: 10, y: 20 }, "Visible").state.selectedElementId;
    const hidden = app.addText({ x: 10, y: 60 }, "Hidden").state.selectedElementId;
    expect(visible).toBeDefined();
    expect(hidden).toBeDefined();
    if (visible === undefined || hidden === undefined) return;

    app.setElementLocked(visible, true);
    app.setElementVisibility(hidden, false);
    await app.exportCurrentPdf();

    expect(exportRequests.at(-1)?.elements).toMatchObject([{ id: visible, locked: true }]);
    expect(exportRequests.at(-1)?.elements.map((element) => element.id)).not.toContain(hidden);
  });
});

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const DOC_MIME = "application/msword";

describe("classifyOpenableFile", () => {
  it("classifies PDF files by extension or MIME type", () => {
    expect(classifyOpenableFile({ name: "contract.pdf", type: "" })).toBe("pdf");
    expect(classifyOpenableFile({ name: "CONTRACT.PDF", type: "" })).toBe("pdf");
    expect(classifyOpenableFile({ name: "scan", type: "application/pdf" })).toBe("pdf");
  });

  it("classifies .docx files by extension or MIME type", () => {
    expect(classifyOpenableFile({ name: "letter.docx", type: "" })).toBe("docx");
    expect(classifyOpenableFile({ name: "Letter.DOCX", type: "" })).toBe("docx");
    expect(classifyOpenableFile({ name: "letter", type: DOCX_MIME })).toBe("docx");
  });

  it("classifies legacy .doc files by extension or MIME type", () => {
    expect(classifyOpenableFile({ name: "memo.doc", type: "" })).toBe("legacy-doc");
    expect(classifyOpenableFile({ name: "memo", type: DOC_MIME })).toBe("legacy-doc");
  });

  it("prefers the .docx extension even when the MIME type is the legacy Word type", () => {
    expect(classifyOpenableFile({ name: "letter.docx", type: DOC_MIME })).toBe("docx");
  });

  it("classifies everything else as unsupported", () => {
    expect(classifyOpenableFile({ name: "notes.txt", type: "text/plain" })).toBe("unsupported");
    expect(classifyOpenableFile({ name: "image.png", type: "image/png" })).toBe("unsupported");
    expect(classifyOpenableFile({ name: "archive", type: "" })).toBe("unsupported");
  });
});

describe("PdfEditorApplication document import", () => {
  const docxFile: LocalPdfFile = {
    name: "letter.docx",
    size: 2048,
    type: DOCX_MIME,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(2048)),
  };
  const docFile: LocalPdfFile = {
    name: "memo.doc",
    size: 1024,
    type: DOC_MIME,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024)),
  };
  const convertedBytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]);

  const buildApplication = (
    convertToPdf: DocumentImportGateway["convertToPdf"],
    openPages: PdfOpenResult = {
      ok: true,
      pages: [{ id: "page-1", width: 300, height: 400, rotation: 0 }],
    },
  ): {
    application: PdfEditorApplication;
    openedBytes: Uint8Array[];
    readSpy: ReturnType<typeof vi.fn>;
  } => {
    const openedBytes: Uint8Array[] = [];
    const readSpy = vi.fn(() =>
      Promise.resolve<LocalPdfReadResult>({
        ok: true,
        fileName: "contract.pdf",
        bytes: new Uint8Array([37, 80, 68, 70, 45]),
      }),
    );
    const application = new PdfEditorApplication(
      { read: readSpy },
      {
        open: (bytes) => {
          openedBytes.push(bytes);
          return Promise.resolve(openPages);
        },
        exportPdf: () => Promise.resolve({ ok: true, bytes: new Uint8Array([1]) }),
      },
      { download: vi.fn() },
      new TestIds(),
      undefined,
      undefined,
      undefined,
      { convertToPdf },
    );
    return { application, openedBytes, readSpy };
  };

  it("converts a .docx file and opens the resulting PDF bytes", async () => {
    const convertToPdf = vi.fn(() =>
      Promise.resolve<DocumentImportResult>({
        ok: true,
        fileName: "letter.docx",
        bytes: convertedBytes,
      }),
    );
    const { application, openedBytes, readSpy } = buildApplication(convertToPdf);

    const snapshot = await application.openFile(docxFile);

    expect(convertToPdf).toHaveBeenCalledWith(docxFile);
    expect(readSpy).not.toHaveBeenCalled();
    expect(openedBytes[0]).toEqual(convertedBytes);
    expect(snapshot.state).toMatchObject({
      status: "ready",
      fileName: "letter.docx",
      pageCount: 1,
    });
  });

  it("reports a converting-document progress phase before conversion completes", async () => {
    const phases: string[] = [];
    const convertToPdf = vi.fn(() =>
      Promise.resolve<DocumentImportResult>({
        ok: true,
        fileName: "letter.docx",
        bytes: convertedBytes,
      }),
    );
    const { application } = buildApplication(convertToPdf);

    await application.openFile(docxFile, (progress) => {
      phases.push(progress.phase);
    });

    expect(phases[0]).toBe("converting-document");
  });

  it("surfaces conversion failure as a recoverable editor error", async () => {
    const convertToPdf = vi.fn(() =>
      Promise.resolve<DocumentImportResult>({
        ok: false,
        error: {
          code: "DocumentConversionFailed",
          message: "This document could not be converted.",
        },
      }),
    );
    const { application, openedBytes } = buildApplication(convertToPdf);

    const snapshot = await application.openFile(docxFile);

    expect(snapshot.state.status).toBe("error");
    expect(snapshot.state.error).toEqual({
      code: "DocumentConversionFailed",
      message: "This document could not be converted.",
    });
    expect(snapshot.canExport).toBe(false);
    expect(openedBytes).toHaveLength(0);
  });

  it("rejects legacy .doc files without invoking the import gateway", async () => {
    const convertToPdf = vi.fn(() =>
      Promise.resolve<DocumentImportResult>({
        ok: true,
        fileName: "letter.docx",
        bytes: convertedBytes,
      }),
    );
    const { application } = buildApplication(convertToPdf);

    const snapshot = await application.openFile(docFile);

    expect(convertToPdf).not.toHaveBeenCalled();
    expect(snapshot.state.status).toBe("error");
    expect(snapshot.state.error?.code).toBe("UnsupportedDocFormat");
  });

  it("discards a conversion that finishes after a newer open starts", async () => {
    const pending = deferred<DocumentImportResult>();
    const convertToPdf = vi.fn(() => pending.promise);
    const { application, openedBytes } = buildApplication(convertToPdf);

    const firstOpening = application.openFile(docxFile);
    await vi.waitFor(() => {
      expect(convertToPdf).toHaveBeenCalledTimes(1);
    });
    const replacementSnapshot = await application.openFile({
      name: "contract.pdf",
      size: 5,
      type: "application/pdf",
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(5)),
    });
    pending.resolve({ ok: true, fileName: "letter.docx", bytes: convertedBytes });
    await firstOpening;

    expect(replacementSnapshot.state).toMatchObject({ status: "ready", fileName: "contract.pdf" });
    expect(application.snapshot().state.fileName).toBe("contract.pdf");
    expect(openedBytes.some((bytes) => bytes.length === convertedBytes.length)).toBe(false);
  });

  it("rejects a .docx file when no import gateway is configured", async () => {
    const readSpy = vi.fn(() =>
      Promise.resolve<LocalPdfReadResult>({
        ok: true,
        fileName: "contract.pdf",
        bytes: new Uint8Array([37, 80, 68, 70, 45]),
      }),
    );
    const application = new PdfEditorApplication(
      { read: readSpy },
      {
        open: () =>
          Promise.resolve<PdfOpenResult>({
            ok: true,
            pages: [{ id: "page-1", width: 300, height: 400, rotation: 0 }],
          }),
        exportPdf: () => Promise.resolve({ ok: true, bytes: new Uint8Array([1]) }),
      },
      { download: vi.fn() },
      new TestIds(),
    );

    const snapshot = await application.openFile(docxFile);

    expect(readSpy).not.toHaveBeenCalled();
    expect(snapshot.state.status).toBe("error");
    expect(snapshot.state.error?.code).toBe("UnsupportedFile");
  });
});
