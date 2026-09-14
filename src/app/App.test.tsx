import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PdfOpenResult } from "../application/editor-application";
import type { PdfJsCompatibilityResult } from "../infrastructure/browser/browser-compatibility";

import { App } from "./App";

const GITHUB_URL = "https:" + "//github.com/thiagomkoppel/QuickPDF";

const download = vi.fn();
const openRenderDocument = vi.fn(() =>
  Promise.resolve({ ok: true as const, documentId: "render-1" }),
);
const disposeRenderDocument = vi.fn();
const startRenderPage = vi.fn(() => ({
  promise: Promise.resolve({
    ok: true as const,
    cssWidth: 300,
    cssHeight: 400,
    backingWidth: 300,
    backingHeight: 400,
  }),
  cancel: vi.fn(),
}));
const clearCanvas = vi.fn();

type MockExportResult =
  | { readonly ok: true; readonly bytes: Uint8Array }
  | {
      readonly ok: false;
      readonly error: { readonly code: "ExportFailed"; readonly message: string };
    };
const exportPdf = vi.fn((request: unknown): Promise<MockExportResult> => {
  void request;
  return Promise.resolve({ ok: true, bytes: new Uint8Array([1, 2, 3]) });
});
const open = vi.fn((): Promise<PdfOpenResult> =>
  Promise.resolve({
    ok: true,
    pages: [{ id: "page-1", width: 300, height: 400, rotation: 0 }],
  }),
);
type MockConvertResult =
  | { readonly ok: true; readonly fileName: string; readonly bytes: Uint8Array }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } };
const convertToPdf = vi.fn((): Promise<MockConvertResult> =>
  Promise.resolve({
    ok: true,
    fileName: "letter.docx",
    bytes: new Uint8Array([37, 80, 68, 70, 45]),
  }),
);

vi.mock("../infrastructure/pdf/pdfjs-page-renderer", () => ({
  PdfJsPageRenderer: class PdfJsPageRenderer {
    public openRenderDocument = openRenderDocument;
    public disposeRenderDocument = disposeRenderDocument;
    public startRenderPage = startRenderPage;
    public clearCanvas = clearCanvas;
  },
}));

vi.mock("../infrastructure/browser/browser-download-adapter", () => ({
  BrowserDownloadAdapter: class BrowserDownloadAdapter {
    public download = download;
  },
}));

vi.mock("../infrastructure/pdf/pdf-lib-export-gateway", () => ({
  PdfLibExportGateway: class PdfLibExportGateway {
    public open = open;
    public exportPdf = exportPdf;
  },
}));

vi.mock("../infrastructure/import/browser-docx-to-pdf-gateway", () => ({
  BrowserDocxToPdfGateway: class BrowserDocxToPdfGateway {
    public convertToPdf = convertToPdf;
  },
}));

const compatiblePreflight: PdfJsCompatibilityResult = {
  status: "compatible",
  diagnostics: {
    missingRequiredApis: [],
    canvasAvailable: true,
    moduleLoaded: true,
    workerInitialized: true,
    renderProbeCompleted: true,
  },
};

const renderAt = (
  path: string,
  compatibilityProbe = () => Promise.resolve(compatiblePreflight),
) => {
  window.history.pushState({}, "", path);
  return render(
    <App
      compatibilityProbe={compatibilityProbe}
      initialCompatibilityResult={compatiblePreflight}
      startupMinimumDurationMs={0}
      openingMinimumDurationMs={0}
    />,
  );
};

const testFile = (bytes: Uint8Array, name: string): File => {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const file = new File([buffer], name, { type: "application/pdf" });
  Object.defineProperty(file, "arrayBuffer", { value: () => Promise.resolve(buffer.slice(0)) });
  return file;
};

const pdfFile = (name = "contract.pdf"): File =>
  testFile(new Uint8Array([37, 80, 68, 70, 45]), name);

