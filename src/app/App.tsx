import {
  useCallback,
  useEffect,
  type ChangeEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  PdfEditorApplication,
  SequentialIdGenerator,
  type EditorSnapshot,
} from "../application/editor-application";
import { BrowserDownloadAdapter } from "../infrastructure/browser/browser-download-adapter";
import { BrowserLocalPdfFileReader } from "../infrastructure/browser/local-pdf-file-reader";
import { BrowserDocxToPdfGateway } from "../infrastructure/import/browser-docx-to-pdf-gateway";
import {
  preflightPdfJsCompatibility,
  type PdfJsCompatibilityResult,
} from "../infrastructure/browser/browser-compatibility";
import { PdfJsPageRenderer } from "../infrastructure/pdf/pdfjs-page-renderer";
import { PdfLibExportGateway } from "../infrastructure/pdf/pdf-lib-export-gateway";
import { PdfRasterCompressionGateway } from "../infrastructure/pdf/pdf-raster-compression-gateway";
import { LeaveWithoutSavingDialog } from "../presentation/components/LeaveWithoutSavingDialog";
import { Shell } from "../presentation/components/Shell";
import { PwaInstallProvider } from "../presentation/components/use-pwa-install";
import { useUnsavedChangesBeforeUnload } from "../presentation/navigation/use-unsaved-changes-before-unload";
import { EditorPage } from "../presentation/pages/EditorPage";
import { LandingPage } from "../presentation/pages/LandingPage";
import { NotFoundPage } from "../presentation/pages/NotFoundPage";
import { PrivacyPolicyPage } from "../presentation/pages/PrivacyPolicyPage";
import { PwaDiagnosticsPage } from "../presentation/pages/PwaDiagnosticsPage";
import { StartupScreen, type StartupStage } from "../presentation/pages/StartupScreen";

declare global {
  interface Window {
    __quickpdfCompatibilityResult__?: PdfJsCompatibilityResult;
  }
}

const STARTUP_MINIMUM_DURATION_MS = 5_000;
const CHROME_UPDATE_URL = "https:" + "//www.google.com/chrome/update/";

const getPathname = (): string => window.location.pathname;

const subscribeToNavigation = (onStoreChange: () => void): (() => void) => {
  window.addEventListener("popstate", onStoreChange);
  window.addEventListener("quickpdf:navigation", onStoreChange);

  return () => {
    window.removeEventListener("popstate", onStoreChange);
    window.removeEventListener("quickpdf:navigation", onStoreChange);
  };
};

const getServerPathname = (): string => "/";

const navigate = (href: string, replace = false): void => {
  if (replace) {
    window.history.replaceState({}, "", href);
  } else {
    window.history.pushState({}, "", href);
  }
  window.dispatchEvent(new Event("quickpdf:navigation"));
};

const RedirectToLanding = (): null => {
  useLayoutEffect(() => {
    navigate("/", true);
  }, []);

  return null;
};

export type PdfJsCompatibilityProbe = () => Promise<PdfJsCompatibilityResult>;

type PdfJsCompatibleResult = Extract<PdfJsCompatibilityResult, { readonly status: "compatible" }>;
type PdfJsIncompatibleResult = Extract<
  PdfJsCompatibilityResult,
  { readonly status: "incompatible" }
>;
type PdfJsIndeterminateResult = Extract<
  PdfJsCompatibilityResult,
  { readonly status: "indeterminate" }
>;

export type AppBootstrapState =
  | { readonly status: "checking"; readonly stage: StartupStage }
  | { readonly status: "compatible"; readonly result: PdfJsCompatibleResult }
  | { readonly status: "incompatible"; readonly result: PdfJsIncompatibleResult }
  | { readonly status: "indeterminate"; readonly result?: PdfJsIndeterminateResult };

interface AppProps {
  readonly compatibilityProbe?: PdfJsCompatibilityProbe;
  readonly initialCompatibilityResult?: PdfJsCompatibilityResult;
  /** Explicit test seam; production uses the required five-second minimum. */
  readonly startupMinimumDurationMs?: number;
  /** Explicit test seam for the minimum landing "opening" animation duration. */
  readonly openingMinimumDurationMs?: number;
}

