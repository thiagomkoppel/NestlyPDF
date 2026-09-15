import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { describe, expect, it, vi, type Mock } from "vitest";

import type {
  EditorSnapshot,
  EditorState,
  EditorTool,
  ExportElement,
  PdfEditorApplication,
} from "../../application/editor-application";
import type { PdfPageRenderHandle } from "../../infrastructure/pdf/pdfjs-page-renderer";
import { EditorPage } from "./EditorPage";

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

const deferred = <T,>(): Deferred<T> => {
  let resolvePromise: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
};

interface TestEditor extends PdfEditorApplication {
  readonly setTool: Mock;
  readonly addText: Mock;
  readonly addWhiteout: Mock;
  readonly addCheckmark: Mock;
  readonly addCross: Mock;
  readonly addDate: Mock;
  readonly selectElement: Mock;
  readonly clearSelection: Mock;
  readonly moveElement: Mock;
  readonly previewMoveElement: Mock;
  readonly commitMoveElement: Mock;
  readonly copySelectedElement: Mock;
  readonly pasteCopiedElement: Mock;
  readonly duplicateElement: Mock;
  readonly deleteElement: Mock;
  readonly updateText: Mock;
  readonly updateTextFontSize: Mock;
  readonly updateTextAppearance: Mock;
  readonly updateElementColor: Mock;
  readonly resizeElement: Mock;
  readonly commitResizeElement: Mock;
  readonly previewResizeElement: Mock;
  readonly previewTextResizeElement: Mock;
  readonly commitTextResizeElement: Mock;
  readonly undo: Mock;
  readonly redo: Mock;
  readonly addTypedSignature: Mock;
  readonly addTypedInitials: Mock;
  readonly addUploadedSignature: Mock;
  readonly addDrawnSignature: Mock;
  readonly selectPage: Mock;
  readonly previousPage: Mock;
  readonly nextPage: Mock;
  readonly reorderCurrentPageLayers: Mock;
  readonly setAllCurrentPageElementsVisibility: Mock;
  readonly setAllCurrentPageElementsLocked: Mock;
  readonly setElementVisibility: Mock;
  readonly setElementLocked: Mock;
  readonly setDocumentDates: Mock;
}

const documentPages = [
  { id: "page-1", width: 300, height: 400, rotation: 0 },
  { id: "page-2", width: 300, height: 400, rotation: 0 },
] as const;

const baseSnapshot = (overrides: Partial<EditorState> = {}): EditorSnapshot => {
  const baseState: EditorState = {
    status: "ready",
    fileName: "visible.pdf",
    pageCount: documentPages.length,
    pages: documentPages,
    currentPageNumber: 1,
    currentPage: documentPages[0],
    renderDocumentId: "render-1",
    tool: "select",
    isDirty: false,
    elements: [],
    visibleElements: [],
    documentDates: {},
    sourceDocumentDates: {},
  };
  const state: EditorState = {
    ...baseState,
    ...overrides,
    pages: overrides.pages ?? baseState.pages,
    pageCount: overrides.pages?.length ?? overrides.pageCount ?? baseState.pageCount,
  };

  return { canExport: true, canUndo: false, canRedo: false, canPaste: false, state };
};
const createEditor = (): TestEditor =>
  ({
    setTool: vi.fn((tool: EditorTool) => baseSnapshot({ tool })),
    addText: vi.fn(() => {
      const element: ExportElement = {
        id: "text-created",
        pageId: "page-1",
        type: "text",
        bounds: { x: 40, y: 50, width: 160, height: 48 },
        text: "Text",
        textAppearance: { fontSize: 16, color: "#111111" },
      };
      return baseSnapshot({
        selectedElementId: element.id,
        selectedElement: element,
        visibleElements: [element],
        isDirty: true,
      });
    }),
    addWhiteout: vi.fn(() => baseSnapshot()),
    addCheckmark: vi.fn(() => {
      const element: ExportElement = {
        id: "checkmark-1",
        pageId: "page-1",
        type: "checkmark",
        bounds: { x: 86, y: 106, width: 28, height: 28 },
      };
      return baseSnapshot({
        selectedElementId: element.id,
        selectedElement: element,
        visibleElements: [element],
        isDirty: true,
      });
    }),
    addCross: vi.fn(() => {
      const element: ExportElement = {
        id: "cross-1",
        pageId: "page-1",
        type: "cross",
        bounds: { x: 86, y: 106, width: 28, height: 28 },
      };
      return baseSnapshot({
        selectedElementId: element.id,
        selectedElement: element,
        visibleElements: [element],
        isDirty: true,
      });
    }),
    addDate: vi.fn(() => {
      const element: ExportElement = {
        id: "date-1",
        pageId: "page-1",
        type: "date",
        bounds: { x: 100, y: 120, width: 96, height: 28 },
        text: "07/31/2026",
        textAppearance: { fontSize: 16, color: "#111111" },
      };
      return baseSnapshot({
        selectedElementId: element.id,
        selectedElement: element,
        visibleElements: [element],
        isDirty: true,
      });
    }),
    addImage: vi.fn(() => {
      const element: ExportElement = {
        id: "image-1",
        pageId: "page-1",
        type: "image",
        bounds: { x: 70, y: 80, width: 80, height: 40 },
        image: { dataUrl: "data:image/png;base64,image", mimeType: "image/png" },
      };
      return baseSnapshot({
        selectedElementId: element.id,
        selectedElement: element,
        visibleElements: [element],
        isDirty: true,
      });
    }),
    addTypedSignature: vi.fn(() =>
      baseSnapshot({
        selectedElementId: "signature-1",
        selectedElement: {
          id: "signature-1",
          pageId: "page-1",
          type: "signature",
          bounds: { x: 56, y: 250, width: 220, height: 70 },
          text: "Ada Lovelace",
          textAppearance: { fontSize: 34, color: "#111111", fontFamily: "serif" },
          source: "type",
        },
        visibleElements: [
          {
            id: "signature-1",
            pageId: "page-1",
            type: "signature",
            bounds: { x: 56, y: 250, width: 220, height: 70 },
            text: "Ada Lovelace",
            textAppearance: { fontSize: 34, color: "#111111", fontFamily: "serif" },
            source: "type",
          },
        ],
        isDirty: true,
      }),
    ),
    addDrawnSignature: vi.fn(() => baseSnapshot()),
    selectPage: vi.fn(() => baseSnapshot()),
    previousPage: vi.fn(() => baseSnapshot()),
    nextPage: vi.fn(() => baseSnapshot()),
    reorderCurrentPageLayers: vi.fn(() => baseSnapshot()),
    setAllCurrentPageElementsVisibility: vi.fn(() => baseSnapshot()),
    setAllCurrentPageElementsLocked: vi.fn(() => baseSnapshot()),
    setElementVisibility: vi.fn(() => baseSnapshot()),
    setElementLocked: vi.fn(() => baseSnapshot()),
    setDocumentDates: vi.fn(() => baseSnapshot()),
    addUploadedSignature: vi.fn(() => baseSnapshot()),
    addTypedInitials: vi.fn(() => baseSnapshot()),
    addDrawnInitials: vi.fn(() => baseSnapshot()),
    selectElement: vi.fn(() => baseSnapshot()),
    clearSelection: vi.fn(() => baseSnapshot()),
    copySelectedElement: vi.fn(() => baseSnapshot({ selectedElementId: "image-1" })),
    pasteCopiedElement: vi.fn(() => baseSnapshot({ selectedElementId: "image-copy" })),
    moveElement: vi.fn(() => baseSnapshot()),
    previewMoveElement: vi.fn(() => baseSnapshot()),
    commitMoveElement: vi.fn(() => baseSnapshot()),
    resizeElement: vi.fn(() => baseSnapshot()),
    commitResizeElement: vi.fn(() => baseSnapshot()),
    previewResizeElement: vi.fn(() => baseSnapshot()),
    previewTextResizeElement: vi.fn(() => baseSnapshot()),
    commitTextResizeElement: vi.fn(() => baseSnapshot()),
    duplicateElement: vi.fn(() => baseSnapshot()),
    deleteElement: vi.fn(() => baseSnapshot()),
    updateText: vi.fn(() => baseSnapshot()),
    updateTextFontSize: vi.fn(() => baseSnapshot()),
    updateTextAppearance: vi.fn(() => baseSnapshot()),
    updateElementColor: vi.fn(() => baseSnapshot()),
    undo: vi.fn(() => baseSnapshot()),
    redo: vi.fn(() => baseSnapshot()),
    exportCurrentPdf: vi.fn(() => Promise.resolve(baseSnapshot())),
  }) as unknown as TestEditor;

const createRenderer = () => ({
  startRenderPage: vi.fn(() => ({
    promise: Promise.resolve({
      ok: true as const,
      cssWidth: 300,
      cssHeight: 400,
      backingWidth: 300,
      backingHeight: 400,
    }),
    cancel: vi.fn(),
  })),
  clearCanvas: vi.fn(),
});

const selectedElementForType = (type: ExportElement["type"]): ExportElement => {
  const base = {
    id: `${type}-1`,
    pageId: "page-1",
    type,
    bounds: { x: 40, y: 50, width: 120, height: 48 },
  } as const;
  if (type === "text") {
    return {
      ...base,
      type,
      text: "Editable text",
      textAppearance: { fontSize: 16, color: "#111111" },
    };
  }
  if (type === "date") {
    return {
      ...base,
      type,
      text: "07/31/2026",
      textAppearance: { fontSize: 16, color: "#111111" },
    };
  }
  if (type === "image") {
    return {
      ...base,
      type,
      image: { dataUrl: "data:image/png;base64,image", mimeType: "image/png" },
    };
  }
  if (type === "signature" || type === "initials") {
    return {
      ...base,
      type,
      text: type === "signature" ? "Ada Lovelace" : "AL",
      textAppearance: { fontSize: 30, color: "#111111", fontFamily: "cursive" },
      source: "type",
    };
  }
  return base;
};

const selectedSnapshot = (type: ExportElement["type"]): EditorSnapshot => {
  const element = selectedElementForType(type);
  return baseSnapshot({
    selectedElementId: element.id,
    selectedElement: element,
    visibleElements: [element],
    isDirty: false,
  });
};

const renderStatefulEditor = (editor: TestEditor, initialSnapshot: EditorSnapshot) => {
  let currentSnapshot = initialSnapshot;
  const renderer = createRenderer();
  const onSnapshotChange = vi.fn((nextSnapshot: EditorSnapshot) => {
    currentSnapshot = nextSnapshot;
    view.rerender(
      <EditorPage
        editor={editor}
        snapshot={currentSnapshot}
        onSnapshotChange={onSnapshotChange}
        pdfRenderer={renderer}
      />,
    );
  });
  const view = render(
    <EditorPage
      editor={editor}
      snapshot={currentSnapshot}
      onSnapshotChange={onSnapshotChange}
      pdfRenderer={renderer}
    />,
  );
  return { ...view, onSnapshotChange, renderer };
};

const dispatchPointerEvent = (
  target: HTMLElement | Window,
  type: string,
  init: { readonly clientX: number; readonly clientY: number; readonly pointerId: number },
): void => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: init.clientX },
    clientY: { value: init.clientY },
    pointerId: { value: init.pointerId },
  });
  act(() => {
    target.dispatchEvent(event);
  });
};

const installControlledRaf = () => {
  let nextId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  const requestSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    const id = nextId;
    nextId += 1;
    callbacks.set(id, callback);
    return id;
  });
  const cancelSpy = vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    callbacks.delete(id);
  });
  return {
    requestSpy,
    cancelSpy,
    pendingCount: () => callbacks.size,
    flushLatest: () => {
      const latest = Array.from(callbacks.entries()).at(-1);
      callbacks.clear();
      if (latest !== undefined) {
        act(() => {
          latest[1](performance.now());
        });
      }
    },
    restore: () => {
      callbacks.clear();
      requestSpy.mockRestore();
      cancelSpy.mockRestore();
    },
  };
};
const textSnapshot = (text: string, fontSize = 16): EditorSnapshot => {
  const element: ExportElement = {
    id: "text-1",
    pageId: "page-1",
    type: "text",
    bounds: { x: 40, y: 50, width: 160, height: 48 },
    text,
    textAppearance: { fontSize, color: "#111111" },
  };
  return baseSnapshot({
    selectedElementId: element.id,
    selectedElement: element,
    visibleElements: [element],
    isDirty: true,
  });
};
const getEditorViewport = (): HTMLElement => {
  const editorViewport = document.querySelector(".editor-viewer");
  expect(editorViewport).toBeInstanceOf(HTMLElement);
  return editorViewport as HTMLElement;
};

