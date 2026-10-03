import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { createPortal } from "react-dom";

import type {
  DocumentDates,
  EditorSnapshot,
  PdfEditorApplication,
  PdfCompressionLevel,
  PdfCompressionProgress,
  PdfExportMode,
  ExportElement,
  ImageElementInput,
  InitialElementSize,
  SignatureFont,
  SignatureImageInput,
  SignatureElementType,
} from "../../application/editor-application";
import {
  DEFAULT_TEXT_APPEARANCE,
  LARGE_DOCUMENT_PAGE_THRESHOLD,
  MAX_TEXT_FONT_SIZE,
  MIN_ELEMENT_HEIGHT,
  MIN_ELEMENT_WIDTH,
  MIN_TEXT_FONT_SIZE,
  validateImageFile,
  validateSignatureImageFile,
} from "../../application/editor-application";
import type { SignatureBackgroundRemover } from "../../application/signature-background-remover";
import { DocumentDatesDialog } from "../components/DocumentDatesDialog";
import { createCanvasSignatureBackgroundRemover } from "../../infrastructure/browser/canvas-signature-background-remover";
import type { PdfJsPageRenderer } from "../../infrastructure/pdf/pdfjs-page-renderer";
import quickPdfMark from "../assets/brand/quickpdf-mark.svg";
import { calculateViewerFit, type ViewerMode } from "./editor-view-modes";
import { classifyEditorFormFactor, type EditorFormFactor } from "./editor-form-factor";
import {
  renderPixelRatioForProfile,
  resolveEditorPerformanceProfile,
  type EditorPerformanceProfile,
} from "./editor-performance-profile";
import { createThumbnailRenderQueue } from "./thumbnail-render-queue";

interface EditorPageProps {
  readonly editor: PdfEditorApplication;
  readonly snapshot: EditorSnapshot;
  readonly onSnapshotChange: (snapshot: EditorSnapshot) => void;
  readonly pdfRenderer: Pick<PdfJsPageRenderer, "startRenderPage" | "clearCanvas"> &
    Partial<Pick<PdfJsPageRenderer, "startRenderThumbnail">>;
  readonly onOpenRequest?: () => void;
  readonly onHomeRequest?: () => void;
  /** Injectable so tests can run the signature dialog without a real canvas. */
  readonly signatureBackgroundRemover?: SignatureBackgroundRemover;
}

type RenderStatus = "idle" | "loading" | "ready" | "error";
type SignatureDialogMode = "draw" | "type" | "upload";
type TextInspectorTab = "text" | "style" | "page";
type WorkspaceGestureMode =
  | "idle"
  | "pending-pan"
  | "panning"
  | "pinching"
  | "moving-overlay"
  | "resizing-overlay"
  | "drawing-whiteout";

type PointerAction =
  | {
      readonly kind: "move";
      readonly elementId: string;
      readonly offsetX: number;
      readonly offsetY: number;
      readonly startBounds: ExportElement["bounds"];
    }
  | {
      readonly kind: "resize";
      readonly elementId: string;
      readonly type: ExportElement["type"];
      readonly startBounds: ExportElement["bounds"];
      readonly startFontSize?: number;
    };

interface ResizePreview {
  readonly bounds: ExportElement["bounds"];
  readonly fontSize?: number;
}

interface VisualResizePreview extends ResizePreview {
  readonly elementId: string;
}

interface MovePreview {
  readonly bounds: ExportElement["bounds"];
}

interface WorkspacePan {
  readonly pointerId: number;
  readonly startClientX: number;
  readonly startClientY: number;
  readonly startScrollLeft: number;
  readonly startScrollTop: number;
  hasMoved: boolean;
}

interface PinchZoom {
  readonly startDistance: number;
  readonly startZoom: number;
}

interface WhiteoutDraft {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly currentX: number;
  readonly currentY: number;
}

interface RenderState {
  readonly status: RenderStatus;
  readonly message?: string;
}

const MIN_ZOOM = 0.5;
const MIN_MOBILE_ZOOM = 0.1;
const MOBILE_TEXT_SIZE: InitialElementSize = { width: 200, height: 52 };
const MOBILE_DATE_SIZE: InitialElementSize = { width: 144, height: 40 };
const MOBILE_MARK_SIZE = 44;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;
const MIN_WHITEOUT_DRAG_DISTANCE = 4;
const LARGE_DOCUMENT_THUMBNAIL_LIMIT = 20;
const LARGE_DOCUMENT_THUMBNAIL_OVERSCAN = 4;
const THUMBNAIL_RENDER_CONCURRENCY = 4;
const thumbnailRenderQueue = createThumbnailRenderQueue(THUMBNAIL_RENDER_CONCURRENCY);
const SIGNATURE_FONTS: readonly { readonly value: SignatureFont; readonly label: string }[] = [
  { value: "cursive", label: "Signature Script" },
  { value: "serif", label: "Serif Italic" },
  { value: "marker", label: "Marker" },
  { value: "hand", label: "Handwritten" },
];

type ToolbarIconName =
  | "open"
  | "download"
  | "undo"
  | "redo"
  | "copy"
  | "paste"
  | "select"
  | "text"
  | "whiteout"
  | "image"
  | "signature"
  | "initials"
  | "checkmark"
  | "cross"
  | "date"
  | "calendar-clock"
  | "zoom-out"
  | "zoom-in"
  | "fit"
  | "previous"
  | "next"
  | "more"
  | "menu"
  | "eye"
  | "eye-off"
  | "lock"
  | "unlock";

const ToolbarIcon = ({ name }: { readonly name: ToolbarIconName }): React.ReactElement => {
  const svg = (children: React.ReactNode): React.ReactElement => (
    <svg
      aria-hidden="true"
      className="toolbar-icon"
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.9"
      viewBox="0 0 24 24"
    >
      {children}
    </svg>
  );

  switch (name) {
    case "menu":
      return svg(
        <>
          <path d="M4 6.5h16" />
          <path d="M4 12h16" />
          <path d="M4 17.5h16" />
        </>,
      );
    case "eye":
      return svg(
        <>
          <path d="M2.75 12s3.3-5 9.25-5 9.25 5 9.25 5-3.3 5-9.25 5S2.75 12 2.75 12Z" />
          <circle cx="12" cy="12" r="2.25" />
        </>,
      );
    case "eye-off":
      return svg(
        <>
          <path d="M3.3 3.3 20.7 20.7" />
          <path d="M6.2 6.1C4.05 7.55 2.75 9.55 2.75 12c0 0 3.3 5 9.25 5 1.35 0 2.58-.26 3.67-.7" />
          <path d="M9.7 7.25A5.64 5.64 0 0 1 12 7c5.95 0 9.25 5 9.25 5a10.83 10.83 0 0 1-3.37 3.53" />
          <path d="M9.93 9.93A3 3 0 0 0 14.07 14.07" />
        </>,
      );
    case "lock":
      return svg(
        <>
          <rect x="5" y="10" width="14" height="10" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </>,
      );
    case "unlock":
      return svg(
        <>
          <rect x="5" y="10" width="14" height="10" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 7.15-2.45" />
        </>,
      );
    case "open":
      return svg(
        <path d="M3.5 6.5h6l1.7 2H20.5v9.8a2.2 2.2 0 0 1-2.2 2.2H5.7a2.2 2.2 0 0 1-2.2-2.2V6.5Z" />,
      );
    case "download":
      return svg(
        <>
          <path d="M12 3.5v10" />
          <path d="m8.2 10.2 3.8 3.8 3.8-3.8" />
          <path d="M4.5 17.5v2h15v-2" />
        </>,
      );
    case "undo":
      return svg(
        <>
          <path d="M9 7 5 11l4 4" />
          <path d="M5.5 11H15a4.5 4.5 0 0 1 4.5 4.5" />
        </>,
      );
    case "redo":
      return svg(
        <>
          <path d="m15 7 4 4-4 4" />
          <path d="M18.5 11H9a4.5 4.5 0 0 0-4.5 4.5" />
        </>,
      );
    case "copy":
      return svg(
        <>
          <rect x="8" y="8" width="11" height="12" rx="1.5" />
          <path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v10A1.5 1.5 0 0 0 5.5 17H8" />
        </>,
      );
    case "paste":
      return svg(
        <>
          <path d="M9 5.5h6" />
          <path d="M10 4h4v3h-4z" />
          <path d="M6 6.5h-.5A1.5 1.5 0 0 0 4 8v10.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V8A1.5 1.5 0 0 0 18.5 6.5H18" />
          <path d="M8 12h8M8 16h6" />
        </>,
      );
    case "select":
      return svg(<path d="m5 3 13 8-6.2 1.4L9.5 19 5 3Z" />);
    case "text":
      return svg(
        <>
          <path d="M5 5h14" />
          <path d="M12 5v14" />
        </>,
      );
    case "whiteout":
      return svg(
        <>
          <path d="m7 16.5 8.8-8.8 2.7 2.7-8.8 8.8-4.2.8z" />
          <path d="m14.4 6.4 2-2a1.9 1.9 0 0 1 2.7 2.7l-2 2" />
          <path d="M4 20.5h16" />
        </>,
      );
    case "image":
      return svg(
        <>
          <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
          <circle cx="9" cy="9" r="1.5" />
          <path d="m4.5 17 4.8-4.8 3.4 3.2 2.4-2.3 4.4 3.9" />
        </>,
      );
    case "signature":
      return svg(
        <>
          <path d="M4 17.5c2.2-3.6 3.5-5.4 4.5-5.4 1.8 0 .1 5.2 1.8 5.2 1.3 0 2.8-4 4.1-4 1.2 0 .3 3.4 1.7 3.4 1.1 0 2.2-1.5 4-4.1" />
          <path d="M16.7 5.7 19.5 3l1.5 1.5-2.8 2.8" />
        </>,
      );
    case "initials":
      return svg(
        <>
          <path d="M4.5 18 8 6l3.5 12" />
          <path d="M6 13h4" />
          <path d="M15 6h4.5l-4.5 12H20" />
        </>,
      );
    case "checkmark":
      return svg(<path d="m4.5 12.5 4.6 4.6L19.5 6.8" />);
    case "cross":
      return svg(
        <>
          <path d="m6 6 12 12" />
          <path d="M18 6 6 18" />
        </>,
      );
    case "date":
      return svg(
        <>
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M8 3.5v3M16 3.5v3M4 9h16M8 13h3M8 16h5" />
        </>,
      );
    case "calendar-clock":
      return svg(
        <>
          <path d="M20.5 11.5V6.9a1.4 1.4 0 0 0-1.4-1.4H4.9a1.4 1.4 0 0 0-1.4 1.4v12.2a1.4 1.4 0 0 0 1.4 1.4h6.6" />
          <path d="M3.5 9.6h17" />
          <path d="M8 3.5v3.4" />
          <path d="M16 3.5v3.4" />
          <circle cx="17.4" cy="17.4" r="4.1" />
          <path d="M17.4 15.4v2.1l1.4 1" />
        </>,
      );
    case "zoom-out":
      return svg(
        <>
          <circle cx="10.5" cy="10.5" r="5.5" />
          <path d="M14.7 14.7 20 20M8 10.5h5" />
        </>,
      );
    case "zoom-in":
      return svg(
        <>
          <circle cx="10.5" cy="10.5" r="5.5" />
          <path d="M14.7 14.7 20 20M8 10.5h5M10.5 8v5" />
        </>,
      );
    case "fit":
      return svg(
        <>
          <path d="M8.5 4H4v4.5M15.5 4H20v4.5M20 15.5V20h-4.5M4 15.5V20h4.5" />
          <rect x="8" y="7" width="8" height="10" rx="1" />
        </>,
      );
    case "previous":
      return svg(<path d="m14.5 5-7 7 7 7" />);
    case "next":
      return svg(<path d="m9.5 5 7 7-7 7" />);
    case "more":
      return svg(
        <>
          <circle cx="5" cy="12" r="1" fill="currentColor" />
          <circle cx="12" cy="12" r="1" fill="currentColor" />
          <circle cx="19" cy="12" r="1" fill="currentColor" />
        </>,
      );
  }
};
const clampZoom = (value: number, minimum = MIN_ZOOM): number =>
  Math.min(MAX_ZOOM, Math.max(minimum, value));

const boundsStyle = (
  bounds: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  },
  scale: number,
): React.CSSProperties => ({
  left: bounds.x * scale,
  top: bounds.y * scale,
  width: bounds.width * scale,
  height: bounds.height * scale,
});

const aspectRatioResizePreviewBounds = (
  startBounds: ExportElement["bounds"],
  bounds: ExportElement["bounds"],
): ExportElement["bounds"] => {
  const ratio = startBounds.width / startBounds.height;
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return bounds;
  }
  const widthDelta = Math.abs(bounds.width - startBounds.width);
  const heightDelta = Math.abs(bounds.height - startBounds.height);
  const withAspect =
    heightDelta > widthDelta
      ? { ...bounds, width: bounds.height * ratio }
      : { ...bounds, height: bounds.width / ratio };
  return {
    ...withAspect,
    width: Math.max(MIN_ELEMENT_WIDTH, withAspect.width),
    height: Math.max(MIN_ELEMENT_HEIGHT, withAspect.height),
  };
};

const isTextResizeType = (type: ExportElement["type"]): boolean => type === "date";

const usesLocalVisualResizePreview = (type: ExportElement["type"]): boolean =>
  type === "image" || type === "checkmark" || type === "cross" || type === "date";
const signatureTextClass = (fontFamily: string | undefined): string =>
  `signature-text signature-font-${fontFamily ?? "cursive"}`;

const defaultPlacement = (
  type: SignatureElementType,
): { readonly x: number; readonly y: number } =>
  type === "signature" ? { x: 56, y: 250 } : { x: 56, y: 180 };
const isMeaningfulWhiteoutDrag = (draft: WhiteoutDraft): boolean =>
  Math.abs(draft.currentX - draft.startX) >= MIN_WHITEOUT_DRAG_DISTANCE &&
  Math.abs(draft.currentY - draft.startY) >= MIN_WHITEOUT_DRAG_DISTANCE;

const whiteoutBoundsFromDraft = (
  draft: WhiteoutDraft,
  page: { readonly width: number; readonly height: number },
  enforceMinimum: boolean,
): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } => {
  const left = Math.min(draft.startX, draft.currentX);
  const top = Math.min(draft.startY, draft.currentY);
  const rawWidth = Math.abs(draft.currentX - draft.startX);
  const rawHeight = Math.abs(draft.currentY - draft.startY);
  const x = Math.min(Math.max(left, 0), page.width);
  const y = Math.min(Math.max(top, 0), page.height);
  const width = Math.min(
    Math.max(enforceMinimum ? MIN_ELEMENT_WIDTH : 1, rawWidth),
    Math.max(0, page.width - x),
  );
  const height = Math.min(
    Math.max(enforceMinimum ? MIN_ELEMENT_HEIGHT : 1, rawHeight),
    Math.max(0, page.height - y),
  );
  return { x, y, width, height };
};

const canvasToImageInput = (
  canvas: HTMLCanvasElement,
  source: "draw" | "upload",
): SignatureImageInput => ({
  dataUrl: canvas.toDataURL("image/png"),
  mimeType: "image/png",
  width: canvas.width,
  height: canvas.height,
  source,
});

const elementLabel = (element: ExportElement): string => {
  switch (element.type) {
    case "text":
      return "Text";
    case "whiteout":
      return "Whiteout";
    case "signature":
      return "Signature";
    case "initials":
      return "Initials";
    case "image":
      return "Image";
    case "checkmark":
      return "Checkmark";
    case "cross":
      return "Cross";
    case "date":
      return "Date";
  }
};

interface LayersPanelProps {
  readonly layers: readonly ExportElement[];
  readonly selectedElementId?: string | undefined;
  readonly onSelect: (elementId: string) => void;
  readonly onReorder: (elementId: string, targetIndex: number) => void;
  readonly onSetAllVisible: (visible: boolean) => void;
  readonly onSetAllLocked: (locked: boolean) => void;
  readonly onSetVisible: (elementId: string, visible: boolean) => void;
  readonly onSetLocked: (elementId: string, locked: boolean) => void;
}

