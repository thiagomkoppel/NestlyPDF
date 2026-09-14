import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { EditorSnapshot, PdfEditorApplication } from "../../application/editor-application";
import { PwaInstallProvider } from "../components/use-pwa-install";

import { LandingPage } from "./LandingPage";

const emptySnapshot: EditorSnapshot = {
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
  canUndo: false,
  canRedo: false,
  canExport: false,
  canPaste: false,
};

describe("LandingPage after bootstrap", () => {
  it("renders the local PDF picker without owning compatibility state", () => {
    render(
      <PwaInstallProvider>
        <LandingPage
          editor={{ openFile: vi.fn() } as unknown as PdfEditorApplication}
          snapshot={emptySnapshot}
          onDocumentOpened={vi.fn()}
          onSnapshotChange={vi.fn()}
        />
      </PwaInstallProvider>,
    );

    expect(screen.getByLabelText("Choose a PDF file")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Browser not supported" }),
    ).not.toBeInTheDocument();
  });
});