const docxFile = (name = "letter.docx"): File => {
  const file = testFile(new Uint8Array([80, 75, 3, 4]), name);
  Object.defineProperty(file, "type", {
    value: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  return file;
};

const clickOverlay = (element: HTMLElement, clientX: number, clientY: number): void => {
  element.dispatchEvent(
    new MouseEvent("click", { bubbles: true, clientX, clientY, cancelable: true }),
  );
};
const pointerOverlay = (
  element: HTMLElement,
  type: string,
  clientX: number,
  clientY: number,
  pointerId: number,
): void => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: clientX },
    clientY: { value: clientY },
    pointerId: { value: pointerId },
  });
  act(() => {
    element.dispatchEvent(event);
  });
};

const dragWhiteout = (overlay: HTMLElement): void => {
  Object.defineProperty(overlay, "setPointerCapture", { value: vi.fn(), configurable: true });
  Object.defineProperty(overlay, "hasPointerCapture", {
    value: vi.fn(() => false),
    configurable: true,
  });
  Object.defineProperty(overlay, "releasePointerCapture", { value: vi.fn(), configurable: true });
  pointerOverlay(overlay, "pointerdown", 40, 50, 10);
  pointerOverlay(overlay, "pointermove", 160, 98, 10);
  pointerOverlay(overlay, "pointerup", 160, 98, 10);
};

beforeEach(() => {
  Object.defineProperty(window.navigator, "userAgent", {
    configurable: true,
    value: "Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36",
  });
  Object.defineProperty(globalThis, "Worker", {
    configurable: true,
    value: function TestWorker(): void {
      return undefined;
    },
  });
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: class TestResizeObserver {
      public observe(): void {
        return undefined;
      }

      public unobserve(): void {
        return undefined;
      }

      public disconnect(): void {
        return undefined;
      }
    },
  });
  Object.defineProperty(globalThis, "CanvasRenderingContext2D", {
    configurable: true,
    value: function TestCanvasRenderingContext2D(): void {
      return undefined;
    },
  });
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:quickpdf-test",
  });
  download.mockClear();
  exportPdf.mockClear();
  open.mockClear();
  openRenderDocument.mockClear();
  disposeRenderDocument.mockClear();
  startRenderPage.mockClear();
  clearCanvas.mockClear();
  convertToPdf.mockClear();
  convertToPdf.mockResolvedValue({
    ok: true,
    fileName: "letter.docx",
    bytes: new Uint8Array([37, 80, 68, 70, 45]),
  });
});