const LayersPanel = ({
  layers,
  selectedElementId,
  onSelect,
  onReorder,
  onSetAllVisible,
  onSetAllLocked,
  onSetVisible,
  onSetLocked,
}: LayersPanelProps) => {
  const [draggedLayerId, setDraggedLayerId] = useState<string | undefined>();
  const selectedIndex = layers.findIndex((element) => element.id === selectedElementId);
  const hasVisibleLayer = layers.some((element) => element.visible ?? true);
  const hasUnlockedLayer = layers.some((element) => !element.locked);

  return (
    <div className="element-inspector__layers-region" data-testid="inspector-layers-region">
      <section className="layers-panel" aria-label="Layers">
        <h2>Layer</h2>
        <div className="layers-panel-header">
          <div className="layers-order-actions" aria-label="Layer order controls">
            {[
              ["Bring to front", 0],
              ["Move up", -1],
              ["Move down", 1],
              ["Send to back", layers.length - 1],
            ].map(([label, value]) => {
              const targetIndex =
                typeof value === "number" && value >= 0
                  ? value
                  : Math.min(layers.length - 1, Math.max(0, selectedIndex + Number(value)));
              return (
                <button
                  key={String(label)}
                  type="button"
                  aria-label={String(label)}
                  disabled={selectedIndex < 0 || selectedIndex === targetIndex}
                  onClick={() => {
                    if (selectedElementId !== undefined) {
                      onReorder(selectedElementId, targetIndex);
                    }
                  }}
                >
                  {label === "Bring to front"
                    ? "\u21c8"
                    : label === "Move up"
                      ? "\u2303"
                      : label === "Move down"
                        ? "\u2304"
                        : "\u21ca"}
                </button>
              );
            })}
          </div>
        </div>
        <ol className="layers-list">
          {layers.map((element, index) => (
            <li
              key={element.id}
              className={element.id === selectedElementId ? "is-selected" : undefined}
              draggable
              onDragStart={() => {
                setDraggedLayerId(element.id);
              }}
              onDragOver={(event) => {
                event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (draggedLayerId !== undefined) {
                  onReorder(draggedLayerId, index);
                }
                setDraggedLayerId(undefined);
              }}
              onDragEnd={() => {
                setDraggedLayerId(undefined);
              }}
            >
              <div
                role="button"
                tabIndex={0}
                className="layer-row-content"
                aria-label={`${elementLabel(element)} layer`}
                onClick={() => {
                  onSelect(element.id);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(element.id);
                  }
                }}
              >
                <span className="layer-row-grip" aria-hidden="true">
                  {"\u22ee\u22ee"}
                </span>
                <span className="layer-row-icon" aria-hidden="true">
                  {element.type === "text" || element.type === "date"
                    ? "T"
                    : element.type === "checkmark"
                      ? "\u2713"
                      : element.type === "cross"
                        ? "\u00d7"
                        : "\u25eb"}
                </span>
                <span className="layer-row-copy">
                  <strong>{element.text?.split(/\r?\n/)[0] ?? elementLabel(element)}</strong>
                  <small>{elementLabel(element)}</small>
                </span>
              </div>
              <div
                className="layer-row-actions"
                aria-label={`${elementLabel(element)} layer actions`}
              >
                <button
                  type="button"
                  className={`layer-row-action${(element.visible ?? true) ? "" : " is-hidden"}`}
                  aria-label={`${(element.visible ?? true) ? "Hide" : "Show"} ${elementLabel(element)} layer`}
                  title={`${(element.visible ?? true) ? "Hide" : "Show"} layer`}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                  }}
                  onDragStart={(event) => {
                    event.preventDefault();
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSetVisible(element.id, !(element.visible ?? true));
                  }}
                >
                  <ToolbarIcon name={(element.visible ?? true) ? "eye" : "eye-off"} />
                </button>
                <button
                  type="button"
                  className={`layer-row-action${element.locked ? " is-locked" : ""}`}
                  aria-label={`${element.locked ? "Unlock" : "Lock"} ${elementLabel(element)} layer`}
                  title={`${element.locked ? "Unlock" : "Lock"} layer`}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                  }}
                  onDragStart={(event) => {
                    event.preventDefault();
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSetLocked(element.id, !element.locked);
                  }}
                >
                  <ToolbarIcon name={element.locked ? "lock" : "unlock"} />
                </button>
              </div>
            </li>
          ))}
        </ol>
        <h3 className="layers-actions-heading">Layer Actions</h3>
        <div className="layers-bulk-actions">
          <button
            type="button"
            disabled={layers.length === 0}
            onClick={() => {
              onSetAllVisible(!hasVisibleLayer);
            }}
          >
            {layers.length === 0 || hasVisibleLayer ? "Hide All" : "Show All"}
          </button>
          <button
            type="button"
            disabled={layers.length === 0}
            onClick={() => {
              onSetAllLocked(hasUnlockedLayer);
            }}
          >
            {layers.length === 0 || hasUnlockedLayer ? "Lock All" : "Unlock All"}
          </button>
        </div>
        <div className="layers-help">
          <strong>How layers work</strong>
          <p>Items higher in the list appear in front. Drag and drop to reorder layers.</p>
        </div>
      </section>
    </div>
  );
};
interface OptionalPointerCaptureTarget {
  readonly hasPointerCapture?: (pointerId: number) => boolean;
  readonly setPointerCapture?: (pointerId: number) => void;
  readonly releasePointerCapture?: (pointerId: number) => void;
}

const capturePointer = (target: HTMLElement, pointerId: number | undefined): void => {
  if (pointerId === undefined) {
    return;
  }
  (target as unknown as OptionalPointerCaptureTarget).setPointerCapture?.(pointerId);
};

const releasePointer = (target: HTMLElement, pointerId: number | undefined): void => {
  if (pointerId === undefined) {
    return;
  }
  const pointerTarget = target as unknown as OptionalPointerCaptureTarget;
  if (pointerTarget.hasPointerCapture?.(pointerId) ?? false) {
    pointerTarget.releasePointerCapture?.(pointerId);
  }
};
const isEditingKeyboardTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable ||
    target.closest("[contenteditable='true'], [contenteditable='plaintext-only']") !== null ||
    (target instanceof HTMLCanvasElement && target.classList.contains("signature-pad"))
  );
};

interface PageThumbnailProps {
  readonly renderer: Pick<PdfJsPageRenderer, "clearCanvas"> &
    Partial<Pick<PdfJsPageRenderer, "startRenderThumbnail">>;
  readonly documentId: string | undefined;
  readonly pageNumber: number;
  readonly pageId: string;
  readonly current: boolean;
  readonly renderEnabled: boolean;
  readonly onSelect: (pageId: string) => void;
  readonly maxWidth: number;
  readonly devicePixelRatio: number;
}

interface ReleaseColorInputProps {
  readonly ariaLabel: string;
  readonly value: string;
  readonly onPreview: (color: string) => void;
  readonly onCommit: (color: string) => void;
}

const ReleaseColorInput = ({
  ariaLabel,
  value,
  onPreview,
  onCommit,
}: ReleaseColorInputProps): React.ReactElement => {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (input === null) {
      return;
    }
    const handleNativeChange = (): void => {
      onCommit(input.value);
    };
    input.addEventListener("change", handleNativeChange);
    return () => {
      input.removeEventListener("change", handleNativeChange);
    };
  }, [onCommit]);

  return (
    <input
      ref={inputRef}
      aria-label={ariaLabel}
      type="color"
      value={value}
      onInput={(event) => {
        onPreview(event.currentTarget.value);
      }}
    />
  );
};
const PageThumbnail = ({
  renderer,
  documentId,
  pageNumber,
  pageId,
  current,
  renderEnabled,
  onSelect,
  maxWidth,
  devicePixelRatio,
}: PageThumbnailProps): React.ReactElement => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<RenderStatus>("loading");
  useEffect(() => {
    const canvas = canvasRef.current;
    if (
      !renderEnabled ||
      canvas === null ||
      documentId === undefined ||
      renderer.startRenderThumbnail === undefined
    ) {
      return;
    }
    setStatus("loading");
    const startRenderThumbnail = renderer.startRenderThumbnail.bind(renderer);
    const handle = thumbnailRenderQueue.enqueue(() =>
      startRenderThumbnail({
        documentId,
        pageNumber,
        maxWidth,
        devicePixelRatio,
        canvas,
      }),
    );
    void handle.promise.then((result) => {
      if (result.ok) {
        setStatus("ready");
      } else if (!result.cancelled) {
        setStatus("error");
      }
    });
    return () => {
      handle.cancel();
      renderer.clearCanvas(canvas);
    };
  }, [devicePixelRatio, documentId, maxWidth, pageNumber, renderEnabled, renderer]);
  return (
    <button
      type="button"
      className={`page-rail-thumbnail${current ? " is-current" : ""}`}
      aria-label={`${current ? "Current " : ""}page ${String(pageNumber)}`}
      aria-current={current ? "page" : undefined}
      onClick={() => {
        onSelect(pageId);
      }}
    >
      <span className="page-thumbnail-canvas-wrap" aria-hidden="true">
        {renderEnabled ? <canvas ref={canvasRef} className="page-thumbnail-canvas" /> : null}
        {renderEnabled && status === "loading" ? (
          <span className="page-thumbnail-skeleton" />
        ) : null}
      </span>
      <span>{String(pageNumber)}</span>
    </button>
  );
};

interface ThumbnailRenderRange {
  readonly start: number;
  readonly end: number;
}

interface ThumbnailRenderWindow {
  readonly documentId: string | undefined;
  readonly currentPageId: string | undefined;
  readonly pageCount: number;
  readonly range: ThumbnailRenderRange;
}

const thumbnailRangeAround = (pageIndex: number, pageCount: number): ThumbnailRenderRange => {
  const maximumStart = Math.max(0, pageCount - LARGE_DOCUMENT_THUMBNAIL_LIMIT);
  const start = Math.min(maximumStart, Math.max(0, pageIndex - LARGE_DOCUMENT_THUMBNAIL_OVERSCAN));
  return {
    start,
    end: Math.min(pageCount, start + LARGE_DOCUMENT_THUMBNAIL_LIMIT),
  };
};

const readEditorFormFactor = (): EditorFormFactor => {
  if (typeof window === "undefined") {
    return "desktop";
  }

  if (typeof window.matchMedia === "function" && window.matchMedia("(max-width: 767px)").matches) {
    return "phone";
  }

  const visualViewport = window.visualViewport;
  const width = visualViewport?.width ?? window.innerWidth;
  const height = visualViewport?.height ?? window.innerHeight;
  const coarsePointer =
    typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;

  return classifyEditorFormFactor({
    width,
    height,
    hasCoarsePointer: coarsePointer,
    maxTouchPoints: navigator.maxTouchPoints,
  });
};

const useEditorFormFactor = (): EditorFormFactor => {
  const [formFactor, setFormFactor] = useState(readEditorFormFactor);

  useEffect(() => {
    const update = (): void => {
      const next = readEditorFormFactor();
      setFormFactor((current) => (current === next ? current : next));
    };
    const coarsePointer = window.matchMedia("(pointer: coarse)");
    const visualViewport = window.visualViewport;

    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    coarsePointer.addEventListener("change", update);
    if (visualViewport) {
      visualViewport.addEventListener("resize", update);
    }
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      coarsePointer.removeEventListener("change", update);
      if (visualViewport) {
        visualViewport.removeEventListener("resize", update);
      }
    };
  }, []);

  return formFactor;
};

const readPerformanceDeviceDetails = (): Readonly<{
  hardwareConcurrency: number | undefined;
  deviceMemory: number | undefined;
}> => {
  const navigatorWithDeviceMemory = navigator as Navigator &
    Readonly<{ readonly deviceMemory?: number }>;
  const hardwareConcurrency = navigator.hardwareConcurrency;
  const deviceMemory = navigatorWithDeviceMemory.deviceMemory;

  return {
    hardwareConcurrency:
      Number.isFinite(hardwareConcurrency) && hardwareConcurrency > 0
        ? hardwareConcurrency
        : undefined,
    deviceMemory:
      Number.isFinite(deviceMemory) && (deviceMemory ?? 0) > 0 ? deviceMemory : undefined,
  };
};

