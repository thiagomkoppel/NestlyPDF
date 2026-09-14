import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

import type { EditorSnapshot, PdfEditorApplication } from "../../application/editor-application";
import { formatQuickPdfBuildLabel } from "../../infrastructure/pwa/build-info";
import { usePwaInstall } from "../components/use-pwa-install";

const GITHUB_URL = "https:" + "//github.com/thiagomkoppel/QuickPDF";
const MINIMUM_OPENING_DURATION_MS = 5_000;
const OPENING_STAGES = [
  "Reading PDF...",
  "Preparing pages...",
  "Building workspace...",
  "Opening editor...",
] as const;

interface LandingPageProps {
  readonly editor: PdfEditorApplication;
  readonly snapshot: EditorSnapshot;
  readonly onSnapshotChange: (snapshot: EditorSnapshot) => void;
  readonly onDocumentOpened: () => void;
  readonly replacementFile?: File;
  readonly onReplacementFileConsumed?: () => void;
  readonly minimumOpeningDurationMs?: number;
}

const sleep = (duration: number): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, duration));

export const LandingPage = ({
  editor,
  snapshot,
  onSnapshotChange,
  onDocumentOpened,
  replacementFile,
  onReplacementFileConsumed,
  minimumOpeningDurationMs = MINIMUM_OPENING_DURATION_MS,
}: LandingPageProps): React.ReactElement => {
  const install = usePwaInstall();
  const showInstallCard = install.availability !== "installed";
  const canInstall =
    install.availability === "chromium-prompt" || install.availability === "ios-instructions";
  const inputRef = useRef<HTMLInputElement>(null);
  const consumedReplacementFileRef = useRef<File | undefined>(undefined);
  const dragDepthRef = useRef(0);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [openingStage, setOpeningStage] = useState(0);
  const [openingFileName, setOpeningFileName] = useState<string>();
  const [largeDocumentPageCount, setLargeDocumentPageCount] = useState<number>();
  const [isConvertingDocument, setIsConvertingDocument] = useState(false);
  const [isPhoneLayout, setIsPhoneLayout] = useState(
    () => window.matchMedia("(max-width: 767px)").matches,
  );
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const update = (): void => {
      setIsPhoneLayout(mediaQuery.matches);
    };
    mediaQuery.addEventListener("change", update);
    return () => {
      mediaQuery.removeEventListener("change", update);
    };
  }, []);
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = (): void => {
      setPrefersReducedMotion(mediaQuery.matches);
    };
    mediaQuery.addEventListener("change", update);
    return () => {
      mediaQuery.removeEventListener("change", update);
    };
  }, []);
  useEffect(() => {
    if (!isOpening || prefersReducedMotion) return undefined;
    const timers = [1_250, 2_500, 3_750].map((delay, index) =>
      window.setTimeout(() => {
        setOpeningStage(index + 1);
      }, delay),
    );
    return () => {
      timers.forEach((timer) => {
        window.clearTimeout(timer);
      });
    };
  }, [isOpening, prefersReducedMotion]);

  const openFile = useCallback(
    async (file: File | undefined): Promise<void> => {
      if (file === undefined || isOpening) return;
      dragDepthRef.current = 0;
      setIsDragActive(false);
      setOpeningFileName(file.name);
      setLargeDocumentPageCount(undefined);
      setIsConvertingDocument(false);
      setOpeningStage(0);
      setIsOpening(true);
      const startedAt = performance.now();
      try {
        const nextSnapshot = await editor.openFile(file, (progress) => {
          if (progress.phase === "converting-document") {
            setIsConvertingDocument(true);
            return;
          }
          setIsConvertingDocument(false);
          setLargeDocumentPageCount(progress.pageCount);
          setOpeningStage(3);
        });
        onSnapshotChange(nextSnapshot);
        if (nextSnapshot.state.status !== "ready") return;
        const remaining = Math.max(0, minimumOpeningDurationMs - (performance.now() - startedAt));
        if (remaining > 0) await sleep(remaining);
        setOpeningStage(3);
        onDocumentOpened();
      } finally {
        setIsOpening(false);
      }
    },
    [editor, isOpening, minimumOpeningDurationMs, onDocumentOpened, onSnapshotChange],
  );
  useEffect(() => {
    if (replacementFile === undefined) {
      consumedReplacementFileRef.current = undefined;
      return;
    }
    if (consumedReplacementFileRef.current === replacementFile) return;

    consumedReplacementFileRef.current = replacementFile;
    onReplacementFileConsumed?.();
    void openFile(replacementFile);
  }, [onReplacementFileConsumed, openFile, replacementFile]);
  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    void openFile(event.currentTarget.files?.[0]);
    event.currentTarget.value = "";
  };
  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    const files = event.dataTransfer.files;
    if (files.length !== 1) {
      dragDepthRef.current = 0;
      setIsDragActive(false);
      return;
    }
    void openFile(files[0]);
  };
  const handleDragEnter = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    if (!isOpening && event.dataTransfer.types.includes("Files")) {
      dragDepthRef.current += 1;
      setIsDragActive(true);
    }
  };
  const handleDragLeave = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragActive(false);
  };
  const navigateToPrivacy = (event: MouseEvent<HTMLAnchorElement>): void => {
    event.preventDefault();
    window.history.pushState({}, "", "/privacy");
    window.dispatchEvent(new Event("quickpdf:navigation"));
  };
  const openPicker = (): void => {
    inputRef.current?.click();
  };
  const handlePickerAction = (event: MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation();
    openPicker();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openPicker();
    }
  };

  const isError = snapshot.state.error !== undefined && !isOpening;
  const isPreparingLargeDocument = largeDocumentPageCount !== undefined;
  const visibleOpeningStage = isPreparingLargeDocument || prefersReducedMotion ? 3 : openingStage;
  const openingProgress = `${String((visibleOpeningStage + 1) * 25)}%`;

  return (
    <section className="landing-page" aria-labelledby="landing-title">
      {install.update.status === "available" ? (
        <aside className="pwa-update-banner" aria-live="polite">
          <strong>NestlyPDF update available</strong>
          <span>A new version is ready.</span>
          <button
            type="button"
            onClick={() => {
              install.dismissUpdate();
            }}
          >
            Later
          </button>
          <button
            type="button"
            onClick={() => {
              install.requestUpdate();
            }}
          >
            Update now
          </button>
        </aside>
      ) : null}
      <div className="landing-hero">
        <div aria-hidden="true" className="landing-hero-icon">
          <span />
          <span />
          <span />
        </div>
        <p className="landing-eyebrow">
          <span className="landing-eyebrow-desktop">Private PDF workspace</span>
          <span className="landing-eyebrow-mobile">Private &amp; Secure</span>
        </p>
        <h1 id="landing-title">
          <span className="landing-title-desktop">Edit PDFs privately, right on your device.</span>
          <span className="landing-title-mobile">
            Edit PDFs
            <br />
            privately.
          </span>
        </h1>
        <p className="landing-subtitle">
          <span className="landing-subtitle-desktop">
            Your files never leave your device. No uploads. No accounts. No cloud storage.
          </span>
          <span className="landing-subtitle-mobile">
            No uploads. No accounts. No cloud storage.
          </span>
        </p>
        <input
          ref={inputRef}
          aria-label="Choose a PDF file"
          className="visually-hidden"
          disabled={isOpening}
          type="file"
          accept="application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={handleChange}
        />
        <div
          aria-busy={isOpening}
          aria-describedby="drop-zone-support"
          aria-label="Open a PDF file"
          className={`file-drop${isDragActive ? " is-drag-active" : ""}${isOpening ? " is-opening" : ""}${isError ? " has-error" : ""}`}
          onClick={isOpening ? undefined : openPicker}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={(event) => {
            event.preventDefault();
          }}
          onDrop={handleDrop}
          onKeyDown={isPhoneLayout ? undefined : handleKeyDown}
          role={isPhoneLayout ? undefined : "button"}
          tabIndex={isPhoneLayout || isOpening ? -1 : 0}
        >
          {isOpening ? (
            <span className="file-drop-opening" role="status">
              <span aria-hidden="true" className="landing-loader" />
              <strong>
                {isConvertingDocument
                  ? "Converting your document..."
                  : isPreparingLargeDocument
                    ? "Preparing large PDF..."
                    : OPENING_STAGES[visibleOpeningStage]}
              </strong>
              <span>
                {isConvertingDocument
                  ? "NestlyPDF is converting this Word document to a PDF in your browser."
                  : isPreparingLargeDocument
                    ? `This document has ${largeDocumentPageCount.toLocaleString()} pages. NestlyPDF is preparing it for editing.`
                    : openingFileName}
              </span>
              <span aria-label={`Opening progress ${openingProgress}`} className="opening-progress">
                <i style={{ width: openingProgress }} />
              </span>
              <small>
                {isPreparingLargeDocument
                  ? "Large documents may take a little longer on this device."
                  : "Processing locally in your browser"}
              </small>
            </span>
          ) : (
            <>
              <span aria-hidden="true" className="file-drop-upload-icon">
                <span className="file-drop-upload-arrow">?</span>
                <span className="file-drop-upload-pdf">PDF</span>
              </span>
              <span className="file-drop-copy">
                <strong className="file-drop-desktop-copy">
                  {isDragActive ? "Release to open your PDF" : "Drop your PDF here"}
                </strong>
                <strong className="file-drop-mobile-copy">
                  {isDragActive ? "Release to open your PDF" : "Open a PDF"}
                </strong>
                <span className="file-drop-desktop-copy">
                  {isDragActive
                    ? "Your file stays in this browser session."
                    : "or choose a file from your device"}
                </span>
                <span className="file-drop-mobile-copy">
                  Choose a file from your device to start editing.
                </span>
                <small id="drop-zone-support" className="file-drop-desktop-copy">
                  Your document never leaves this browser session.
                </small>
              </span>
              <span aria-hidden="true" className="file-drop-button">
                Choose File
              </span>
              <div className="file-drop-mobile-actions">
                <button type="button" onClick={handlePickerAction}>
                  Choose PDF
                </button>
                <span>or</span>
                <button type="button" className="file-drop-browse" onClick={handlePickerAction}>
                  Browse files
                </button>
                <small>
                  Your file stays on this device.
                  <br />
                  We never upload or store your documents.
                </small>
              </div>
            </>
          )}
        </div>
        {isError ? (
          <div className="landing-error" role="alert">
            <strong>We could not open that file.</strong>
            <span>{snapshot.state.error.message}</span>
            <button type="button" onClick={openPicker}>
              Try another file
            </button>
          </div>
        ) : null}
        {showInstallCard ? (
          <section aria-labelledby="landing-install-title" className="landing-install-card">
            <span aria-hidden="true" className="landing-install-card__icon">
              <svg fill="none" viewBox="0 0 24 24">
                <path d="M12 3v11" />
                <path d="m7.75 10.25L12 14.5l4.25-4.25" />
                <path d="M5 17.5v1.25A2.25 2.25 0 0 0 7.25 21h9.5A2.25 2.25 0 0 0 19 18.75V17.5" />
              </svg>
            </span>
            <div className="landing-install-card__content">
              <h2 id="landing-install-title">Install NestlyPDF</h2>
              <p>Use NestlyPDF like an app and open it offline.</p>
              <ul>
                <li>Opens quickly</li>
                <li>Launches from your home screen</li>
                <li>Runs like a native application</li>
                <li>Your PDFs always stay on your device</li>
              </ul>
            </div>
            {canInstall ? (
              <button type="button" onClick={() => void install.requestInstall()}>
                Install NestlyPDF
              </button>
            ) : null}
            <small>You only need to install it once.</small>
          </section>
        ) : null}
        <ul aria-label="NestlyPDF privacy promises" className="landing-badges">
          <li>
            <b>?</b>
            <span>
              <strong>Private by design</strong>
              <small className="landing-badge-desktop">Stays in your browser</small>
              <small className="landing-badge-mobile">Your files never leave your browser</small>
            </span>
          </li>
          <li>
            <b>?</b>
            <span>
              <strong className="landing-badge-desktop">Fast &amp; Simple</strong>
              <strong className="landing-badge-mobile">No Uploads</strong>
              <small className="landing-badge-desktop">Edit in seconds</small>
              <small className="landing-badge-mobile">Everything stays on device</small>
            </span>
          </li>
          <li>
            <b>?</b>
            <span>
              <strong className="landing-badge-desktop">Your Control</strong>
              <strong className="landing-badge-mobile">100% Free</strong>
              <small className="landing-badge-desktop">No accounts, no tracking</small>
              <small className="landing-badge-mobile">
                No sign up
                <br />
                No limits
              </small>
            </span>
          </li>
        </ul>
      </div>
      <footer className="landing-footer" id="privacy">
        <span>
          <strong className="landing-footer-desktop">NestlyPDF - Browser-Based PDF Editor</strong>
          <strong className="landing-footer-mobile">Made with privacy in mind</strong>
          <small aria-label="NestlyPDF build" className="landing-version">
            {formatQuickPdfBuildLabel()}
          </small>
        </span>
        <span>
          <a href="/privacy" onClick={navigateToPrivacy}>
            Privacy Policy
          </a>
          <a href={GITHUB_URL} rel="noreferrer" target="_blank">
            GitHub
          </a>
        </span>
      </footer>
    </section>
  );
};