interface NavigationDestination {
  readonly href: string;
  readonly isExternal: boolean;
  readonly openInNewWindow: boolean;
}

type PendingExitAction =
  | { readonly type: "home" }
  | { readonly type: "open" }
  | { readonly type: "navigate"; readonly destination: NavigationDestination };

interface EditorServices {
  readonly editor: PdfEditorApplication;
  readonly pdfRenderer: PdfJsPageRenderer;
}

const createEditorServices = (): EditorServices => {
  const pdfRenderer = new PdfJsPageRenderer();
  return {
    pdfRenderer,
    editor: new PdfEditorApplication(
      new BrowserLocalPdfFileReader(),
      new PdfLibExportGateway(),
      new BrowserDownloadAdapter(),
      new SequentialIdGenerator(),
      pdfRenderer,
      undefined,
      new PdfRasterCompressionGateway(),
      new BrowserDocxToPdfGateway(),
    ),
  };
};

const indeterminateCompatibility = (): Extract<
  PdfJsCompatibilityResult,
  { readonly status: "indeterminate" }
> => ({
  status: "indeterminate",
  diagnostics: {
    missingRequiredApis: [],
    canvasAvailable: false,
    moduleLoaded: false,
    workerInitialized: false,
    renderProbeCompleted: false,
  },
});

const toBootstrapState = (result: PdfJsCompatibilityResult): AppBootstrapState => {
  switch (result.status) {
    case "compatible":
      return { status: "compatible", result };
    case "incompatible":
      return { status: "incompatible", result };
    case "indeterminate":
      return { status: "indeterminate" };
  }
};

const BrowserCompatibilityPage = ({
  compatibility,
}: {
  readonly compatibility: Extract<PdfJsCompatibilityResult, { readonly status: "incompatible" }>;
}): React.ReactElement => (
  <Shell>
    <section className="landing-page" aria-labelledby="browser-compatibility-title">
      <div className="landing-hero">
        <section className="browser-compatibility-panel" role="alert">
          <h1 id="browser-compatibility-title">Browser not supported</h1>
          <p>This browser cannot reliably display PDFs in NestlyPDF.</p>
          <p>Check your browser support or open NestlyPDF on another device.</p>
          {compatibility.diagnostics.missingRequiredApis.length > 0 ? (
            <p>
              Missing required browser capability:{" "}
              {compatibility.diagnostics.missingRequiredApis.join(", ")}
            </p>
          ) : null}
          <div className="browser-compatibility-actions">
            <a href={CHROME_UPDATE_URL} rel="noreferrer" target="_blank">
              Check for browser updates
            </a>
          </div>
        </section>
      </div>
    </section>
  </Shell>
);