export const EditorPage = ({
  editor,
  snapshot,
  onSnapshotChange,
  pdfRenderer,
  onOpenRequest,
  onHomeRequest,
  signatureBackgroundRemover,
}: EditorPageProps): React.ReactElement => {
  const backgroundRemover = useMemo(
    () => signatureBackgroundRemover ?? createCanvasSignatureBackgroundRemover(),
    [signatureBackgroundRemover],
  );
  const editorFormFactor = useEditorFormFactor();
  const isPhoneQuickEditViewport = editorFormFactor === "phone";
  const isTabletQuickEditViewport =
    editorFormFactor === "tablet-portrait" || editorFormFactor === "tablet-landscape";
  const isCompactEditorViewport = isPhoneQuickEditViewport || isTabletQuickEditViewport;
  const usesInspectorSheet = isCompactEditorViewport;
  /** PDF date editing is a desktop tool: the pickers and the status bar row need pointer layouts. */
  const isDesktopEditorViewport = editorFormFactor === "desktop";
  const [performanceProfile, setPerformanceProfile] =
    useState<EditorPerformanceProfile>("automatic");
  const effectivePerformanceProfile = resolveEditorPerformanceProfile(performanceProfile, {
    formFactor: editorFormFactor,
    ...readPerformanceDeviceDetails(),
  });
  const renderPixelRatio = renderPixelRatioForProfile(
    effectivePerformanceProfile,
    window.devicePixelRatio,
  );
  const state = snapshot.state;
  const currentPage = state.currentPage;
  const currentPageId = currentPage?.id;
  const currentPageWidth = currentPage?.width;
  const currentPageHeight = currentPage?.height;
  const currentPageRotation = currentPage?.rotation;
  const isLargeDocument = state.pageCount >= LARGE_DOCUMENT_PAGE_THRESHOLD;
  const currentPageLayers = useMemo(
    () => state.elements.filter((element) => element.pageId === currentPageId).reverse(),
    [state.elements, currentPageId],
  );
  const editorViewportRef = useRef<HTMLElement | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayLayerRef = useRef<HTMLDivElement | null>(null);
  const pageRailListRef = useRef<HTMLDivElement | null>(null);
  const renderSequenceRef = useRef(0);
  const [zoom, setZoom] = useState(1);
  const [viewMode, setViewMode] = useState<ViewerMode>("fit-page");
  const [isPageRailCollapsed, setIsPageRailCollapsed] = useState(false);
  const [isMobilePageRailOpen, setIsMobilePageRailOpen] = useState(false);
  const [isMobileInspectorOpen, setIsMobileInspectorOpen] = useState(false);
  const isInspectorSheetOpen = isMobileInspectorOpen;
  const [isMobileMoreOpen, setIsMobileMoreOpen] = useState(false);
  const [isQuickEditNoticeDismissed, setIsQuickEditNoticeDismissed] = useState(false);
  const zoomRef = useRef(1);
  const hasManualZoomRef = useRef(false);
  const mobileFitDocumentIdRef = useRef<string | undefined>(undefined);
  const lastRenderDocumentIdRef = useRef<string | undefined>(state.renderDocumentId);
  const [renderState, setRenderState] = useState<RenderState>({ status: "idle" });
  const currentPageThumbnailRange = thumbnailRangeAround(
    Math.max(0, state.currentPageNumber - 1),
    state.pageCount,
  );
  const [scrolledThumbnailWindow, setScrolledThumbnailWindow] = useState<ThumbnailRenderWindow>(
    () => ({
      documentId: state.renderDocumentId,
      currentPageId,
      pageCount: state.pageCount,
      range: currentPageThumbnailRange,
    }),
  );
  const thumbnailRenderRange =
    scrolledThumbnailWindow.documentId === state.renderDocumentId &&
    scrolledThumbnailWindow.currentPageId === currentPageId &&
    scrolledThumbnailWindow.pageCount === state.pageCount
      ? scrolledThumbnailWindow.range
      : currentPageThumbnailRange;
  const [thumbnailRowStride, setThumbnailRowStride] = useState(216);

  const [isDocumentDatesDialogOpen, setIsDocumentDatesDialogOpen] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportMode, setExportMode] = useState<PdfExportMode>("original");
  const [compressionLevel, setCompressionLevel] = useState<PdfCompressionLevel>("balanced");
  const [exportFilename, setExportFilename] = useState("");
  const [compressionProgress, setCompressionProgress] = useState<
    PdfCompressionProgress | undefined
  >();
  const exportAbortRef = useRef<AbortController | undefined>(undefined);
  const [dialogType, setDialogType] = useState<SignatureElementType | undefined>();
  const [pendingImage, setPendingImage] = useState<ImageElementInput | undefined>();
  const [imageUploadError, setImageUploadError] = useState<string | undefined>();
  const [pointerAction, setPointerAction] = useState<PointerAction | undefined>();
  const [whiteoutDraft, setWhiteoutDraft] = useState<WhiteoutDraft | undefined>();
  const [editingTextElementId, setEditingTextElementId] = useState<string | undefined>();
  const [textInspectorTab, setTextInspectorTab] = useState<TextInspectorTab>("text");
  const [imageInspectorTab, setImageInspectorTab] = useState<TextInspectorTab>("text");
  const [colorPreviewByElementId, setColorPreviewByElementId] = useState<
    ReadonlyMap<string, string>
  >(new Map());
  const colorPreviewRef = useRef<{ readonly elementId: string; readonly color: string } | null>(
    null,
  );
  const [visualResizePreview, setVisualResizePreviewState] = useState<
    VisualResizePreview | undefined
  >();
  const editingTextAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const textFocusRetryRef = useRef<number | undefined>(undefined);
  const resizePreviewRef = useRef<ResizePreview | undefined>(undefined);
  const resizeFrameRef = useRef<number | undefined>(undefined);
  const pendingVisualResizePreviewRef = useRef<VisualResizePreview | undefined>(undefined);
  const movePreviewRef = useRef<MovePreview | undefined>(undefined);
  const moveFrameRef = useRef<number | undefined>(undefined);
  const pendingMovePreviewRef = useRef<
    { readonly elementId: string; readonly x: number; readonly y: number } | undefined
  >(undefined);
  const moveCancelRef = useRef<(() => void) | undefined>(undefined);
  const workspacePanRef = useRef<WorkspacePan | undefined>(undefined);
  const touchPointsRef = useRef(new Map<number, { readonly x: number; readonly y: number }>());
  const pinchZoomRef = useRef<PinchZoom | undefined>(undefined);
  const workspaceGestureModeRef = useRef<WorkspaceGestureMode>("idle");
  const suppressWorkspaceClickRef = useRef(false);
  const [isWorkspacePanning, setIsWorkspacePanning] = useState(false);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const mobileMoreButtonRef = useRef<HTMLButtonElement | null>(null);
  const mobileMoreSheetRef = useRef<HTMLElement | null>(null);

  const getMobileInsertionPoint = useCallback(
    (type: SignatureElementType): { readonly x: number; readonly y: number } => {
      if (!isCompactEditorViewport || currentPage === undefined) {
        return defaultPlacement(type);
      }
      const workspace = workspaceRef.current;
      const page = overlayLayerRef.current;
      if (workspace === null || page === null || zoom <= 0) {
        return defaultPlacement(type);
      }
      const workspaceRect = workspace.getBoundingClientRect();
      const pageRect = page.getBoundingClientRect();
      const left = Math.max(workspaceRect.left, pageRect.left);
      const right = Math.min(workspaceRect.right, pageRect.right);
      const top = Math.max(workspaceRect.top, pageRect.top);
      const bottom = Math.min(workspaceRect.bottom, pageRect.bottom);
      if (right <= left || bottom <= top) {
        return defaultPlacement(type);
      }
      const defaultWidth = type === "signature" ? 180 : 96;
      const defaultHeight = type === "signature" ? 64 : 40;
      return {
        x:
          Math.min(
            Math.max((left + right) / 2 - pageRect.left, (defaultWidth * zoom) / 2),
            currentPage.width * zoom - (defaultWidth * zoom) / 2,
          ) / zoom,
        y:
          Math.min(
            Math.max((top + bottom) / 2 - pageRect.top, (defaultHeight * zoom) / 2),
            currentPage.height * zoom - (defaultHeight * zoom) / 2,
          ) / zoom,
      };
    },
    [currentPage, isCompactEditorViewport, zoom],
  );
  useEffect(() => {
    if (!isCompactEditorViewport || !isMobileMoreOpen) {
      return undefined;
    }
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsMobileMoreOpen(false);
      }
    };
    const trigger = mobileMoreButtonRef.current;
    window.addEventListener("keydown", closeOnEscape);
    requestAnimationFrame(() => {
      mobileMoreSheetRef.current?.focus();
    });
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      trigger?.focus();
    };
  }, [isCompactEditorViewport, isMobileMoreOpen]);

  const applySnapshot = useCallback(
    (nextSnapshot: EditorSnapshot): void => {
      setColorPreviewByElementId((current) => {
        if (current.size === 0) {
          return current;
        }
        const committedColors = new Map(
          nextSnapshot.state.elements.map((element) => [
            element.id,
            element.color ?? element.textAppearance?.color ?? "#000000",
          ]),
        );
        let changed = false;
        const next = new Map(current);
        for (const [elementId, previewColor] of current) {
          if (committedColors.get(elementId) !== previewColor) {
            next.delete(elementId);
            changed = true;
          }
        }
        return changed ? next : current;
      });
      onSnapshotChange(nextSnapshot);
    },
    [onSnapshotChange],
  );

  const openInspectorSheet = useCallback((): void => {
    setIsMobileInspectorOpen(true);
  }, []);

  const cycleInspectorSheet = useCallback((): void => {
    setIsMobileInspectorOpen((open) => !open);
  }, []);
  const selectElementForInspector = useCallback(
    (elementId: string): void => {
      applySnapshot(editor.selectElement(elementId));
      openInspectorSheet();
    },
    [applySnapshot, editor, openInspectorSheet],
  );
  const handleColorPreview = useCallback((elementId: string, color: string): void => {
    colorPreviewRef.current = { elementId, color };
    setColorPreviewByElementId((current) => {
      const next = new Map(current);
      next.set(elementId, color);
      return next;
    });
  }, []);

  const handleColorCommit = useCallback(
    (elementId: string, color: string): void => {
      colorPreviewRef.current = null;
      handleColorPreview(elementId, color);
      colorPreviewRef.current = null;
      applySnapshot(editor.updateElementColor(elementId, color));
    },
    [applySnapshot, editor, handleColorPreview],
  );

  const commitPendingColor = useCallback((): void => {
    const pendingColor = colorPreviewRef.current;
    if (pendingColor === null) {
      return;
    }
    handleColorCommit(pendingColor.elementId, pendingColor.color);
  }, [handleColorCommit]);
  const cancelResizeFrame = useCallback((): void => {
    if (resizeFrameRef.current !== undefined) {
      window.cancelAnimationFrame(resizeFrameRef.current);
      resizeFrameRef.current = undefined;
    }
    pendingVisualResizePreviewRef.current = undefined;
  }, []);

  const clearVisualResizePreview = useCallback((): void => {
    cancelResizeFrame();
    setVisualResizePreviewState(undefined);
  }, [cancelResizeFrame]);

  const scheduleVisualResizePreview = useCallback((preview: VisualResizePreview): void => {
    pendingVisualResizePreviewRef.current = preview;
    if (resizeFrameRef.current !== undefined) {
      return;
    }
    resizeFrameRef.current = window.requestAnimationFrame(() => {
      resizeFrameRef.current = undefined;
      const nextPreview = pendingVisualResizePreviewRef.current;
      pendingVisualResizePreviewRef.current = undefined;
      if (nextPreview !== undefined) {
        setVisualResizePreviewState(nextPreview);
      }
    });
  }, []);

  const cancelMoveFrame = useCallback((): void => {
    if (moveFrameRef.current !== undefined) {
      window.cancelAnimationFrame(moveFrameRef.current);
      moveFrameRef.current = undefined;
    }
    pendingMovePreviewRef.current = undefined;
  }, []);

  const scheduleMovePreview = useCallback(
    (preview: { readonly elementId: string; readonly x: number; readonly y: number }): void => {
      pendingMovePreviewRef.current = preview;
      if (moveFrameRef.current !== undefined) {
        return;
      }
      moveFrameRef.current = window.requestAnimationFrame(() => {
        moveFrameRef.current = undefined;
        const nextPreview = pendingMovePreviewRef.current;
        pendingMovePreviewRef.current = undefined;
        if (nextPreview !== undefined) {
          applySnapshot(
            editor.previewMoveElement(nextPreview.elementId, {
              x: nextPreview.x,
              y: nextPreview.y,
            }),
          );
        }
      });
    },
    [applySnapshot, editor],
  );

  useEffect(
    () => () => {
      cancelResizeFrame();
      cancelMoveFrame();
    },
    [cancelMoveFrame, cancelResizeFrame],
  );

  useEffect(() => {
    if (currentPageId !== undefined) {
      return;
    }
    cancelResizeFrame();
    resizePreviewRef.current = undefined;
    const cleanupState = window.setTimeout(() => {
      setVisualResizePreviewState(undefined);
      setPointerAction(undefined);
    }, 0);
    return () => {
      window.clearTimeout(cleanupState);
    };
  }, [cancelResizeFrame, currentPageId]);

  const applyFit = useCallback(
    (mode: Exclude<ViewerMode, "manual">): void => {
      const workspace = workspaceRef.current;
      if (workspace === null || currentPageWidth === undefined || currentPageHeight === undefined) {
        return;
      }
      const style = window.getComputedStyle(workspace);
      const horizontalPadding =
        Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
      const verticalPadding =
        Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
      const calculated = calculateViewerFit(mode, {
        workspaceWidth: workspace.clientWidth,
        workspaceHeight: workspace.clientHeight,
        horizontalPadding: Number.isFinite(horizontalPadding) ? horizontalPadding : 0,
        verticalPadding: Number.isFinite(verticalPadding) ? verticalPadding : 0,
        pageWidth: currentPageWidth,
        pageHeight: currentPageHeight,
      });
      if (calculated === undefined) {
        return;
      }
      const bounded = clampZoom(calculated, isCompactEditorViewport ? MIN_MOBILE_ZOOM : MIN_ZOOM);
      zoomRef.current = bounded;
      setZoom((current) => (current === bounded ? current : bounded));
      setViewMode(mode);
    },
    [currentPageHeight, currentPageWidth, isCompactEditorViewport],
  );
  const applyZoom = useCallback(
    (
      nextZoom: number,
      anchor?: {
        readonly workspace: HTMLElement;
        readonly clientX: number;
        readonly clientY: number;
      },
    ): void => {
      hasManualZoomRef.current = true;
      const currentZoom = zoomRef.current;
      const boundedZoom = clampZoom(nextZoom, isCompactEditorViewport ? MIN_MOBILE_ZOOM : MIN_ZOOM);
      if (boundedZoom === currentZoom) {
        return;
      }

      if (anchor !== undefined) {
        const rect = anchor.workspace.getBoundingClientRect();
        const anchorX = anchor.clientX - rect.left;
        const anchorY = anchor.clientY - rect.top;
        const pageX = (anchor.workspace.scrollLeft + anchorX) / currentZoom;
        const pageY = (anchor.workspace.scrollTop + anchorY) / currentZoom;
        requestAnimationFrame(() => {
          anchor.workspace.scrollLeft = pageX * boundedZoom - anchorX;
          anchor.workspace.scrollTop = pageY * boundedZoom - anchorY;
        });
      }

      zoomRef.current = boundedZoom;
      setViewMode("manual");
      setZoom(boundedZoom);
    },
    [isCompactEditorViewport],
  );

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    if (viewMode === "manual") {
      return;
    }
    applyFit(viewMode);
  }, [applyFit, currentPageId, isPageRailCollapsed, state.renderDocumentId, viewMode]);

  useEffect(() => {
    if (lastRenderDocumentIdRef.current === state.renderDocumentId) {
      return;
    }
    lastRenderDocumentIdRef.current = state.renderDocumentId;
    hasManualZoomRef.current = false;
    mobileFitDocumentIdRef.current = undefined;
  }, [state.renderDocumentId]);
  useEffect(() => {
    if (!isCompactEditorViewport || currentPageId === undefined || hasManualZoomRef.current) {
      return;
    }
    if (mobileFitDocumentIdRef.current === state.renderDocumentId) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      applyFit("fit-page");
      mobileFitDocumentIdRef.current = state.renderDocumentId;
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [applyFit, currentPageId, isCompactEditorViewport, state.renderDocumentId]);
  useEffect(() => {
    const workspace = workspaceRef.current;
    if (workspace === null || viewMode === "manual" || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => {
      applyFit(viewMode);
    });
    observer.observe(workspace);
    return () => {
      observer.disconnect();
    };
  }, [applyFit, viewMode]);
  const setEditingTextArea = useCallback((textarea: HTMLTextAreaElement | null): void => {
    editingTextAreaRef.current = textarea;
    if (textFocusRetryRef.current !== undefined) {
      window.clearTimeout(textFocusRetryRef.current);
      textFocusRetryRef.current = undefined;
    }
    if (textarea === null) {
      return;
    }
    const focusTextArea = (): void => {
      if (editingTextAreaRef.current !== textarea) {
        return;
      }
      textarea.focus();
      textarea.select();
    };
    focusTextArea();
    textFocusRetryRef.current = window.setTimeout(focusTextArea, 0);
  }, []);

  useEffect(
    () => () => {
      if (textFocusRetryRef.current !== undefined) {
        window.clearTimeout(textFocusRetryRef.current);
      }
    },
    [],
  );
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null || currentPageId === undefined || state.renderDocumentId === undefined) {
      if (canvas !== null) {
        pdfRenderer.clearCanvas(canvas);
      }
      setRenderState({ status: "idle" });
      return;
    }

    const renderSequence = renderSequenceRef.current + 1;
    renderSequenceRef.current = renderSequence;
    setRenderState({ status: "loading" });
    const handle = pdfRenderer.startRenderPage({
      documentId: state.renderDocumentId,
      pageNumber: state.currentPageNumber,
      scale: zoom,
      devicePixelRatio: renderPixelRatio,
      canvas,
    });

    void handle.promise.then((result) => {
      if (renderSequenceRef.current !== renderSequence) {
        return;
      }
      if (!result.ok) {
        if (result.cancelled) {
          return;
        }
        setRenderState({ status: "error", message: result.error.message });
        return;
      }
      setRenderState({ status: "ready" });
    });

    return () => {
      renderSequenceRef.current += 1;
      handle.cancel();
    };
  }, [
    currentPageHeight,
    currentPageId,
    currentPageRotation,
    currentPageWidth,
    pdfRenderer,
    renderPixelRatio,
    state.currentPageNumber,
    state.renderDocumentId,
    zoom,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    return () => {
      if (canvas !== null) {
        pdfRenderer.clearCanvas(canvas);
      }
    };
  }, [pdfRenderer]);

  const updateLargeDocumentThumbnailRange = useCallback((): void => {
    if (!isLargeDocument) {
      return;
    }
    const list = pageRailListRef.current;
    const firstThumbnail = list?.querySelector<HTMLElement>(".page-rail-thumbnail");
    if (list === null || firstThumbnail === null || firstThumbnail === undefined) {
      return;
    }
    const styles = window.getComputedStyle(list);
    const parsedGap = Number.parseFloat(styles.rowGap || styles.gap);
    const gap = Number.isFinite(parsedGap) ? parsedGap : 0;
    const rowStride = firstThumbnail.offsetHeight + gap;
    if (rowStride <= 0) {
      return;
    }
    setThumbnailRowStride((currentStride) =>
      Math.abs(currentStride - rowStride) < 0.5 ? currentStride : rowStride,
    );
    const maximumScrollTop = list.scrollHeight - list.clientHeight;
    const firstVisiblePageIndex = Math.min(
      state.pageCount - 1,
      Math.max(
        0,
        maximumScrollTop > 0
          ? Math.round((list.scrollTop / maximumScrollTop) * (state.pageCount - 1))
          : Math.floor(list.scrollTop / rowStride),
      ),
    );
    const nextRange = thumbnailRangeAround(firstVisiblePageIndex, state.pageCount);
    setScrolledThumbnailWindow((currentWindow) => {
      const nextWindow: ThumbnailRenderWindow = {
        documentId: state.renderDocumentId,
        currentPageId,
        pageCount: state.pageCount,
        range: nextRange,
      };
      return currentWindow.documentId === nextWindow.documentId &&
        currentWindow.currentPageId === nextWindow.currentPageId &&
        currentWindow.pageCount === nextWindow.pageCount &&
        currentWindow.range.start === nextRange.start &&
        currentWindow.range.end === nextRange.end
        ? currentWindow
        : nextWindow;
    });
  }, [currentPageId, isLargeDocument, state.pageCount, state.renderDocumentId]);

  useEffect(() => {
    const list = pageRailListRef.current;
    if (list !== null) {
      list.scrollTop = 0;
    }
  }, [state.renderDocumentId]);

  useEffect(() => {
    if (!isLargeDocument) {
      return undefined;
    }
    window.addEventListener("resize", updateLargeDocumentThumbnailRange);
    return () => {
      window.removeEventListener("resize", updateLargeDocumentThumbnailRange);
    };
  }, [isLargeDocument, updateLargeDocumentThumbnailRange]);

  useEffect(() => {
    const editorViewport = editorViewportRef.current;
    const workspace = workspaceRef.current;
    if (editorViewport === null || workspace === null || currentPageId === undefined) {
      return;
    }

    const handleWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }
      event.preventDefault();
      applyZoom(zoomRef.current + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP), {
        workspace,
        clientX: event.clientX,
        clientY: event.clientY,
      });
    };

    editorViewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      editorViewport.removeEventListener("wheel", handleWheel);
    };
  }, [applyZoom, currentPageId]);

  useEffect(() => {
    if (currentPageId === undefined) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (moveCancelRef.current !== undefined && event.key === "Escape") {
        event.preventDefault();
        moveCancelRef.current();
        return;
      }
      if (pointerAction?.kind === "resize" && event.key === "Escape") {
        event.preventDefault();
        if (isTextResizeType(pointerAction.type)) {
          if (usesLocalVisualResizePreview(pointerAction.type)) {
            clearVisualResizePreview();
          }
          applySnapshot(
            editor.previewTextResizeElement(
              pointerAction.elementId,
              pointerAction.startBounds,
              pointerAction.startFontSize ?? DEFAULT_TEXT_APPEARANCE.fontSize,
            ),
          );
        } else if (usesLocalVisualResizePreview(pointerAction.type)) {
          clearVisualResizePreview();
        } else {
          applySnapshot(
            editor.previewResizeElement(pointerAction.elementId, pointerAction.startBounds),
          );
        }
        resizePreviewRef.current = undefined;
        setPointerAction(undefined);
        return;
      }
      if (whiteoutDraft !== undefined && event.key === "Escape") {
        event.preventDefault();
        setWhiteoutDraft(undefined);
        return;
      }
      if (editingTextElementId !== undefined) {
        if (event.key === "Escape" && isEditingKeyboardTarget(event.target)) {
          event.preventDefault();
          setEditingTextElementId(undefined);
          applySnapshot(editor.setTool("select"));
        }
        if (isEditingKeyboardTarget(event.target)) {
          return;
        }
      }
      if ((event.ctrlKey || event.metaKey) && !isEditingKeyboardTarget(event.target)) {
        const key = event.key.toLowerCase();
        const wantsUndo = key === "z" && !event.shiftKey;
        const wantsRedo = (key === "z" && event.shiftKey) || (!event.metaKey && key === "y");
        if (key === "c" && state.selectedElementId !== undefined) {
          event.preventDefault();
          applySnapshot(editor.copySelectedElement());
          return;
        }
        if (key === "v" && snapshot.canPaste) {
          event.preventDefault();
          setWhiteoutDraft(undefined);
          applySnapshot(editor.pasteCopiedElement());
          return;
        }
        if (wantsUndo && snapshot.canUndo) {
          event.preventDefault();
          setEditingTextElementId(undefined);
          setWhiteoutDraft(undefined);
          applySnapshot(editor.undo());
          return;
        }
        if (wantsRedo && snapshot.canRedo) {
          event.preventDefault();
          setEditingTextElementId(undefined);
          setWhiteoutDraft(undefined);
          applySnapshot(editor.redo());
          return;
        }
      }
      if (
        state.selectedElementId !== undefined &&
        event.key === "Enter" &&
        !isEditingKeyboardTarget(event.target) &&
        state.selectedElement?.locked !== true &&
        (state.selectedElement?.type === "text" || state.selectedElement?.type === "date")
      ) {
        event.preventDefault();
        setEditingTextElementId(state.selectedElementId);
        return;
      }
      if (
        state.selectedElementId !== undefined &&
        (event.key === "Delete" || event.key === "Backspace") &&
        !isEditingKeyboardTarget(event.target)
      ) {
        event.preventDefault();
        setEditingTextElementId(undefined);
        applySnapshot(editor.deleteElement(state.selectedElementId));
        return;
      }
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        applyZoom(zoomRef.current + ZOOM_STEP);
        return;
      }
      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        applyZoom(zoomRef.current - ZOOM_STEP);
        return;
      }
      if (event.key === "0") {
        event.preventDefault();
        applyZoom(1);
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [
    applySnapshot,
    applyZoom,
    currentPageId,
    editingTextElementId,
    editor,
    pointerAction,
    clearVisualResizePreview,
    snapshot.canPaste,
    snapshot.canRedo,
    snapshot.canUndo,
    state.selectedElement,
    state.selectedElementId,
    whiteoutDraft,
  ]);

  useEffect(() => {
    if (pointerAction === undefined) {
      return;
    }

    const handlePointerMove = (event: globalThis.PointerEvent): void => {
      const overlayLayer = overlayLayerRef.current;
      if (overlayLayer === null) {
        return;
      }
      const rect = overlayLayer.getBoundingClientRect();
      const point = {
        x: (event.clientX - rect.left) / zoom,
        y: (event.clientY - rect.top) / zoom,
      };
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        return;
      }
      if (pointerAction.kind === "move") {
        const bounds = {
          ...pointerAction.startBounds,
          x: point.x - pointerAction.offsetX,
          y: point.y - pointerAction.offsetY,
        };
        movePreviewRef.current = { bounds };
        scheduleMovePreview({ elementId: pointerAction.elementId, x: bounds.x, y: bounds.y });
        return;
      }
      if (isTextResizeType(pointerAction.type)) {
        const startFontSize = pointerAction.startFontSize ?? DEFAULT_TEXT_APPEARANCE.fontSize;
        const rawScale =
          Math.max(point.x - pointerAction.startBounds.x, point.y - pointerAction.startBounds.y) /
          Math.max(pointerAction.startBounds.width, pointerAction.startBounds.height);
        const nextFontSize = Math.min(
          MAX_TEXT_FONT_SIZE,
          Math.max(MIN_TEXT_FONT_SIZE, startFontSize * rawScale),
        );
        const scale = nextFontSize / startFontSize;
        const bounds = {
          ...pointerAction.startBounds,
          width: pointerAction.startBounds.width * scale,
          height: pointerAction.startBounds.height * scale,
        };
        resizePreviewRef.current = { bounds, fontSize: nextFontSize };
        if (usesLocalVisualResizePreview(pointerAction.type)) {
          scheduleVisualResizePreview({
            elementId: pointerAction.elementId,
            bounds,
            fontSize: nextFontSize,
          });
          return;
        }
        applySnapshot(
          editor.previewTextResizeElement(pointerAction.elementId, bounds, nextFontSize),
        );
        return;
      }
      const rawBounds = {
        ...pointerAction.startBounds,
        width: point.x - pointerAction.startBounds.x,
        height: point.y - pointerAction.startBounds.y,
      };
      const bounds = usesLocalVisualResizePreview(pointerAction.type)
        ? aspectRatioResizePreviewBounds(pointerAction.startBounds, rawBounds)
        : rawBounds;
      resizePreviewRef.current = { bounds };
      if (usesLocalVisualResizePreview(pointerAction.type)) {
        scheduleVisualResizePreview({ elementId: pointerAction.elementId, bounds });
        return;
      }
      applySnapshot(editor.previewResizeElement(pointerAction.elementId, bounds));
    };

    const stopPointerAction = (): void => {
      if (pointerAction.kind === "move") {
        cancelMoveFrame();
        const preview = movePreviewRef.current;
        if (preview !== undefined) {
          applySnapshot(
            editor.commitMoveElement(
              pointerAction.elementId,
              pointerAction.startBounds,
              preview.bounds,
            ),
          );
        }
      }
      if (pointerAction.kind === "resize") {
        const preview = resizePreviewRef.current;
        if (isTextResizeType(pointerAction.type) && preview?.fontSize !== undefined) {
          if (usesLocalVisualResizePreview(pointerAction.type)) {
            clearVisualResizePreview();
          }
          applySnapshot(
            editor.commitTextResizeElement(
              pointerAction.elementId,
              {
                bounds: pointerAction.startBounds,
                fontSize: pointerAction.startFontSize ?? DEFAULT_TEXT_APPEARANCE.fontSize,
              },
              { bounds: preview.bounds, fontSize: preview.fontSize },
            ),
          );
        } else if (preview !== undefined) {
          if (usesLocalVisualResizePreview(pointerAction.type)) {
            clearVisualResizePreview();
          }
          applySnapshot(
            editor.commitResizeElement(
              pointerAction.elementId,
              pointerAction.startBounds,
              preview.bounds,
            ),
          );
        }
      }
      movePreviewRef.current = undefined;
      resizePreviewRef.current = undefined;
      setPointerAction(undefined);
      workspaceGestureModeRef.current = "idle";
    };

    const cancelPointerAction = (): void => {
      if (pointerAction.kind === "move") {
        cancelMoveFrame();
        applySnapshot(
          editor.previewMoveElement(pointerAction.elementId, {
            x: pointerAction.startBounds.x,
            y: pointerAction.startBounds.y,
          }),
        );
      }
      if (pointerAction.kind === "resize") {
        if (isTextResizeType(pointerAction.type)) {
          if (usesLocalVisualResizePreview(pointerAction.type)) {
            clearVisualResizePreview();
          }
          applySnapshot(
            editor.previewTextResizeElement(
              pointerAction.elementId,
              pointerAction.startBounds,
              pointerAction.startFontSize ?? DEFAULT_TEXT_APPEARANCE.fontSize,
            ),
          );
        } else if (usesLocalVisualResizePreview(pointerAction.type)) {
          clearVisualResizePreview();
        } else {
          applySnapshot(
            editor.previewResizeElement(pointerAction.elementId, pointerAction.startBounds),
          );
        }
      }
      movePreviewRef.current = undefined;
      resizePreviewRef.current = undefined;
      setPointerAction(undefined);
      workspaceGestureModeRef.current = "idle";
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopPointerAction, { once: true });
    window.addEventListener("pointercancel", cancelPointerAction, { once: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopPointerAction);
      window.removeEventListener("pointercancel", cancelPointerAction);
    };
  }, [
    applySnapshot,
    cancelMoveFrame,
    clearVisualResizePreview,
    editor,
    pointerAction,
    scheduleMovePreview,
    scheduleVisualResizePreview,
    zoom,
  ]);

  const pointFromOverlayEvent = (
    event: Pick<PointerEvent<HTMLDivElement>, "clientX" | "clientY" | "currentTarget">,
  ): { readonly x: number; readonly y: number } | undefined => {
    const rect = event.currentTarget.getBoundingClientRect();
    const point = {
      x: (event.clientX - rect.left) / zoom,
      y: (event.clientY - rect.top) / zoom,
    };
    return Number.isFinite(point.x) && Number.isFinite(point.y) ? point : undefined;
  };

  const startWhiteoutDraft = (event: PointerEvent<HTMLDivElement>): void => {
    if (currentPage === undefined || state.tool !== "whiteout") {
      return;
    }
    if (event.target instanceof HTMLElement && event.target.closest(".overlay-element") !== null) {
      return;
    }
    const point = pointFromOverlayEvent(event);
    if (point === undefined) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    workspaceGestureModeRef.current = "drawing-whiteout";
    capturePointer(event.currentTarget, event.pointerId);
    if (editingTextElementId !== undefined) {
      setEditingTextElementId(undefined);
    }
    setWhiteoutDraft({
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      currentX: point.x,
      currentY: point.y,
    });
  };

  const updateWhiteoutDraft = (event: PointerEvent<HTMLDivElement>): void => {
    const draft = whiteoutDraft;
    if (draft?.pointerId !== event.pointerId) {
      return;
    }
    const point = pointFromOverlayEvent(event);
    if (point === undefined) {
      return;
    }
    setWhiteoutDraft({ ...draft, currentX: point.x, currentY: point.y });
  };

  const finishWhiteoutDraft = (event: PointerEvent<HTMLDivElement>): void => {
    const draft = whiteoutDraft;
    if (draft?.pointerId !== event.pointerId) {
      return;
    }
    releasePointer(event.currentTarget, event.pointerId);
    const finalDraft = draft;
    setWhiteoutDraft(undefined);
    workspaceGestureModeRef.current = "idle";
    if (currentPage === undefined || !isMeaningfulWhiteoutDrag(finalDraft)) {
      return;
    }
    const bounds = whiteoutBoundsFromDraft(finalDraft, currentPage, true);
    if (bounds.width <= 0 || bounds.height <= 0) {
      return;
    }
    applySnapshot(editor.addWhiteout(bounds));
  };

  const cancelWhiteoutDraft = (event: PointerEvent<HTMLDivElement>): void => {
    if (
      whiteoutDraft !== undefined &&
      event.currentTarget.hasPointerCapture(whiteoutDraft.pointerId)
    ) {
      event.currentTarget.releasePointerCapture(whiteoutDraft.pointerId);
    }
    setWhiteoutDraft(undefined);
    workspaceGestureModeRef.current = "idle";
  };
  const clearSelection = (): void => {
    setEditingTextElementId(undefined);
    setWhiteoutDraft(undefined);
    applySnapshot(editor.clearSelection());
  };

  const handleImageFileChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file === undefined) {
      return;
    }
    const validationError = validateImageFile(file);
    if (validationError !== undefined) {
      setImageUploadError(validationError.message);
      setPendingImage(undefined);
      return;
    }
    const reader = new FileReader();
    const image = new Image();
    reader.addEventListener("error", () => {
      setImageUploadError("The image could not be read.");
      setPendingImage(undefined);
    });
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") {
        setImageUploadError("The image could not be read.");
        setPendingImage(undefined);
        return;
      }
      image.addEventListener("error", () => {
        setImageUploadError("The image appears to be corrupted or unsupported.");
        setPendingImage(undefined);
      });
      image.addEventListener("load", () => {
        setImageUploadError(undefined);
        setPendingImage({
          dataUrl: reader.result as string,
          mimeType: file.type === "image/png" ? "image/png" : "image/jpeg",
          width: image.naturalWidth,
          height: image.naturalHeight,
        });
        applySnapshot(editor.setTool("image"));
      });
      image.src = reader.result;
    });
    reader.readAsDataURL(file);
  };
  const handleOverlayClick = (event: MouseEvent<HTMLDivElement>): void => {
    if (suppressWorkspaceClickRef.current) {
      suppressWorkspaceClickRef.current = false;
      event.stopPropagation();
      return;
    }
    if (currentPage === undefined) {
      return;
    }
    if (event.target instanceof HTMLTextAreaElement) {
      return;
    }
    if (event.target instanceof HTMLElement && event.target.closest(".overlay-element") !== null) {
      return;
    }
    if (editingTextElementId !== undefined) {
      setEditingTextElementId(undefined);
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const point = {
      x: (event.clientX - rect.left) / zoom,
      y: (event.clientY - rect.top) / zoom,
    };
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return;
    }
    if (state.tool === "text") {
      const nextSnapshot = isCompactEditorViewport
        ? editor.addText(point, "Text", MOBILE_TEXT_SIZE)
        : editor.addText(point, "Text");
      const selectedElementId = nextSnapshot.state.selectedElementId;
      applySnapshot(editor.setTool("select"));
      setEditingTextElementId(selectedElementId);
      return;
    }
    if (state.tool === "image" && pendingImage !== undefined) {
      applySnapshot(editor.addImage(point, pendingImage));
      setPendingImage(undefined);
      applySnapshot(editor.setTool("select"));
      return;
    }
    if (state.tool === "checkmark") {
      applySnapshot(
        isCompactEditorViewport
          ? editor.addCheckmark(point, MOBILE_MARK_SIZE)
          : editor.addCheckmark(point),
      );
      applySnapshot(editor.setTool("select"));
      return;
    }
    if (state.tool === "cross") {
      applySnapshot(
        isCompactEditorViewport ? editor.addCross(point, MOBILE_MARK_SIZE) : editor.addCross(point),
      );
      applySnapshot(editor.setTool("select"));
      return;
    }
    if (state.tool === "date") {
      applySnapshot(
        isCompactEditorViewport ? editor.addDate(point, MOBILE_DATE_SIZE) : editor.addDate(point),
      );
      applySnapshot(editor.setTool("select"));
      return;
    }
    if (state.tool === "select" && state.selectedElementId !== undefined) {
      clearSelection();
    }
  };

  const isWorkspacePanSurface = (target: EventTarget | null): boolean =>
    target instanceof HTMLElement &&
    target.closest(
      ".overlay-element, button, input, textarea, select, [contenteditable='true']",
    ) === null;

  const startWorkspacePan = (event: PointerEvent<HTMLElement>): void => {
    if (isCompactEditorViewport && event.pointerType === "touch") {
      if (state.tool !== "select" || !isWorkspacePanSurface(event.target)) {
        return;
      }
      const workspace = event.currentTarget;
      const points = touchPointsRef.current;
      event.preventDefault();
      points.set(event.pointerId, { x: event.clientX, y: event.clientY });
      capturePointer(workspace, event.pointerId);
      if (points.size >= 2) {
        const [first, second] = [...points.values()];
        if (first !== undefined && second !== undefined) {
          workspacePanRef.current = undefined;
          workspaceGestureModeRef.current = "pinching";
          pinchZoomRef.current = {
            startDistance: Math.hypot(second.x - first.x, second.y - first.y),
            startZoom: zoomRef.current,
          };
          setIsWorkspacePanning(true);
        }
        return;
      }
      workspaceGestureModeRef.current = "pending-pan";
      workspacePanRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startScrollLeft: workspace.scrollLeft,
        startScrollTop: workspace.scrollTop,
        hasMoved: false,
      };
      return;
    }
    if (event.button !== 0 || state.tool !== "select" || !isWorkspacePanSurface(event.target)) {
      return;
    }
    const workspace = event.currentTarget;
    workspacePanRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startScrollLeft: workspace.scrollLeft,
      startScrollTop: workspace.scrollTop,
      hasMoved: false,
    };
    workspaceGestureModeRef.current = "pending-pan";
    capturePointer(workspace, event.pointerId);
    setIsWorkspacePanning(true);
  };

  const updateWorkspacePan = (event: PointerEvent<HTMLElement>): void => {
    if (isCompactEditorViewport && event.pointerType === "touch") {
      const points = touchPointsRef.current;
      if (!points.has(event.pointerId)) return;
      points.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const pinch = pinchZoomRef.current;
      const [first, second] = [...points.values()];
      if (
        workspaceGestureModeRef.current === "pinching" &&
        pinch !== undefined &&
        first !== undefined &&
        second !== undefined &&
        pinch.startDistance > 0
      ) {
        event.preventDefault();
        const distance = Math.hypot(second.x - first.x, second.y - first.y);
        applyZoom(pinch.startZoom * (distance / pinch.startDistance), {
          workspace: event.currentTarget,
          clientX: (first.x + second.x) / 2,
          clientY: (first.y + second.y) / 2,
        });
        suppressWorkspaceClickRef.current = true;
        return;
      }
      const pan = workspacePanRef.current;
      if (
        (workspaceGestureModeRef.current !== "pending-pan" &&
          workspaceGestureModeRef.current !== "panning") ||
        pan?.pointerId !== event.pointerId
      ) {
        return;
      }
      event.preventDefault();
      const deltaX = event.clientX - pan.startClientX;
      const deltaY = event.clientY - pan.startClientY;
      if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
        pan.hasMoved = true;
        workspaceGestureModeRef.current = "panning";
        suppressWorkspaceClickRef.current = true;
        setIsWorkspacePanning(true);
      }
      event.currentTarget.scrollLeft = pan.startScrollLeft - deltaX;
      event.currentTarget.scrollTop = pan.startScrollTop - deltaY;
      return;
    }
    const pan = workspacePanRef.current;
    if (pan?.pointerId !== event.pointerId) {
      return;
    }
    const deltaX = event.clientX - pan.startClientX;
    const deltaY = event.clientY - pan.startClientY;
    if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
      pan.hasMoved = true;
      workspaceGestureModeRef.current = "panning";
      suppressWorkspaceClickRef.current = true;
    }
    event.currentTarget.scrollLeft = pan.startScrollLeft - deltaX;
    event.currentTarget.scrollTop = pan.startScrollTop - deltaY;
  };

  const endWorkspacePan = (event: PointerEvent<HTMLElement>): void => {
    if (isCompactEditorViewport && event.pointerType === "touch") {
      const points = touchPointsRef.current;
      const pan = workspacePanRef.current;
      const wasPanPointer = pan?.pointerId === event.pointerId;
      points.delete(event.pointerId);
      releasePointer(event.currentTarget, event.pointerId);
      if (workspaceGestureModeRef.current === "pinching") {
        pinchZoomRef.current = undefined;
        workspacePanRef.current = undefined;
        workspaceGestureModeRef.current = "idle";
        setIsWorkspacePanning(false);
        return;
      }
      if (wasPanPointer) {
        workspacePanRef.current = undefined;
        workspaceGestureModeRef.current = "idle";
        setIsWorkspacePanning(false);
      }
      return;
    }
    const pan = workspacePanRef.current;
    if (pan?.pointerId !== event.pointerId) {
      return;
    }
    releasePointer(event.currentTarget, event.pointerId);

    workspacePanRef.current = undefined;
    workspaceGestureModeRef.current = "idle";
    setIsWorkspacePanning(false);
  };

  const handleWorkspaceClick = (event: MouseEvent<HTMLElement>): void => {
    if (suppressWorkspaceClickRef.current) {
      suppressWorkspaceClickRef.current = false;
      return;
    }
    if (
      event.target !== event.currentTarget ||
      state.tool !== "select" ||
      state.selectedElementId === undefined
    ) {
      return;
    }
    clearSelection();
  };

  const startElementMove = (
    element: ExportElement,
    event: PointerEvent<HTMLDivElement> | MouseEvent<HTMLDivElement>,
  ): void => {
    if (element.locked) {
      event.preventDefault();
      event.stopPropagation();
      moveCancelRef.current?.();
      selectElementForInspector(element.id);
      return;
    }
    if (
      event.target instanceof HTMLTextAreaElement ||
      (event.target as HTMLElement).dataset.resizeHandle === "true"
    ) {
      return;
    }
    if ("detail" in event && event.detail > 1) {
      return;
    }
    if (moveCancelRef.current !== undefined) {
      return;
    }
    event.preventDefault();
    workspaceGestureModeRef.current = "moving-overlay";
    event.currentTarget.focus();
    if (editingTextElementId !== undefined && editingTextElementId !== element.id) {
      setEditingTextElementId(undefined);
    }
    selectElementForInspector(element.id);
    const overlayLayer = overlayLayerRef.current;
    if (overlayLayer === null) {
      return;
    }
    const target = event.currentTarget;
    const startBounds = element.bounds;
    const rect = overlayLayer.getBoundingClientRect();
    const startPoint = {
      x: (event.clientX - rect.left) / zoom,
      y: (event.clientY - rect.top) / zoom,
    };
    if (!Number.isFinite(startPoint.x) || !Number.isFinite(startPoint.y)) {
      return;
    }
    const offsetX = startPoint.x - startBounds.x;
    const offsetY = startPoint.y - startBounds.y;
    let latestBounds: ExportElement["bounds"] | undefined;

    const cleanup = (): void => {
      target.removeEventListener("pointermove", handleMove);
      target.removeEventListener("pointerup", handleUp);
      target.removeEventListener("pointercancel", handleCancel);
      moveCancelRef.current = undefined;
      movePreviewRef.current = undefined;
      workspaceGestureModeRef.current = "idle";
    };
    const restoreStart = (): void => {
      cancelMoveFrame();
      applySnapshot(editor.previewMoveElement(element.id, { x: startBounds.x, y: startBounds.y }));
      cleanup();
    };
    const handleMove = (nativeEvent: globalThis.PointerEvent): void => {
      const layer = overlayLayerRef.current;
      if (layer === null) {
        return;
      }
      const layerRect = layer.getBoundingClientRect();
      const point = {
        x: (nativeEvent.clientX - layerRect.left) / zoomRef.current,
        y: (nativeEvent.clientY - layerRect.top) / zoomRef.current,
      };
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        return;
      }
      const bounds = {
        ...startBounds,
        x: point.x - offsetX,
        y: point.y - offsetY,
      };
      latestBounds = bounds;
      movePreviewRef.current = { bounds };
      scheduleMovePreview({ elementId: element.id, x: bounds.x, y: bounds.y });
    };
    const handleUp = (): void => {
      releasePointer(target, "pointerId" in event ? event.pointerId : undefined);
      cancelMoveFrame();
      if (latestBounds !== undefined) {
        applySnapshot(editor.commitMoveElement(element.id, startBounds, latestBounds));
      }
      cleanup();
    };
    const handleCancel = (): void => {
      releasePointer(target, "pointerId" in event ? event.pointerId : undefined);
      restoreStart();
    };

    capturePointer(target, "pointerId" in event ? event.pointerId : undefined);
    target.addEventListener("pointermove", handleMove);
    target.addEventListener("pointerup", handleUp, { once: true });
    target.addEventListener("pointercancel", handleCancel, { once: true });
    moveCancelRef.current = restoreStart;
  };

  const startElementResize = (
    element: ExportElement,
    event: PointerEvent<HTMLButtonElement>,
  ): void => {
    if (element.locked) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    workspaceGestureModeRef.current = "resizing-overlay";
    selectElementForInspector(element.id);
    resizePreviewRef.current = {
      bounds: element.bounds,
      ...(element.textAppearance?.fontSize === undefined
        ? {}
        : { fontSize: element.textAppearance.fontSize }),
    };
    setPointerAction({
      kind: "resize",
      elementId: element.id,
      type: element.type,
      startBounds: element.bounds,
      ...(isTextResizeType(element.type)
        ? { startFontSize: element.textAppearance?.fontSize ?? DEFAULT_TEXT_APPEARANCE.fontSize }
        : {}),
    });
  };

  const undo = (): void => {
    setEditingTextElementId(undefined);
    setWhiteoutDraft(undefined);
    applySnapshot(editor.undo());
  };

  const redo = (): void => {
    setEditingTextElementId(undefined);
    setWhiteoutDraft(undefined);
    applySnapshot(editor.redo());
  };
  const openExportDialog = (): void => {
    setExportMode("original");
    setExportFilename(state.fileName ?? "quickpdf-edited.pdf");
    setCompressionProgress(undefined);
    setIsExportDialogOpen(true);
  };

  const exportPdf = async (): Promise<void> => {
    const abortController = new AbortController();
    exportAbortRef.current = abortController;
    setCompressionProgress(undefined);
    setIsExporting(true);
    try {
      const nextSnapshot = await editor.exportCurrentPdf({
        mode: exportMode,
        compressionLevel,
        filename: exportFilename,
        signal: abortController.signal,
        onCompressionProgress: setCompressionProgress,
      });
      applySnapshot(nextSnapshot);
      if (nextSnapshot.state.error === undefined) {
        setIsExportDialogOpen(false);
      }
    } finally {
      exportAbortRef.current = undefined;
      setCompressionProgress(undefined);
      setIsExporting(false);
    }
  };

  const cancelExport = (): void => {
    exportAbortRef.current?.abort();
    exportAbortRef.current = undefined;
    setCompressionProgress(undefined);
    setIsExporting(false);
    setIsExportDialogOpen(false);
  };

  const download = (): void => {
    openExportDialog();
  };

  const acceptSignatureImage = (image: SignatureImageInput): void => {
    if (dialogType === undefined) {
      return;
    }
    const point = getMobileInsertionPoint(dialogType);
    const nextSnapshot =
      dialogType === "signature"
        ? image.source === "upload"
          ? editor.addUploadedSignature(point, image)
          : editor.addDrawnSignature(point, image)
        : editor.addDrawnInitials(point, image);
    applySnapshot(nextSnapshot);
    applySnapshot(editor.setTool("select"));
    setDialogType(undefined);
  };

  const acceptTypedSignature = (text: string, fontFamily: SignatureFont): void => {
    if (dialogType === undefined) {
      return;
    }
    const point = getMobileInsertionPoint(dialogType);
    const nextSnapshot =
      dialogType === "signature"
        ? editor.addTypedSignature(point, { text, fontFamily })
        : editor.addTypedInitials(point, { text, fontFamily });
    applySnapshot(nextSnapshot);
    applySnapshot(editor.setTool("select"));
    setDialogType(undefined);
  };

  if (currentPage === undefined) {
    return (
      <section className="page-section editor-shell" aria-labelledby="editor-title">
        <div className="content-stack">
          <p className="phase-label">No document open</p>
          <h1 id="editor-title">Open a PDF first</h1>
          <p>Return home and choose a local PDF to start editing.</p>
        </div>
      </section>
    );
  }

  const pageCssWidth = currentPage.width * zoom;
  const pageCssHeight = currentPage.height * zoom;
  const selectedElement = state.selectedElement;
  const mobileQuickEditPanel = isCompactEditorViewport ? (
    <div className="mobile-quick-edit-panel">
      <div className="mobile-quick-edit-summary">
        <strong>
          {selectedElement === undefined ? "Quick Edit" : elementLabel(selectedElement)}
        </strong>
        <span>
          {selectedElement === undefined
            ? "Select an element to edit it."
            : "Tap the handle to close this panel."}
        </span>
      </div>
      {selectedElement === undefined ? null : (
        <div className="mobile-quick-edit-content">
          {selectedElement.type === "text" || selectedElement.type === "date" ? (
            <>
              <label>
                {selectedElement.type === "date" ? "Date value" : "Content"}
                <textarea
                  aria-label={selectedElement.type === "date" ? "Date value" : "Text content"}
                  value={selectedElement.text ?? ""}
                  onChange={(event) => {
                    applySnapshot(editor.updateText(selectedElement.id, event.currentTarget.value));
                  }}
                />
              </label>
              <label>
                Font size
                <select
                  aria-label="Text font size"
                  value={selectedElement.textAppearance?.fontSize ?? 16}
                  onChange={(event) => {
                    const fontSize = Number(event.currentTarget.value);
                    if (Number.isFinite(fontSize) && fontSize > 0) {
                      applySnapshot(editor.updateTextFontSize(selectedElement.id, fontSize));
                    }
                  }}
                >
                  {[8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72, 96].map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-inspector-color">
                Color
                <ReleaseColorInput
                  ariaLabel="Text color"
                  value={
                    colorPreviewByElementId.get(selectedElement.id) ??
                    selectedElement.color ??
                    "#000000"
                  }
                  onPreview={(color) => {
                    handleColorPreview(selectedElement.id, color);
                  }}
                  onCommit={(color) => {
                    handleColorCommit(selectedElement.id, color);
                  }}
                />
              </label>
            </>
          ) : null}
          {selectedElement.type === "checkmark" ? (
            <>
              <label>
                Size
                <input
                  aria-label="Checkmark size"
                  type="number"
                  min="16"
                  value={Math.round(selectedElement.bounds.width)}
                  onChange={(event) => {
                    const size = event.currentTarget.valueAsNumber;
                    if (Number.isFinite(size)) {
                      applySnapshot(
                        editor.resizeElement(selectedElement.id, { width: size, height: size }),
                      );
                    }
                  }}
                />
              </label>
              <label className="text-inspector-color">
                Color
                <ReleaseColorInput
                  ariaLabel="Checkmark color"
                  value={
                    colorPreviewByElementId.get(selectedElement.id) ??
                    selectedElement.color ??
                    "#000000"
                  }
                  onPreview={(color) => {
                    handleColorPreview(selectedElement.id, color);
                  }}
                  onCommit={(color) => {
                    handleColorCommit(selectedElement.id, color);
                  }}
                />
              </label>
            </>
          ) : null}
          {selectedElement.type === "image" || selectedElement.type === "signature" ? (
            <>
              <label>
                Size
                <input
                  aria-label={`${elementLabel(selectedElement)} size`}
                  type="number"
                  min="16"
                  value={Math.round(selectedElement.bounds.width)}
                  onChange={(event) => {
                    const width = event.currentTarget.valueAsNumber;
                    if (Number.isFinite(width)) {
                      const ratio = selectedElement.bounds.height / selectedElement.bounds.width;
                      applySnapshot(
                        editor.resizeElement(selectedElement.id, { width, height: width * ratio }),
                      );
                    }
                  }}
                />
              </label>
              <p className="mobile-quick-edit-note">
                {selectedElement.type === "image"
                  ? "Aspect ratio is locked."
                  : "Use desktop or tablet to replace this signature."}
              </p>
            </>
          ) : null}
          {["whiteout", "initials", "cross"].includes(selectedElement.type) ? (
            <p className="mobile-quick-edit-note" role="status">
              This element can be viewed on mobile, but advanced editing is available on desktop or
              tablet.
            </p>
          ) : null}
          <div className="mobile-quick-edit-actions">
            <button
              type="button"
              onClick={() => {
                applySnapshot(editor.duplicateElement(selectedElement.id));
              }}
            >
              Duplicate
            </button>
            <button
              type="button"
              className="text-inspector-delete"
              onClick={() => {
                applySnapshot(editor.deleteElement(selectedElement.id));
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  ) : null;

  const mobileMoreSheet =
    isCompactEditorViewport && isMobileMoreOpen && typeof document !== "undefined"
      ? createPortal(
          <div className="mobile-more-overlay" role="presentation">
            <button
              type="button"
              className="mobile-more-backdrop"
              aria-label="Close more tools"
              onClick={() => {
                setIsMobileMoreOpen(false);
              }}
            />
            <section
              ref={mobileMoreSheetRef}
              className="mobile-more-sheet"
              role="dialog"
              aria-modal="true"
              aria-label="More tools"
              tabIndex={-1}
            >
              <h2>More tools</h2>
              <div className="mobile-more-sheet__tools">
                <button
                  type="button"
                  disabled={onOpenRequest === undefined}
                  onClick={() => {
                    setIsMobileMoreOpen(false);
                    onOpenRequest?.();
                  }}
                >
                  <ToolbarIcon name="open" /> Open PDF
                </button>
                <button
                  type="button"
                  onClick={() => {
                    applySnapshot(editor.setTool("whiteout"));
                    setIsMobileMoreOpen(false);
                  }}
                >
                  <ToolbarIcon name="whiteout" /> Whiteout
                </button>
                <button
                  type="button"
                  onClick={() => {
                    applySnapshot(editor.setTool("initials"));
                    setDialogType("initials");
                    setIsMobileMoreOpen(false);
                  }}
                >
                  <ToolbarIcon name="initials" /> Initials
                </button>
                <button
                  type="button"
                  onClick={() => {
                    applySnapshot(editor.setTool("cross"));
                    setIsMobileMoreOpen(false);
                  }}
                >
                  <ToolbarIcon name="cross" /> Cross
                </button>{" "}
              </div>
              <label className="mobile-more-sheet__performance">
                <span>Performance</span>
                <select
                  aria-label="Editor performance profile"
                  value={performanceProfile}
                  onChange={(event) => {
                    setPerformanceProfile(event.currentTarget.value as EditorPerformanceProfile);
                  }}
                >
                  <option value="automatic">Automatic</option>
                  <option value="light">Light Mode</option>
                  <option value="full">Full Quality</option>
                </select>
              </label>
              <button
                type="button"
                className="mobile-more-sheet__close"
                onClick={() => {
                  setIsMobileMoreOpen(false);
                }}
              >
                Close
              </button>
            </section>
          </div>,
          document.body,
        )
      : null;
  const whiteoutPreviewBounds =
    whiteoutDraft === undefined
      ? undefined
      : whiteoutBoundsFromDraft(whiteoutDraft, currentPage, false);

  const elementInspector = (
    <aside
      className={`element-inspector${isInspectorSheetOpen ? " is-mobile-open" : ""}`}
      aria-label="Selected element actions"
    >
      <button
        type="button"
        className="mobile-inspector-handle"
        hidden={!usesInspectorSheet}
        aria-label={isInspectorSheetOpen ? "Collapse inspector sheet" : "Expand inspector sheet"}
        aria-expanded={isInspectorSheetOpen}
        onClick={cycleInspectorSheet}
      >
        <span aria-hidden="true" />
      </button>
      {mobileQuickEditPanel}
      {mobileMoreSheet}
      <div className="desktop-inspector-content" hidden={isCompactEditorViewport}>
        {selectedElement === undefined ? (
          <>
            <div
              className="element-inspector__properties-region"
              data-testid="inspector-properties-region"
            >
              <div className="element-inspector__properties-scroll">
                <div className="document-inspector">
                  <p>{state.fileName ?? "Local PDF"}</p>
                  <dl>
                    <div>
                      <dt>Pages</dt>
                      <dd>{String(state.pageCount)}</dd>
                    </div>
                    <div>
                      <dt>Current page</dt>
                      <dd>{String(state.currentPageNumber)}</dd>
                    </div>
                    <div>
                      <dt>Zoom</dt>
                      <dd>{`${String(Math.round(zoom * 100))}%`}</dd>
                    </div>
                  </dl>
                  <p className="document-inspector-hint">
                    Select an element to edit its properties.
                  </p>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="element-inspector__tabs-region" data-testid="inspector-tabs-region">
              {selectedElement.type === "text" || selectedElement.type === "date" ? (
                <div
                  className="text-inspector-tabs"
                  role="tablist"
                  aria-label="Text inspector sections"
                >
                  {(["text", "style", "page"] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      role="tab"
                      aria-selected={textInspectorTab === tab}
                      onClick={() => {
                        setTextInspectorTab(tab);
                      }}
                    >
                      {tab === "text" ? "Text" : tab === "style" ? "Style" : "Page"}
                    </button>
                  ))}
                </div>
              ) : null}
              {["image", "whiteout", "checkmark", "cross", "signature", "initials"].includes(
                selectedElement.type,
              ) ? (
                <div
                  className="text-inspector-tabs"
                  role="tablist"
                  aria-label="Image inspector sections"
                >
                  {(["text", "style", "page"] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      role="tab"
                      aria-selected={imageInspectorTab === tab}
                      onClick={() => {
                        setImageInspectorTab(tab);
                      }}
                    >
                      {tab === "text"
                        ? "Image"
                        : tab === "style"
                          ? selectedElement.type === "checkmark" || selectedElement.type === "cross"
                            ? "Style"
                            : "Size"
                          : "Page"}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div
              className="element-inspector__properties-region"
              data-testid="inspector-properties-region"
            >
              <div className="element-inspector__properties-scroll">
                {selectedElement.type === "text" || selectedElement.type === "date" ? (
                  <section className="text-inspector" aria-label="Text properties">
                    {textInspectorTab === "text" ? (
                      <>
                        <label className="text-inspector-content">
                          Content
                          <textarea
                            aria-label="Text content"
                            value={selectedElement.text ?? ""}
                            onChange={(event) => {
                              applySnapshot(
                                editor.updateText(selectedElement.id, event.currentTarget.value),
                              );
                            }}
                          />
                        </label>{" "}
                        <div className="text-inspector-actions">
                          <button
                            type="button"
                            onClick={() => {
                              applySnapshot(editor.duplicateElement(selectedElement.id));
                            }}
                          >
                            Duplicate
                          </button>
                          <button
                            type="button"
                            className="text-inspector-delete"
                            onClick={() => {
                              applySnapshot(editor.deleteElement(selectedElement.id));
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    ) : null}

                    {textInspectorTab === "style" ? (
                      <>
                        <label>
                          Font
                          <select
                            aria-label="Text font"
                            value={selectedElement.textAppearance?.fontFamily ?? "Helvetica"}
                            onChange={(event) => {
                              applySnapshot(
                                editor.updateTextAppearance(selectedElement.id, {
                                  fontFamily: event.currentTarget.value,
                                }),
                              );
                            }}
                          >
                            <option>Helvetica</option>
                            <option>Times Roman</option>
                            <option>Courier</option>
                            <option disabled>----------------</option>
                            <option>Patrick Hand</option>
                          </select>
                        </label>

                        <div className="text-inspector-size-row">
                          <label>
                            Size
                            <select
                              aria-label="Text font size"
                              value={selectedElement.textAppearance?.fontSize ?? 16}
                              onChange={(event) => {
                                const fontSize = Number(event.currentTarget.value);
                                if (!Number.isFinite(fontSize) || fontSize <= 0) {
                                  return;
                                }
                                applySnapshot(
                                  editor.updateTextFontSize(selectedElement.id, fontSize),
                                );
                              }}
                            >
                              {[8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72, 96].map(
                                (size) => (
                                  <option key={size} value={size}>
                                    {size}
                                  </option>
                                ),
                              )}
                            </select>
                          </label>
                          <div className="text-inspector-toggle-group" aria-label="Text emphasis">
                            <button
                              type="button"
                              aria-label="Bold"
                              aria-pressed={selectedElement.textAppearance?.bold ?? false}
                              onClick={() => {
                                applySnapshot(
                                  editor.updateTextAppearance(selectedElement.id, {
                                    bold: !(selectedElement.textAppearance?.bold ?? false),
                                  }),
                                );
                              }}
                            >
                              B
                            </button>
                            <button
                              type="button"
                              className="text-inspector-italic"
                              aria-label="Italic"
                              aria-pressed={selectedElement.textAppearance?.italic ?? false}
                              onClick={() => {
                                applySnapshot(
                                  editor.updateTextAppearance(selectedElement.id, {
                                    italic: !(selectedElement.textAppearance?.italic ?? false),
                                  }),
                                );
                              }}
                            >
                              I
                            </button>
                            <button
                              type="button"
                              className="text-inspector-underline"
                              aria-label="Underline"
                              aria-pressed={selectedElement.textAppearance?.underline ?? false}
                              onClick={() => {
                                applySnapshot(
                                  editor.updateTextAppearance(selectedElement.id, {
                                    underline: !(
                                      selectedElement.textAppearance?.underline ?? false
                                    ),
                                  }),
                                );
                              }}
                            >
                              U
                            </button>
                          </div>
                        </div>

                        <label className="text-inspector-color">
                          Color
                          <ReleaseColorInput
                            ariaLabel="Text color"
                            value={
                              colorPreviewByElementId.get(selectedElement.id) ??
                              selectedElement.color ??
                              "#000000"
                            }
                            onPreview={(color) => {
                              handleColorPreview(selectedElement.id, color);
                            }}
                            onCommit={(color) => {
                              handleColorCommit(selectedElement.id, color);
                            }}
                          />
                        </label>

                        <div className="text-inspector-alignment">
                          <span>Alignment</span>
                          <div className="text-inspector-toggle-group" aria-label="Text alignment">
                            {(
                              [
                                ["left", "Align left", "\u2261"],
                                ["center", "Align center", "\u2261"],
                                ["right", "Align right", "\u2261"],
                              ] as const
                            ).map(([alignment, label, icon]) => (
                              <button
                                key={alignment}
                                type="button"
                                className={`text-inspector-align-${alignment}`}
                                aria-label={label}
                                aria-pressed={
                                  (selectedElement.textAppearance?.alignment ?? "left") ===
                                  alignment
                                }
                                onClick={() => {
                                  applySnapshot(
                                    editor.updateTextAppearance(selectedElement.id, {
                                      alignment,
                                    }),
                                  );
                                }}
                              >
                                {icon}
                              </button>
                            ))}
                          </div>
                        </div>

                        <label className="text-inspector-inline-field">
                          Line Height
                          <select
                            aria-label="Line height"
                            value={selectedElement.textAppearance?.lineHeight ?? 1.2}
                            onChange={(event) => {
                              applySnapshot(
                                editor.updateTextAppearance(selectedElement.id, {
                                  lineHeight: Number(event.currentTarget.value),
                                }),
                              );
                            }}
                          >
                            <option value="1">1.00</option>
                            <option value="1.2">1.20</option>
                            <option value="1.5">1.50</option>
                            <option value="2">2.00</option>
                          </select>
                        </label>

                        <label className="text-inspector-inline-field">
                          Letter Spacing
                          <select
                            aria-label="Letter spacing"
                            value={selectedElement.textAppearance?.letterSpacing ?? 0}
                            onChange={(event) => {
                              applySnapshot(
                                editor.updateTextAppearance(selectedElement.id, {
                                  letterSpacing: Number(event.currentTarget.value),
                                }),
                              );
                            }}
                          >
                            <option value="-0.5">-0.5</option>
                            <option value="0">0</option>
                            <option value="0.5">0.5</option>
                            <option value="1">1</option>
                            <option value="2">2</option>
                          </select>
                        </label>
                      </>
                    ) : null}

                    {textInspectorTab === "page" ? (
                      <p className="text-inspector-page">
                        This text belongs to page{" "}
                        {String(
                          state.pages.findIndex((page) => page.id === selectedElement.pageId) + 1,
                        )}
                        .
                      </p>
                    ) : null}
                  </section>
                ) : null}
                {["image", "whiteout", "checkmark", "cross", "signature", "initials"].includes(
                  selectedElement.type,
                ) ? (
                  <section className="image-inspector" aria-label="Image properties">
                    {imageInspectorTab === "text" ? (
                      <>
                        <div className="image-inspector-preview">
                          {selectedElement.image !== undefined ? (
                            <img
                              src={selectedElement.image.dataUrl}
                              alt="Selected element preview"
                            />
                          ) : (
                            <span
                              className={`element-inspector-symbol element-inspector-symbol-${selectedElement.type}`}
                            >
                              {selectedElement.type === "checkmark"
                                ? "\u2713"
                                : selectedElement.type === "cross"
                                  ? "\u00d7"
                                  : selectedElement.type === "whiteout"
                                    ? "Whiteout"
                                    : (selectedElement.text ?? elementLabel(selectedElement))}
                            </span>
                          )}
                        </div>
                        <dl className="image-inspector-metadata">
                          <div>
                            <dt>Format</dt>
                            <dd>
                              {selectedElement.image === undefined
                                ? "Overlay"
                                : selectedElement.image.mimeType === "image/png"
                                  ? "PNG"
                                  : "JPG"}
                            </dd>
                          </div>
                          <div>
                            <dt>Original size</dt>
                            <dd>{`${String(Math.round(selectedElement.bounds.width))} \u00d7 ${String(Math.round(selectedElement.bounds.height))} pt`}</dd>
                          </div>
                          <div>
                            <dt>Page</dt>
                            <dd>
                              {String(
                                state.pages.findIndex(
                                  (page) => page.id === selectedElement.pageId,
                                ) + 1,
                              )}
                            </dd>
                          </div>
                        </dl>
                      </>
                    ) : null}
                    {imageInspectorTab === "style" ? (
                      <>
                        <div className="image-inspector-size">
                          <label>
                            Width
                            <input
                              aria-label="Image width"
                              type="number"
                              min="16"
                              value={Math.round(selectedElement.bounds.width)}
                              onChange={(event) => {
                                const width = event.currentTarget.valueAsNumber;
                                if (Number.isFinite(width))
                                  applySnapshot(
                                    editor.resizeElement(selectedElement.id, {
                                      width,
                                      height: selectedElement.bounds.height,
                                    }),
                                  );
                              }}
                            />
                          </label>
                          <label>
                            Height
                            <input
                              aria-label="Image height"
                              type="number"
                              min="16"
                              value={Math.round(selectedElement.bounds.height)}
                              onChange={(event) => {
                                const height = event.currentTarget.valueAsNumber;
                                if (Number.isFinite(height))
                                  applySnapshot(
                                    editor.resizeElement(selectedElement.id, {
                                      width: selectedElement.bounds.width,
                                      height,
                                    }),
                                  );
                              }}
                            />
                          </label>
                        </div>
                        {selectedElement.type === "checkmark" ||
                        selectedElement.type === "cross" ? (
                          <label className="text-inspector-color">
                            Color
                            <ReleaseColorInput
                              ariaLabel={`${elementLabel(selectedElement)} color`}
                              value={
                                colorPreviewByElementId.get(selectedElement.id) ??
                                selectedElement.color ??
                                "#000000"
                              }
                              onPreview={(color) => {
                                handleColorPreview(selectedElement.id, color);
                              }}
                              onCommit={(color) => {
                                handleColorCommit(selectedElement.id, color);
                              }}
                            />
                          </label>
                        ) : null}
                      </>
                    ) : null}
                    {imageInspectorTab === "page" ? (
                      <p className="image-inspector-page">
                        This image belongs to page{" "}
                        {String(
                          state.pages.findIndex((page) => page.id === selectedElement.pageId) + 1,
                        )}
                        .
                      </p>
                    ) : null}
                    {imageInspectorTab === "text" ? (
                      <div className="image-inspector-actions">
                        <button
                          type="button"
                          onClick={() => {
                            applySnapshot(editor.duplicateElement(selectedElement.id));
                          }}
                        >
                          Duplicate
                        </button>{" "}
                        <button
                          type="button"
                          className="text-inspector-delete"
                          onClick={() => {
                            applySnapshot(editor.deleteElement(selectedElement.id));
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </section>
                ) : null}
              </div>
            </div>
          </>
        )}
        <LayersPanel
          layers={currentPageLayers}
          selectedElementId={selectedElement?.id}
          onSelect={(elementId) => {
            selectElementForInspector(elementId);
          }}
          onReorder={(elementId, targetIndex) => {
            applySnapshot(editor.reorderCurrentPageLayers(elementId, targetIndex));
          }}
          onSetAllVisible={(visible) => {
            applySnapshot(editor.setAllCurrentPageElementsVisibility(visible));
          }}
          onSetAllLocked={(locked) => {
            applySnapshot(editor.setAllCurrentPageElementsLocked(locked));
          }}
          onSetVisible={(elementId, visible) => {
            applySnapshot(editor.setElementVisibility(elementId, visible));
          }}
          onSetLocked={(elementId, locked) => {
            applySnapshot(editor.setElementLocked(elementId, locked));
          }}
        />
      </div>
    </aside>
  );

  const pageRailStartIndex = isLargeDocument ? thumbnailRenderRange.start : 0;
  const pageRailPages = isLargeDocument
    ? state.pages.slice(thumbnailRenderRange.start, thumbnailRenderRange.end)
    : state.pages;
  const pageRailPagesBefore = pageRailStartIndex;
  const pageRailPagesAfter = state.pageCount - pageRailStartIndex - pageRailPages.length;

  return (
    <section
      ref={editorViewportRef}
      className={`editor-viewer is-performance-${effectivePerformanceProfile}${isCompactEditorViewport ? ` is-compact-editor${isInspectorSheetOpen ? " is-mobile-inspector-open" : ""}${!isQuickEditNoticeDismissed ? " is-quick-edit-notice-visible" : ""}` : ""}${isTabletQuickEditViewport ? " is-tablet-quick-edit" : ""}`}
      aria-labelledby="editor-title"
      onPointerDownCapture={(event) => {
        const colorInput =
          event.target instanceof Element ? event.target.closest('input[type="color"]') : null;
        if (colorInput === null) {
          commitPendingColor();
        }
      }}
    >
      <header className="editor-header">
        <button
          type="button"
          className="editor-header-identity editor-home-link"
          aria-label="Go to NestlyPDF home"
          onClick={() => {
            onHomeRequest?.();
          }}
        >
          <img src={quickPdfMark} alt="" aria-hidden="true" />
          <span aria-hidden="true">NestlyPDF</span>
        </button>
        <div className="editor-document-meta">
          <h1 id="editor-title">{state.fileName ?? "Open PDF"}</h1>
          <p className="editor-subtitle" role="status">
            {state.status === "exporting"
              ? "Preparing edited PDF..."
              : state.isDirty
                ? "Unsaved temporary edits"
                : "No unsaved edits"}
          </p>
        </div>
        <div
          className="mobile-editor-header-actions"
          aria-label="Mobile editor actions"
          hidden={!isCompactEditorViewport}
        >
          <button
            type="button"
            hidden={!usesInspectorSheet}
            aria-label="Open page thumbnails"
            aria-expanded={isMobilePageRailOpen}
            onClick={() => {
              setIsMobilePageRailOpen(true);
            }}
          >
            <ToolbarIcon name="menu" />
          </button>
          <button type="button" aria-label="Undo" disabled={!snapshot.canUndo} onClick={undo}>
            <ToolbarIcon name="undo" />
          </button>
          <button type="button" aria-label="Redo" disabled={!snapshot.canRedo} onClick={redo}>
            <ToolbarIcon name="redo" />
          </button>
          <button
            type="button"
            aria-label="Download"
            onClick={download}
            disabled={!snapshot.canExport || state.status === "exporting"}
          >
            <ToolbarIcon name="download" />
          </button>
          {isTabletQuickEditViewport ? (
            <label className="editor-performance-profile">
              <span className="visually-hidden">Editor performance profile</span>
              <select
                aria-label="Editor performance profile"
                value={performanceProfile}
                onChange={(event) => {
                  setPerformanceProfile(event.currentTarget.value as EditorPerformanceProfile);
                }}
              >
                <option value="automatic">Automatic</option>
                <option value="light">Light Mode</option>
                <option value="full">Full Quality</option>
              </select>
            </label>
          ) : null}
        </div>
      </header>
      {isCompactEditorViewport && !isQuickEditNoticeDismissed ? (
        <section className="quick-edit-notice" role="status" aria-label="Quick Edit mode">
          <ToolbarIcon name="more" />
          <p>
            <strong>Quick Edit mode</strong>
            <span>
              Use desktop or tablet for layers, advanced formatting, and the full toolset.
            </span>
          </p>
          <button
            type="button"
            aria-label="Dismiss Quick Edit notice"
            onClick={() => {
              setIsQuickEditNoticeDismissed(true);
            }}
          >
            {"\u00d7"}
          </button>
        </section>
      ) : null}
      <div className="editor-controls">
        <div
          className="viewer-toolbar editor-toolbar"
          role="toolbar"
          aria-label="PDF editor controls"
        >
          <div
            className="toolbar-group toolbar-file-group"
            aria-label="File controls"
            hidden={isCompactEditorViewport}
          >
            <button
              type="button"
              aria-label="Open"
              onClick={onOpenRequest}
              disabled={onOpenRequest === undefined}
            >
              <ToolbarIcon name="open" />
              <span className="toolbar-label">Open</span>
            </button>
            <button
              type="button"
              aria-label="Download"
              onClick={download}
              disabled={!snapshot.canExport || state.status === "exporting"}
            >
              <ToolbarIcon name="download" />
              <span className="toolbar-label">Download</span>
            </button>
          </div>
          <div
            className="toolbar-group"
            aria-label="Edit controls"
            hidden={isCompactEditorViewport}
          >
            <button type="button" aria-label="Undo" disabled={!snapshot.canUndo} onClick={undo}>
              <ToolbarIcon name="undo" />
              <span className="toolbar-label">Undo</span>
            </button>
            <button type="button" aria-label="Redo" disabled={!snapshot.canRedo} onClick={redo}>
              <ToolbarIcon name="redo" />
              <span className="toolbar-label">Redo</span>
            </button>
            <button
              type="button"
              aria-label="Copy"
              disabled={state.selectedElementId === undefined}
              onClick={() => {
                applySnapshot(editor.copySelectedElement());
              }}
            >
              <ToolbarIcon name="copy" />
              <span className="toolbar-label">Copy</span>
            </button>
            <button
              type="button"
              aria-label="Paste"
              disabled={!snapshot.canPaste}
              onClick={() => {
                applySnapshot(editor.pasteCopiedElement());
              }}
            >
              <ToolbarIcon name="paste" />
              <span className="toolbar-label">Paste</span>
            </button>
          </div>
          <div className="toolbar-group toolbar-tools-group" aria-label="Insert tools">
            <button
              type="button"
              aria-label="Select"
              data-mobile-primary="true"
              aria-pressed={state.tool === "select"}
              onClick={() => {
                applySnapshot(editor.setTool("select"));
              }}
            >
              <ToolbarIcon name="select" />
              <span className="toolbar-label">Select</span>
            </button>
            <button
              type="button"
              aria-label="Text"
              data-mobile-primary="true"
              aria-pressed={state.tool === "text"}
              onClick={() => {
                applySnapshot(editor.setTool("text"));
              }}
            >
              <ToolbarIcon name="text" />
              <span className="toolbar-label">Text</span>
            </button>
            <button
              type="button"
              hidden={isCompactEditorViewport}
              aria-label="Whiteout"
              aria-pressed={state.tool === "whiteout"}
              onClick={() => {
                applySnapshot(editor.setTool("whiteout"));
              }}
            >
              <ToolbarIcon name="whiteout" />
              <span className="toolbar-label">Whiteout</span>
            </button>
            <button
              type="button"
              aria-label="Image"
              data-mobile-primary="true"
              aria-pressed={state.tool === "image"}
              onClick={() => {
                imageInputRef.current?.click();
              }}
            >
              <ToolbarIcon name="image" />
              <span className="toolbar-label">Image</span>
            </button>
            <input
              ref={imageInputRef}
              className="visually-hidden"
              aria-label="Choose image"
              type="file"
              accept="image/png,image/jpeg"
              style={{ display: "none" }}
              onChange={handleImageFileChange}
            />
            <button
              type="button"
              aria-label="Signature"
              data-mobile-primary="true"
              aria-pressed={state.tool === "signature"}
              onClick={() => {
                applySnapshot(editor.setTool("signature"));
                setDialogType("signature");
              }}
            >
              <ToolbarIcon name="signature" />
              <span className="toolbar-label">Signature</span>
            </button>
            <button
              type="button"
              hidden={isCompactEditorViewport}
              aria-label="Initials"
              aria-pressed={state.tool === "initials"}
              onClick={() => {
                applySnapshot(editor.setTool("initials"));
                setDialogType("initials");
              }}
            >
              <ToolbarIcon name="initials" />
              <span className="toolbar-label">Initials</span>
            </button>
            <button
              type="button"
              aria-label="Checkmark"
              data-mobile-primary="true"
              aria-pressed={state.tool === "checkmark"}
              onClick={() => {
                applySnapshot(editor.setTool("checkmark"));
              }}
            >
              <ToolbarIcon name="checkmark" />
              <span className="toolbar-label">Check</span>
            </button>
            <button
              type="button"
              hidden={isCompactEditorViewport}
              aria-label="Cross"
              aria-pressed={state.tool === "cross"}
              onClick={() => {
                applySnapshot(editor.setTool("cross"));
              }}
            >
              <ToolbarIcon name="cross" />
              <span className="toolbar-label">Cross</span>
            </button>
            <button
              type="button"
              aria-label="Date"
              data-mobile-primary="true"
              aria-pressed={state.tool === "date"}
              onClick={() => {
                applySnapshot(editor.setTool("date"));
              }}
            >
              <ToolbarIcon name="date" />
              <span className="toolbar-label">Date</span>
            </button>
          </div>
          <div className="mobile-tools-overflow" hidden={!isCompactEditorViewport}>
            <button
              type="button"
              aria-label="More editor tools"
              aria-expanded={isMobileMoreOpen}
              onClick={() => {
                setIsMobileMoreOpen((open) => !open);
              }}
            >
              <ToolbarIcon name="more" />
              <span className="toolbar-label">More</span>
            </button>
          </div>
          <output
            className="visually-hidden"
            aria-label="Zoom level"
          >{`${String(Math.round(zoom * 100))}%`}</output>
          <div
            className="toolbar-group toolbar-view-group"
            aria-label="View controls"
            hidden={isCompactEditorViewport}
          >
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() => {
                applyZoom(zoomRef.current - ZOOM_STEP);
              }}
            >
              <ToolbarIcon name="zoom-out" />
              <span className="toolbar-label">Zoom out</span>
            </button>
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() => {
                applyZoom(zoomRef.current + ZOOM_STEP);
              }}
            >
              <ToolbarIcon name="zoom-in" />
              <span className="toolbar-label">Zoom in</span>
            </button>
            <button
              type="button"
              aria-label="Fit page"
              aria-pressed={viewMode === "fit-page"}
              onClick={() => {
                applyFit("fit-page");
              }}
            >
              <ToolbarIcon name="fit" />
              <span className="toolbar-label">Fit page</span>
            </button>
            <button
              type="button"
              aria-label="Fit width"
              aria-pressed={viewMode === "fit-width"}
              onClick={() => {
                applyFit("fit-width");
              }}
            >
              <ToolbarIcon name="fit" />
              <span className="toolbar-label">Fit width</span>
            </button>
          </div>
          <div
            className="toolbar-group toolbar-pages-group"
            aria-label="Page controls"
            hidden={isCompactEditorViewport}
          >
            <button
              type="button"
              aria-label="Previous page"
              disabled={state.currentPageNumber <= 1}
              onClick={() => {
                applySnapshot(editor.previousPage());
              }}
            >
              <ToolbarIcon name="previous" />
              <span className="toolbar-label">Previous</span>
            </button>
            <output aria-label="Current page">
              <span>
                {state.currentPageNumber} / {state.pageCount}
              </span>
            </output>
            <button
              type="button"
              aria-label="Next page"
              disabled={state.currentPageNumber >= state.pageCount}
              onClick={() => {
                applySnapshot(editor.nextPage());
              }}
            >
              <ToolbarIcon name="next" />
              <span className="toolbar-label">Next</span>
            </button>
          </div>
        </div>
      </div>
      <div className="editor-message-strip">
        <p className="whiteout-note">
          Whiteout only covers content visually. It does not securely remove underlying PDF data.
        </p>
        {imageUploadError === undefined ? null : (
          <p className="error-message" role="alert">
            {imageUploadError}
          </p>
        )}
        {pendingImage === undefined || state.tool !== "image" ? null : (
          <p className="status-note" role="status">
            Click the PDF page to place the image.
          </p>
        )}
        {state.exportFilename === undefined ? null : (
          <p className="status-note" role="status">
            Downloaded {state.exportFilename}. The editor remains open.
          </p>
        )}
        {state.error === undefined ? null : (
          <p className="error-message" role="alert">
            {state.error.message}
          </p>
        )}
        {renderState.status === "loading" && !isCompactEditorViewport ? (
          <p className="status-note" role="status">
            Rendering PDF page...
          </p>
        ) : null}
        {renderState.status === "error" ? (
          <p className="error-message" role="alert">
            {renderState.message ?? "The PDF page could not be rendered."}
          </p>
        ) : null}
      </div>
      <div
        className={`editor-workspace-shell${isPageRailCollapsed ? " is-rail-collapsed" : ""}${isMobilePageRailOpen ? " is-mobile-rail-open" : ""}`}
      >
        <aside
          className={`page-rail${isPageRailCollapsed ? " is-collapsed" : ""}${isMobilePageRailOpen ? " is-mobile-open" : ""}`}
          aria-label="Page rail"
        >
          <div className="page-rail-header">
            <strong>Pages</strong>
            <button
              type="button"
              className="mobile-page-rail-close"
              hidden={!usesInspectorSheet}
              aria-label="Close page thumbnails"
              onClick={() => {
                setIsMobilePageRailOpen(false);
              }}
            >
              {"\u00d7"}
            </button>
            <button
              type="button"
              aria-label={isPageRailCollapsed ? "Expand page rail" : "Collapse page rail"}
              aria-pressed={isPageRailCollapsed}
              onClick={() => {
                setIsPageRailCollapsed((collapsed) => !collapsed);
              }}
            >
              {isPageRailCollapsed ? ">" : "<"}
            </button>
          </div>
          <div
            ref={pageRailListRef}
            className="page-rail-list"
            onScroll={updateLargeDocumentThumbnailRange}
          >
            {isLargeDocument && pageRailPagesBefore > 0 ? (
              <div
                className="page-rail-spacer"
                aria-hidden="true"
                style={{ height: pageRailPagesBefore * thumbnailRowStride }}
              />
            ) : null}
            {pageRailPages.map((page, visibleIndex) => {
              const pageIndex = pageRailStartIndex + visibleIndex;
              return (
                <PageThumbnail
                  key={page.id}
                  renderer={pdfRenderer}
                  documentId={state.renderDocumentId}
                  pageNumber={pageIndex + 1}
                  pageId={page.id}
                  current={page.id === currentPageId}
                  renderEnabled={!isLargeDocument || renderState.status === "ready"}
                  maxWidth={effectivePerformanceProfile === "light" ? 96 : 126}
                  devicePixelRatio={renderPixelRatio}
                  onSelect={(pageId) => {
                    applySnapshot(editor.selectPage(pageId));
                  }}
                />
              );
            })}
            {isLargeDocument && pageRailPagesAfter > 0 ? (
              <div
                className="page-rail-spacer"
                aria-hidden="true"
                style={{ height: pageRailPagesAfter * thumbnailRowStride }}
              />
            ) : null}
          </div>
        </aside>
        <div className="editor-viewport" aria-label="PDF editor viewport">
          <main
            ref={workspaceRef}
            className={`viewer-main${isWorkspacePanning ? " is-panning" : ""}`}
            aria-label="PDF workspace"
            onClick={handleWorkspaceClick}
            onPointerDown={startWorkspacePan}
            onPointerMove={updateWorkspacePan}
            onPointerUp={endWorkspacePan}
            onPointerCancel={endWorkspacePan}
          >
            <div
              className="pdf-page-frame"
              style={{ width: pageCssWidth, height: pageCssHeight }}
              aria-label={`PDF page ${String(state.currentPageNumber)} of ${String(state.pageCount)}`}
            >
              <canvas ref={canvasRef} className="pdf-page-canvas" aria-label="Rendered PDF page" />
              <div
                ref={overlayLayerRef}
                className="overlay-layer"
                aria-label="PDF overlay"
                onClick={handleOverlayClick}
                onPointerDown={startWhiteoutDraft}
                onPointerMove={updateWhiteoutDraft}
                onPointerUp={finishWhiteoutDraft}
                onPointerCancel={cancelWhiteoutDraft}
              >
                {whiteoutPreviewBounds === undefined ? null : (
                  <div
                    className="whiteout-preview"
                    aria-label="Whiteout preview"
                    style={boundsStyle(whiteoutPreviewBounds, zoom)}
                  />
                )}
                {state.visibleElements.map((element) => {
                  const elementBounds =
                    visualResizePreview?.elementId === element.id
                      ? visualResizePreview.bounds
                      : element.bounds;
                  const previewFontSize =
                    visualResizePreview?.elementId === element.id
                      ? visualResizePreview.fontSize
                      : undefined;
                  const isResizing =
                    pointerAction?.kind === "resize" && pointerAction.elementId === element.id;
                  return (
                    <div
                      key={element.id}
                      className={`overlay-element overlay-${element.type}${state.selectedElementId === element.id ? " is-selected" : ""}${isResizing ? " is-resizing" : ""}`}
                      style={boundsStyle(elementBounds, zoom)}
                      role="group"
                      aria-label={`${element.type} element`}
                      data-locked={element.locked ? "true" : "false"}
                      aria-description={
                        element.type === "text" || element.type === "date"
                          ? "Press Enter to edit selected text."
                          : undefined
                      }
                      tabIndex={element.type === "text" || element.type === "date" ? 0 : undefined}
                      onPointerDown={(event) => {
                        startElementMove(element, event);
                      }}
                      onMouseDown={(event) => {
                        if (element.type === "image") {
                          startElementMove(element, event);
                        }
                      }}
                    >
                      {" "}
                      {element.type === "text" || element.type === "date" ? (
                        editingTextElementId === element.id ? (
                          <textarea
                            ref={setEditingTextArea}
                            aria-label="Edit text element"
                            autoFocus
                            value={element.text ?? ""}
                            style={{
                              color:
                                colorPreviewByElementId.get(element.id) ??
                                element.color ??
                                "#000000",
                              fontFamily:
                                element.textAppearance?.fontFamily ??
                                "Helvetica, Arial, sans-serif",
                              fontSize:
                                (previewFontSize ?? element.textAppearance?.fontSize ?? 16) * zoom,
                              fontStyle: element.textAppearance?.italic ? "italic" : "normal",
                              fontWeight: element.textAppearance?.bold ? 700 : 400,
                              letterSpacing: `${String(element.textAppearance?.letterSpacing ?? 0)}px`,
                              lineHeight: element.textAppearance?.lineHeight ?? 1.2,
                              textAlign: element.textAppearance?.alignment ?? "left",
                              textDecoration: element.textAppearance?.underline
                                ? "underline"
                                : "none",
                            }}
                            onChange={(event) => {
                              applySnapshot(
                                editor.updateText(element.id, event.currentTarget.value),
                              );
                            }}
                            onBlur={() => {
                              setEditingTextElementId(undefined);
                            }}
                          />
                        ) : (
                          <div
                            className="text-element-display"
                            aria-label="Text element content"

                            style={{
                              color:
                                colorPreviewByElementId.get(element.id) ??
                                element.color ??
                                "#000000",
                              fontFamily:
                                element.textAppearance?.fontFamily ??
                                "Helvetica, Arial, sans-serif",
                              fontSize:
                                (previewFontSize ?? element.textAppearance?.fontSize ?? 16) * zoom,
                              fontStyle: element.textAppearance?.italic ? "italic" : "normal",
                              fontWeight: element.textAppearance?.bold ? 700 : 400,
                              letterSpacing: `${String(element.textAppearance?.letterSpacing ?? 0)}px`,
                              lineHeight: element.textAppearance?.lineHeight ?? 1.2,
                              textAlign: element.textAppearance?.alignment ?? "left",
                              textDecoration: element.textAppearance?.underline
                                ? "underline"
                                : "none",
                            }}
                            onDoubleClick={(event) => {
                              if (element.locked) {
                                return;
                              }
                              event.stopPropagation();
                              setEditingTextElementId(element.id);
                            }}
                          >
                            {element.text}
                          </div>
                        )
                      ) : null}
                      {element.type === "checkmark" || element.type === "cross" ? (
                        <svg
                          className={`annotation-symbol annotation-${element.type}`}
                          style={{
                            stroke:
                              colorPreviewByElementId.get(element.id) ?? element.color ?? "#000000",
                          }}
                          viewBox="0 0 100 100"
                          aria-hidden="true"
                          focusable="false"
                        >
                          {element.type === "checkmark" ? (
                            <path d="M16 52 L40 76 L84 24" />
                          ) : (
                            <>
                              <path d="M22 22 L78 78" />
                              <path d="M78 22 L22 78" />
                            </>
                          )}
                        </svg>
                      ) : null}
                      {element.type === "image" && element.image !== undefined ? (
                        <img
                          src={element.image.dataUrl}
                          alt=""
                          draggable={false}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "fill",
                            display: "block",
                          }}
                        />
                      ) : null}
                      {element.type === "signature" || element.type === "initials" ? (
                        element.image === undefined ? (
                          <div
                            className={signatureTextClass(element.textAppearance?.fontFamily)}
                            style={{
                              color:
                                colorPreviewByElementId.get(element.id) ??
                                element.color ??
                                "#000000",
                              fontSize: (element.textAppearance?.fontSize ?? 30) * zoom,
                            }}
                          >
                            {element.text}
                          </div>
                        ) : (
                          <img src={element.image.dataUrl} alt="" draggable={false} />
                        )
                      ) : null}
                      {state.selectedElementId === element.id && !element.locked ? (
                        <button
                          type="button"
                          className="resize-handle"
                          aria-label={`Resize ${element.type} element`}
                          data-resize-handle="true"
                          onPointerDown={(event) => {
                            startElementResize(element, event);
                          }}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </main>
        </div>

        {usesInspectorSheet ? null : elementInspector}
      </div>
      <footer className="editor-status-bar" aria-label="Document status">
        <button
          type="button"
          className="mobile-status-page-drawer"
          hidden={!usesInspectorSheet}
          aria-label="Open page thumbnails"
          onClick={() => {
            setIsMobilePageRailOpen(true);
          }}
        >
          {`${String(state.currentPageNumber)} / ${String(state.pageCount)}`}
        </button>
        <button
          type="button"
          className="mobile-status-previous"
          hidden={!usesInspectorSheet}
          aria-label="Previous page"
          disabled={state.currentPageNumber <= 1}
          onClick={() => {
            applySnapshot(editor.previousPage());
          }}
        >
          <ToolbarIcon name="previous" />
        </button>
        <button
          type="button"
          className="mobile-status-zoom mobile-status-zoom-out"
          hidden={!usesInspectorSheet}
          aria-label="Zoom out"
          onClick={() => {
            applyZoom(zoomRef.current - ZOOM_STEP);
          }}
        >
          <ToolbarIcon name="zoom-out" />
        </button>
        <output
          className="mobile-status-zoom-value"
          aria-label="Mobile viewer scale"
          hidden={!usesInspectorSheet}
        >{`${String(Math.round(zoom * 100))}%`}</output>
        <button
          type="button"
          className="mobile-status-zoom mobile-status-zoom-in"
          hidden={!usesInspectorSheet}
          aria-label="Zoom in"
          onClick={() => {
            applyZoom(zoomRef.current + ZOOM_STEP);
          }}
        >
          <ToolbarIcon name="zoom-in" />
        </button>

        <button
          type="button"
          className="mobile-status-next"
          hidden={!usesInspectorSheet}
          aria-label="Next page"
          disabled={state.currentPageNumber >= state.pageCount}
          onClick={() => {
            applySnapshot(editor.nextPage());
          }}
        >
          <ToolbarIcon name="next" />
        </button>
        <button
          type="button"
          className="mobile-status-inspector"
          hidden={!usesInspectorSheet}
          aria-label="Open editor inspector"
          aria-expanded={isInspectorSheetOpen}
          onClick={openInspectorSheet}
        >
          <ToolbarIcon name="fit" />
        </button>
        <span className="desktop-status-copy">{`Page ${String(state.currentPageNumber)} of ${String(state.pageCount)}`}</span>
        <span className="desktop-status-copy">{`${String(Math.round(zoom * 100))}%`}</span>
        <span className="desktop-status-copy">{state.isDirty ? "Unsaved changes" : "Ready"}</span>
        {isDesktopEditorViewport ? (
          <button
            type="button"
            className="status-document-dates"
            aria-label="Edit PDF dates"
            aria-expanded={isDocumentDatesDialogOpen}
            disabled={!snapshot.canExport || state.status === "exporting"}
            onClick={() => {
              setIsDocumentDatesDialogOpen(true);
            }}
          >
            <ToolbarIcon name="calendar-clock" />
            <span>PDF dates</span>
          </button>
        ) : null}
      </footer>
      {isDesktopEditorViewport && isDocumentDatesDialogOpen ? (
        <DocumentDatesDialog
          documentDates={state.documentDates}
          sourceDocumentDates={state.sourceDocumentDates}
          onCancel={() => {
            setIsDocumentDatesDialogOpen(false);
          }}
          onApply={(dates: DocumentDates) => {
            applySnapshot(editor.setDocumentDates(dates));
            setIsDocumentDatesDialogOpen(false);
          }}
        />
      ) : null}
      {usesInspectorSheet ? elementInspector : null}
      {isExportDialogOpen ? (
        <ExportPdfDialog
          filename={exportFilename}
          mode={exportMode}
          compressionLevel={compressionLevel}
          isExporting={isExporting}
          progress={compressionProgress}
          error={state.error?.code === "CompressionNotBeneficial" ? state.error.message : undefined}
          onFilenameChange={setExportFilename}
          onModeChange={setExportMode}
          onCompressionLevelChange={setCompressionLevel}
          onCancel={cancelExport}
          onExport={() => void exportPdf()}
        />
      ) : null}{" "}
      {dialogType === undefined ? null : (
        <SignatureDialog
          type={dialogType}
          onCancel={() => {
            setDialogType(undefined);
          }}
          onAcceptImage={acceptSignatureImage}
          onAcceptText={acceptTypedSignature}
          backgroundRemover={backgroundRemover}
        />
      )}
    </section>
  );
};

interface ExportPdfDialogProps {
  readonly filename: string;
  readonly mode: PdfExportMode;
  readonly compressionLevel: PdfCompressionLevel;
  readonly isExporting: boolean;
  readonly progress: PdfCompressionProgress | undefined;
  readonly error: string | undefined;
  readonly onFilenameChange: (filename: string) => void;
  readonly onModeChange: (mode: PdfExportMode) => void;
  readonly onCompressionLevelChange: (level: PdfCompressionLevel) => void;
  readonly onCancel: () => void;
  readonly onExport: () => void;
}

const COMPRESSION_LEVEL_OPTIONS: readonly {
  readonly level: PdfCompressionLevel;
  readonly title: string;
  readonly description: string;
}[] = [
  {
    level: "balanced",
    title: "Balanced",
    description: "Images at 150 DPI. Sharp on screen and on paper.",
  },
  {
    level: "strong",
    title: "Strong",
    description: "Images at 110 DPI with stronger JPEG. Best for email and uploads.",
  },
  {
    level: "maximum",
    title: "Maximum",
    description: "Smallest possible file. Pages may be flattened into images.",
  },
];

const compressionProgressLabel = (progress: PdfCompressionProgress | undefined): string => {
  if (progress === undefined) return "Preparing compression...";
  const position = `${String(progress.currentPage)} of ${String(progress.totalPages)}`;
  return progress.unit === "image" ? `Optimizing image ${position}` : `Page ${position}`;
};

const ExportPdfDialog = ({
  filename,
  mode,
  compressionLevel,
  isExporting,
  progress,
  error,
  onFilenameChange,
  onModeChange,
  onCompressionLevelChange,
  onCancel,
  onExport,
}: ExportPdfDialogProps): React.ReactElement => {
  const isCompressing = isExporting && mode === "compressed";
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && !isExporting) {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isExporting, onCancel]);
  return createPortal(
    <div
      className="export-dialog-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !isExporting) onCancel();
      }}
    >
      <section
        aria-labelledby="export-pdf-title"
        aria-modal="true"
        className="export-dialog"
        role="dialog"
      >
        <header>
          <span aria-hidden="true" className="export-dialog__icon">
            <ToolbarIcon name="download" />
          </span>
          <div>
            <h2 id="export-pdf-title">Export PDF</h2>
            <p>Choose how you want to export your PDF.</p>
          </div>
          <button
            aria-label="Close export dialog"
            disabled={isExporting}
            type="button"
            onClick={onCancel}
          >
            {"\u00d7"}
          </button>
        </header>
        {isCompressing ? (
          <section aria-live="polite" className="export-dialog__progress">
            <strong>Compressing PDF...</strong>
            <span>{compressionProgressLabel(progress)}</span>
            <progress max={progress?.totalPages ?? 1} value={progress?.currentPage ?? 0} />
            <p>Your document remains on this device.</p>
          </section>
        ) : (
          <>
            <label className="export-dialog__filename">
              File name
              <input
                aria-label="Export filename"
                value={filename}
                onChange={(event) => {
                  onFilenameChange(event.currentTarget.value);
                }}
              />
            </label>
            <fieldset>
              <legend>Export option</legend>
              <label className={mode === "original" ? "is-selected" : ""}>
                <input
                  checked={mode === "original"}
                  name="export-mode"
                  type="radio"
                  value="original"
                  onChange={() => {
                    onModeChange("original");
                  }}
                />
                <span>
                  <strong>Original Size (No Compression)</strong>
                  <small>
                    Export with the original document quality. NestlyPDF edits will be included.
                  </small>
                </span>
              </label>
              <label className={mode === "compressed" ? "is-selected" : ""}>
                <input
                  checked={mode === "compressed"}
                  name="export-mode"
                  type="radio"
                  value="compressed"
                  onChange={() => {
                    onModeChange("compressed");
                  }}
                />
                <span>
                  <strong>
                    Compress PDF <em>Recommended</em>
                  </strong>
                  <small>
                    Smaller file. Images are resized and re-encoded; text stays selectable.
                  </small>
                </span>
              </label>
            </fieldset>
            {mode === "compressed" ? (
              <fieldset className="export-dialog__levels">
                <legend>Compression level</legend>
                {COMPRESSION_LEVEL_OPTIONS.map((option) => (
                  <label
                    className={compressionLevel === option.level ? "is-selected" : ""}
                    key={option.level}
                  >
                    <input
                      checked={compressionLevel === option.level}
                      name="compression-level"
                      type="radio"
                      value={option.level}
                      onChange={() => {
                        onCompressionLevelChange(option.level);
                      }}
                    />
                    <span>
                      <strong>{option.title}</strong>
                      <small>{option.description}</small>
                    </span>
                  </label>
                ))}
              </fieldset>
            ) : null}
            {error === undefined ? null : (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
            <p className="export-dialog__privacy">
              Your files stay in your browser.<small>Private. Secure. Always local.</small>
            </p>
          </>
        )}
        <footer>
          <button disabled={isExporting} type="button" onClick={onCancel}>
            Cancel
          </button>
          <button disabled={isExporting} type="button" onClick={onExport}>
            {isCompressing ? "Compressing..." : "Export PDF"}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
};
interface SignatureDialogProps {
  readonly type: SignatureElementType;
  readonly onCancel: () => void;
  readonly onAcceptImage: (image: SignatureImageInput) => void;
  readonly onAcceptText: (text: string, fontFamily: SignatureFont) => void;
  readonly backgroundRemover: SignatureBackgroundRemover;
}

interface SignatureUploadPreview {
  /** The image exactly as the user picked it, kept so the removal can be undone. */
  readonly original: SignatureImageInput;
  /** The ink on a transparent background, missing when removal did not produce one. */
  readonly separated?: SignatureImageInput;
  readonly status: "pending" | "removed" | "already-transparent" | "unchanged" | "failed";
}

const uploadPreviewNote = (preview: SignatureUploadPreview): string | undefined => {
  switch (preview.status) {
    case "removed":
      return "Background removed. Only the signature ink will be placed on the page.";
    case "already-transparent":
      return "This image already had a transparent background, so it was only trimmed.";
    case "unchanged":
      return "No clear background was found, so the image was kept exactly as uploaded.";
    case "pending":
    case "failed":
      return undefined;
  }
};

const SignatureDialog = ({
  type,
  onCancel,
  onAcceptImage,
  onAcceptText,
  backgroundRemover,
}: SignatureDialogProps): React.ReactElement => {
  const [mode, setMode] = useState<SignatureDialogMode>("draw");
  const [typedName, setTypedName] = useState(type === "signature" ? "Your Name" : "YN");
  const [fontFamily, setFontFamily] = useState<SignatureFont>("cursive");
  const [uploadError, setUploadError] = useState<string | undefined>();
  const [uploadPreview, setUploadPreview] = useState<SignatureUploadPreview | undefined>();
  const [removeBackground, setRemoveBackground] = useState(true);
  const [isRemovingBackground, setIsRemovingBackground] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const isDrawingRef = useRef(false);
  const hasStrokeRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    // Re-armed on every mount: StrictMode mounts, unmounts, and mounts again in development,
    // so a flag only ever cleared here would strand the next background removal mid-flight.
    isMountedRef.current = true;
    dialogRef.current?.focus();
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
      if (event.key !== "Tab") {
        return;
      }
      const dialog = dialogRef.current;
      if (dialog === null) {
        return;
      }
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          "button, input, select, canvas, [tabindex]:not([tabindex='-1'])",
        ),
      ).filter((element) => !element.hasAttribute("disabled"));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (first === undefined || last === undefined) {
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onCancel]);

  const clearCanvas = (): void => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas == null || context == null) {
      return;
    }
    context.clearRect(0, 0, canvas.width, canvas.height);
    hasStrokeRef.current = false;
  };

  const startDrawing = (event: PointerEvent<HTMLCanvasElement>): void => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas == null || context == null) {
      return;
    }
    canvas.setPointerCapture(event.pointerId);
    const rect = canvas.getBoundingClientRect();
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 4;
    context.strokeStyle = "#000000";
    context.beginPath();
    context.moveTo(event.clientX - rect.left, event.clientY - rect.top);
    isDrawingRef.current = true;
  };

  const continueDrawing = (event: PointerEvent<HTMLCanvasElement>): void => {
    if (!isDrawingRef.current) {
      return;
    }
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas == null || context == null) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    context.lineTo(event.clientX - rect.left, event.clientY - rect.top);
    context.stroke();
    hasStrokeRef.current = true;
  };

  const finishDrawing = (): void => {
    isDrawingRef.current = false;
  };

  const acceptDraw = (): void => {
    const canvas = canvasRef.current;
    if (canvas === null || !hasStrokeRef.current) {
      setUploadError(`Draw ${type === "signature" ? "a signature" : "initials"} before accepting.`);
      return;
    }
    onAcceptImage(canvasToImageInput(canvas, "draw"));
  };

  const separateUploadedBackground = async (original: SignatureImageInput): Promise<void> => {
    setIsRemovingBackground(true);
    const outcome = await backgroundRemover.remove(original);
    if (!isMountedRef.current) {
      return;
    }
    setIsRemovingBackground(false);
    if (outcome.status === "failed") {
      setUploadError(outcome.error.message);
      setUploadPreview({ original, status: "failed" });
      return;
    }
    setUploadPreview(
      outcome.status === "unchanged"
        ? { original, status: "unchanged" }
        : { original, separated: outcome.image, status: outcome.status },
    );
  };

  const acceptUpload = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.currentTarget.files?.[0];
    if (file === undefined) {
      return;
    }
    const validationError = validateSignatureImageFile(file);
    if (validationError !== undefined) {
      setUploadError(validationError.message);
      return;
    }
    setUploadError(undefined);
    setUploadPreview(undefined);
    const image = new Image();
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") {
        setUploadError("The signature image could not be read.");
        return;
      }
      const dataUrl = reader.result;
      image.addEventListener("load", () => {
        const original: SignatureImageInput = {
          dataUrl,
          mimeType: file.type === "image/png" ? "image/png" : "image/jpeg",
          width: image.naturalWidth,
          height: image.naturalHeight,
          source: "upload",
        };
        setUploadPreview({ original, status: "pending" });
        if (removeBackground) {
          void separateUploadedBackground(original);
        }
      });
      image.src = dataUrl;
    });
    reader.readAsDataURL(file);
  };

  const previewImage =
    uploadPreview === undefined
      ? undefined
      : removeBackground
        ? (uploadPreview.separated ?? uploadPreview.original)
        : uploadPreview.original;

  const toggleRemoveBackground = (enabled: boolean): void => {
    setRemoveBackground(enabled);
    if (!enabled || uploadPreview === undefined || uploadPreview.separated !== undefined) {
      return;
    }
    setUploadError(undefined);
    void separateUploadedBackground(uploadPreview.original);
  };

  return (
    <div className="modal-backdrop">
      <div
        ref={dialogRef}
        className="signature-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="signature-dialog-title"
        tabIndex={-1}
      >
        <header className="dialog-header">
          <h2 id="signature-dialog-title">{type === "signature" ? "Signature" : "Initials"}</h2>
          <button
            type="button"
            className="dialog-close"
            aria-label="Close dialog"
            onClick={onCancel}
          >
            {"\u00d7"}
          </button>
        </header>
        <div className="dialog-tabs" role="tablist" aria-label={`${type} methods`}>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "draw"}
            onClick={() => {
              setMode("draw");
            }}
          >
            Draw
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "type"}
            onClick={() => {
              setMode("type");
            }}
          >
            Type
          </button>
          {type === "signature" ? (
            <button
              type="button"
              role="tab"
              aria-selected={mode === "upload"}
              onClick={() => {
                setMode("upload");
              }}
            >
              Upload
            </button>
          ) : null}
        </div>
        {uploadError === undefined ? null : (
          <p className="error-message" role="alert">
            {uploadError}
          </p>
        )}
        {mode === "draw" ? (
          <div className="signature-panel">
            <canvas
              ref={canvasRef}
              className="signature-pad"
              width="480"
              height="180"
              aria-label={`Draw ${type}`}
              tabIndex={0}
              onPointerDown={startDrawing}
              onPointerMove={continueDrawing}
              onPointerUp={finishDrawing}
              onPointerCancel={finishDrawing}
            />
            <div className="dialog-actions">
              <button type="button" onClick={clearCanvas}>
                Clear
              </button>
              <button type="button" onClick={acceptDraw}>
                Accept
              </button>
            </div>
          </div>
        ) : null}
        {mode === "type" ? (
          <div className="signature-panel">
            <label>
              {type === "signature" ? "Signature name" : "Initials"}
              <input
                aria-label={type === "signature" ? "Signature name" : "Initials text"}
                value={typedName}
                onChange={(event) => {
                  setTypedName(event.currentTarget.value);
                }}
              />
            </label>
            <label>
              Font
              <select
                value={fontFamily}
                onChange={(event) => {
                  setFontFamily(event.currentTarget.value as SignatureFont);
                }}
              >
                {SIGNATURE_FONTS.map((font) => (
                  <option key={font.value} value={font.value}>
                    {font.label}
                  </option>
                ))}
              </select>
            </label>
            <div className={signatureTextClass(fontFamily)} aria-label="Signature preview">
              {typedName}
            </div>
            <div className="dialog-actions">
              <button
                type="button"
                onClick={() => {
                  onAcceptText(typedName, fontFamily);
                }}
              >
                Accept
              </button>
            </div>
          </div>
        ) : null}
        {mode === "upload" && type === "signature" ? (
          <div className="signature-panel">
            <label>
              Upload PNG or JPG
              <input
                aria-label="Upload signature image"
                type="file"
                accept="image/png,image/jpeg"
                onChange={acceptUpload}
              />
            </label>
            <label className="signature-option">
              <input
                type="checkbox"
                checked={removeBackground}
                onChange={(event) => {
                  toggleRemoveBackground(event.currentTarget.checked);
                }}
              />
              Remove background automatically
            </label>
            {uploadPreview === undefined || previewImage === undefined ? (
              <p className="signature-upload-hint">
                Photograph or scan your signature on plain paper. The paper is removed here in your
                browser; the image is never uploaded.
              </p>
            ) : (
              <>
                <div className="signature-upload-preview">
                  <img
                    src={previewImage.dataUrl}
                    alt="Signature preview"
                    aria-label="Uploaded signature preview"
                  />
                </div>
                <p
                  className="signature-upload-hint"
                  role="status"
                  aria-label="Signature upload status"
                >
                  {isRemovingBackground
                    ? "Removing background…"
                    : removeBackground
                      ? (uploadPreviewNote(uploadPreview) ?? "Using the uploaded image as it is.")
                      : "Using the uploaded image as it is."}
                </p>
                <div className="dialog-actions">
                  <button
                    type="button"
                    disabled={isRemovingBackground}
                    onClick={() => {
                      onAcceptImage(previewImage);
                    }}
                  >
                    Accept
                  </button>
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};