describe("NestlyPDF application shell", () => {
  it("captures a native install prompt while the startup screen is still visible", async () => {
    vi.useFakeTimers();
    try {
      const prompt = vi.fn(() => Promise.resolve());
      const installEvent = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
        prompt: () => Promise<void>;
        userChoice: Promise<{ readonly outcome: "dismissed" }>;
      };
      Object.assign(installEvent, {
        prompt,
        userChoice: Promise.resolve({ outcome: "dismissed" }),
      });

      window.history.pushState({}, "", "/");
      render(
        <App
          compatibilityProbe={() => Promise.resolve(compatiblePreflight)}
          initialCompatibilityResult={compatiblePreflight}
          startupMinimumDurationMs={50}
        />,
      );

      expect(screen.getByText("Preparing Nest")).toBeInTheDocument();
      fireEvent(window, installEvent);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });

      const installButton = screen.getAllByRole("button", { name: "Install NestlyPDF" })[0];
      if (installButton === undefined) throw new Error("Expected the captured install action.");
      fireEvent.click(installButton);
      expect(prompt).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders the landing page with the product name, product statement, and accurate privacy promise", () => {
    renderAt("/");

    expect(screen.getByRole("link", { name: "Go to NestlyPDF home" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Edit PDFs privately, right on your device. Edit PDFs privately.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your files never leave your device. No uploads. No accounts. No cloud storage.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Private by design")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("QuickPDF");
    expect(screen.getByLabelText("NestlyPDF build")).toBeInTheDocument();
    expect(screen.getByText("Fast & Simple")).toBeInTheDocument();
    expect(screen.getByText("Your Control")).toBeInTheDocument();
    expect(screen.getByLabelText("Choose a PDF file")).toHaveAttribute(
      "accept",
      "application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
  });

  it("renders the complete browser-local privacy policy at the privacy route", () => {
    renderAt("/privacy");

    expect(screen.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeInTheDocument();
    expect(screen.getByText("Privacy at a glance")).toBeInTheDocument();
    expect(screen.getByText("Your PDF is processed locally in your browser.")).toBeInTheDocument();
    expect(
      screen.getByText("NestlyPDF does not upload or store your document on its own servers."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to NestlyPDF" })).toHaveAttribute("href", "/");
    const privacyBrand = screen.getByRole("link", { name: "Go to NestlyPDF home" });
    expect(privacyBrand.querySelector("img")).toHaveAttribute(
      "src",
      expect.stringContaining("quickpdf-mark"),
    );

    for (const heading of [
      "1. Overview",
      "2. Documents and editing data",
      "3. Information NestlyPDF does not intentionally collect",
      "4. Browser storage and session lifetime",
      "5. Signatures and sensitive information",
      "6. Exported files",
      "7. Hosting and technical request data",
      "8. Cookies, analytics, and advertising",
      "9. External links",
      "10. Security and limitations",
      "11. Whiteout is not redaction",
      "12. Children's privacy",
      "13. International use",
      "14. Changes to this policy",
      "15. Contact",
    ]) {
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    }

    expect(screen.getByRole("link", { name: "thiagomkoppel@gmail.com" })).toHaveAttribute(
      "href",
      "mailto:thiagomkoppel@gmail.com",
    );
    expect(screen.getByRole("link", { name: "GitHub page" })).toHaveAttribute("href", GITHUB_URL);
    expect(screen.getByText("Last updated: August 27, 2026")).toBeInTheDocument();
  });

  it("navigates between the landing page and privacy policy without a full page reload", async () => {
    const user = userEvent.setup();
    renderAt("/");

    await user.click(screen.getByRole("link", { name: "Privacy Policy" }));
    expect(screen.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Back to NestlyPDF" }));
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Edit PDFs privately, right on your device. Edit PDFs privately.",
      }),
    ).toBeInTheDocument();
  });
  it("renders diagnostics from the canonical internal route and returns to the landing page", async () => {
    const user = userEvent.setup();
    renderAt("/pwa-diagnostics");

    expect(
      await screen.findByRole("heading", { level: 1, name: "NestlyPDF diagnostics" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Choose a PDF file")).not.toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Back to NestlyPDF" }));

    expect(window.location.pathname).toBe("/");
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Edit PDFs privately, right on your device. Edit PDFs privately.",
      }),
    ).toBeInTheDocument();
  });
  it("opens the accessible local picker from the complete drop zone", () => {
    renderAt("/");
    const input = screen.getByLabelText("Choose a PDF file");
    const openPicker = vi.fn();
    Object.defineProperty(input, "click", { configurable: true, value: openPicker });

    fireEvent.click(screen.getByRole("button", { name: "Open a PDF file" }));

    expect(openPicker).toHaveBeenCalledTimes(1);
  });
  it("keeps the release state stable across nested drag events", () => {
    renderAt("/");
    const dropZone = screen.getByRole("button", { name: "Open a PDF file" });
    const dataTransfer = { types: ["Files"], files: [] };

    fireEvent.dragEnter(dropZone, { dataTransfer });
    fireEvent.dragEnter(dropZone, { dataTransfer });
    expect(screen.getAllByText("Release to open your PDF")).not.toHaveLength(0);

    fireEvent.dragLeave(dropZone, { dataTransfer });
    expect(screen.getAllByText("Release to open your PDF")).not.toHaveLength(0);

    fireEvent.dragLeave(dropZone, { dataTransfer });
    expect(screen.getAllByText("Drop your PDF here")).not.toHaveLength(0);
  });

  it("shows the browser-local opening stages while a file is opening", async () => {
    let resolveOpen: (result: PdfOpenResult) => void = () => {
      throw new Error("The PDF gateway did not begin opening.");
    };
    open.mockImplementationOnce(
      () =>
        new Promise<PdfOpenResult>((resolve) => {
          resolveOpen = resolve;
        }),
    );
    renderAt("/");

    fireEvent.change(screen.getByLabelText("Choose a PDF file"), {
      target: { files: [pdfFile()] },
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Reading PDF...");
    await new Promise<void>((resolve) => window.setTimeout(resolve, 1300));
    expect(screen.getByRole("status")).toHaveTextContent("Preparing pages...");
    await new Promise<void>((resolve) => window.setTimeout(resolve, 1300));
    expect(screen.getByRole("status")).toHaveTextContent("Building workspace...");
    expect(screen.getByText("Processing locally in your browser")).toBeInTheDocument();
    expect(screen.queryByText("Preparing large PDF...")).not.toBeInTheDocument();

    act(() => {
      resolveOpen({ ok: true, pages: [{ id: "page-1", width: 300, height: 400, rotation: 0 }] });
    });
  });

  it("shows deterministic large-document preparation after page count discovery", async () => {
    let resolveRender: (result: {
      readonly ok: true;
      readonly documentId: string;
    }) => void = () => {
      throw new Error("The render gateway did not begin opening.");
    };
    const pages = Array.from({ length: 500 }, (_, index) => ({
      id: `page-${String(index + 1)}`,
      width: 300,
      height: 400,
      rotation: 0 as const,
    }));
    open.mockResolvedValueOnce({ ok: true, pages });
    openRenderDocument.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRender = resolve;
        }),
    );
    renderAt("/");

    fireEvent.change(screen.getByLabelText("Choose a PDF file"), {
      target: { files: [pdfFile("large.pdf")] },
    });

    expect(await screen.findByRole("status")).toHaveTextContent("Preparing large PDF...");
    expect(
      screen.getByText("This document has 500 pages. NestlyPDF is preparing it for editing."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Large documents may take a little longer on this device."),
    ).toBeInTheDocument();

    act(() => {
      resolveRender({ ok: true, documentId: "render-large" });
    });
  });

  it("uses the same opening shell for a dropped PDF", async () => {
    let resolveOpen: (result: PdfOpenResult) => void = () => {
      throw new Error("The PDF gateway did not begin opening.");
    };
    open.mockImplementationOnce(
      () =>
        new Promise<PdfOpenResult>((resolve) => {
          resolveOpen = resolve;
        }),
    );
    renderAt("/");

    fireEvent.drop(screen.getByRole("button", { name: "Open a PDF file" }), {
      dataTransfer: { files: [pdfFile()], types: ["Files"] },
    });

    expect(await screen.findByRole("status")).toHaveTextContent("Reading PDF...");
    act(() => {
      resolveOpen({ ok: true, pages: [{ id: "page-1", width: 300, height: 400, rotation: 0 }] });
    });
  });
  it("returns to a retryable landing error after an invalid PDF", async () => {
    open.mockResolvedValueOnce({
      ok: false,
      error: { code: "InvalidPdf", message: "That file is not a valid PDF." },
    });
    renderAt("/");

    fireEvent.change(screen.getByLabelText("Choose a PDF file"), {
      target: { files: [pdfFile()] },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("That file is not a valid PDF.");
    expect(screen.getByRole("button", { name: "Try another file" })).toBeInTheDocument();
  });

  it("converts a .docx file to PDF and opens the editor", async () => {
    const user = userEvent.setup();
    renderAt("/");

    await user.upload(screen.getByLabelText("Choose a PDF file"), docxFile());
    await screen.findByRole("heading", { name: "letter.docx" }, { timeout: 6_500 });

    expect(convertToPdf).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(new Uint8Array([37, 80, 68, 70, 45]));
  });

  it("shows a converting-document status while a .docx file is being converted", async () => {
    let resolveConversion: (result: MockConvertResult) => void = () => {
      throw new Error("Conversion did not begin.");
    };
    convertToPdf.mockImplementationOnce(
      () =>
        new Promise<MockConvertResult>((resolve) => {
          resolveConversion = resolve;
        }),
    );
    renderAt("/");

    fireEvent.change(screen.getByLabelText("Choose a PDF file"), {
      target: { files: [docxFile()] },
    });

    expect(await screen.findByRole("status")).toHaveTextContent("Converting your document...");

    act(() => {
      resolveConversion({
        ok: true,
        fileName: "letter.docx",
        bytes: new Uint8Array([37, 80, 68, 70, 45]),
      });
    });
  });

  it("returns to a retryable landing error when .docx conversion fails", async () => {
    convertToPdf.mockResolvedValueOnce({
      ok: false,
      error: {
        code: "DocumentConversionFailed",
        message: "This Word document could not be converted to a PDF.",
      },
    });
    renderAt("/");

    fireEvent.change(screen.getByLabelText("Choose a PDF file"), {
      target: { files: [docxFile()] },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This Word document could not be converted to a PDF.",
    );
    expect(open).not.toHaveBeenCalled();
  });

  it("rejects a legacy .doc file without attempting conversion", async () => {
    renderAt("/");

    const legacyDoc = testFile(new Uint8Array([208, 207, 17, 224]), "memo.doc");
    Object.defineProperty(legacyDoc, "type", { value: "application/msword" });
    fireEvent.change(screen.getByLabelText("Choose a PDF file"), {
      target: { files: [legacyDoc] },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Word 97-2003 .doc files can't be opened here",
    );
    expect(convertToPdf).not.toHaveBeenCalled();
  });

  it("uses the non-animated opening path when reduced motion is preferred", async () => {
    const originalMatchMedia = window.matchMedia.bind(window);
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    let resolveOpen: (result: PdfOpenResult) => void = () => {
      throw new Error("The PDF gateway did not begin opening.");
    };
    open.mockImplementationOnce(
      () =>
        new Promise<PdfOpenResult>((resolve) => {
          resolveOpen = resolve;
        }),
    );
    renderAt("/");

    fireEvent.change(screen.getByLabelText("Choose a PDF file"), {
      target: { files: [pdfFile()] },
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Opening editor...");

    act(() => {
      resolveOpen({ ok: true, pages: [{ id: "page-1", width: 300, height: 400, rotation: 0 }] });
    });
    Object.defineProperty(window, "matchMedia", { configurable: true, value: originalMatchMedia });
  });
  it("navigates home immediately from a clean editor through the NestlyPDF logo", async () => {
    const user = userEvent.setup();
    renderAt("/");

    await user.upload(screen.getByLabelText("Choose a PDF file"), pdfFile());
    await screen.findByRole("heading", { name: "contract.pdf" }, { timeout: 6_500 });
    await user.click(screen.getByRole("button", { name: "Go to NestlyPDF home" }));

    expect(window.location.pathname).toBe("/");
    expect(screen.getByLabelText("Choose a PDF file")).toBeInTheDocument();
  });

  it("guards dirty editor logo navigation and disposes through the standard close path only after confirmation", async () => {
    const user = userEvent.setup();
    renderAt("/");

    await user.upload(screen.getByLabelText("Choose a PDF file"), pdfFile());
    await screen.findByRole("heading", { name: "contract.pdf" }, { timeout: 6_500 });
    await user.click(screen.getByRole("button", { name: "Text" }));
    clickOverlay(screen.getByLabelText("PDF overlay"), 45, 55);
    await screen.findByLabelText("Edit text element");
    expect(screen.getByText("Unsaved temporary edits")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Go to NestlyPDF home" }));
    expect(window.location.pathname).toBe("/editor");
    expect(screen.getByRole("dialog", { name: "Leave without saving?" })).toBeInTheDocument();
    expect(screen.getByText(/You have unsaved changes in this PDF\./)).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Leave without saving?" })).toBeNull();
    expect(screen.getByRole("heading", { name: "contract.pdf" })).toBeInTheDocument();
    expect(screen.getByText("Unsaved temporary edits")).toBeInTheDocument();
    expect(disposeRenderDocument).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Go to NestlyPDF home" }));
    await user.click(screen.getByRole("button", { name: "Leave without saving" }));

    expect(window.location.pathname).toBe("/");
    expect(screen.getByLabelText("Choose a PDF file")).toBeInTheDocument();
    expect(disposeRenderDocument).toHaveBeenCalledWith("render-1");
  });
  it("guards every same-tab link and the Open action while a session is dirty", async () => {
    const user = userEvent.setup();
    renderAt("/");

    await user.upload(screen.getByLabelText("Choose a PDF file"), pdfFile());
    await screen.findByRole("heading", { name: "contract.pdf" }, { timeout: 6_500 });
    await user.click(screen.getByRole("button", { name: "Text" }));
    clickOverlay(screen.getByLabelText("PDF overlay"), 45, 55);
    await screen.findByLabelText("Edit text element");

    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(window.location.pathname).toBe("/editor");
    expect(screen.getByRole("dialog", { name: "Leave without saving?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Stay here" }));
    expect(screen.getByText("Unsaved temporary edits")).toBeInTheDocument();

    const navigationLink = document.createElement("a");
    navigationLink.href = "/privacy";
    navigationLink.textContent = "Open privacy";
    document.body.append(navigationLink);
    await user.click(navigationLink);

    expect(window.location.pathname).toBe("/editor");
    expect(screen.getByRole("dialog", { name: "Leave without saving?" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Leave without saving" }));
    expect(window.location.pathname).toBe("/privacy");
    expect(disposeRenderDocument).toHaveBeenCalledWith("render-1");
    navigationLink.remove();
  }, 10_000);
  it("guards dirty browser history and unload attempts without disposing the session", async () => {
    const user = userEvent.setup();
    renderAt("/");

    await user.upload(screen.getByLabelText("Choose a PDF file"), pdfFile());
    await screen.findByRole("heading", { name: "contract.pdf" }, { timeout: 6_500 });
    await user.click(screen.getByRole("button", { name: "Text" }));
    clickOverlay(screen.getByLabelText("PDF overlay"), 45, 55);
    await screen.findByLabelText("Edit text element");

    act(() => {
      window.history.pushState({}, "", "/privacy");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(window.location.pathname).toBe("/editor");
    expect(screen.getByRole("dialog", { name: "Leave without saving?" })).toBeInTheDocument();
    await user.keyboard("{Escape}");

    const beforeUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(true);
    expect(disposeRenderDocument).not.toHaveBeenCalled();
  }, 10_000);
  it("opens the replacement picker immediately for a clean document", async () => {
    const user = userEvent.setup();
    renderAt("/");

    await user.upload(screen.getByLabelText("Choose a PDF file"), pdfFile());
    await screen.findByRole("heading", { name: "contract.pdf" }, { timeout: 6_500 });
    const replacementPicker = screen.getByLabelText("Choose a replacement PDF file");
    const openPicker = vi.fn();
    Object.defineProperty(replacementPicker, "click", {
      configurable: true,
      value: openPicker,
    });

    await user.click(screen.getByRole("button", { name: "Open" }));

    expect(screen.queryByRole("dialog", { name: "Leave without saving?" })).toBeNull();
    expect(openPicker).toHaveBeenCalledTimes(1);
    expect(disposeRenderDocument).toHaveBeenCalledWith("render-1");
  }, 10_000);

  it("keeps a dirty document when replacement is cancelled and opens the picker only after discard confirmation", async () => {
    const user = userEvent.setup();
    renderAt("/");

    await user.upload(screen.getByLabelText("Choose a PDF file"), pdfFile());
    await screen.findByRole("heading", { name: "contract.pdf" }, { timeout: 6_500 });
    const replacementPicker = screen.getByLabelText("Choose a replacement PDF file");
    const openPicker = vi.fn();
    Object.defineProperty(replacementPicker, "click", {
      configurable: true,
      value: openPicker,
    });
    await user.click(screen.getByRole("button", { name: "Text" }));
    clickOverlay(screen.getByLabelText("PDF overlay"), 45, 55);
    await screen.findByLabelText("Edit text element");

    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByRole("dialog", { name: "Leave without saving?" })).toBeInTheDocument();
    expect(openPicker).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Stay here" }));
    expect(screen.getByText("Unsaved temporary edits")).toBeInTheDocument();
    expect(openPicker).not.toHaveBeenCalled();
    expect(disposeRenderDocument).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.click(screen.getByRole("button", { name: "Leave without saving" }));
    expect(openPicker).toHaveBeenCalledTimes(1);
    expect(disposeRenderDocument).toHaveBeenCalledWith("render-1");
  }, 10_000);

  it("guards external new-tab links before disposing a dirty editor session", async () => {
    const user = userEvent.setup();
    const openExternal = vi.spyOn(window, "open").mockReturnValue(null);
    renderAt("/");

    await user.upload(screen.getByLabelText("Choose a PDF file"), pdfFile());
    await screen.findByRole("heading", { name: "contract.pdf" }, { timeout: 6_500 });
    await user.click(screen.getByRole("button", { name: "Text" }));
    clickOverlay(screen.getByLabelText("PDF overlay"), 45, 55);
    await screen.findByLabelText("Edit text element");

    const externalLink = document.createElement("a");
    externalLink.href = GITHUB_URL;
    externalLink.target = "_blank";
    externalLink.textContent = "Open GitHub";
    document.body.append(externalLink);
    await user.click(externalLink);

    expect(screen.getByRole("dialog", { name: "Leave without saving?" })).toBeInTheDocument();
    expect(openExternal).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Leave without saving" }));
    expect(openExternal).toHaveBeenCalledWith(GITHUB_URL, "_blank", "noopener");
    externalLink.remove();
  }, 10_000);
  it("opens a local PDF, renders the current page, adds overlays, downloads, and keeps the editor open", async () => {
    const user = userEvent.setup();
    renderAt("/");

    await user.upload(screen.getByLabelText("Choose a PDF file"), pdfFile());
    expect(
      await screen.findByRole("heading", { name: "contract.pdf" }, { timeout: 6_500 }),
    ).toBeInTheDocument();
    expect(await screen.findByLabelText("Rendered PDF page")).toBeInTheDocument();
    await waitFor(() => {
      expect(startRenderPage).toHaveBeenCalledWith(
        expect.objectContaining({ documentId: "render-1", pageNumber: 1, scale: 1 }),
      );
    });

    await user.click(screen.getByRole("button", { name: "Whiteout" }));
    dragWhiteout(screen.getByLabelText("PDF overlay"));
    const whiteout = await screen.findByRole("group", { name: "whiteout element" });
    expect(whiteout).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Text" }));
    clickOverlay(screen.getByLabelText("PDF overlay"), 130, 110);
    const textBox = await screen.findByLabelText("Edit text element");
    await user.clear(textBox);
    await user.type(textBox, "Replacement");

    await user.click(screen.getByRole("button", { name: "Download" }));
    await user.click(
      within(screen.getByRole("dialog", { name: "Export PDF" })).getByRole("button", {
        name: "Export PDF",
      }),
    );

    await waitFor(() => {
      expect(download).toHaveBeenCalledWith({
        bytes: new Uint8Array([1, 2, 3]),
        filename: "contract.pdf",
        mimeType: "application/pdf",
      });
    });
    expect(screen.getByRole("heading", { name: "contract.pdf" })).toBeInTheDocument();
    expect(
      screen.getByText("Downloaded contract.pdf. The editor remains open."),
    ).toBeInTheDocument();
    const exportRequest = exportPdf.mock.calls[0]?.[0] as {
      readonly elements: readonly { readonly type: string }[];
    };
    expect(exportRequest.elements.map((element) => element.type)).toEqual(["whiteout", "text"]);
  });

  it("keeps the editor open and dirty when export fails", async () => {
    exportPdf.mockResolvedValueOnce({
      ok: false,
      error: { code: "ExportFailed", message: "Nope" },
    });
    const user = userEvent.setup();
    renderAt("/");

    await user.upload(screen.getByLabelText("Choose a PDF file"), pdfFile());
    await screen.findByRole("heading", { name: "contract.pdf" }, { timeout: 6_500 });
    await user.click(screen.getByRole("button", { name: "Text" }));
    clickOverlay(screen.getByLabelText("PDF overlay"), 45, 55);
    await screen.findByLabelText("Edit text element");
    await user.click(screen.getByRole("button", { name: "Download" }));
    await user.click(
      within(screen.getByRole("dialog", { name: "Export PDF" })).getByRole("button", {
        name: "Export PDF",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Nope");
    expect(screen.getByRole("heading", { name: "contract.pdf" })).toBeInTheDocument();
    expect(screen.getByText("Unsaved temporary edits")).toBeInTheDocument();
  });

  it("renders the phone landing with its menu and local file-picker actions", async () => {
    const originalMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query: string): MediaQueryList => ({
      matches: query === "(max-width: 767px)",
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    });
    const user = userEvent.setup();

    renderAt("/");

    expect(screen.getByText("Private & Secure")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Edit PDFs privately, right on your device. Edit PDFs privately.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("No uploads. No accounts. No cloud storage.")).toBeInTheDocument();
    expect(screen.getByText("No Uploads")).toBeInTheDocument();
    expect(screen.getByText("100% Free")).toBeInTheDocument();
    expect(screen.getByText(/Made with privacy in mind/)).toBeInTheDocument();

    const input = screen.getByLabelText("Choose a PDF file");
    const openPicker = vi.fn();
    Object.defineProperty(input, "click", { configurable: true, value: openPicker });
    await user.click(screen.getByRole("button", { name: "Choose PDF" }));
    await user.click(screen.getByRole("button", { name: "Browse files" }));
    expect(openPicker).toHaveBeenCalledTimes(2);

    const menu = screen.getByRole("button", { name: "Open site menu" });
    await user.click(menu);
    expect(menu).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("navigation", { name: "Primary" })).toHaveClass("is-mobile-menu-open");
    await user.keyboard("{Escape}");
    expect(menu).toHaveAttribute("aria-expanded", "false");

    window.matchMedia = originalMatchMedia;
  });
  it("redirects an editor route without an active in-memory document to the landing page", async () => {
    renderAt("/editor");

    expect(screen.queryByText("Open a PDF first")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(window.location.pathname).toBe("/");
    });
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Edit PDFs privately, right on your device. Edit PDFs privately.",
      }),
    ).toBeInTheDocument();
  });

  it("keeps an active document on the editor route", async () => {
    const user = userEvent.setup();
    renderAt("/");

    await user.upload(screen.getByLabelText("Choose a PDF file"), pdfFile());
    await screen.findByRole("heading", { name: "contract.pdf" }, { timeout: 6_500 });

    expect(window.location.pathname).toBe("/editor");
    expect(screen.getByLabelText("Rendered PDF page")).toBeInTheDocument();
  });

  it("renders a not-found page for unknown routes", () => {
    renderAt("/missing-route");

    expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return to NestlyPDF home" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("uses a semantic responsive shell structure", () => {
    renderAt("/");

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
  });
});