describe("EditorPage PDF rendering", () => {
  it("commits a pending text color before selecting an overlay", async () => {
    const user = userEvent.setup();
    const originalElement = selectedElementForType("text");
    if (originalElement.type !== "text") {
      throw new Error("Expected a text element fixture.");
    }
    const committedColor = "#c62828";
    const committedElement: ExportElement = {
      ...originalElement,
      color: committedColor,
      textAppearance: { fontSize: 16, color: committedColor },
    };
    const committedSnapshot = baseSnapshot({
      selectedElementId: committedElement.id,
      selectedElement: committedElement,
      elements: [committedElement],
      visibleElements: [committedElement],
      isDirty: true,
    });
    const editor = createEditor();
    const updateElementColor = editor.updateElementColor;
    const selectElement = editor.selectElement;
    updateElementColor.mockReturnValue(committedSnapshot);
    selectElement.mockReturnValue(committedSnapshot);

    renderStatefulEditor(
      editor,
      baseSnapshot({
        selectedElementId: originalElement.id,
        selectedElement: originalElement,
        elements: [originalElement],
        visibleElements: [originalElement],
      }),
    );

    await user.click(screen.getByRole("tab", { name: "Style" }));
    fireEvent.input(screen.getByLabelText("Text color"), {
      target: { value: committedColor },
    });

    expect(updateElementColor).not.toHaveBeenCalled();

    fireEvent.pointerDown(screen.getByRole("group", { name: "text element" }), {
      clientX: 80,
      clientY: 90,
      pointerId: 71,
    });

    expect(updateElementColor).toHaveBeenCalledWith(originalElement.id, committedColor);
    expect(screen.getByLabelText("Text element content")).toHaveStyle({ color: committedColor });
  });
  it("renders the active PDF page into a canvas and removes the placeholder path", async () => {
    const renderer = createRenderer();
    const { container } = render(
      <EditorPage
        editor={createEditor()}
        snapshot={baseSnapshot()}
        onSnapshotChange={vi.fn()}
        pdfRenderer={renderer}
      />,
    );

    expect(screen.getByLabelText("Rendered PDF page")).toBeInTheDocument();
    await waitFor(() => {
      expect(renderer.startRenderPage).toHaveBeenCalledWith(
        expect.objectContaining({ documentId: "render-1", pageNumber: 1, scale: 1 }),
      );
    });
    expect(container.querySelector(".pdf-page-placeholder")).toBeNull();
  });

  it("shows loading while rendering and a recoverable error when rendering fails", async () => {
    const pending = deferred<{
      readonly ok: false;
      readonly cancelled: false;
      readonly error: { readonly code: "RenderFailed"; readonly message: string };
    }>();
    const renderer = {
      startRenderPage: vi.fn(() => ({ promise: pending.promise, cancel: vi.fn() })),
      clearCanvas: vi.fn(),
    };
    render(
      <EditorPage
        editor={createEditor()}
        snapshot={baseSnapshot()}
        onSnapshotChange={vi.fn()}
        pdfRenderer={renderer}
      />,
    );

    expect(screen.getByText("Rendering PDF page...")).toBeInTheDocument();
    pending.resolve({
      ok: false,
      cancelled: false,
      error: { code: "RenderFailed", message: "The PDF page could not be rendered." },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The PDF page could not be rendered.",
    );
  });

  it("cancels stale renders and rerenders when the page changes", async () => {
    const firstCancel = vi.fn();
    const renderer = {
      startRenderPage: vi
        .fn()
        .mockReturnValueOnce({
          promise: Promise.resolve({
            ok: true as const,
            cssWidth: 300,
            cssHeight: 400,
            backingWidth: 300,
            backingHeight: 400,
          }),
          cancel: firstCancel,
        })
        .mockReturnValueOnce({
          promise: Promise.resolve({
            ok: true as const,
            cssWidth: 200,
            cssHeight: 300,
            backingWidth: 200,
            backingHeight: 300,
          }),
          cancel: vi.fn(),
        }),
      clearCanvas: vi.fn(),
    };
    const { rerender } = render(
      <EditorPage
        editor={createEditor()}
        snapshot={baseSnapshot()}
        onSnapshotChange={vi.fn()}
        pdfRenderer={renderer}
      />,
    );

    rerender(
      <EditorPage
        editor={createEditor()}
        snapshot={baseSnapshot({
          currentPageNumber: 2,
          currentPage: { id: "page-2", width: 200, height: 300, rotation: 0 },
          visibleElements: [],
        })}
        onSnapshotChange={vi.fn()}
        pdfRenderer={renderer}
      />,
    );

    expect(firstCancel).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(renderer.startRenderPage).toHaveBeenLastCalledWith(
        expect.objectContaining({ pageNumber: 2 }),
      );
    });
  });

  it("rerenders on zoom and keeps overlay dimensions aligned to canvas CSS size", async () => {
    const user = userEvent.setup();
    const renderer = createRenderer();
    render(
      <EditorPage
        editor={createEditor()}
        snapshot={baseSnapshot({
          visibleElements: [
            {
              id: "element-1",
              pageId: "page-1",
              type: "whiteout",
              bounds: { x: 40, y: 50, width: 120, height: 48 },
            },
          ],
        })}
        onSnapshotChange={vi.fn()}
        pdfRenderer={renderer}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Zoom in" }));

    await waitFor(() => {
      expect(renderer.startRenderPage).toHaveBeenLastCalledWith(
        expect.objectContaining({ scale: 1.25 }),
      );
    });
    const page = screen.getByLabelText("PDF page 1 of 2");
    const whiteout = screen.getByRole("group", { name: "whiteout element" });
    expect(page).toHaveStyle({ width: "375px", height: "500px" });
    expect(whiteout).toHaveStyle({ left: "50px", top: "62.5px", width: "150px", height: "60px" });
  });

  it("passes device pixel ratio to the renderer and clears the canvas on cleanup", async () => {
    const renderer = createRenderer();
    const originalDpr = window.devicePixelRatio;
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 2 });

    const { unmount } = render(
      <EditorPage
        editor={createEditor()}
        snapshot={baseSnapshot()}
        onSnapshotChange={vi.fn()}
        pdfRenderer={renderer}
      />,
    );

    await waitFor(() => {
      expect(renderer.startRenderPage).toHaveBeenCalledWith(
        expect.objectContaining({ devicePixelRatio: 2 }),
      );
    });
    unmount();
    expect(renderer.clearCanvas).toHaveBeenCalled();
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: originalDpr });
  });

  it("uses a native non-passive editor viewport wheel listener for viewer-only modified-wheel zoom", async () => {
    const addEventListener = vi.spyOn(HTMLElement.prototype, "addEventListener");
    const renderer = createRenderer();
    render(
      <EditorPage
        editor={createEditor()}
        snapshot={baseSnapshot()}
        onSnapshotChange={vi.fn()}
        pdfRenderer={renderer}
      />,
    );

    const editorViewport = getEditorViewport();
    await waitFor(() => {
      expect(addEventListener).toHaveBeenCalledWith("wheel", expect.any(Function), {
        passive: false,
      });
    });
    const wheelListenerTargets = addEventListener.mock.calls
      .map((call, index) => ({ call, target: addEventListener.mock.contexts[index] }))
      .filter(({ call }) => call[0] === "wheel")
      .map(({ target }) => target);
    expect(wheelListenerTargets).toContain(editorViewport);
    expect(wheelListenerTargets).not.toContain(screen.getByLabelText("Rendered PDF page"));
    addEventListener.mockRestore();
  });

  it("prevents browser page zoom and rerenders the viewer when modified wheel starts on the stable viewport", async () => {
    const renderer = createRenderer();
    render(
      <EditorPage
        editor={createEditor()}
        snapshot={baseSnapshot()}
        onSnapshotChange={vi.fn()}
        pdfRenderer={renderer}
      />,
    );
    const editorViewport = getEditorViewport();

    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: -100,
    });
    editorViewport.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => {
      expect(renderer.startRenderPage).toHaveBeenLastCalledWith(
        expect.objectContaining({ scale: 1.25 }),
      );
    });
  });

  it("leaves ordinary wheel scrolling unchanged", () => {
    const renderer = createRenderer();
    render(
      <EditorPage
        editor={createEditor()}
        snapshot={baseSnapshot()}
        onSnapshotChange={vi.fn()}
        pdfRenderer={renderer}
      />,
    );
    const editorViewport = getEditorViewport();

    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 100,
    });
    editorViewport.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(renderer.startRenderPage).toHaveBeenCalledTimes(1);
  });

  it("prevents browser keyboard zoom shortcuts and changes only viewer zoom", async () => {
    const renderer = createRenderer();
    render(
      <EditorPage
        editor={createEditor()}
        snapshot={baseSnapshot()}
        onSnapshotChange={vi.fn()}
        pdfRenderer={renderer}
      />,
    );

    const zoomIn = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: "+",
    });
    window.dispatchEvent(zoomIn);

    expect(zoomIn.defaultPrevented).toBe(true);
    await waitFor(() => {
      expect(renderer.startRenderPage).toHaveBeenLastCalledWith(
        expect.objectContaining({ scale: 1.25 }),
      );
    });

    const reset = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      metaKey: true,
      key: "0",
    });
    window.dispatchEvent(reset);

    expect(reset.defaultPrevented).toBe(true);
    await waitFor(() => {
      expect(renderer.startRenderPage).toHaveBeenLastCalledWith(
        expect.objectContaining({ scale: 1 }),
      );
    });
  });
  it("contains repeated modified-wheel zoom-out gestures at the minimum boundary", async () => {
    const renderer = createRenderer();
    const onSnapshotChange = vi.fn();
    render(
      <EditorPage
        editor={createEditor()}
        snapshot={baseSnapshot({ isDirty: false })}
        onSnapshotChange={onSnapshotChange}
        pdfRenderer={renderer}
      />,
    );
    const editorViewport = getEditorViewport();

    act(() => {
      editorViewport.dispatchEvent(
        new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true, deltaY: 100 }),
      );
      editorViewport.dispatchEvent(
        new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true, deltaY: 100 }),
      );
    });
    await waitFor(() => {
      expect(screen.getByLabelText("Zoom level")).toHaveTextContent("50%");
    });
    const boundaryEvents = [
      new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true, deltaY: 100 }),
      new WheelEvent("wheel", { bubbles: true, cancelable: true, metaKey: true, deltaY: 100 }),
      new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true, deltaY: 100 }),
    ];

    act(() => {
      boundaryEvents.forEach((event) => {
        editorViewport.dispatchEvent(event);
      });
    });

    expect(boundaryEvents.every((event) => event.defaultPrevented)).toBe(true);
    expect(screen.getByLabelText("Zoom level")).toHaveTextContent("50%");
    expect(renderer.startRenderPage).toHaveBeenLastCalledWith(
      expect.objectContaining({ scale: 0.5 }),
    );
    expect(screen.getByText("No unsaved edits")).toBeInTheDocument();
    expect(onSnapshotChange).not.toHaveBeenCalled();
  });

  it("contains modified-wheel zoom-in gestures at the maximum boundary", async () => {
    const renderer = createRenderer();
    render(
      <EditorPage
        editor={createEditor()}
        snapshot={baseSnapshot()}
        onSnapshotChange={vi.fn()}
        pdfRenderer={renderer}
      />,
    );
    const editorViewport = getEditorViewport();

    act(() => {
      for (let index = 0; index < 8; index += 1) {
        editorViewport.dispatchEvent(
          new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -100 }),
        );
      }
    });
    await waitFor(() => {
      expect(screen.getByLabelText("Zoom level")).toHaveTextContent("300%");
    });
    const boundaryEvent = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: -100,
    });

    act(() => {
      editorViewport.dispatchEvent(boundaryEvent);
    });

    expect(boundaryEvent.defaultPrevented).toBe(true);
    expect(screen.getByLabelText("Zoom level")).toHaveTextContent("300%");
    expect(renderer.startRenderPage).toHaveBeenLastCalledWith(
      expect.objectContaining({ scale: 3 }),
    );
  });

  it("does not prevent ordinary wheel gestures at zoom boundaries", () => {
    const renderer = createRenderer();
    render(
      <EditorPage
        editor={createEditor()}
        snapshot={baseSnapshot()}
        onSnapshotChange={vi.fn()}
        pdfRenderer={renderer}
      />,
    );
    const editorViewport = getEditorViewport();

    act(() => {
      editorViewport.dispatchEvent(
        new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true, deltaY: 100 }),
      );
      editorViewport.dispatchEvent(
        new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true, deltaY: 100 }),
      );
    });
    const plainAtMin = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 100 });
    editorViewport.dispatchEvent(plainAtMin);
    expect(plainAtMin.defaultPrevented).toBe(false);

    act(() => {
      for (let index = 0; index < 10; index += 1) {
        editorViewport.dispatchEvent(
          new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -100 }),
        );
      }
    });
    const plainAtMax = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -100 });
    editorViewport.dispatchEvent(plainAtMax);
    expect(plainAtMax.defaultPrevented).toBe(false);
  });

  it("renders Undo and Redo controls disabled when history is unavailable", () => {
    render(
      <EditorPage
        editor={createEditor()}
        snapshot={baseSnapshot()}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
  });

  it("pans an empty phone workspace with one touch without changing editor state", () => {
    const mediaQuery = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => mediaQuery),
    );
    const onSnapshotChange = vi.fn();
    render(
      <EditorPage
        editor={createEditor()}
        snapshot={baseSnapshot({ selectedElementId: "text-1" })}
        onSnapshotChange={onSnapshotChange}
        pdfRenderer={createRenderer()}
      />,
    );

    const workspace = screen.getByRole("main", { name: "PDF workspace" });
    Object.defineProperties(workspace, {
      scrollLeft: { configurable: true, value: 120, writable: true },
      scrollTop: { configurable: true, value: 80, writable: true },
      setPointerCapture: { configurable: true, value: vi.fn() },
      releasePointerCapture: { configurable: true, value: vi.fn() },
    });
    const dispatchTouch = (type: string, clientX: number, clientY: number): Event => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        pointerId: { value: 71 },
        pointerType: { value: "touch" },
        clientX: { value: clientX },
        clientY: { value: clientY },
      });
      act(() => {
        workspace.dispatchEvent(event);
      });
      return event;
    };

    const down = dispatchTouch("pointerdown", 200, 180);
    const move = dispatchTouch("pointermove", 150, 140);
    dispatchTouch("pointerup", 150, 140);

    expect(down.defaultPrevented).toBe(true);
    expect(move.defaultPrevented).toBe(true);
    expect(workspace.scrollLeft).toBe(170);
    expect(workspace.scrollTop).toBe(120);
    expect(onSnapshotChange).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it("pans the empty Select workspace without changing editor state", () => {
    const onSnapshotChange = vi.fn();
    render(
      <EditorPage
        editor={createEditor()}
        snapshot={baseSnapshot({ selectedElementId: "text-1" })}
        onSnapshotChange={onSnapshotChange}
        pdfRenderer={createRenderer()}
      />,
    );

    const workspace = screen.getByRole("main", { name: "PDF workspace" });
    Object.defineProperties(workspace, {
      scrollLeft: { configurable: true, value: 120, writable: true },
      scrollTop: { configurable: true, value: 80, writable: true },
    });

    fireEvent(
      workspace,
      Object.assign(new Event("pointerdown", { bubbles: true }), {
        button: 0,
        pointerId: 9,
        clientX: 200,
        clientY: 180,
      }),
    );
    fireEvent(
      workspace,
      Object.assign(new Event("pointermove", { bubbles: true }), {
        pointerId: 9,
        clientX: 150,
        clientY: 140,
      }),
    );
    fireEvent(
      workspace,
      Object.assign(new Event("pointerup", { bubbles: true }), {
        pointerId: 9,
        clientX: 150,
        clientY: 140,
      }),
    );

    expect(workspace.scrollLeft).toBe(170);
    expect(workspace.scrollTop).toBe(120);
    expect(onSnapshotChange).not.toHaveBeenCalled();
  });

  it("pans plain PDF page area through the workspace gesture", () => {
    const onSnapshotChange = vi.fn();
    render(
      <EditorPage
        editor={createEditor()}
        snapshot={baseSnapshot()}
        onSnapshotChange={onSnapshotChange}
        pdfRenderer={createRenderer()}
      />,
    );

    const workspace = screen.getByRole("main", { name: "PDF workspace" });
    const pageArea = screen.getByLabelText("PDF overlay");
    Object.defineProperties(workspace, {
      scrollLeft: { configurable: true, value: 120, writable: true },
      scrollTop: { configurable: true, value: 80, writable: true },
    });

    const dispatchPagePointer = (type: string, clientX: number, clientY: number): void => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        button: { value: 0 },
        pointerId: { value: 10 },
        clientX: { value: clientX },
        clientY: { value: clientY },
      });
      act(() => {
        pageArea.dispatchEvent(event);
      });
    };

    dispatchPagePointer("pointerdown", 200, 180);
    dispatchPagePointer("pointermove", 150, 140);
    dispatchPagePointer("pointerup", 150, 140);

    expect(workspace.scrollLeft).toBe(170);
    expect(workspace.scrollTop).toBe(120);
    expect(onSnapshotChange).not.toHaveBeenCalled();
  });

  it("renders the compact toolbar with labeled icon-first controls", async () => {
    const user = userEvent.setup();
    render(
      <EditorPage
        editor={createEditor()}
        snapshot={{ ...baseSnapshot(), canUndo: true, canRedo: true }}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );
    for (const name of [
      "Open",
      "Download",
      "Undo",
      "Redo",
      "Select",
      "Text",
      "Whiteout",
      "Image",
      "Signature",
      "Initials",
      "Checkmark",
      "Cross",
      "Date",
      "Zoom out",
      "Zoom in",
      "Fit page",
      "Fit width",
      "Previous page",
      "Next page",
    ]) {
      expect(screen.getByRole("button", { name }).querySelector("svg.toolbar-icon")).not.toBeNull();
    }
    expect(screen.queryByText("ACTIVE")).not.toBeInTheDocument();
    expect(screen.queryByText("SELECTED")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More editor options" })).toBeNull();
    const workspace = screen.getByLabelText("PDF workspace");
    Object.defineProperties(workspace, {
      clientWidth: { value: 900 },
      clientHeight: { value: 700 },
    });
    await user.click(screen.getByRole("button", { name: "Fit width" }));
    expect(screen.getByRole("button", { name: "Fit width" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Fit page" }));
    expect(screen.getByRole("button", { name: "Fit page" })).toBeEnabled();
  });
  it("routes the keyboard-accessible editor logo through the supplied home navigation boundary", async () => {
    const user = userEvent.setup();
    const onHomeRequest = vi.fn();
    render(
      <EditorPage
        editor={createEditor()}
        snapshot={baseSnapshot()}
        onSnapshotChange={vi.fn()}
        onHomeRequest={onHomeRequest}
        pdfRenderer={createRenderer()}
      />,
    );

    await user.tab();
    await user.keyboard("{Enter}");

    expect(onHomeRequest).toHaveBeenCalledTimes(1);
  });
  it("routes the toolbar Open action through the supplied navigation boundary", async () => {
    const user = userEvent.setup();
    const onOpenRequest = vi.fn();
    render(
      <EditorPage
        editor={createEditor()}
        snapshot={baseSnapshot()}
        onSnapshotChange={vi.fn()}
        onOpenRequest={onOpenRequest}
        pdfRenderer={createRenderer()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Open" }));

    expect(onOpenRequest).toHaveBeenCalledTimes(1);
  });
  it("routes Undo and Redo toolbar actions through the application API", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    render(
      <EditorPage
        editor={editor}
        snapshot={{ ...baseSnapshot(), canUndo: true, canRedo: true }}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Undo" }));
    await user.click(screen.getByRole("button", { name: "Redo" }));

    expect(editor.undo).toHaveBeenCalledTimes(1);
    expect(editor.redo).toHaveBeenCalledTimes(1);
  });

  it("handles Undo and Redo keyboard shortcuts when history is available", () => {
    const editor = createEditor();
    render(
      <EditorPage
        editor={editor}
        snapshot={{ ...baseSnapshot(), canUndo: true, canRedo: true }}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );
    const undo = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: "z",
    });
    const redoShift = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      shiftKey: true,
      key: "Z",
    });
    const redoY = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: "y",
    });
    const macRedo = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      metaKey: true,
      shiftKey: true,
      key: "z",
    });

    act(() => {
      window.dispatchEvent(undo);
      window.dispatchEvent(redoShift);
      window.dispatchEvent(redoY);
      window.dispatchEvent(macRedo);
    });

    expect(undo.defaultPrevented).toBe(true);
    expect(redoShift.defaultPrevented).toBe(true);
    expect(redoY.defaultPrevented).toBe(true);
    expect(macRedo.defaultPrevented).toBe(true);
    expect(editor.undo).toHaveBeenCalledTimes(1);
    expect(editor.redo).toHaveBeenCalledTimes(3);
  });

  it("does not hijack history shortcuts inside active text editing controls", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    render(
      <EditorPage
        editor={editor}
        snapshot={{ ...selectedSnapshot("text"), canUndo: true, canRedo: true }}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    await user.dblClick(screen.getByLabelText("Text element content"));
    const textArea = screen.getByLabelText("Edit text element");
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: "z",
    });
    act(() => {
      textArea.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
    expect(editor.undo).not.toHaveBeenCalled();
  });
  it("does not intercept browser zoom shortcuts when no editor document is open", () => {
    render(
      <EditorPage
        editor={createEditor()}
        snapshot={{
          canExport: false,
          canUndo: false,
          canRedo: false,
          canPaste: false,
          state: {
            status: "empty",
            pageCount: 0,
            pages: [],
            currentPageNumber: 0,
            tool: "select",
            isDirty: false,
            elements: [],
            visibleElements: [],
            documentDates: {},
            sourceDocumentDates: {},
          },
        }}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: "+",
    });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });
  it("selects text with one click anywhere inside the text box without entering edit mode", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    const element = selectedElementForType("text");
    render(
      <EditorPage
        editor={editor}
        snapshot={baseSnapshot({ visibleElements: [element] })}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    await user.click(screen.getByLabelText("Text element content"));

    expect(editor.selectElement).toHaveBeenCalledWith("text-1");
    expect(screen.queryByLabelText("Edit text element")).toBeNull();
  });

  it("keeps Enter as a newline inside the text inspector content field", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    render(
      <EditorPage
        editor={editor}
        snapshot={selectedSnapshot("text")}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    await user.click(screen.getByLabelText("Text content"));
    await user.keyboard("{End}{Enter}");

    expect(editor.updateText).toHaveBeenCalledWith("text-1", "Editable text\n");
  });

  it("enters date editing on double-click", async () => {
    const user = userEvent.setup();
    render(
      <EditorPage
        editor={createEditor()}
        snapshot={selectedSnapshot("date")}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    await user.dblClick(screen.getByLabelText("Text element content"));
    expect(screen.getByLabelText("Edit text element")).toHaveFocus();
  });
  it("enters text editing on double-click and keeps normal typing inside the text input", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    render(
      <EditorPage
        editor={editor}
        snapshot={selectedSnapshot("text")}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    await user.dblClick(screen.getByLabelText("Text element content"));
    const input = screen.getByLabelText("Edit text element");
    expect(input).toHaveFocus();
    await user.keyboard("A");

    expect(editor.updateText).toHaveBeenCalled();
    expect(editor.deleteElement).not.toHaveBeenCalled();
  });

  it("types multi-character text without losing prior characters or resetting the caret", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    let currentText = "Editable text";
    editor.selectElement.mockImplementation(() => textSnapshot(currentText));
    editor.updateText.mockImplementation((elementId: string, text: string) => {
      expect(elementId).toBe("text-1");
      currentText = text;
      return textSnapshot(currentText);
    });
    renderStatefulEditor(editor, textSnapshot(currentText));

    await user.dblClick(screen.getByLabelText("Text element content"));
    const input = screen.getByLabelText("Edit text element");
    expect(input).toBeInstanceOf(HTMLTextAreaElement);
    const textArea = input as HTMLTextAreaElement;
    await user.keyboard("ABCDE");

    expect(textArea).toHaveValue("ABCDE");
    expect(textArea.selectionStart).toBe(5);
    expect(editor.deleteElement).not.toHaveBeenCalled();
  });

  it("edits in the middle of existing text while preserving caret position", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    let currentText = "Editable text";
    editor.selectElement.mockImplementation(() => textSnapshot(currentText));
    editor.updateText.mockImplementation((_elementId: string, text: string) => {
      currentText = text;
      return textSnapshot(currentText);
    });
    renderStatefulEditor(editor, textSnapshot(currentText));

    await user.dblClick(screen.getByLabelText("Text element content"));
    const input = screen.getByLabelText("Edit text element");
    expect(input).toBeInstanceOf(HTMLTextAreaElement);
    const textArea = input as HTMLTextAreaElement;
    textArea.setSelectionRange(4, 4);
    await user.keyboard("XYZ");

    expect(textArea).toHaveValue("EditXYZable text");
    expect(textArea.selectionStart).toBe(7);
  });

  it("lets Backspace and Delete edit text content without deleting the element", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    let currentText = "ABCDE";
    editor.selectElement.mockImplementation(() => textSnapshot(currentText));
    editor.updateText.mockImplementation((_elementId: string, text: string) => {
      currentText = text;
      return textSnapshot(currentText);
    });
    renderStatefulEditor(editor, textSnapshot(currentText));

    await user.dblClick(screen.getByLabelText("Text element content"));
    const input = screen.getByLabelText("Edit text element");
    expect(input).toBeInstanceOf(HTMLTextAreaElement);
    const textArea = input as HTMLTextAreaElement;
    textArea.setSelectionRange(2, 2);
    await user.keyboard("{Backspace}");
    expect(textArea).toHaveValue("ACDE");
    textArea.setSelectionRange(1, 1);
    await user.keyboard("{Delete}");

    expect(textArea).toHaveValue("ADE");
    expect(editor.deleteElement).not.toHaveBeenCalled();
  });
  it("enters text editing with Enter while selected", () => {
    render(
      <EditorPage
        editor={createEditor()}
        snapshot={selectedSnapshot("text")}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Enter",
    });

    act(() => {
      window.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByLabelText("Edit text element")).toHaveFocus();
  });

  it("exits text editing with Escape and keeps the element selected", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    render(
      <EditorPage
        editor={editor}
        snapshot={selectedSnapshot("text")}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );
    await user.dblClick(screen.getByLabelText("Text element content"));
    const input = screen.getByLabelText("Edit text element");

    await user.keyboard("{Escape}");

    expect(screen.queryByLabelText("Edit text element")).toBeNull();
    expect(screen.getByRole("complementary", { name: "Selected element actions" })).toBeVisible();
    expect(screen.getByLabelText("Resize text element")).toBeVisible();
    expect(editor.deleteElement).not.toHaveBeenCalled();
    expect(input).not.toHaveFocus();
  });

  it("clicking empty page space with Select clears selection after exiting text editing", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    render(
      <EditorPage
        editor={editor}
        snapshot={selectedSnapshot("text")}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );
    await user.dblClick(screen.getByLabelText("Text element content"));

    await user.click(screen.getByLabelText("PDF overlay"));

    expect(screen.queryByLabelText("Edit text element")).toBeNull();
    expect(editor.clearSelection).toHaveBeenCalledTimes(1);
  });

  it("clicking empty page space with Select clears the current selected element", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    render(
      <EditorPage
        editor={editor}
        snapshot={selectedSnapshot("whiteout")}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    await user.click(screen.getByLabelText("PDF overlay"));

    expect(editor.clearSelection).toHaveBeenCalledTimes(1);
    expect(editor.selectElement).not.toHaveBeenCalled();
  });

  it("does not clear selection when empty page space is used by a creation tool", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    render(
      <EditorPage
        editor={editor}
        snapshot={baseSnapshot({ ...selectedSnapshot("text").state, tool: "text" })}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    await user.click(screen.getByLabelText("PDF overlay"));

    expect(editor.addText).toHaveBeenCalled();
    expect(editor.clearSelection).not.toHaveBeenCalled();
  });

  it("does not clear selection when selected-element inspector controls are used", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    render(
      <EditorPage
        editor={editor}
        snapshot={selectedSnapshot("text")}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Duplicate" }));

    expect(editor.duplicateElement).toHaveBeenCalledWith("text-1");
    expect(editor.clearSelection).not.toHaveBeenCalled();
  });

  it("clears selection when Select clicks empty workspace outside the PDF page", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    render(
      <EditorPage
        editor={editor}
        snapshot={selectedSnapshot("signature")}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    await user.click(screen.getByLabelText("PDF workspace"));

    expect(editor.clearSelection).toHaveBeenCalledTimes(1);
  });

  it("Backspace edits text while editing and does not delete the selected text element", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    render(
      <EditorPage
        editor={editor}
        snapshot={selectedSnapshot("text")}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );
    await user.dblClick(screen.getByLabelText("Text element content"));

    await user.keyboard("{Backspace}");

    expect(editor.updateText).toHaveBeenCalled();
    expect(editor.deleteElement).not.toHaveBeenCalled();
  });

  it("dragging selected text moves it without entering editing", async () => {
    const editor = createEditor();
    render(
      <EditorPage
        editor={editor}
        snapshot={selectedSnapshot("text")}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );
    const text = screen.getByRole("group", { name: "text element" });
    const workspace = screen.getByRole("main", { name: "PDF workspace" });
    Object.defineProperties(workspace, {
      scrollLeft: { configurable: true, value: 120, writable: true },
      scrollTop: { configurable: true, value: 80, writable: true },
    });

    const down = new Event("pointerdown", { bubbles: true });
    Object.defineProperties(down, {
      clientX: { value: 55 },
      clientY: { value: 65 },
      pointerId: { value: 1 },
    });
    act(() => {
      text.dispatchEvent(down);
    });
    expect(editor.selectElement).toHaveBeenCalledWith("text-1");
    await waitFor(() => {
      expect(text).toHaveFocus();
    });
    const move = new Event("pointermove", { bubbles: true });
    Object.defineProperties(move, {
      clientX: { value: 75 },
      clientY: { value: 85 },
      pointerId: { value: 1 },
    });
    const up = new Event("pointerup", { bubbles: true });
    Object.defineProperty(up, "pointerId", { value: 1 });
    act(() => {
      text.dispatchEvent(move);
      text.dispatchEvent(up);
    });

    expect(editor.commitMoveElement).toHaveBeenCalledTimes(1);
    expect(editor.commitMoveElement).toHaveBeenCalledWith(
      "text-1",
      { x: 40, y: 50, width: 120, height: 48 },
      expect.objectContaining({ x: 60, y: 70, width: 120, height: 48 }),
    );
    expect(screen.queryByLabelText("Edit text element")).toBeNull();
    expect(workspace.scrollLeft).toBe(120);
    expect(workspace.scrollTop).toBe(80);
  });

  it("batches rapid drag previews into one animation frame and commits the latest bounds", () => {
    const raf = installControlledRaf();
    const editor = createEditor();
    try {
      render(
        <EditorPage
          editor={editor}
          snapshot={selectedSnapshot("text")}
          onSnapshotChange={vi.fn()}
          pdfRenderer={createRenderer()}
        />,
      );
      const text = screen.getByRole("group", { name: "text element" });

      dispatchPointerEvent(text, "pointerdown", { clientX: 55, clientY: 65, pointerId: 1 });
      dispatchPointerEvent(text, "pointermove", { clientX: 65, clientY: 75, pointerId: 1 });
      dispatchPointerEvent(text, "pointermove", { clientX: 75, clientY: 85, pointerId: 1 });
      dispatchPointerEvent(text, "pointermove", { clientX: 85, clientY: 95, pointerId: 1 });

      expect(raf.requestSpy).toHaveBeenCalledTimes(1);
      expect(raf.pendingCount()).toBe(1);
      expect(editor.previewMoveElement).not.toHaveBeenCalled();

      raf.flushLatest();

      expect(editor.previewMoveElement).toHaveBeenCalledTimes(1);
      expect(editor.previewMoveElement).toHaveBeenCalledWith(
        "text-1",
        expect.objectContaining({ x: 70, y: 80 }),
      );

      dispatchPointerEvent(text, "pointerup", { clientX: 85, clientY: 95, pointerId: 1 });

      expect(editor.commitMoveElement).toHaveBeenCalledTimes(1);
      expect(editor.commitMoveElement).toHaveBeenCalledWith(
        "text-1",
        { x: 40, y: 50, width: 120, height: 48 },
        expect.objectContaining({ x: 70, y: 80, width: 120, height: 48 }),
      );
      expect(raf.pendingCount()).toBe(0);
    } finally {
      raf.restore();
    }
  });

  it("discards a pending drag preview frame when the pointer is released before it flushes", () => {
    const raf = installControlledRaf();
    const editor = createEditor();
    try {
      render(
        <EditorPage
          editor={editor}
          snapshot={selectedSnapshot("text")}
          onSnapshotChange={vi.fn()}
          pdfRenderer={createRenderer()}
        />,
      );
      const text = screen.getByRole("group", { name: "text element" });

      dispatchPointerEvent(text, "pointerdown", { clientX: 55, clientY: 65, pointerId: 1 });
      dispatchPointerEvent(text, "pointermove", { clientX: 75, clientY: 85, pointerId: 1 });
      expect(raf.pendingCount()).toBe(1);

      dispatchPointerEvent(text, "pointerup", { clientX: 75, clientY: 85, pointerId: 1 });

      expect(raf.cancelSpy).toHaveBeenCalled();
      expect(raf.pendingCount()).toBe(0);
      expect(editor.commitMoveElement).toHaveBeenCalledTimes(1);
      expect(editor.commitMoveElement).toHaveBeenCalledWith(
        "text-1",
        { x: 40, y: 50, width: 120, height: 48 },
        expect.objectContaining({ x: 60, y: 70, width: 120, height: 48 }),
      );

      raf.flushLatest();
      expect(editor.previewMoveElement).not.toHaveBeenCalled();
    } finally {
      raf.restore();
    }
  });

  it("places text as a one-shot tool and switches back to Select", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    render(
      <EditorPage
        editor={editor}
        snapshot={baseSnapshot({ tool: "text" })}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    await user.click(screen.getByLabelText("PDF overlay"));

    expect(editor.addText).toHaveBeenCalledTimes(1);
    expect(editor.setTool).toHaveBeenCalledWith("select");
  });

  it("does not create a second text element when the outside click exits initial editing", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    render(
      <EditorPage
        editor={editor}
        snapshot={textSnapshot("Placed text")}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );
    await user.dblClick(screen.getByLabelText("Text element content"));

    await user.click(screen.getByLabelText("PDF overlay"));

    expect(screen.queryByLabelText("Edit text element")).toBeNull();
    expect(editor.addText).not.toHaveBeenCalled();
    expect(editor.clearSelection).toHaveBeenCalledTimes(1);
  });

  it("Escape exits text editing and switches back to Select", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    render(
      <EditorPage
        editor={editor}
        snapshot={selectedSnapshot("text")}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );
    await user.dblClick(screen.getByLabelText("Text element content"));

    await user.keyboard("{Escape}");

    expect(screen.queryByLabelText("Edit text element")).toBeNull();
    expect(editor.setTool).toHaveBeenCalledWith("select");
  });
  it("newly created text is selected and enters editing automatically", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    const { rerender } = render(
      <EditorPage
        editor={editor}
        snapshot={baseSnapshot({ tool: "text" })}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    await user.click(screen.getByLabelText("PDF overlay"));
    const createdSnapshot = editor.addText.mock.results[0]?.value as EditorSnapshot;
    rerender(
      <EditorPage
        editor={editor}
        snapshot={createdSnapshot}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    expect(editor.addText).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByLabelText("Edit text element")).toHaveFocus();
    });
  });

  it("resizes text bounds without changing the font size", () => {
    const editor = createEditor();
    render(
      <EditorPage
        editor={editor}
        snapshot={selectedSnapshot("text")}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );
    const overlay = screen.getByLabelText("PDF overlay");
    Object.defineProperty(overlay, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 300, height: 400, right: 300, bottom: 400 }),
    });

    dispatchPointerEvent(screen.getByLabelText("Resize text element"), "pointerdown", {
      clientX: 200,
      clientY: 98,
      pointerId: 9,
    });
    dispatchPointerEvent(window, "pointermove", { clientX: 280, clientY: 122, pointerId: 9 });
    dispatchPointerEvent(window, "pointerup", { clientX: 280, clientY: 122, pointerId: 9 });

    expect(editor.previewResizeElement).toHaveBeenCalledWith("text-1", {
      x: 40,
      y: 50,
      width: 240,
      height: 72,
    });
    expect(editor.commitResizeElement).toHaveBeenCalledWith(
      "text-1",
      { x: 40, y: 50, width: 120, height: 48 },
      { x: 40, y: 50, width: 240, height: 72 },
    );
    expect(editor.previewTextResizeElement).not.toHaveBeenCalled();
    expect(editor.commitTextResizeElement).not.toHaveBeenCalled();
  });

  it("cancels text bounds resize with Escape without a commit", () => {
    const editor = createEditor();
    render(
      <EditorPage
        editor={editor}
        snapshot={selectedSnapshot("text")}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );
    const overlay = screen.getByLabelText("PDF overlay");
    Object.defineProperty(overlay, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 300, height: 400, right: 300, bottom: 400 }),
    });

    dispatchPointerEvent(screen.getByLabelText("Resize text element"), "pointerdown", {
      clientX: 200,
      clientY: 98,
      pointerId: 10,
    });
    dispatchPointerEvent(window, "pointermove", { clientX: 280, clientY: 122, pointerId: 10 });
    const escape = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" });
    act(() => {
      window.dispatchEvent(escape);
    });

    expect(escape.defaultPrevented).toBe(true);
    expect(editor.previewResizeElement).toHaveBeenLastCalledWith("text-1", {
      x: 40,
      y: 50,
      width: 120,
      height: 48,
    });
    expect(editor.commitResizeElement).not.toHaveBeenCalled();
    expect(editor.previewTextResizeElement).not.toHaveBeenCalled();
    expect(editor.commitTextResizeElement).not.toHaveBeenCalled();
  });
  it("shows current-page layers front to back and reorders through the application use case", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    const text = selectedElementForType("text");
    const checkmark = selectedElementForType("checkmark");
    render(
      <EditorPage
        editor={editor}
        snapshot={baseSnapshot({
          selectedElementId: text.id,
          selectedElement: text,
          elements: [text, checkmark],
          visibleElements: [text, checkmark],
        })}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    expect(screen.getByLabelText("Layers")).toHaveTextContent("Checkmark");
    expect(screen.queryByRole("heading", { name: "Order" })).not.toBeInTheDocument();
    expect(
      screen.queryByText("Top items appear in front of bottom items."),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Layer order controls")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Move up" }));
    expect(editor.reorderCurrentPageLayers).toHaveBeenCalledWith("text-1", 0);
  });
  it("enables bulk layer actions for real layers and derives mixed-state labels", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    const visibleText = selectedElementForType("text");
    const hiddenCheckmark = {
      ...selectedElementForType("checkmark"),
      visible: false,
      locked: true,
    };
    render(
      <EditorPage
        editor={editor}
        snapshot={baseSnapshot({
          elements: [visibleText, hiddenCheckmark],
          visibleElements: [visibleText],
        })}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    const hideAll = screen.getByRole("button", { name: "Hide All" });
    const lockAll = screen.getByRole("button", { name: "Lock All" });
    expect(hideAll).toBeEnabled();
    expect(lockAll).toBeEnabled();
    await user.click(hideAll);
    await user.click(lockAll);
    expect(editor.setAllCurrentPageElementsVisibility).toHaveBeenCalledWith(false);
    expect(editor.setAllCurrentPageElementsLocked).toHaveBeenCalledWith(true);
    expect(screen.queryByLabelText("checkmark element")).toBeNull();
  });

  it("uses accessible per-layer visibility and lock actions without selecting the layer", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    const text = selectedElementForType("text");
    const hiddenLockedCheckmark = {
      ...selectedElementForType("checkmark"),
      visible: false,
      locked: true,
    };
    const { rerender } = render(
      <EditorPage
        editor={editor}
        snapshot={baseSnapshot({
          elements: [text, hiddenLockedCheckmark],
          visibleElements: [text],
        })}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    expect(screen.getByRole("button", { name: "Hide Text layer" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Lock Text layer" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Show Checkmark layer" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Unlock Checkmark layer" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Checkmark layer" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Hide All" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Lock All" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Hide Text layer" }));
    await user.click(screen.getByRole("button", { name: "Lock Text layer" }));
    expect(editor.setElementVisibility).toHaveBeenCalledWith(text.id, false);
    expect(editor.setElementLocked).toHaveBeenCalledWith(text.id, true);
    expect(editor.selectElement).not.toHaveBeenCalled();

    screen.getByRole("button", { name: "Unlock Checkmark layer" }).focus();
    await user.keyboard("{Enter}");
    expect(editor.setElementLocked).toHaveBeenLastCalledWith(hiddenLockedCheckmark.id, false);

    const hiddenLockedText = { ...text, visible: false, locked: true };
    rerender(
      <EditorPage
        editor={editor}
        snapshot={baseSnapshot({
          elements: [hiddenLockedText, hiddenLockedCheckmark],
          visibleElements: [],
        })}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    expect(screen.getByRole("button", { name: "Show Text layer" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Unlock Text layer" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Show All" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Unlock All" })).toBeVisible();
  });
  it("disables bulk layer actions when the current page has no overlays", () => {
    render(
      <EditorPage
        editor={createEditor()}
        snapshot={baseSnapshot()}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    expect(screen.getByRole("button", { name: "Hide All" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Lock All" })).toBeDisabled();
  });
  it("keeps inspector tabs, properties, and layers in stable sibling regions", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    const text = selectedElementForType("text");
    const date = selectedElementForType("date");
    const checkmark = selectedElementForType("checkmark");
    const { rerender } = render(
      <EditorPage
        editor={editor}
        snapshot={baseSnapshot({
          selectedElementId: text.id,
          selectedElement: { ...text, text: "A deliberately long text value\n".repeat(80) },
          elements: [text, checkmark],
          visibleElements: [text, checkmark],
        })}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    const tabsRegion = screen.getByTestId("inspector-tabs-region");
    const propertiesRegion = screen.getByTestId("inspector-properties-region");
    const layersRegion = screen.getByTestId("inspector-layers-region");
    const propertiesScroll = propertiesRegion.querySelector(
      ".element-inspector__properties-scroll",
    );

    expect(tabsRegion).toContainElement(
      screen.getByRole("tablist", { name: "Text inspector sections" }),
    );
    for (const tabName of ["Text", "Style", "Page"]) {
      expect(screen.getByRole("tab", { name: tabName })).toBeInTheDocument();
    }
    expect(propertiesScroll).toContainElement(screen.getByLabelText("Text content"));
    expect(propertiesRegion).toContainElement(screen.getByRole("button", { name: "Duplicate" }));
    expect(layersRegion).toContainElement(screen.getByLabelText("Layers"));
    expect(propertiesRegion.compareDocumentPosition(layersRegion)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    await user.click(screen.getByRole("tab", { name: "Style" }));
    expect(propertiesScroll).toContainElement(screen.getByLabelText("Text font"));
    expect(screen.getByTestId("inspector-layers-region")).toBe(layersRegion);

    await user.click(screen.getByRole("tab", { name: "Page" }));
    expect(propertiesScroll).toHaveTextContent("This text belongs to page 1.");
    expect(screen.getByTestId("inspector-layers-region")).toBe(layersRegion);

    rerender(
      <EditorPage
        editor={editor}
        snapshot={baseSnapshot({
          selectedElementId: date.id,
          selectedElement: date,
          elements: [text, date, checkmark],
          visibleElements: [text, date, checkmark],
        })}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    expect(screen.getByTestId("inspector-tabs-region")).toContainElement(
      screen.getByRole("tablist", { name: "Text inspector sections" }),
    );
    for (const tabName of ["Text", "Style", "Page"]) {
      expect(screen.getByRole("tab", { name: tabName })).toBeInTheDocument();
    }

    rerender(
      <EditorPage
        editor={editor}
        snapshot={baseSnapshot({
          selectedElementId: checkmark.id,
          selectedElement: checkmark,
          elements: [text, checkmark],
          visibleElements: [text, checkmark],
        })}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    expect(screen.getByTestId("inspector-tabs-region")).toContainElement(
      screen.getByRole("tablist", { name: "Image inspector sections" }),
    );
    expect(screen.getByTestId("inspector-layers-region")).toBe(layersRegion);
  });
  it("shows a text-only font-size control and updates text appearance through the editor use case", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    render(
      <EditorPage
        editor={editor}
        snapshot={selectedSnapshot("text")}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );
    await user.click(screen.getByRole("tab", { name: "Style" }));
    const fontSize = screen.getByLabelText("Text font size");
    expect(fontSize).toHaveValue("16");
    fireEvent.change(fontSize, { target: { value: "24" } });
    expect(editor.updateTextFontSize).toHaveBeenCalledWith("text-1", 24);
  });

  it("offers Patrick Hand and applies it to the selected text overlay", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    const original = selectedElementForType("text");
    if (original.type !== "text") throw new Error("Expected text fixture.");
    const updated: ExportElement = {
      ...original,
      textAppearance: {
        fontSize: original.textAppearance?.fontSize ?? 16,
        color: original.textAppearance?.color ?? "#000000",
        fontFamily: "Patrick Hand",
      },
    };
    editor.updateTextAppearance.mockReturnValue(
      baseSnapshot({
        selectedElementId: updated.id,
        selectedElement: updated,
        elements: [updated],
        visibleElements: [updated],
        isDirty: true,
      }),
    );
    renderStatefulEditor(editor, selectedSnapshot("text"));

    await user.click(screen.getByRole("tab", { name: "Style" }));
    const font = screen.getByLabelText("Text font");
    expect(within(font).getByRole("option", { name: "Patrick Hand" })).toBeInTheDocument();
    await user.selectOptions(font, "Patrick Hand");

    expect(editor.updateTextAppearance).toHaveBeenCalledWith("text-1", {
      fontFamily: "Patrick Hand",
    });
    expect(screen.getByLabelText("Text element content")).toHaveStyle({
      fontFamily: "Patrick Hand",
    });
  });
  it.each(["whiteout", "signature", "initials", "image"] as const)(
    "hides the font-size control for selected %s overlays",
    (type) => {
      render(
        <EditorPage
          editor={createEditor()}
          snapshot={selectedSnapshot(type)}
          onSnapshotChange={vi.fn()}
          pdfRenderer={createRenderer()}
        />,
      );

      expect(screen.queryByLabelText("Text font size")).toBeNull();
    },
  );

  it("ignores empty or non-finite font-size input safely", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    render(
      <EditorPage
        editor={editor}
        snapshot={selectedSnapshot("text")}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );
    await user.click(screen.getByRole("tab", { name: "Style" }));
    const fontSize = screen.getByLabelText("Text font size");
    fireEvent.change(fontSize, { target: { value: "" } });
    fireEvent.change(fontSize, { target: { value: "not-a-number" } });
    expect(editor.updateTextFontSize).not.toHaveBeenCalled();
  });

  it("renders normal overlays without document-like borders while keeping selected outlines", () => {
    render(
      <EditorPage
        editor={createEditor()}
        snapshot={selectedSnapshot("whiteout")}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    const whiteout = screen.getByRole("group", { name: "whiteout element" });
    expect(whiteout).toHaveClass("is-selected");
    expect(whiteout).not.toHaveStyle({ border: "1px solid #245e47" });
  });

  it("keeps Whiteout active after creating a whiteout", () => {
    const editor = createEditor();
    editor.addWhiteout.mockReturnValue(baseSnapshot({ tool: "whiteout", isDirty: true }));
    render(
      <EditorPage
        editor={editor}
        snapshot={baseSnapshot({ tool: "whiteout" })}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );
    const overlay = screen.getByLabelText("PDF overlay");
    Object.defineProperty(overlay, "setPointerCapture", { value: vi.fn() });
    Object.defineProperty(overlay, "hasPointerCapture", { value: vi.fn(() => false) });
    Object.defineProperty(overlay, "releasePointerCapture", { value: vi.fn() });
    Object.defineProperty(overlay, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 300, height: 400, right: 300, bottom: 400 }),
    });

    dispatchPointerEvent(overlay, "pointerdown", { clientX: 40, clientY: 50, pointerId: 12 });
    dispatchPointerEvent(overlay, "pointermove", { clientX: 100, clientY: 110, pointerId: 12 });
    dispatchPointerEvent(overlay, "pointerup", { clientX: 100, clientY: 110, pointerId: 12 });

    expect(editor.addWhiteout).toHaveBeenCalled();
    expect(editor.setTool).not.toHaveBeenCalledWith("select");
  });
  it("draws whiteout by pointer drag with a live preview and pointer capture", () => {
    const editor = createEditor();
    render(
      <EditorPage
        editor={editor}
        snapshot={baseSnapshot({ tool: "whiteout" })}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );
    const overlay = screen.getByLabelText("PDF overlay");
    const workspace = screen.getByRole("main", { name: "PDF workspace" });
    Object.defineProperties(workspace, {
      scrollLeft: { configurable: true, value: 120, writable: true },
      scrollTop: { configurable: true, value: 80, writable: true },
    });
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    Object.defineProperty(overlay, "setPointerCapture", { value: setPointerCapture });
    Object.defineProperty(overlay, "hasPointerCapture", { value: vi.fn(() => true) });
    Object.defineProperty(overlay, "releasePointerCapture", { value: releasePointerCapture });
    Object.defineProperty(overlay, "getBoundingClientRect", {
      value: () => ({ left: 10, top: 20, width: 300, height: 400, right: 310, bottom: 420 }),
    });

    dispatchPointerEvent(overlay, "pointerdown", { clientX: 50, clientY: 70, pointerId: 7 });
    expect(setPointerCapture).toHaveBeenCalledWith(7);
    dispatchPointerEvent(overlay, "pointermove", { clientX: 170, clientY: 130, pointerId: 7 });
    expect(screen.getByLabelText("Whiteout preview")).toBeVisible();
    dispatchPointerEvent(overlay, "pointerup", { clientX: 170, clientY: 130, pointerId: 7 });

    expect(releasePointerCapture).toHaveBeenCalledWith(7);
    expect(editor.addWhiteout).toHaveBeenCalledWith({ x: 40, y: 50, width: 120, height: 60 });
    expect(workspace.scrollLeft).toBe(120);
    expect(workspace.scrollTop).toBe(80);
  });

  it("lets compact Whiteout own PDF-page drags without panning the workspace", () => {
    const mediaQuery = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => mediaQuery),
    );
    const editor = createEditor();
    editor.addWhiteout.mockReturnValue(baseSnapshot({ tool: "whiteout", isDirty: true }));
    render(
      <EditorPage
        editor={editor}
        snapshot={baseSnapshot({ tool: "whiteout" })}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );
    const overlay = screen.getByLabelText("PDF overlay");
    const workspace = screen.getByRole("main", { name: "PDF workspace" });
    Object.defineProperties(workspace, {
      scrollLeft: { configurable: true, value: 120, writable: true },
      scrollTop: { configurable: true, value: 80, writable: true },
    });
    Object.defineProperty(overlay, "setPointerCapture", { value: vi.fn() });
    Object.defineProperty(overlay, "hasPointerCapture", { value: vi.fn(() => true) });
    Object.defineProperty(overlay, "releasePointerCapture", { value: vi.fn() });
    Object.defineProperty(overlay, "getBoundingClientRect", {
      value: () => ({ left: 10, top: 20, width: 300, height: 400, right: 310, bottom: 420 }),
    });

    dispatchPointerEvent(overlay, "pointerdown", { clientX: 50, clientY: 70, pointerId: 17 });
    dispatchPointerEvent(overlay, "pointermove", { clientX: 170, clientY: 130, pointerId: 17 });
    expect(screen.getByLabelText("Whiteout preview")).toBeVisible();
    dispatchPointerEvent(overlay, "pointerup", { clientX: 170, clientY: 130, pointerId: 17 });

    expect(editor.addWhiteout).toHaveBeenCalledWith({ x: 40, y: 50, width: 120, height: 60 });
    expect(editor.setTool).not.toHaveBeenCalledWith("select");
    expect(workspace.scrollLeft).toBe(120);
    expect(workspace.scrollTop).toBe(80);
    vi.unstubAllGlobals();
  });

  it("normalizes up-left whiteout drags and ignores tiny accidental drags", () => {
    const editor = createEditor();
    render(
      <EditorPage
        editor={editor}
        snapshot={baseSnapshot({ tool: "whiteout" })}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );
    const overlay = screen.getByLabelText("PDF overlay");
    Object.defineProperty(overlay, "setPointerCapture", { value: vi.fn() });
    Object.defineProperty(overlay, "hasPointerCapture", { value: vi.fn(() => false) });
    Object.defineProperty(overlay, "releasePointerCapture", { value: vi.fn() });
    Object.defineProperty(overlay, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 300, height: 400, right: 300, bottom: 400 }),
    });

    dispatchPointerEvent(overlay, "pointerdown", { clientX: 180, clientY: 150, pointerId: 1 });
    dispatchPointerEvent(overlay, "pointermove", { clientX: 120, clientY: 90, pointerId: 1 });
    dispatchPointerEvent(overlay, "pointerup", { clientX: 120, clientY: 90, pointerId: 1 });
    expect(editor.addWhiteout).toHaveBeenCalledWith({ x: 120, y: 90, width: 60, height: 60 });

    editor.addWhiteout.mockClear();
    dispatchPointerEvent(overlay, "pointerdown", { clientX: 20, clientY: 20, pointerId: 2 });
    dispatchPointerEvent(overlay, "pointermove", { clientX: 22, clientY: 22, pointerId: 2 });
    dispatchPointerEvent(overlay, "pointerup", { clientX: 22, clientY: 22, pointerId: 2 });
    expect(editor.addWhiteout).not.toHaveBeenCalled();
  });

  it("cancels in-progress whiteout drag with Escape", () => {
    const editor = createEditor();
    render(
      <EditorPage
        editor={editor}
        snapshot={baseSnapshot({ tool: "whiteout" })}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );
    const overlay = screen.getByLabelText("PDF overlay");
    Object.defineProperty(overlay, "setPointerCapture", { value: vi.fn() });
    Object.defineProperty(overlay, "hasPointerCapture", { value: vi.fn(() => false) });
    Object.defineProperty(overlay, "releasePointerCapture", { value: vi.fn() });
    Object.defineProperty(overlay, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 300, height: 400, right: 300, bottom: 400 }),
    });

    dispatchPointerEvent(overlay, "pointerdown", { clientX: 30, clientY: 40, pointerId: 3 });
    dispatchPointerEvent(overlay, "pointermove", { clientX: 130, clientY: 140, pointerId: 3 });
    const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" });
    act(() => {
      window.dispatchEvent(event);
    });
    dispatchPointerEvent(overlay, "pointerup", { clientX: 130, clientY: 140, pointerId: 3 });

    expect(event.defaultPrevented).toBe(true);
    expect(editor.addWhiteout).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Whiteout preview")).toBeNull();
  });

  it("rejects unsupported image uploads without entering placement mode", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const editor = createEditor();
    render(
      <EditorPage
        editor={editor}
        snapshot={baseSnapshot()}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    await user.upload(
      screen.getByLabelText("Choose image"),
      new File(["webp"], "stamp.webp", { type: "image/webp" }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Use a PNG, JPG, or JPEG image.");
    expect(editor.setTool).not.toHaveBeenCalledWith("image");
    expect((editor.addImage as Mock).mock.calls).toEqual([]);
  });

  it("loads a PNG locally, enters image placement mode, and places it on the clicked PDF page", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const editor = createEditor();
    const OriginalImage = window.Image;
    class TestImage extends EventTarget {
      public naturalWidth = 80;
      public naturalHeight = 40;
      public set src(_value: string) {
        this.dispatchEvent(new Event("load"));
      }
    }
    Object.defineProperty(window, "Image", { configurable: true, value: TestImage });
    const { rerender } = render(
      <EditorPage
        editor={editor}
        snapshot={baseSnapshot()}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    const imageInput = screen.getByLabelText("Choose image");
    const pngFile = new File(["png"], "logo.png", { type: "image/png" });
    await user.upload(imageInput, pngFile);
    await waitFor(() => {
      expect(editor.setTool).toHaveBeenCalledWith("image");
    });
    expect(imageInput).toHaveValue("");
    await user.upload(imageInput, pngFile);
    await waitFor(() => {
      expect(editor.setTool).toHaveBeenCalledTimes(2);
    });
    rerender(
      <EditorPage
        editor={editor}
        snapshot={baseSnapshot({ tool: "image" })}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );
    const overlay = screen.getByLabelText("PDF overlay");
    Object.defineProperty(overlay, "getBoundingClientRect", {
      value: () => ({ left: 10, top: 20, width: 300, height: 400, right: 310, bottom: 420 }),
    });

    fireEvent.click(overlay, { clientX: 110, clientY: 140 });

    expect((editor.addImage as Mock).mock.calls[0]).toEqual([
      { x: 100, y: 120 },
      expect.objectContaining({ mimeType: "image/png", width: 80, height: 40 }),
    ]);
    expect(editor.setTool).toHaveBeenLastCalledWith("select");
    Object.defineProperty(window, "Image", { configurable: true, value: OriginalImage });
  });

  it("renders selected image overlays with shared inspector actions", () => {
    const editor = createEditor();
    render(
      <EditorPage
        editor={editor}
        snapshot={selectedSnapshot("image")}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    expect(screen.getByRole("group", { name: "image element" })).toBeVisible();
    expect(
      screen.getByRole("complementary", { name: "Selected element actions" }),
    ).toHaveTextContent("Image");
    expect(screen.getByRole("button", { name: "Duplicate" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Delete" })).toBeVisible();
    expect(screen.getByLabelText("Resize image element")).toBeVisible();
  });

  it("uses one geometry for selected image bounds, rendered img, and hit area", () => {
    const editor = createEditor();
    render(
      <EditorPage
        editor={editor}
        snapshot={selectedSnapshot("image")}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    const imageOverlay = screen.getByRole("group", { name: "image element" });
    const image = imageOverlay.querySelector("img");

    expect(imageOverlay).toHaveStyle({ left: "40px", top: "50px", width: "120px", height: "48px" });
    expect(image).toHaveStyle({
      width: "100%",
      height: "100%",
      objectFit: "fill",
      display: "block",
    });
    expect(screen.getByLabelText("Resize image element")).toBeVisible();
  });

  it("moves image overlays through preview, one commit, undo, and redo without removing the image", async () => {
    const editor = createEditor();
    const initialElement = selectedElementForType("image");
    const movedElement: ExportElement = {
      ...initialElement,
      bounds: { x: 64, y: 68, width: 120, height: 48 },
    };
    editor.selectElement.mockImplementation(() =>
      baseSnapshot({
        selectedElementId: initialElement.id,
        selectedElement: initialElement,
        visibleElements: [initialElement],
      }),
    );
    editor.previewMoveElement.mockImplementation(() =>
      baseSnapshot({
        selectedElementId: movedElement.id,
        selectedElement: movedElement,
        visibleElements: [movedElement],
      }),
    );
    editor.commitMoveElement.mockImplementation(() => ({
      ...baseSnapshot({
        selectedElementId: movedElement.id,
        selectedElement: movedElement,
        visibleElements: [movedElement],
      }),
      canUndo: true,
    }));
    editor.undo.mockImplementation(() => ({
      ...baseSnapshot({
        selectedElementId: initialElement.id,
        selectedElement: initialElement,
        visibleElements: [initialElement],
      }),
      canRedo: true,
    }));
    editor.redo.mockImplementation(() =>
      baseSnapshot({
        selectedElementId: movedElement.id,
        selectedElement: movedElement,
        visibleElements: [movedElement],
      }),
    );
    renderStatefulEditor(editor, selectedSnapshot("image"));
    const overlay = screen.getByLabelText("PDF overlay");
    Object.defineProperty(overlay, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 300, height: 400, right: 300, bottom: 400 }),
    });

    dispatchPointerEvent(screen.getByRole("group", { name: "image element" }), "pointerdown", {
      clientX: 52,
      clientY: 62,
      pointerId: 31,
    });
    const imageElement = screen.getByRole("group", { name: "image element" });
    dispatchPointerEvent(imageElement, "pointermove", { clientX: 76, clientY: 80, pointerId: 31 });
    dispatchPointerEvent(imageElement, "pointerup", { clientX: 76, clientY: 80, pointerId: 31 });

    expect(editor.commitMoveElement).toHaveBeenCalledTimes(1);
    expect(editor.commitMoveElement).toHaveBeenCalledWith(
      "image-1",
      { x: 40, y: 50, width: 120, height: 48 },
      { x: 64, y: 68, width: 120, height: 48 },
    );
    expect(screen.getByRole("group", { name: "image element" })).toHaveStyle({
      left: "64px",
      top: "68px",
    });

    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByRole("group", { name: "image element" })).toHaveStyle({
      left: "40px",
      top: "50px",
    });
    await userEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(screen.getByRole("group", { name: "image element" })).toHaveStyle({
      left: "64px",
      top: "68px",
    });
  });
  it("keeps the image node and src stable while batching resize previews to one frame", () => {
    const raf = installControlledRaf();
    const editor = createEditor();
    const renderer = createRenderer();
    try {
      render(
        <EditorPage
          editor={editor}
          snapshot={selectedSnapshot("image")}
          onSnapshotChange={vi.fn()}
          pdfRenderer={renderer}
        />,
      );
      const overlay = screen.getByLabelText("PDF overlay");
      Object.defineProperty(overlay, "getBoundingClientRect", {
        value: () => ({ left: 0, top: 0, width: 300, height: 400, right: 300, bottom: 400 }),
      });
      const imageOverlay = screen.getByRole("group", { name: "image element" });
      const image = imageOverlay.querySelector("img");
      expect(image).toBeInstanceOf(HTMLImageElement);
      const startingSrc = image?.getAttribute("src");

      dispatchPointerEvent(screen.getByLabelText("Resize image element"), "pointerdown", {
        clientX: 160,
        clientY: 98,
        pointerId: 21,
      });
      dispatchPointerEvent(window, "pointermove", { clientX: 180, clientY: 106, pointerId: 21 });
      dispatchPointerEvent(window, "pointermove", { clientX: 200, clientY: 114, pointerId: 21 });
      dispatchPointerEvent(window, "pointermove", { clientX: 220, clientY: 122, pointerId: 21 });

      expect(raf.requestSpy).toHaveBeenCalledTimes(1);
      expect(raf.pendingCount()).toBe(1);
      expect(editor.previewResizeElement).not.toHaveBeenCalled();
      expect(imageOverlay).toHaveStyle({ width: "120px", height: "48px" });

      raf.flushLatest();

      const updatedOverlay = screen.getByRole("group", { name: "image element" });
      const updatedImage = updatedOverlay.querySelector("img");
      expect(updatedImage).toBe(image);
      expect(updatedImage?.getAttribute("src")).toBe(startingSrc);
      expect(updatedOverlay).toHaveStyle({ width: "180px", height: "72px" });
      expect(updatedOverlay).toHaveClass("is-resizing");
      expect(updatedImage).toHaveStyle({ width: "100%", height: "100%" });
      expect(renderer.startRenderPage).toHaveBeenCalledTimes(1);
    } finally {
      raf.restore();
    }
  });

  it.each(["checkmark", "cross"] as const)(
    "keeps the %s vector node stable while batching resize previews to one frame",
    (type) => {
      const raf = installControlledRaf();
      const editor = createEditor();
      const renderer = createRenderer();
      try {
        render(
          <EditorPage
            editor={editor}
            snapshot={selectedSnapshot(type)}
            onSnapshotChange={vi.fn()}
            pdfRenderer={renderer}
          />,
        );
        const overlay = screen.getByLabelText("PDF overlay");
        Object.defineProperty(overlay, "getBoundingClientRect", {
          value: () => ({ left: 0, top: 0, width: 300, height: 400, right: 300, bottom: 400 }),
        });
        const annotationOverlay = screen.getByRole("group", { name: `${type} element` });
        const symbol = annotationOverlay.querySelector("svg");
        expect(symbol).toBeInstanceOf(SVGSVGElement);

        dispatchPointerEvent(screen.getByLabelText(`Resize ${type} element`), "pointerdown", {
          clientX: 160,
          clientY: 98,
          pointerId: 31,
        });
        dispatchPointerEvent(window, "pointermove", { clientX: 180, clientY: 106, pointerId: 31 });
        dispatchPointerEvent(window, "pointermove", { clientX: 200, clientY: 114, pointerId: 31 });
        dispatchPointerEvent(window, "pointermove", { clientX: 220, clientY: 122, pointerId: 31 });

        expect(raf.requestSpy).toHaveBeenCalledTimes(1);
        expect(raf.pendingCount()).toBe(1);
        expect(editor.previewResizeElement).not.toHaveBeenCalled();
        expect(annotationOverlay).toHaveStyle({ width: "120px", height: "48px" });

        raf.flushLatest();

        const updatedOverlay = screen.getByRole("group", { name: `${type} element` });
        const updatedSymbol = updatedOverlay.querySelector("svg");
        expect(updatedSymbol).toBe(symbol);
        expect(updatedOverlay).toHaveStyle({ width: "180px", height: "72px" });
        expect(updatedOverlay).toHaveClass("is-resizing");
        expect(updatedSymbol).toHaveClass(`annotation-${type}`);
        expect(renderer.startRenderPage).toHaveBeenCalledTimes(1);
      } finally {
        raf.restore();
      }
    },
  );

  it("scales date font size during resize preview and commits text-like geometry history", async () => {
    const raf = installControlledRaf();
    const editor = createEditor();
    const resizedElement: ExportElement = {
      ...selectedElementForType("date"),
      bounds: { x: 40, y: 50, width: 240, height: 96 },
      textAppearance: { fontSize: 32, color: "#111111" },
    };
    editor.selectElement.mockImplementation(() => selectedSnapshot("date"));
    editor.commitTextResizeElement.mockImplementation(() =>
      baseSnapshot({
        selectedElementId: resizedElement.id,
        selectedElement: resizedElement,
        visibleElements: [resizedElement],
        isDirty: true,
      }),
    );
    try {
      renderStatefulEditor(editor, selectedSnapshot("date"));
      const overlay = screen.getByLabelText("PDF overlay");
      Object.defineProperty(overlay, "getBoundingClientRect", {
        value: () => ({ left: 0, top: 0, width: 300, height: 400, right: 300, bottom: 400 }),
      });
      const dateOverlay = screen.getByRole("group", { name: "date element" });
      const dateText = screen.getByLabelText("Text element content");
      expect(dateText).toHaveStyle({ fontSize: "16px" });

      dispatchPointerEvent(screen.getByLabelText("Resize date element"), "pointerdown", {
        clientX: 160,
        clientY: 98,
        pointerId: 32,
      });
      dispatchPointerEvent(window, "pointermove", { clientX: 280, clientY: 122, pointerId: 32 });

      expect(raf.requestSpy).toHaveBeenCalledTimes(1);
      expect(editor.previewTextResizeElement).not.toHaveBeenCalled();
      expect(dateOverlay).toHaveStyle({ width: "120px", height: "48px" });
      act(() => {
        raf.flushLatest();
      });
      await waitFor(() => {
        expect(dateOverlay).toHaveStyle({ width: "240px", height: "96px" });
        expect(dateText).toHaveStyle({ fontSize: "32px" });
      });

      dispatchPointerEvent(window, "pointerup", { clientX: 280, clientY: 122, pointerId: 32 });

      expect(editor.commitTextResizeElement).toHaveBeenCalledTimes(1);
      expect(editor.commitTextResizeElement).toHaveBeenCalledWith(
        "date-1",
        { bounds: { x: 40, y: 50, width: 120, height: 48 }, fontSize: 16 },
        { bounds: { x: 40, y: 50, width: 240, height: 96 }, fontSize: 32 },
      );
      expect(screen.getByRole("group", { name: "date element" })).toHaveStyle({
        width: "240px",
        height: "96px",
      });
      expect(screen.getByLabelText("Text element content")).toHaveStyle({ fontSize: "32px" });
    } finally {
      raf.restore();
    }
  });
  it("commits the latest image resize geometry even when the pending frame has not painted", () => {
    const raf = installControlledRaf();
    const editor = createEditor();
    const resizedElement: ExportElement = {
      ...selectedElementForType("image"),
      bounds: { x: 40, y: 50, width: 180, height: 72 },
    };
    editor.commitResizeElement.mockImplementation(() =>
      baseSnapshot({
        selectedElementId: resizedElement.id,
        selectedElement: resizedElement,
        visibleElements: [resizedElement],
        isDirty: true,
      }),
    );
    try {
      renderStatefulEditor(editor, selectedSnapshot("image"));
      const overlay = screen.getByLabelText("PDF overlay");
      Object.defineProperty(overlay, "getBoundingClientRect", {
        value: () => ({ left: 0, top: 0, width: 300, height: 400, right: 300, bottom: 400 }),
      });

      dispatchPointerEvent(screen.getByLabelText("Resize image element"), "pointerdown", {
        clientX: 160,
        clientY: 98,
        pointerId: 21,
      });
      dispatchPointerEvent(window, "pointermove", { clientX: 200, clientY: 114, pointerId: 21 });
      dispatchPointerEvent(window, "pointermove", { clientX: 220, clientY: 122, pointerId: 21 });
      dispatchPointerEvent(window, "pointerup", { clientX: 220, clientY: 122, pointerId: 21 });

      expect(raf.cancelSpy).toHaveBeenCalled();
      expect(editor.previewResizeElement).not.toHaveBeenCalled();
      expect(editor.commitResizeElement).toHaveBeenCalledTimes(1);
      expect(editor.commitResizeElement).toHaveBeenCalledWith(
        "image-1",
        { x: 40, y: 50, width: 120, height: 48 },
        { x: 40, y: 50, width: 180, height: 72 },
      );
      expect(screen.getByRole("group", { name: "image element" })).toHaveStyle({
        width: "180px",
        height: "72px",
      });
    } finally {
      raf.restore();
    }
  });

  it("cancels image resize by restoring original dimensions without history", () => {
    const raf = installControlledRaf();
    const editor = createEditor();
    try {
      render(
        <EditorPage
          editor={editor}
          snapshot={selectedSnapshot("image")}
          onSnapshotChange={vi.fn()}
          pdfRenderer={createRenderer()}
        />,
      );
      const overlay = screen.getByLabelText("PDF overlay");
      Object.defineProperty(overlay, "getBoundingClientRect", {
        value: () => ({ left: 0, top: 0, width: 300, height: 400, right: 300, bottom: 400 }),
      });

      dispatchPointerEvent(screen.getByLabelText("Resize image element"), "pointerdown", {
        clientX: 160,
        clientY: 98,
        pointerId: 22,
      });
      dispatchPointerEvent(window, "pointermove", { clientX: 220, clientY: 122, pointerId: 22 });
      raf.flushLatest();
      expect(screen.getByRole("group", { name: "image element" })).toHaveStyle({
        width: "180px",
        height: "72px",
      });

      dispatchPointerEvent(window, "pointercancel", { clientX: 220, clientY: 122, pointerId: 22 });

      expect(screen.getByRole("group", { name: "image element" })).toHaveStyle({
        width: "120px",
        height: "48px",
      });
      expect(editor.previewResizeElement).not.toHaveBeenCalled();
      expect(editor.commitResizeElement).not.toHaveBeenCalled();
    } finally {
      raf.restore();
    }
  });

  it("cancels pending image resize frames on Escape", () => {
    const raf = installControlledRaf();
    const editor = createEditor();
    try {
      render(
        <EditorPage
          editor={editor}
          snapshot={selectedSnapshot("image")}
          onSnapshotChange={vi.fn()}
          pdfRenderer={createRenderer()}
        />,
      );
      const overlay = screen.getByLabelText("PDF overlay");
      Object.defineProperty(overlay, "getBoundingClientRect", {
        value: () => ({ left: 0, top: 0, width: 300, height: 400, right: 300, bottom: 400 }),
      });

      dispatchPointerEvent(screen.getByLabelText("Resize image element"), "pointerdown", {
        clientX: 160,
        clientY: 98,
        pointerId: 23,
      });
      dispatchPointerEvent(window, "pointermove", { clientX: 220, clientY: 122, pointerId: 23 });
      act(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });

      expect(raf.cancelSpy).toHaveBeenCalled();
      expect(raf.pendingCount()).toBe(0);
      expect(screen.getByRole("group", { name: "image element" })).toHaveStyle({
        width: "120px",
        height: "48px",
      });
      expect(editor.previewResizeElement).not.toHaveBeenCalled();
      expect(editor.commitResizeElement).not.toHaveBeenCalled();
    } finally {
      raf.restore();
    }
  });

  it("cancels pending image resize frames on unmount and document close", () => {
    const raf = installControlledRaf();
    const editor = createEditor();
    try {
      const view = render(
        <EditorPage
          editor={editor}
          snapshot={selectedSnapshot("image")}
          onSnapshotChange={vi.fn()}
          pdfRenderer={createRenderer()}
        />,
      );
      const overlay = screen.getByLabelText("PDF overlay");
      Object.defineProperty(overlay, "getBoundingClientRect", {
        value: () => ({ left: 0, top: 0, width: 300, height: 400, right: 300, bottom: 400 }),
      });

      dispatchPointerEvent(screen.getByLabelText("Resize image element"), "pointerdown", {
        clientX: 160,
        clientY: 98,
        pointerId: 24,
      });
      dispatchPointerEvent(window, "pointermove", { clientX: 220, clientY: 122, pointerId: 24 });
      const openSnapshot = baseSnapshot();
      const { currentPage, selectedElement, selectedElementId, ...closedState } =
        openSnapshot.state;
      void currentPage;
      void selectedElement;
      void selectedElementId;
      view.rerender(
        <EditorPage
          editor={editor}
          snapshot={{
            ...openSnapshot,
            state: { ...closedState, elements: [], visibleElements: [] },
          }}
          onSnapshotChange={vi.fn()}
          pdfRenderer={createRenderer()}
        />,
      );

      expect(raf.cancelSpy).toHaveBeenCalled();
      expect(raf.pendingCount()).toBe(0);

      dispatchPointerEvent(window, "pointermove", { clientX: 230, clientY: 126, pointerId: 24 });
      view.unmount();

      expect(raf.pendingCount()).toBe(0);
      expect(editor.commitResizeElement).not.toHaveBeenCalled();
    } finally {
      raf.restore();
    }
  });

  it("places checkmark, cross, and date annotations as one-shot tools", async () => {
    const editor = createEditor();
    let latestSnapshot = baseSnapshot();
    const rememberSnapshot = (nextSnapshot: EditorSnapshot): EditorSnapshot => {
      latestSnapshot = nextSnapshot;
      return nextSnapshot;
    };
    editor.addCheckmark.mockImplementation(() => {
      const element: ExportElement = {
        id: "checkmark-1",
        pageId: "page-1",
        type: "checkmark",
        bounds: { x: 86, y: 106, width: 28, height: 28 },
      };
      return rememberSnapshot(
        baseSnapshot({
          selectedElementId: element.id,
          selectedElement: element,
          visibleElements: [element],
          isDirty: true,
        }),
      );
    });
    editor.addCross.mockImplementation(() => {
      const element: ExportElement = {
        id: "cross-1",
        pageId: "page-1",
        type: "cross",
        bounds: { x: 96, y: 116, width: 28, height: 28 },
      };
      return rememberSnapshot(
        baseSnapshot({
          selectedElementId: element.id,
          selectedElement: element,
          visibleElements: [element],
          isDirty: true,
        }),
      );
    });
    editor.addDate.mockImplementation(() => {
      const element: ExportElement = {
        id: "date-1",
        pageId: "page-1",
        type: "date",
        bounds: { x: 120, y: 140, width: 96, height: 28 },
        text: "07/31/2026",
        textAppearance: { fontSize: 16, color: "#111111" },
      };
      return rememberSnapshot(
        baseSnapshot({
          selectedElementId: element.id,
          selectedElement: element,
          visibleElements: [element],
          isDirty: true,
        }),
      );
    });
    editor.setTool.mockImplementation((tool: EditorTool) => {
      latestSnapshot = { ...latestSnapshot, state: { ...latestSnapshot.state, tool } };
      return latestSnapshot;
    });
    const { onSnapshotChange } = renderStatefulEditor(editor, latestSnapshot);
    const overlay = screen.getByLabelText("PDF overlay");
    Object.defineProperty(overlay, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 300, height: 400, right: 300, bottom: 400 }),
    });

    await userEvent.click(screen.getByRole("button", { name: "Checkmark" }));
    expect(editor.setTool).toHaveBeenCalledWith("checkmark");
    expect(screen.getByRole("button", { name: /Checkmark/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    act(() => {
      onSnapshotChange(baseSnapshot({ tool: "checkmark" }));
    });
    fireEvent.click(screen.getByLabelText("PDF overlay"), { clientX: 100, clientY: 120 });
    expect(editor.addCheckmark).toHaveBeenCalledWith({ x: 100, y: 120 });
    expect(editor.setTool).toHaveBeenLastCalledWith("select");
    expect(screen.getByRole("group", { name: "checkmark element" })).toBeVisible();
    expect(
      screen.getByRole("group", { name: "checkmark element" }).querySelector("svg"),
    ).not.toBeNull();

    act(() => {
      onSnapshotChange(baseSnapshot());
    });
    await userEvent.click(screen.getByRole("button", { name: "Cross" }));
    act(() => {
      onSnapshotChange(baseSnapshot({ tool: "cross" }));
    });
    fireEvent.click(screen.getByLabelText("PDF overlay"), { clientX: 110, clientY: 130 });
    expect(editor.addCross).toHaveBeenCalledWith({ x: 110, y: 130 });
    expect(screen.getByRole("group", { name: "cross element" })).toBeVisible();

    act(() => {
      onSnapshotChange(baseSnapshot());
    });
    await userEvent.click(screen.getByRole("button", { name: "Date" }));
    act(() => {
      onSnapshotChange(baseSnapshot({ tool: "date" }));
    });
    fireEvent.click(screen.getByLabelText("PDF overlay"), { clientX: 120, clientY: 140 });
    expect(editor.addDate).toHaveBeenCalledWith({ x: 120, y: 140 });
    expect(screen.getByRole("group", { name: "date element" })).toHaveTextContent("07/31/2026");

    fireEvent.click(screen.getByLabelText("PDF overlay"), { clientX: 150, clientY: 160 });
    expect(editor.addDate).toHaveBeenCalledTimes(1);
  });

  it.each(["checkmark", "cross", "date"] as const)(
    "shows shared controls and supports copy/paste/delete for selected %s annotations",
    (type) => {
      const editor = createEditor();
      let copyCount = 0;
      let pasteCount = 0;
      editor.copySelectedElement.mockImplementation(() => {
        copyCount += 1;
        return selectedSnapshot(type);
      });
      editor.pasteCopiedElement.mockImplementation(() => {
        pasteCount += 1;
        return selectedSnapshot(type);
      });
      render(
        <EditorPage
          editor={editor}
          snapshot={{ ...selectedSnapshot(type), canPaste: true }}
          onSnapshotChange={vi.fn()}
          pdfRenderer={createRenderer()}
        />,
      );

      expect(screen.getByRole("group", { name: `${type} element` })).toBeVisible();
      expect(screen.getByRole("button", { name: "Duplicate" })).toBeVisible();
      expect(screen.getByRole("button", { name: "Delete" })).toBeVisible();
      expect(screen.getByLabelText(`Resize ${type} element`)).toBeVisible();

      act(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "c", ctrlKey: true }));
      });
      expect(copyCount).toBe(1);
      act(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "v", ctrlKey: true }));
      });
      expect(pasteCount).toBe(1);
      act(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete" }));
      });
      expect(editor.deleteElement).toHaveBeenCalledWith(`${type}-1`);
    },
  );
  it("exposes one visible Image button backed by a hidden reusable file input", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const editor = createEditor();
    render(
      <EditorPage
        editor={editor}
        snapshot={baseSnapshot()}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );
    await waitFor(() => {
      expect(screen.queryByText("Rendering PDF page...")).toBeNull();
    });
    const imageButton = screen.getByRole("button", { name: "Image" });
    const imageInput = screen.getByLabelText("Choose image");
    const clickSpy = vi.spyOn(imageInput, "click");

    expect(screen.getAllByRole("button", { name: "Image" })).toHaveLength(1);
    expect(imageInput).not.toBeVisible();
    expect(screen.queryByText(/No file chosen/i)).toBeNull();

    await user.click(imageButton);

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(imageInput).toHaveValue("");
  });
  it("handles copy and paste shortcuts for selected image overlays through the private clipboard", () => {
    const editor = createEditor();
    render(
      <EditorPage
        editor={editor}
        snapshot={{ ...selectedSnapshot("image"), canPaste: true }}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );
    const copy = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: "c",
    });
    const paste = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      metaKey: true,
      key: "v",
    });

    act(() => {
      window.dispatchEvent(copy);
      window.dispatchEvent(paste);
    });

    expect(copy.defaultPrevented).toBe(true);
    expect(paste.defaultPrevented).toBe(true);
    expect(editor.copySelectedElement.mock.calls).toHaveLength(1);
    expect(editor.pasteCopiedElement.mock.calls).toHaveLength(1);
  });
  it.each(["select", "text", "whiteout", "signature", "initials"] as const)(
    "marks the %s tool as active with aria-pressed",
    async (tool) => {
      const user = userEvent.setup();
      const editor = createEditor();
      render(
        <EditorPage
          editor={editor}
          snapshot={baseSnapshot()}
          onSnapshotChange={vi.fn()}
          pdfRenderer={createRenderer()}
        />,
      );

      await user.click(screen.getByRole("button", { name: new RegExp(tool, "i") }));

      expect(editor.setTool).toHaveBeenCalledWith(tool);
    },
  );
  it("shows the document inspector without reserving an empty tabs region", () => {
    const { container } = render(
      <EditorPage
        editor={createEditor()}
        snapshot={baseSnapshot()}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    expect(
      screen.getByRole("complementary", { name: "Selected element actions" }),
    ).toHaveTextContent("visible.pdf");
    const desktopInspector = container.querySelector(".desktop-inspector-content");
    const propertiesRegion = screen.getByTestId("inspector-properties-region");
    expect(screen.queryByTestId("inspector-tabs-region")).not.toBeInTheDocument();
    expect(desktopInspector?.firstElementChild).toBe(propertiesRegion);
    expect(screen.getByText("Select an element to edit its properties.")).toBeVisible();
    expect(screen.getByLabelText("Layers")).toBeInTheDocument();
  });

  it("keeps current-page layers mounted and selectable when no element is selected", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    const text = selectedElementForType("text");
    const checkmark = selectedElementForType("checkmark");
    const { rerender } = render(
      <EditorPage
        editor={editor}
        snapshot={baseSnapshot({
          elements: [text, checkmark],
          visibleElements: [text, checkmark],
        })}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    const layersRegion = screen.getByTestId("inspector-layers-region");
    expect(layersRegion).toContainElement(screen.getByLabelText("Layers"));
    expect(screen.getByRole("button", { name: "Bring to front" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Checkmark layer" }));
    expect(editor.selectElement).toHaveBeenCalledWith("checkmark-1");

    rerender(
      <EditorPage
        editor={editor}
        snapshot={baseSnapshot({
          elements: [text],
          visibleElements: [text],
        })}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    expect(screen.getByTestId("inspector-layers-region")).toBe(layersRegion);
    expect(screen.getByRole("button", { name: "Text layer" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Checkmark layer" })).toBeNull();
  });
  it("renders selected-element actions as a stable workspace sibling beside the PDF viewport", () => {
    const { container } = render(
      <EditorPage
        editor={createEditor()}
        snapshot={selectedSnapshot("text")}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    const workspace = container.querySelector(".editor-workspace-shell");
    const pageRail = container.querySelector(".page-rail");
    const inspector = container.querySelector(".element-inspector");
    const viewport = container.querySelector(".editor-viewport");
    const statusBar = container.querySelector(".editor-status-bar");
    expect(workspace).toBeInstanceOf(HTMLElement);
    expect(pageRail).toBeInstanceOf(HTMLElement);
    expect(inspector).toBeInstanceOf(HTMLElement);
    expect(viewport).toBeInstanceOf(HTMLElement);
    expect(statusBar).toBeInstanceOf(HTMLElement);
    expect(workspace?.contains(pageRail)).toBe(true);
    expect(workspace?.contains(viewport)).toBe(true);
    expect(workspace?.contains(inspector)).toBe(true);
    expect(workspace?.compareDocumentPosition(statusBar as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("prioritizes the current page and bounds large-document thumbnail canvases", async () => {
    const pages = Array.from({ length: 1_001 }, (_, index) => ({
      id: `page-${String(index + 1)}`,
      width: 300,
      height: 400,
      rotation: 0 as const,
    }));
    const currentPageRender = deferred<{
      readonly ok: true;
      readonly cssWidth: number;
      readonly cssHeight: number;
      readonly backingWidth: number;
      readonly backingHeight: number;
    }>();
    const startRenderThumbnail = vi.fn(() => ({
      promise: Promise.resolve({
        ok: true as const,
        cssWidth: 96,
        cssHeight: 128,
        backingWidth: 96,
        backingHeight: 128,
      }),
      cancel: vi.fn(),
    }));
    const renderer = {
      startRenderPage: vi.fn(() => ({ promise: currentPageRender.promise, cancel: vi.fn() })),
      startRenderThumbnail,
      clearCanvas: vi.fn(),
    };
    const { container } = render(
      <EditorPage
        editor={createEditor()}
        snapshot={baseSnapshot({ pages })}
        onSnapshotChange={vi.fn()}
        pdfRenderer={renderer}
      />,
    );

    expect(screen.getAllByRole("button", { name: /page [0-9]+/i })).toHaveLength(20);
    expect(screen.queryByRole("button", { name: "page 1001" })).toBeNull();
    expect(startRenderThumbnail).not.toHaveBeenCalled();
    expect(container.querySelectorAll(".page-thumbnail-canvas")).toHaveLength(0);

    act(() => {
      currentPageRender.resolve({
        ok: true,
        cssWidth: 300,
        cssHeight: 400,
        backingWidth: 300,
        backingHeight: 400,
      });
    });
    await waitFor(() => {
      expect(startRenderThumbnail.mock.calls.length).toBeGreaterThan(0);
    });
    expect(startRenderThumbnail.mock.calls.length).toBeLessThanOrEqual(20);
    expect(container.querySelectorAll(".page-thumbnail-canvas").length).toBeLessThanOrEqual(20);

    const pageRailList = container.querySelector<HTMLElement>(".page-rail-list");
    const firstThumbnail = screen.getByRole("button", { name: "Current page 1" });
    expect(pageRailList).not.toBeNull();
    if (pageRailList === null) {
      return;
    }
    Object.defineProperty(pageRailList, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(firstThumbnail, "offsetHeight", { configurable: true, value: 160 });
    pageRailList.scrollTop = 1_000_000;
    fireEvent.scroll(pageRailList);

    await waitFor(() => {
      expect(startRenderThumbnail).toHaveBeenCalledWith(
        expect.objectContaining({ pageNumber: 1_001 }),
      );
    });
    expect(
      screen.getByRole("button", { name: "page 1001" }).querySelector(".page-thumbnail-canvas"),
    ).not.toBeNull();
    expect(screen.getAllByRole("button", { name: /page [0-9]+/i }).length).toBeLessThanOrEqual(20);
    expect(container.querySelectorAll(".page-thumbnail-canvas").length).toBeLessThanOrEqual(20);
  });

  it("calls startRenderThumbnail with its renderer instance as the receiver", async () => {
    const receivers: unknown[] = [];
    class ThisCheckingRenderer {
      public clearCanvas = vi.fn();
      public startRenderPage = vi.fn(() => ({
        promise: Promise.resolve({
          ok: true as const,
          cssWidth: 300,
          cssHeight: 400,
          backingWidth: 300,
          backingHeight: 400,
        }),
        cancel: vi.fn(),
      }));
      public startRenderThumbnail(): PdfPageRenderHandle {
        receivers.push(this);
        const bound = this instanceof ThisCheckingRenderer;
        return {
          promise: Promise.resolve(
            bound
              ? { ok: true, cssWidth: 96, cssHeight: 128, backingWidth: 96, backingHeight: 128 }
              : {
                  ok: false,
                  cancelled: false,
                  error: { code: "RenderFailed", message: "unbound" },
                },
          ),
          cancel: vi.fn(),
        };
      }
    }
    const pages = Array.from({ length: 3 }, (_, index) => ({
      id: `page-${String(index + 1)}`,
      width: 300,
      height: 400,
      rotation: 0 as const,
    }));
    render(
      <EditorPage
        editor={createEditor()}
        snapshot={baseSnapshot({ pages })}
        onSnapshotChange={vi.fn()}
        pdfRenderer={new ThisCheckingRenderer()}
      />,
    );

    await waitFor(() => {
      expect(receivers.length).toBe(3);
    });
    expect(receivers.every((receiver) => receiver instanceof ThisCheckingRenderer)).toBe(true);
  });

  it("does not delete selected overlays while focus is inside editing controls", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    render(
      <EditorPage
        editor={editor}
        snapshot={selectedSnapshot("text")}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    await user.dblClick(screen.getByLabelText("Text element content"));
    const textArea = screen.getByLabelText("Edit text element");
    await user.click(textArea);
    const textAreaDelete = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Delete",
    });
    act(() => {
      textArea.dispatchEvent(textAreaDelete);
    });
    expect(editor.deleteElement).not.toHaveBeenCalled();

    const widthInput = screen.getByLabelText("Text content");
    await user.click(widthInput);
    const inputDelete = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Delete",
    });
    act(() => {
      widthInput.dispatchEvent(inputDelete);
    });
    expect(editor.deleteElement).not.toHaveBeenCalled();

    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    document.body.append(editable);
    const editableDelete = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Delete",
    });
    act(() => {
      editable.dispatchEvent(editableDelete);
    });
    expect(editor.deleteElement).not.toHaveBeenCalled();
    editable.remove();

    await user.click(screen.getByRole("button", { name: "Signature" }));
    await user.click(screen.getByRole("tab", { name: "Type" }));
    const fontSelect = screen.getByLabelText("Font");
    await user.click(fontSelect);
    const selectDelete = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Delete",
    });
    act(() => {
      fontSelect.dispatchEvent(selectDelete);
    });
    expect(editor.deleteElement).not.toHaveBeenCalled();

    await user.click(screen.getByRole("tab", { name: "Draw" }));
    const signaturePad = screen.getByLabelText("Draw signature");
    signaturePad.focus();
    const padDelete = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Delete",
    });
    act(() => {
      signaturePad.dispatchEvent(padDelete);
    });

    expect(editor.deleteElement).not.toHaveBeenCalled();
  });
  it("opens a signature dialog with draw, type, and upload tabs and accepts typed signatures", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    render(
      <EditorPage
        editor={editor}
        snapshot={baseSnapshot()}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Signature" }));

    expect(screen.getByRole("dialog", { name: "Signature" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Draw" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Type" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Upload" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Type" }));
    await user.clear(screen.getByLabelText("Signature name"));
    await user.type(screen.getByLabelText("Signature name"), "Ada Lovelace");
    await user.selectOptions(screen.getByLabelText("Font"), "serif");
    expect(screen.getByLabelText("Signature preview")).toHaveTextContent("Ada Lovelace");
    await user.click(screen.getByRole("button", { name: "Accept" }));

    expect(editor.addTypedSignature).toHaveBeenCalledWith(
      { x: 56, y: 250 },
      { text: "Ada Lovelace", fontFamily: "serif" },
    );
    expect(editor.setTool).toHaveBeenLastCalledWith("select");
  });

  it("opens initials without an upload tab and accepts typed initials", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    render(
      <EditorPage
        editor={editor}
        snapshot={baseSnapshot()}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Initials" }));

    expect(screen.getByRole("dialog", { name: "Initials" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Upload" })).toBeNull();
    await user.click(screen.getByRole("tab", { name: "Type" }));
    await user.clear(screen.getByLabelText("Initials text"));
    await user.type(screen.getByLabelText("Initials text"), "AL");
    await user.click(screen.getByRole("button", { name: "Accept" }));

    expect(editor.addTypedInitials).toHaveBeenCalledWith(
      { x: 56, y: 180 },
      { text: "AL", fontFamily: "cursive" },
    );
    expect(editor.setTool).toHaveBeenLastCalledWith("select");
  });

  it("rejects unsupported signature uploads and closes the dialog with Escape", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const editor = createEditor();
    render(
      <EditorPage
        editor={editor}
        snapshot={baseSnapshot()}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Signature" }));
    await user.click(screen.getByRole("tab", { name: "Upload" }));
    await user.upload(
      screen.getByLabelText("Upload signature image"),
      new File(["gif"], "sig.gif", { type: "image/gif" }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Use a PNG, JPG, or JPEG signature image.");
    expect(editor.addUploadedSignature).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("removes the background of an uploaded signature before it is placed", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const editor = createEditor();
    const OriginalImage = window.Image;
    class TestImage extends EventTarget {
      public naturalWidth = 400;
      public naturalHeight = 200;
      public set src(_value: string) {
        this.dispatchEvent(new Event("load"));
      }
    }
    Object.defineProperty(window, "Image", { configurable: true, value: TestImage });
    const separated = {
      dataUrl: "data:image/png;base64,separated",
      mimeType: "image/png" as const,
      width: 320,
      height: 90,
      source: "upload" as const,
    };
    const backgroundRemover = {
      remove: vi.fn(() => Promise.resolve({ status: "removed" as const, image: separated })),
    };
    render(
      <EditorPage
        editor={editor}
        snapshot={baseSnapshot()}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
        signatureBackgroundRemover={backgroundRemover}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Signature" }));
    await user.click(screen.getByRole("tab", { name: "Upload" }));
    await user.upload(
      screen.getByLabelText("Upload signature image"),
      new File(["jpg"], "sig.jpg", { type: "image/jpeg" }),
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Uploaded signature preview")).toHaveAttribute(
        "src",
        separated.dataUrl,
      );
    });
    expect(backgroundRemover.remove).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: "image/jpeg", width: 400, height: 200 }),
    );
    expect(screen.getByLabelText("Signature upload status")).toHaveTextContent(
      "Background removed.",
    );

    await user.click(screen.getByRole("button", { name: "Accept" }));

    expect(editor.addUploadedSignature.mock.calls[0]?.[1]).toEqual(separated);
    Object.defineProperty(window, "Image", { configurable: true, value: OriginalImage });
  });

  it("finishes background removal when the dialog is remounted by StrictMode", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const editor = createEditor();
    const OriginalImage = window.Image;
    class TestImage extends EventTarget {
      public naturalWidth = 400;
      public naturalHeight = 200;
      public set src(_value: string) {
        this.dispatchEvent(new Event("load"));
      }
    }
    Object.defineProperty(window, "Image", { configurable: true, value: TestImage });
    const separated = {
      dataUrl: "data:image/png;base64,separated",
      mimeType: "image/png" as const,
      width: 320,
      height: 90,
      source: "upload" as const,
    };
    const backgroundRemover = {
      remove: vi.fn(() => Promise.resolve({ status: "removed" as const, image: separated })),
    };
    render(
      <StrictMode>
        <EditorPage
          editor={editor}
          snapshot={baseSnapshot()}
          onSnapshotChange={vi.fn()}
          pdfRenderer={createRenderer()}
          signatureBackgroundRemover={backgroundRemover}
        />
      </StrictMode>,
    );

    await user.click(screen.getByRole("button", { name: "Signature" }));
    await user.click(screen.getByRole("tab", { name: "Upload" }));
    await user.upload(
      screen.getByLabelText("Upload signature image"),
      new File(["jpg"], "sig.jpg", { type: "image/jpeg" }),
    );

    // The status must settle instead of staying on "Removing background...".
    await waitFor(() => {
      expect(screen.getByLabelText("Signature upload status")).toHaveTextContent(
        "Background removed.",
      );
    });
    expect(screen.getByLabelText("Uploaded signature preview")).toHaveAttribute(
      "src",
      separated.dataUrl,
    );
    expect(screen.getByRole("button", { name: "Accept" })).toBeEnabled();
    Object.defineProperty(window, "Image", { configurable: true, value: OriginalImage });
  });

  it("keeps the original upload when background removal is switched off", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const editor = createEditor();
    const OriginalImage = window.Image;
    class TestImage extends EventTarget {
      public naturalWidth = 400;
      public naturalHeight = 200;
      public set src(_value: string) {
        this.dispatchEvent(new Event("load"));
      }
    }
    Object.defineProperty(window, "Image", { configurable: true, value: TestImage });
    const backgroundRemover = {
      remove: vi.fn(() =>
        Promise.resolve({
          status: "removed" as const,
          image: {
            dataUrl: "data:image/png;base64,separated",
            mimeType: "image/png" as const,
            width: 320,
            height: 90,
            source: "upload" as const,
          },
        }),
      ),
    };
    render(
      <EditorPage
        editor={editor}
        snapshot={baseSnapshot()}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
        signatureBackgroundRemover={backgroundRemover}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Signature" }));
    await user.click(screen.getByRole("tab", { name: "Upload" }));
    await user.upload(
      screen.getByLabelText("Upload signature image"),
      new File(["jpg"], "sig.jpg", { type: "image/jpeg" }),
    );
    await waitFor(() => {
      expect(screen.getByLabelText("Uploaded signature preview")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("checkbox", { name: "Remove background automatically" }));

    expect(screen.getByLabelText("Signature upload status")).toHaveTextContent(
      "Using the uploaded image as it is.",
    );

    await user.click(screen.getByRole("button", { name: "Accept" }));

    expect(editor.addUploadedSignature.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ mimeType: "image/jpeg", width: 400, height: 200 }),
    );
    Object.defineProperty(window, "Image", { configurable: true, value: OriginalImage });
  });

  it("explains when the signature background could not be removed", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const editor = createEditor();
    const OriginalImage = window.Image;
    class TestImage extends EventTarget {
      public naturalWidth = 400;
      public naturalHeight = 200;
      public set src(_value: string) {
        this.dispatchEvent(new Event("load"));
      }
    }
    Object.defineProperty(window, "Image", { configurable: true, value: TestImage });
    const backgroundRemover = {
      remove: vi.fn(() =>
        Promise.resolve({
          status: "failed" as const,
          error: {
            code: "SignatureBackgroundRemovalFailed" as const,
            message: "The signature background could not be removed. The original image was kept.",
          },
        }),
      ),
    };
    render(
      <EditorPage
        editor={editor}
        snapshot={baseSnapshot()}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
        signatureBackgroundRemover={backgroundRemover}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Signature" }));
    await user.click(screen.getByRole("tab", { name: "Upload" }));
    await user.upload(
      screen.getByLabelText("Upload signature image"),
      new File(["jpg"], "sig.jpg", { type: "image/jpeg" }),
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "The signature background could not be removed.",
      );
    });
    await user.click(screen.getByRole("button", { name: "Accept" }));

    expect(editor.addUploadedSignature.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ mimeType: "image/jpeg", width: 400 }),
    );
    Object.defineProperty(window, "Image", { configurable: true, value: OriginalImage });
  });

  it("supports pointer drawing with a transparent canvas background", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    class TestPointerEvent extends MouseEvent {
      public readonly pointerId: number;

      public constructor(type: string, init: MouseEventInit & { readonly pointerId?: number }) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
      }
    }
    Object.defineProperty(window, "PointerEvent", { configurable: true, value: TestPointerEvent });
    const stroke = vi.fn();
    const context = {
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke,
      clearRect: vi.fn(),
      lineCap: "round",
      lineJoin: "round",
      lineWidth: 4,
      strokeStyle: "#111111",
    } as unknown as CanvasRenderingContext2D;
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
    const toDataUrl = vi
      .spyOn(HTMLCanvasElement.prototype, "toDataURL")
      .mockReturnValue("data:image/png;base64,iVBORw0KGgo=");
    Object.defineProperty(HTMLCanvasElement.prototype, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
    render(
      <EditorPage
        editor={editor}
        snapshot={baseSnapshot()}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Signature" }));
    const pad = screen.getByLabelText("Draw signature");
    expect(pad).toHaveClass("signature-pad");
    act(() => {
      pad.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, clientX: 10, clientY: 12 }),
      );
      pad.dispatchEvent(
        new PointerEvent("pointermove", { bubbles: true, pointerId: 1, clientX: 40, clientY: 42 }),
      );
      pad.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1 }));
    });
    await user.click(screen.getByRole("button", { name: "Accept" }));

    expect(stroke).toHaveBeenCalled();
    expect(toDataUrl).toHaveBeenCalledWith("image/png");
    expect(editor.addDrawnSignature).toHaveBeenCalledWith(
      { x: 56, y: 250 },
      expect.objectContaining({ mimeType: "image/png", source: "draw" }),
    );
    getContext.mockRestore();
    toDataUrl.mockRestore();
  });

  it("uses larger initial geometry for phone text, date, and symbol placement", () => {
    const mediaQuery = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => mediaQuery),
    );

    const scenarios: readonly {
      readonly tool: EditorTool;
      readonly assertCall: (editor: TestEditor) => void;
    }[] = [
      {
        tool: "text",
        assertCall: (editor) => {
          expect(editor.addText).toHaveBeenCalledWith({ x: 50, y: 70 }, "Text", {
            width: 200,
            height: 52,
          });
        },
      },
      {
        tool: "checkmark",
        assertCall: (editor) => {
          expect(editor.addCheckmark).toHaveBeenCalledWith({ x: 50, y: 70 }, 44);
        },
      },
      {
        tool: "cross",
        assertCall: (editor) => {
          expect(editor.addCross).toHaveBeenCalledWith({ x: 50, y: 70 }, 44);
        },
      },
      {
        tool: "date",
        assertCall: (editor) => {
          expect(editor.addDate).toHaveBeenCalledWith({ x: 50, y: 70 }, { width: 144, height: 40 });
        },
      },
    ];

    for (const scenario of scenarios) {
      const editor = createEditor();
      const view = render(
        <EditorPage
          editor={editor}
          snapshot={baseSnapshot({ tool: scenario.tool })}
          onSnapshotChange={vi.fn()}
          pdfRenderer={createRenderer()}
        />,
      );
      const overlay = within(view.container).getByLabelText("PDF overlay");
      Object.defineProperty(overlay, "getBoundingClientRect", {
        configurable: true,
        value: () => ({ left: 0, top: 0, width: 300, height: 400, right: 300, bottom: 400 }),
      });
      fireEvent.click(overlay, { clientX: 50, clientY: 70 });
      scenario.assertCall(editor);
      view.unmount();
    }

    vi.unstubAllGlobals();
  });

  it("keeps mobile overlay touch gestures out of workspace pinch handling", () => {
    const mediaQuery = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => mediaQuery),
    );
    const textElement = selectedElementForType("text");
    const dateElement = selectedElementForType("date");
    const editor = createEditor();
    const { container } = render(
      <EditorPage
        editor={editor}
        snapshot={baseSnapshot({
          selectedElementId: textElement.id,
          selectedElement: textElement,
          elements: [textElement, dateElement],
          visibleElements: [textElement, dateElement],
        })}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );
    const workspace = screen.getByLabelText("PDF workspace");
    const textOverlay = screen.getByRole("group", { name: "text element" });
    const dateOverlay = screen.getByRole("group", { name: "date element" });
    const workspaceCapture = vi.fn();
    Object.defineProperty(workspace, "setPointerCapture", {
      configurable: true,
      value: workspaceCapture,
    });

    const dispatchTouch = (
      target: HTMLElement,
      type: string,
      pointerId: number,
      clientX: number,
      clientY: number,
    ): void => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        pointerId: { value: pointerId },
        pointerType: { value: "touch" },
        clientX: { value: clientX },
        clientY: { value: clientY },
      });
      act(() => {
        target.dispatchEvent(event);
      });
    };

    dispatchTouch(textOverlay, "pointerdown", 41, 55, 65);
    dispatchTouch(textOverlay, "pointermove", 41, 75, 85);
    dispatchTouch(textOverlay, "pointerup", 41, 75, 85);

    expect(workspaceCapture).not.toHaveBeenCalled();
    expect(editor.commitMoveElement).toHaveBeenCalledTimes(1);
    expect(editor.commitMoveElement).toHaveBeenCalledWith(
      textElement.id,
      textElement.bounds,
      expect.objectContaining({ x: 60, y: 70 }),
    );

    dispatchTouch(dateOverlay, "pointerdown", 42, 110, 130);
    expect(editor.selectElement).toHaveBeenLastCalledWith(dateElement.id);
    expect(container.querySelector(".overlay-element")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
  it("provides stateful mobile drawer, inspector sheet, and More controls without changing editor APIs", async () => {
    const mediaQuery = {
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => mediaQuery),
    );
    const user = userEvent.setup();
    const { container } = render(
      <EditorPage
        editor={createEditor()}
        snapshot={baseSnapshot()}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    const workspace = container.querySelector(".editor-workspace-shell");
    const pageRail = container.querySelector(".page-rail");
    const inspector = container.querySelector(".element-inspector");
    expect(workspace).not.toHaveClass("is-mobile-rail-open");
    expect(pageRail).not.toHaveClass("is-mobile-open");
    expect(inspector).not.toHaveClass("is-mobile-open");
    expect(workspace?.contains(inspector)).toBe(false);
    const statusBar = container.querySelector(".editor-status-bar");
    expect(statusBar?.compareDocumentPosition(inspector as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    const [openThumbnails] = screen.getAllByRole("button", { name: "Open page thumbnails" });
    if (openThumbnails === undefined) {
      throw new Error("Mobile page drawer control is missing.");
    }
    await user.click(openThumbnails);
    expect(workspace).toHaveClass("is-mobile-rail-open");
    expect(pageRail).toHaveClass("is-mobile-open");

    await user.click(screen.getByRole("button", { name: "Close page thumbnails" }));
    expect(workspace).not.toHaveClass("is-mobile-rail-open");
    expect(pageRail).not.toHaveClass("is-mobile-open");

    await user.click(screen.getByRole("button", { name: "More editor tools" }));
    expect(screen.getByRole("dialog", { name: "More tools" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Whiteout" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Fit page" })).toBeNull();

    const [openInspector] = screen.getAllByRole("button", { name: "Open editor inspector" });
    if (openInspector === undefined) {
      throw new Error("Mobile inspector control is missing.");
    }
    await user.click(openInspector);
    expect(inspector).toHaveClass("is-mobile-open");

    await user.click(screen.getByRole("button", { name: "Collapse inspector sheet" }));
    expect(inspector).not.toHaveClass("is-mobile-open");
    vi.unstubAllGlobals();
  });
  it("uses one simplified Quick Edit shell for touch tablets in portrait and landscape", async () => {
    const mediaQuery = {
      addEventListener: vi.fn(),
      matches: false,
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        ...mediaQuery,
        matches: query === "(pointer: coarse)",
      })),
    );
    vi.stubGlobal("visualViewport", {
      addEventListener: vi.fn(),
      height: 1180,
      removeEventListener: vi.fn(),
      width: 820,
    });
    const user = userEvent.setup();
    const { container } = render(
      <EditorPage
        editor={createEditor()}
        snapshot={selectedSnapshot("text")}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    const viewer = container.querySelector(".editor-viewer");
    const workspace = container.querySelector(".editor-workspace-shell");
    const inspector = container.querySelector(".element-inspector");
    expect(viewer).toHaveClass("is-compact-editor", "is-tablet-quick-edit");
    expect(viewer).not.toHaveClass("is-tablet-editor", "is-tablet-portrait");
    expect(workspace?.contains(inspector)).toBe(false);
    expect(screen.getByRole("status", { name: "Quick Edit mode" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Dismiss Quick Edit notice" }));
    expect(screen.queryByRole("status", { name: "Quick Edit mode" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Whiteout" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Initials" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cross" })).toBeNull();
    expect(container.querySelector(".desktop-inspector-content")).toHaveAttribute("hidden");
    expect(container.querySelector(".layers-panel")).not.toBeVisible();

    const [openThumbnails] = screen.getAllByRole("button", { name: "Open page thumbnails" });
    if (openThumbnails === undefined) throw new Error("Tablet page drawer control is missing.");
    await user.click(openThumbnails);
    expect(workspace).toHaveClass("is-mobile-rail-open");
    await user.click(screen.getByRole("button", { name: "Close page thumbnails" }));
    expect(workspace).not.toHaveClass("is-mobile-rail-open");

    await user.click(screen.getByRole("button", { name: "More editor tools" }));
    expect(screen.getByRole("dialog", { name: "More tools" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Whiteout" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Close" }));

    await user.click(screen.getByRole("button", { name: "Open editor inspector" }));
    expect(inspector).toHaveClass("is-mobile-open");
    await user.click(screen.getByRole("button", { name: "Collapse inspector sheet" }));
    expect(inspector).not.toHaveClass("is-mobile-open");
    vi.unstubAllGlobals();
  });
  it("uses simplified Quick Edit controls on wide touch tablets", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        addEventListener: vi.fn(),
        matches: query === "(pointer: coarse)",
        removeEventListener: vi.fn(),
      })),
    );
    vi.stubGlobal("visualViewport", {
      addEventListener: vi.fn(),
      height: 800,
      removeEventListener: vi.fn(),
      width: 1280,
    });
    const { container } = render(
      <EditorPage
        editor={createEditor()}
        snapshot={selectedSnapshot("text")}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    expect(container.querySelector(".editor-viewer")).toHaveClass(
      "is-compact-editor",
      "is-tablet-quick-edit",
    );
    expect(screen.queryByRole("button", { name: "Collapse tablet inspector" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Fit page" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Fit width" })).toBeNull();
    vi.unstubAllGlobals();
  });
  it("uses Light Mode canvas resolution on low-powered tablets and allows Full Quality", async () => {
    const originalPixelRatio = Object.getOwnPropertyDescriptor(window, "devicePixelRatio");
    const originalHardwareConcurrency = Object.getOwnPropertyDescriptor(
      navigator,
      "hardwareConcurrency",
    );
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 2 });
    Object.defineProperty(navigator, "hardwareConcurrency", { configurable: true, value: 4 });
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        addEventListener: vi.fn(),
        matches: query === "(pointer: coarse)",
        removeEventListener: vi.fn(),
      })),
    );
    vi.stubGlobal("visualViewport", {
      addEventListener: vi.fn(),
      height: 800,
      removeEventListener: vi.fn(),
      width: 1280,
    });
    const renderer = createRenderer();
    const user = userEvent.setup();
    const view = render(
      <EditorPage
        editor={createEditor()}
        snapshot={baseSnapshot()}
        onSnapshotChange={vi.fn()}
        pdfRenderer={renderer}
      />,
    );

    await waitFor(() => {
      expect(renderer.startRenderPage).toHaveBeenLastCalledWith(
        expect.objectContaining({ devicePixelRatio: 1 }),
      );
    });
    expect(view.container.querySelector(".editor-viewer")).toHaveClass("is-performance-light");

    await user.selectOptions(screen.getByLabelText("Editor performance profile"), "full");
    await waitFor(() => {
      expect(renderer.startRenderPage).toHaveBeenLastCalledWith(
        expect.objectContaining({ devicePixelRatio: 2 }),
      );
    });
    expect(view.container.querySelector(".editor-viewer")).toHaveClass("is-performance-full");

    await user.selectOptions(screen.getByLabelText("Editor performance profile"), "light");
    await waitFor(() => {
      expect(renderer.startRenderPage).toHaveBeenLastCalledWith(
        expect.objectContaining({ devicePixelRatio: 1 }),
      );
    });

    view.unmount();
    if (originalPixelRatio === undefined) {
      Reflect.deleteProperty(window, "devicePixelRatio");
    } else {
      Object.defineProperty(window, "devicePixelRatio", originalPixelRatio);
    }
    if (originalHardwareConcurrency === undefined) {
      Reflect.deleteProperty(navigator, "hardwareConcurrency");
    } else {
      Object.defineProperty(navigator, "hardwareConcurrency", originalHardwareConcurrency);
    }
    vi.unstubAllGlobals();
  });
  it("uses the reduced Quick Edit notice, primary tools, and contextual text controls on phones", async () => {
    const mediaQuery = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => mediaQuery),
    );
    const user = userEvent.setup();
    const text: ExportElement = {
      id: "quick-edit-text",
      pageId: "page-1",
      type: "text",
      bounds: { x: 30, y: 40, width: 160, height: 48 },
      text: "Quick text",
      textAppearance: { fontSize: 16, color: "#000000" },
    };
    const { container } = render(
      <EditorPage
        editor={createEditor()}
        snapshot={baseSnapshot({
          selectedElementId: text.id,
          selectedElement: text,
          visibleElements: [text],
        })}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    expect(screen.getByRole("status", { name: "Quick Edit mode" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss Quick Edit notice" })).toHaveTextContent(
      "×",
    );
    const primaryTools = [
      ...container.querySelectorAll<HTMLButtonElement>(
        '.toolbar-tools-group button[data-mobile-primary="true"]',
      ),
    ].map((button) => button.getAttribute("aria-label"));
    expect(primaryTools).toEqual(["Select", "Text", "Image", "Signature", "Checkmark", "Date"]);
    for (const advancedTool of ["Whiteout", "Initials", "Cross"]) {
      expect(screen.queryByRole("button", { name: advancedTool })).toBeNull();
    }
    expect(container.querySelector(".desktop-inspector-content")).toHaveAttribute("hidden");

    const [openInspector] = screen.getAllByRole("button", { name: "Open editor inspector" });
    if (openInspector === undefined) throw new Error("Mobile inspector control is missing.");
    await user.click(openInspector);
    const panel = container.querySelector(".mobile-quick-edit-panel");
    if (!(panel instanceof HTMLElement)) throw new Error("Quick Edit panel is missing.");
    expect(within(panel).getByLabelText("Text content")).toBeInTheDocument();
    expect(within(panel).getByLabelText("Text font size")).toBeInTheDocument();
    expect(within(panel).getByLabelText("Text color")).toBeInTheDocument();
    expect(within(panel).queryByRole("tablist")).toBeNull();
    expect(within(panel).queryByLabelText("Text font")).toBeNull();
    expect(within(panel).queryByLabelText("Line height")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Dismiss Quick Edit notice" }));
    expect(screen.queryByRole("status", { name: "Quick Edit mode" })).toBeNull();
    vi.unstubAllGlobals();
  });
  it("opens Export PDF options before generating a download", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    const exportCurrentPdf = (editor as unknown as { readonly exportCurrentPdf: Mock })
      .exportCurrentPdf;
    render(
      <EditorPage
        editor={editor}
        snapshot={baseSnapshot()}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Download" }));
    expect(screen.getByRole("dialog", { name: "Export PDF" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Original Size/ })).toBeChecked();
    expect(exportCurrentPdf).not.toHaveBeenCalled();
    await user.click(screen.getByRole("radio", { name: /Compress PDF/ }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(exportCurrentPdf).not.toHaveBeenCalled();
  });
  it("restores export controls after compression is not beneficial", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    const exportCurrentPdf = (editor as unknown as { readonly exportCurrentPdf: Mock })
      .exportCurrentPdf;
    const nonBeneficialSnapshot = baseSnapshot({
      error: {
        code: "CompressionNotBeneficial",
        message: "Compression didn't reduce this PDF. Export the original-quality version instead.",
      },
    });
    exportCurrentPdf
      .mockResolvedValueOnce(nonBeneficialSnapshot)
      .mockResolvedValueOnce(baseSnapshot());
    const onSnapshotChange = vi.fn();
    const { rerender } = render(
      <EditorPage
        editor={editor}
        snapshot={baseSnapshot()}
        onSnapshotChange={onSnapshotChange}
        pdfRenderer={createRenderer()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Download" }));
    await user.click(screen.getByRole("radio", { name: /Compress PDF/ }));
    await user.click(screen.getByRole("button", { name: "Export PDF" }));
    await waitFor(() => {
      expect(onSnapshotChange).toHaveBeenCalledWith(nonBeneficialSnapshot);
    });

    rerender(
      <EditorPage
        editor={editor}
        snapshot={nonBeneficialSnapshot}
        onSnapshotChange={onSnapshotChange}
        pdfRenderer={createRenderer()}
      />,
    );

    for (const alert of screen.getAllByRole("alert")) {
      expect(alert).toHaveTextContent(
        "Compression didn't reduce this PDF. Export the original-quality version instead.",
      );
    }
    expect(screen.queryByText("Compressing PDF...")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Export PDF" })).toBeEnabled();

    await user.click(screen.getByRole("radio", { name: /Original Size/ }));
    await user.click(screen.getByRole("button", { name: "Export PDF" }));
    expect(screen.queryByRole("dialog", { name: "Export PDF" })).not.toBeInTheDocument();
    expect(exportCurrentPdf).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ mode: "original" }),
    );
  });
  it("closes the export dialog after a successful compressed export", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    const exportCurrentPdf = (editor as unknown as { readonly exportCurrentPdf: Mock })
      .exportCurrentPdf;
    exportCurrentPdf.mockResolvedValueOnce(baseSnapshot());

    render(
      <EditorPage
        editor={editor}
        snapshot={baseSnapshot()}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Download" }));
    await user.click(screen.getByRole("radio", { name: /Compress PDF/ }));
    await user.click(screen.getByRole("button", { name: "Export PDF" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Export PDF" })).not.toBeInTheDocument();
    });
  });
  it.each([
    ["a compression error", "PDF compression could not be completed."],
    ["a cancelled compression", "PDF compression was cancelled."],
  ])("restores export controls after %s", async (_terminalState, message) => {
    const user = userEvent.setup();
    const editor = createEditor();
    const exportCurrentPdf = (editor as unknown as { readonly exportCurrentPdf: Mock })
      .exportCurrentPdf;
    const failedSnapshot = baseSnapshot({
      error: { code: "CompressionFailed", message },
    });
    exportCurrentPdf.mockResolvedValueOnce(failedSnapshot);
    const onSnapshotChange = vi.fn();

    render(
      <EditorPage
        editor={editor}
        snapshot={baseSnapshot()}
        onSnapshotChange={onSnapshotChange}
        pdfRenderer={createRenderer()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Download" }));
    await user.click(screen.getByRole("radio", { name: /Compress PDF/ }));
    await user.click(screen.getByRole("button", { name: "Export PDF" }));

    await waitFor(() => {
      expect(onSnapshotChange).toHaveBeenCalledWith(failedSnapshot);
    });
    expect(screen.queryByText("Compressing PDF...")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Export PDF" })).toBeEnabled();
  });
  it("keeps the full editor inspector and toolset outside the phone breakpoint", () => {
    const mediaQuery = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => mediaQuery),
    );

    const { container } = render(
      <EditorPage
        editor={createEditor()}
        snapshot={selectedSnapshot("text")}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    expect(screen.queryByRole("status", { name: "Quick Edit mode" })).toBeNull();
    expect(screen.getByRole("button", { name: "Whiteout" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Initials" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Cross" })).toBeVisible();
    expect(container.querySelector(".desktop-inspector-content")).not.toHaveAttribute("hidden");
    expect(screen.getByRole("tablist", { name: "Text inspector sections" })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
  it("edits the PDF dates from the desktop status bar", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    const { container } = render(
      <EditorPage
        editor={editor}
        snapshot={baseSnapshot({
          documentDates: { creationDate: new Date(2019, 4, 6, 7, 8).getTime() },
          sourceDocumentDates: { creationDate: new Date(2019, 4, 6, 7, 8).getTime() },
        })}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    const statusBar = container.querySelector(".editor-status-bar");
    const openDates = screen.getByRole("button", { name: "Edit PDF dates" });
    expect(statusBar?.contains(openDates)).toBe(true);

    await user.click(openDates);
    const dialog = screen.getByRole("dialog", { name: "PDF dates" });
    expect(within(dialog).getByLabelText("Created")).toHaveValue("2019-05-06T07:08");

    const modified = within(dialog).getByLabelText("Modified");
    fireEvent.change(modified, { target: { value: "2002-03-04T05:06" } });
    await user.click(within(dialog).getByRole("button", { name: "Apply dates" }));

    expect(editor.setDocumentDates).toHaveBeenCalledWith({
      creationDate: new Date(2019, 4, 6, 7, 8).getTime(),
      modificationDate: new Date(2002, 2, 4, 5, 6).getTime(),
    });
    expect(screen.queryByRole("dialog", { name: "PDF dates" })).not.toBeInTheDocument();
  });

  it("closes the PDF dates dialog without changing the document", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    render(
      <EditorPage
        editor={editor}
        snapshot={baseSnapshot()}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit PDF dates" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(editor.setDocumentDates).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "PDF dates" })).not.toBeInTheDocument();
  });

  it("offers no PDF dates to edit while no document is open", () => {
    const snapshot = baseSnapshot();
    render(
      <EditorPage
        editor={createEditor()}
        snapshot={{ ...snapshot, canExport: false, state: { ...snapshot.state, status: "empty" } }}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    expect(screen.getByRole("button", { name: "Edit PDF dates" })).toBeDisabled();
  });

  it("keeps the PDF dates tool off touch layouts", () => {
    const mediaQuery = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => mediaQuery),
    );

    render(
      <EditorPage
        editor={createEditor()}
        snapshot={baseSnapshot()}
        onSnapshotChange={vi.fn()}
        pdfRenderer={createRenderer()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Edit PDF dates" })).not.toBeInTheDocument();

    vi.unstubAllGlobals();
  });
});