const AppContent = ({
  compatibilityProbe = preflightPdfJsCompatibility,
  initialCompatibilityResult,
  startupMinimumDurationMs = STARTUP_MINIMUM_DURATION_MS,
  openingMinimumDurationMs,
}: AppProps): React.ReactElement => {
  const pathname = useSyncExternalStore(subscribeToNavigation, getPathname, getServerPathname);
  const { editor, pdfRenderer } = useMemo(() => createEditorServices(), []);
  const [snapshot, setSnapshot] = useState<EditorSnapshot>(() => editor.snapshot());
  const [pendingExitAction, setPendingExitAction] = useState<PendingExitAction>();
  const [replacementFile, setReplacementFile] = useState<File>();
  const replacementPickerRef = useRef<HTMLInputElement>(null);
  const resolvedInitialCompatibilityResult =
    initialCompatibilityResult ?? window.__quickpdfCompatibilityResult__;
  const compatibilityProbeRef = useRef(compatibilityProbe);
  const resolvedInitialResultRef = useRef(resolvedInitialCompatibilityResult);
  const [bootstrap, setBootstrap] = useState<AppBootstrapState>(() =>
    resolvedInitialCompatibilityResult !== undefined && startupMinimumDurationMs === 0
      ? toBootstrapState(resolvedInitialCompatibilityResult)
      : { status: "checking", stage: "initializing" },
  );

  useEffect(() => {
    document.getElementById("quickpdf-boot-fallback")?.remove();
  }, []);
  const hasUnsavedEditorSession =
    pathname === "/editor" && snapshot.state.status !== "empty" && snapshot.state.isDirty;
  useUnsavedChangesBeforeUnload(hasUnsavedEditorSession);

  useEffect(
    () => () => {
      editor.closeDocument();
    },
    [editor],
  );

  useEffect(() => {
    if (bootstrap.status !== "checking") return undefined;
    let disposed = false;
    const duration = Math.max(0, startupMinimumDurationMs);
    const stages: readonly StartupStage[] = [
      "loading-renderer",
      "checking-worker",
      "testing-render",
      "finalizing",
    ];
    const stageTimers = stages.map((stage, index) =>
      window.setTimeout(
        () => {
          if (!disposed) setBootstrap({ status: "checking", stage });
        },
        Math.round(duration * ((index + 1) / (stages.length + 1))),
      ),
    );
    const probe =
      resolvedInitialResultRef.current === undefined
        ? compatibilityProbeRef.current()
        : Promise.resolve(resolvedInitialResultRef.current);
    const minimumDuration = new Promise<void>((resolve) => {
      window.setTimeout(resolve, duration);
    });

    void Promise.all([probe.catch(indeterminateCompatibility), minimumDuration]).then(
      ([compatibility]) => {
        if (!disposed) setBootstrap(toBootstrapState(compatibility));
      },
    );

    return () => {
      disposed = true;
      stageTimers.forEach((timer) => {
        window.clearTimeout(timer);
      });
    };
  }, [bootstrap.status, startupMinimumDurationMs]);

  const openEditor = (): void => {
    navigate("/editor");
  };

  const handleReplacementFileChange = useCallback((event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file === undefined) return;
    setReplacementFile(file);
    navigate("/");
  }, []);

  const performNavigation = useCallback((destination: NavigationDestination): void => {
    if (!destination.isExternal) {
      navigate(destination.href);
      return;
    }
    if (destination.openInNewWindow) {
      window.open(destination.href, "_blank", "noopener");
      return;
    }
    window.location.assign(destination.href);
  }, []);

  const executeExitAction = useCallback(
    (action: PendingExitAction): void => {
      switch (action.type) {
        case "home":
          navigate("/");
          return;
        case "open":
          replacementPickerRef.current?.click();
          return;
        case "navigate":
          performNavigation(action.destination);
          return;
      }
    },
    [performNavigation],
  );

  const discardAndExecuteExitAction = useCallback(
    (action: PendingExitAction): void => {
      if (editor.snapshot().state.status !== "empty") {
        setSnapshot(editor.closeDocument());
      }
      executeExitAction(action);
    },
    [editor, executeExitAction],
  );

  const requestExit = useCallback(
    (action: PendingExitAction): void => {
      const currentState = editor.snapshot().state;
      if (currentState.status !== "empty" && currentState.isDirty) {
        setPendingExitAction(action);
        return;
      }
      discardAndExecuteExitAction(action);
    },
    [discardAndExecuteExitAction, editor],
  );

  const requestNavigation = useCallback(
    (destination: NavigationDestination): void => {
      requestExit({ type: "navigate", destination });
    },
    [requestExit],
  );

  const requestHomeNavigation = useCallback((): void => {
    requestExit({ type: "home" });
  }, [requestExit]);

  const requestOpenDocument = useCallback((): void => {
    requestExit({ type: "open" });
  }, [requestExit]);

  const leaveWithoutSaving = (): void => {
    if (pendingExitAction === undefined) return;
    const action = pendingExitAction;
    setPendingExitAction(undefined);
    discardAndExecuteExitAction(action);
  };

  const stayInEditor = (): void => {
    setPendingExitAction(undefined);
  };

  useEffect(() => {
    if (pathname !== "/editor") return undefined;

    const guardSameTabLink = (event: MouseEvent): void => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest<HTMLAnchorElement>("a[href]");
      if (link === null || link.download) return;

      const destinationUrl = new URL(link.href, window.location.href);
      if (destinationUrl.protocol === "javascript:") return;
      const currentUrl = new URL(window.location.href);
      if (destinationUrl.href === currentUrl.href) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      requestNavigation({
        href:
          destinationUrl.origin === currentUrl.origin
            ? `${destinationUrl.pathname}${destinationUrl.search}${destinationUrl.hash}`
            : destinationUrl.href,
        isExternal: destinationUrl.origin !== currentUrl.origin,
        openInNewWindow: link.target === "_blank",
      });
    };

    document.addEventListener("click", guardSameTabLink, true);
    return () => {
      document.removeEventListener("click", guardSameTabLink, true);
    };
  }, [pathname, requestNavigation]);

  useEffect(() => {
    if (pathname !== "/editor") return undefined;

    const guardHistoryNavigation = (): void => {
      const destination = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.history.replaceState({}, "", "/editor");
      window.dispatchEvent(new Event("quickpdf:navigation"));
      requestNavigation({ href: destination, isExternal: false, openInNewWindow: false });
    };

    window.addEventListener("popstate", guardHistoryNavigation);
    return () => {
      window.removeEventListener("popstate", guardHistoryNavigation);
    };
  }, [pathname, requestNavigation]);
  const withReplacementPicker = (page: React.ReactElement): React.ReactElement => (
    <>
      <input
        ref={replacementPickerRef}
        aria-label="Choose a replacement PDF file"
        className="visually-hidden"
        type="file"
        accept="application/pdf,.pdf"
        onChange={handleReplacementFileChange}
      />
      {page}
    </>
  );

  if (bootstrap.status === "checking") {
    return withReplacementPicker(<StartupScreen stage={bootstrap.stage} />);
  }

  if (bootstrap.status === "incompatible") {
    return withReplacementPicker(<BrowserCompatibilityPage compatibility={bootstrap.result} />);
  }

  if (
    pathname === "/pwa-diagnostics" ||
    new URLSearchParams(window.location.search).get("pwa-debug") === "1"
  ) {
    return withReplacementPicker(
      <Shell>
        <PwaDiagnosticsPage bootstrapStatus={bootstrap.status} />
      </Shell>,
    );
  }

  switch (pathname) {
    case "/":
      return withReplacementPicker(
        <Shell>
          <LandingPage
            editor={editor}
            snapshot={snapshot}
            onSnapshotChange={setSnapshot}
            onDocumentOpened={openEditor}
            onReplacementFileConsumed={() => {
              setReplacementFile(undefined);
            }}
            {...(openingMinimumDurationMs === undefined
              ? {}
              : { minimumOpeningDurationMs: openingMinimumDurationMs })}
            {...(replacementFile === undefined ? {} : { replacementFile })}
          />
        </Shell>,
      );
    case "/privacy":
      return withReplacementPicker(
        <Shell hideHeader>
          <PrivacyPolicyPage />
        </Shell>,
      );
    case "/editor":
      if (snapshot.state.status === "empty") {
        return withReplacementPicker(<RedirectToLanding />);
      }
      return withReplacementPicker(
        <Shell hideHeader>
          <EditorPage
            editor={editor}
            snapshot={snapshot}
            onSnapshotChange={setSnapshot}
            pdfRenderer={pdfRenderer}
            onHomeRequest={requestHomeNavigation}
            onOpenRequest={requestOpenDocument}
          />
          {pendingExitAction !== undefined ? (
            <LeaveWithoutSavingDialog onLeave={leaveWithoutSaving} onStay={stayInEditor} />
          ) : null}
        </Shell>,
      );
    default:
      return withReplacementPicker(
        <Shell>
          <NotFoundPage />
        </Shell>,
      );
  }
};
export const App = (props: AppProps): React.ReactElement => (
  <PwaInstallProvider>
    <AppContent {...props} />
  </PwaInstallProvider>
);
