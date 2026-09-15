import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EditorSnapshot, PdfEditorApplication } from "../../application/editor-application";
import { Shell } from "../components/Shell";

import { LandingPage } from "./LandingPage";

const originalUserAgent = window.navigator.userAgent;

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

const setUserAgent = (userAgent: string): void => {
  Object.defineProperty(window.navigator, "userAgent", { configurable: true, value: userAgent });
};

const setMatchMedia = (matchesStandalone = false): void => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string): MediaQueryList => ({
      matches: matchesStandalone && query === "(display-mode: standalone)",
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
};

const renderLanding = (): void => {
  render(
    <Shell>
      <LandingPage
        editor={{ openFile: vi.fn() } as unknown as PdfEditorApplication}
        snapshot={emptySnapshot}
        onDocumentOpened={vi.fn()}
        onSnapshotChange={vi.fn()}
      />
    </Shell>,
  );
};

afterEach(() => {
  setUserAgent(originalUserAgent);
  setMatchMedia();
});

describe("LandingPage install onboarding", () => {
  it("shows the install card and launches the Chromium prompt", async () => {
    const prompt = vi.fn(() => Promise.resolve());
    const event = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ readonly outcome: "accepted" }>;
    };
    Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome: "accepted" }) });
    const user = userEvent.setup();
    renderLanding();

    fireEvent(window, event);
    const card = await screen.findByRole("region", { name: "Install NestlyPDF" });
    expect(
      within(card).getByText("Use NestlyPDF like an app and open it offline."),
    ).toBeInTheDocument();
    expect(within(card).getByText("Opens quickly")).toBeInTheDocument();
    expect(within(card).getByText("Launches from your home screen")).toBeInTheDocument();
    expect(within(card).getByText("Runs like a native application")).toBeInTheDocument();
    expect(within(card).getByText("Your PDFs always stay on your device")).toBeInTheDocument();
    expect(within(card).getByText("You only need to install it once.")).toBeInTheDocument();

    await user.click(within(card).getByRole("button", { name: "Install NestlyPDF" }));
    expect(prompt).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "Install NestlyPDF" })).not.toBeInTheDocument();
    });
  });

  it("opens the existing iOS Add to Home Screen instructions from the card", async () => {
    setUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
    );
    const user = userEvent.setup();
    renderLanding();

    const card = screen.getByRole("region", { name: "Install NestlyPDF" });
    await user.click(within(card).getByRole("button", { name: "Install NestlyPDF" }));
    expect(screen.getByRole("dialog", { name: "Install NestlyPDF" })).toBeInTheDocument();
  });

  it("keeps the onboarding card visible but hides its install action when unavailable", () => {
    renderLanding();

    const card = screen.getByRole("region", { name: "Install NestlyPDF" });
    expect(card).toBeInTheDocument();
    expect(
      within(card).queryByRole("button", { name: "Install NestlyPDF" }),
    ).not.toBeInTheDocument();

    cleanup();
    setMatchMedia(true);
    renderLanding();
    expect(screen.queryByRole("region", { name: "Install NestlyPDF" })).not.toBeInTheDocument();
  });
});
