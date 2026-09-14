import {
  DocumentSession,
  DomainError,
  type Bounds,
  type DocumentDates,
  type DomainResult,
  type DocumentPage,
  type EditorElement,
  type EditorElementContent,
  type ImageElementContent,
  type SignatureElementContent,
  type TextElementContent,
} from "../domain/document-session";

export type { DocumentDates } from "../domain/document-session";

export type EditorStatus = "empty" | "loading" | "ready" | "exporting" | "error";
export type EditorTool =
  | "select"
  | "text"
  | "whiteout"
  | "signature"
  | "initials"
  | "image"
  | "checkmark"
  | "cross"
  | "date";
export type SignatureFont = "cursive" | "serif" | "marker" | "hand";
export type SignatureSource = "draw" | "type" | "upload";
export type SignatureElementType = "signature" | "initials";
export interface InitialElementSize {
  readonly width: number;
  readonly height: number;
}
export type EditorErrorCode =
  | "UnsupportedFile"
  | "EmptyFile"
  | "UnreadableFile"
  | "InvalidPdf"
  | "NoActiveDocument"
  | "MissingElement"
  | "InvalidElementBounds"
  | "InvalidTextAppearance"
  | "InvalidSignature"
  | "UnsupportedSignatureImage"
  | "SignatureImageTooLarge"
  | "SignatureBackgroundRemovalFailed"
  | "InvalidImage"
  | "UnsupportedImage"
  | "ImageTooLarge"
  | "OperationRejected"
  | "RenderFailed"
  | "ExportFailed"
  | "CompressionFailed"
  | "CompressionNotBeneficial"
  | "DownloadFailed";

export interface EditorError {
  readonly code: EditorErrorCode;
  readonly message: string;
}

export const LARGE_DOCUMENT_PAGE_THRESHOLD = 100;
export const VERY_LARGE_DOCUMENT_PAGE_THRESHOLD = 500;

export type DocumentSizeClass = "normal" | "large" | "very-large";

export const classifyDocumentSize = (pageCount: number): DocumentSizeClass => {
  if (pageCount >= VERY_LARGE_DOCUMENT_PAGE_THRESHOLD) {
    return "very-large";
  }
  if (pageCount >= LARGE_DOCUMENT_PAGE_THRESHOLD) {
    return "large";
  }
  return "normal";
};

export interface PdfOpenProgress {
  readonly phase: "preparing-large-document";
  readonly pageCount: number;
  readonly sizeClass: Exclude<DocumentSizeClass, "normal">;
}

export type PdfOpenProgressListener = (progress: PdfOpenProgress) => void;

export interface LocalPdfFile {
  readonly name: string;
  readonly size: number;
  readonly type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface LocalPdfReadSuccess {
  readonly ok: true;
  readonly fileName: string;
  readonly bytes: Uint8Array;
}

export interface LocalPdfReadFailure {
  readonly ok: false;
  readonly error: EditorError;
}

export type LocalPdfReadResult = LocalPdfReadSuccess | LocalPdfReadFailure;

export interface LocalPdfFileReader {
  read(file: LocalPdfFile): Promise<LocalPdfReadResult>;
}

export interface PdfOpenSuccess {
  readonly ok: true;
  readonly pages: readonly DocumentPage[];
  /** The Info dictionary dates the file arrived with, when the gateway could read them. */
  readonly documentDates?: DocumentDates;
}

export interface PdfFailure {
  readonly ok: false;
  readonly error: EditorError;
}

export type PdfOpenResult = PdfOpenSuccess | PdfFailure;

export interface PdfRenderDocumentSuccess {
  readonly ok: true;
  readonly documentId: string;
}

export type PdfRenderDocumentResult = PdfRenderDocumentSuccess | PdfFailure;

export interface PdfRenderDocumentGateway {
  openRenderDocument(bytes: Uint8Array): Promise<PdfRenderDocumentResult>;
  disposeRenderDocument(documentId: string): void;
}

export interface TextAppearance {
  readonly fontSize: number;
  readonly color: string;
  readonly fontFamily?: string;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly underline?: boolean;
  readonly alignment?: "left" | "center" | "right";
  readonly lineHeight?: number;
  readonly letterSpacing?: number;
}

export interface ImageAppearance {
  readonly dataUrl: string;
  readonly mimeType: "image/png" | "image/jpeg";
}

export interface ExportElement {
  readonly id: string;
  readonly pageId: string;
  readonly type:
    "text" | "whiteout" | "signature" | "initials" | "image" | "checkmark" | "cross" | "date";
  readonly bounds: Bounds;
  readonly text?: string;
  readonly textAppearance?: TextAppearance;
  readonly image?: ImageAppearance;
  readonly source?: SignatureSource;
  readonly color?: string;
  readonly visible?: boolean;
  readonly locked?: boolean;
}

export interface PdfExportRequest {
  readonly originalBytes: Uint8Array;
  readonly pages: readonly DocumentPage[];
  readonly elements: readonly ExportElement[];
  /** Dates to stamp on the exported file; an omitted date keeps what the source bytes carry. */
  readonly documentDates?: DocumentDates;
}

export interface PdfExportSuccess {
  readonly ok: true;
  readonly bytes: Uint8Array;
}

export type PdfExportResult = PdfExportSuccess | PdfFailure;

export interface PdfExportGateway {
  open(bytes: Uint8Array): Promise<PdfOpenResult>;
  exportPdf(request: PdfExportRequest): Promise<PdfExportResult>;
}

export type PdfExportMode = "original" | "compressed";

export interface PdfCompressionProgress {
  readonly currentPage: number;
  readonly totalPages: number;
}

export type PdfCompressionResult =
  | { readonly ok: true; readonly bytes: Uint8Array }
  | { readonly ok: false; readonly cancelled: boolean; readonly message: string };

export interface PdfCompressionGateway {
  compress(request: {
    readonly bytes: Uint8Array;
    readonly onProgress?: (progress: PdfCompressionProgress) => void;
    readonly signal?: AbortSignal;
    /** Rebuilding pages drops the Info dictionary, so the chosen dates are re-applied here. */
    readonly documentDates?: DocumentDates;
  }): Promise<PdfCompressionResult>;
}

export interface PdfExportOptions {
  readonly mode?: PdfExportMode;
  readonly filename?: string;
  readonly onCompressionProgress?: (progress: PdfCompressionProgress) => void;
  readonly signal?: AbortSignal;
}

export interface DownloadRequest {
  readonly bytes: Uint8Array;
  readonly filename: string;
  readonly mimeType: string;
}

export interface DownloadAdapter {
  download(request: DownloadRequest): void;
}

export interface IdGenerator {
  nextId(prefix: string): string;
}

export interface DateProvider {
  today(): Date;
}

export interface EditorState {
  readonly status: EditorStatus;
  readonly fileName?: string;
  readonly pageCount: number;
  readonly pages: readonly DocumentPage[];
  readonly currentPageNumber: number;
  readonly currentPage?: DocumentPage;
  readonly renderDocumentId?: string;
  readonly tool: EditorTool;
  readonly isDirty: boolean;
  readonly selectedElementId?: string;
  readonly selectedElement?: ExportElement;
  readonly elements: readonly ExportElement[];
  readonly visibleElements: readonly ExportElement[];
  readonly exportFilename?: string;
  /** Dates the next export will write; an absent date keeps the one stored in the file. */
  readonly documentDates: DocumentDates;
  /** Dates read from the opened file, kept so the date dialog can offer them again. */
  readonly sourceDocumentDates: DocumentDates;
  readonly error?: EditorError;
}

export interface EditorSnapshot {
  readonly state: EditorState;
  readonly canExport: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly canPaste: boolean;
}

export interface SignatureImageInput {
  readonly dataUrl: string;
  readonly mimeType: "image/png" | "image/jpeg";
  readonly width: number;
  readonly height: number;
  readonly source: "draw" | "upload";
}

export interface ImageElementInput {
  readonly dataUrl: string;
  readonly mimeType: "image/png" | "image/jpeg";
  readonly width: number;
  readonly height: number;
}

export interface TypedSignatureInput {
  readonly text: string;
  readonly fontFamily: SignatureFont;
}

export const COMMAND_HISTORY_LIMIT = 100;
export const MIN_TEXT_FONT_SIZE = 8;
export const MAX_TEXT_FONT_SIZE = 96;
export const DEFAULT_TEXT_APPEARANCE: TextAppearance = { fontSize: 16, color: "#000000" };
export const DEFAULT_SIGNATURE_APPEARANCE: TextAppearance = {
  fontSize: 34,
  color: "#000000",
  fontFamily: "cursive",
};
export const DEFAULT_INITIALS_APPEARANCE: TextAppearance = {
  fontSize: 26,
  color: "#000000",
  fontFamily: "cursive",
};
export const DEFAULT_DATE_APPEARANCE: TextAppearance = { fontSize: 16, color: "#000000" };
export const DEFAULT_CHECKMARK_SIZE = 28;
export const DEFAULT_CROSS_SIZE = 28;
export const MIN_ELEMENT_WIDTH = 16;
export const MIN_ELEMENT_HEIGHT = 16;
export const MAX_SIGNATURE_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const PASTE_OFFSET = 16;

const emptyState = (): EditorState => ({
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
});

const cloneBytes = (bytes: Uint8Array): Uint8Array => new Uint8Array(bytes);
const cloneBounds = (bounds: Bounds): Bounds => ({ ...bounds });
const isFiniteBounds = (bounds: Bounds): boolean =>
  Number.isFinite(bounds.x) &&
  Number.isFinite(bounds.y) &&
  Number.isFinite(bounds.width) &&
  Number.isFinite(bounds.height) &&
  bounds.width > 0 &&
  bounds.height > 0;

const isTextContent = (content: EditorElement["content"]): content is TextElementContent =>
  content !== undefined && !("kind" in content);

const isSignatureContent = (
  content: EditorElement["content"],
): content is SignatureElementContent =>
  content !== undefined &&
  "kind" in content &&
  (content.kind === "typed" || content.kind === "image");

const isImageContent = (content: EditorElement["content"]): content is ImageElementContent =>
  content !== undefined && "kind" in content && content.kind === "image-element";

const isTextLikeElement = (element: EditorElement): boolean =>
  element.type === "text" || element.type === "date";

const textFromElement = (element: EditorElement): string =>
  isTextLikeElement(element) && isTextContent(element.content) ? element.content.text : "";

const textFontSizeFromElement = (element: EditorElement): number => {
  const content = element.content;
  return isTextLikeElement(element) && isTextContent(content) && content.fontSize !== undefined
    ? content.fontSize
    : element.type === "date"
      ? DEFAULT_DATE_APPEARANCE.fontSize
      : DEFAULT_TEXT_APPEARANCE.fontSize;
};

const isHexColor = (color: string): boolean => /^#[0-9a-fA-F]{6}$/.test(color);
const elementColor = (element: EditorElement): string => element.color ?? "#000000";

const clampTextFontSize = (fontSize: number): number =>
  Math.min(MAX_TEXT_FONT_SIZE, Math.max(MIN_TEXT_FONT_SIZE, fontSize));

const formatLocalDate = (date: Date): string => {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = String(date.getFullYear()).padStart(4, "0");
  return `${month}/${day}/${year}`;
};
const toExportElement = (element: EditorElement): ExportElement => {
  const layerState = { visible: element.visible ?? true, locked: element.locked ?? false };
  if (element.type === "whiteout") {
    return {
      id: element.id,
      pageId: element.pageId,
      type: "whiteout",
      bounds: cloneBounds(element.bounds),
      ...layerState,
    };
  }
  if (element.type === "checkmark" || element.type === "cross") {
    return {
      id: element.id,
      pageId: element.pageId,
      type: element.type,
      bounds: cloneBounds(element.bounds),
      color: elementColor(element),
      ...layerState,
    };
  }
  if (element.type === "image") {
    const content = isImageContent(element.content) ? element.content : undefined;
    return {
      id: element.id,
      pageId: element.pageId,
      type: "image",
      bounds: cloneBounds(element.bounds),
      ...layerState,
      ...(content === undefined
        ? {}
        : {
            image: {
              dataUrl: content.dataUrl,
              mimeType: content.mimeType,
            },
          }),
    };
  }
  if (element.type === "signature" || element.type === "initials") {
    const content = isSignatureContent(element.content) ? element.content : undefined;
    if (content?.kind === "typed") {
      const appearance =
        element.type === "signature" ? DEFAULT_SIGNATURE_APPEARANCE : DEFAULT_INITIALS_APPEARANCE;
      return {
        id: element.id,
        pageId: element.pageId,
        type: element.type,
        bounds: cloneBounds(element.bounds),
        text: content.text,
        textAppearance: {
          ...appearance,
          color: elementColor(element),
          fontFamily: content.fontFamily,
        },
        source: "type",
        ...layerState,
      };
    }
    if (content?.kind === "image") {
      return {
        id: element.id,
        pageId: element.pageId,
        type: element.type,
        bounds: cloneBounds(element.bounds),
        image: {
          dataUrl: content.dataUrl,
          mimeType: content.mimeType,
        },
        source: content.source,
        ...layerState,
      };
    }
  }
  const appearance = element.type === "date" ? DEFAULT_DATE_APPEARANCE : DEFAULT_TEXT_APPEARANCE;
  return {
    id: element.id,
    pageId: element.pageId,
    type: element.type === "date" ? "date" : "text",
    bounds: cloneBounds(element.bounds),
    color: elementColor(element),
    text: textFromElement(element),
    textAppearance: {
      ...appearance,
      color: elementColor(element),
      fontSize: textFontSizeFromElement(element),
      ...(isTextContent(element.content)
        ? {
            fontFamily: element.content.fontFamily,
            bold: element.content.bold,
            italic: element.content.italic,
            underline: element.content.underline,
            alignment: element.content.alignment,
            lineHeight: element.content.lineHeight,
            letterSpacing: element.content.letterSpacing,
          }
        : {}),
    },
    ...layerState,
  };
};
export const exportFilenameFromInput = (fileName: string): string => {
  const fallback = "quickpdf-edited";
  const withoutPath = fileName.split(/[/\\]/).at(-1) ?? fallback;
  const withoutExtension = withoutPath.replace(/\.pdf$/i, "");
  const safeBase = withoutExtension
    .replace(/[^a-zA-Z0-9._ -]+/g, "")
    .trim()
    .replace(/[. ]+$/g, "");
  return `${safeBase.length === 0 ? fallback : safeBase}.pdf`;
};

const safeExportFilename = (fileName: string | undefined): string => {
  const fallback = "quickpdf-edited";
  const withoutPath = (fileName ?? fallback).split(/[/\\]/).at(-1) ?? fallback;
  const withoutExtension = withoutPath.replace(/\.pdf$/i, "");
  const safeBase = withoutExtension
    .replace(/[^a-zA-Z0-9._ -]+/g, "")
    .trim()
    .replace(/[. ]+$/g, "");
  return `${safeBase.length === 0 ? fallback : safeBase}-edited.pdf`;
};

export const validateSignatureImageFile = (
  file: Pick<LocalPdfFile, "name" | "size" | "type">,
): EditorError | undefined => {
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  const isSupportedType = file.type === "image/png" || file.type === "image/jpeg";
  const isSupportedExtension = extension === "png" || extension === "jpg" || extension === "jpeg";
  if (!isSupportedType || !isSupportedExtension) {
    return {
      code: "UnsupportedSignatureImage",
      message: "Use a PNG, JPG, or JPEG signature image.",
    };
  }
  if (file.size > MAX_SIGNATURE_IMAGE_BYTES) {
    return { code: "SignatureImageTooLarge", message: "Signature images must be 2 MB or smaller." };
  }
  return undefined;
};

export const validateImageFile = (
  file: Pick<LocalPdfFile, "name" | "size" | "type">,
): EditorError | undefined => {
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  const isSupportedType = file.type === "image/png" || file.type === "image/jpeg";
  const isSupportedExtension = extension === "png" || extension === "jpg" || extension === "jpeg";
  if (!isSupportedType || !isSupportedExtension) {
    return {
      code: "UnsupportedImage",
      message: "Use a PNG, JPG, or JPEG image.",
    };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { code: "ImageTooLarge", message: "Images must be 5 MB or smaller." };
  }
  return undefined;
};
interface ClipboardElement {
  readonly type:
    "text" | "whiteout" | "signature" | "initials" | "image" | "checkmark" | "cross" | "date";
  readonly bounds: Bounds;
  readonly color?: string;
  readonly content?: EditorElementContent;
}

interface HistoryState {
  readonly elements: readonly EditorElement[];
  readonly selectedElementId?: string;
}

interface HistoryEntry {
  readonly type:
    | "add-element"
    | "delete-element"
    | "duplicate-element"
    | "paste-element"
    | "update-element"
    | "update-text"
    | "reorder-layers";
  readonly before: HistoryState;
  readonly after: HistoryState;
  readonly beforeRevision: number;
  readonly afterRevision: number;
}

const cloneHistoryElement = (element: EditorElement): EditorElement => ({
  ...element,
  bounds: { ...element.bounds },
  ...(element.content === undefined ? {} : { content: { ...element.content } }),
});

const clipboardElementFrom = (element: EditorElement): ClipboardElement => ({
  type: element.type,
  bounds: cloneBounds(element.bounds),
  ...(element.color === undefined ? {} : { color: element.color }),
  ...(element.content === undefined ? {} : { content: { ...element.content } }),
});
const cloneHistoryState = (state: HistoryState): HistoryState => ({
  elements: state.elements.map(cloneHistoryElement),
  ...(state.selectedElementId === undefined ? {} : { selectedElementId: state.selectedElementId }),
});

const elementsMatch = (left: EditorElement, right: EditorElement): boolean =>
  left.id === right.id &&
  left.pageId === right.pageId &&
  left.type === right.type &&
  (left.visible ?? true) === (right.visible ?? true) &&
  (left.locked ?? false) === (right.locked ?? false) &&
  left.color === right.color &&
  left.bounds.x === right.bounds.x &&
  left.bounds.y === right.bounds.y &&
  left.bounds.width === right.bounds.width &&
  left.bounds.height === right.bounds.height &&
  JSON.stringify(left.content ?? {}) === JSON.stringify(right.content ?? {});
export class SequentialIdGenerator implements IdGenerator {
  #next = 1;

  public nextId(prefix: string): string {
    const id = `${prefix}-${String(this.#next)}`;
    this.#next += 1;
    return id;
  }
}

export class PdfEditorApplication {
  readonly #fileReader: LocalPdfFileReader;
  readonly #pdfGateway: PdfExportGateway;
  readonly #downloadAdapter: DownloadAdapter;
  readonly #idGenerator: IdGenerator;
  readonly #renderGateway: PdfRenderDocumentGateway | undefined;
  readonly #dateProvider: DateProvider;
  readonly #compressionGateway: PdfCompressionGateway | undefined;
  #session: DocumentSession | undefined;
  #originalBytes: Uint8Array | undefined;
  #renderDocumentId: string | undefined;
  #state: EditorState = emptyState();
  #undoStack: HistoryEntry[] = [];
  #redoStack: HistoryEntry[] = [];
  #currentRevision = 0;
  #cleanRevision = 0;
  #clipboard: ClipboardElement | undefined;
  #openSequence = 0;
  #sourceDocumentDates: DocumentDates = {};
  /** Date choices live outside the command history, so dirty state tracks them separately. */
  #hasUnsavedDocumentDates = false;

  public constructor(
    fileReader: LocalPdfFileReader,
    pdfGateway: PdfExportGateway,
    downloadAdapter: DownloadAdapter,
    idGenerator: IdGenerator,
    renderGateway?: PdfRenderDocumentGateway,
    dateProvider: DateProvider = { today: () => new Date() },
    compressionGateway?: PdfCompressionGateway,
  ) {
    this.#fileReader = fileReader;
    this.#pdfGateway = pdfGateway;
    this.#downloadAdapter = downloadAdapter;
    this.#idGenerator = idGenerator;
    this.#renderGateway = renderGateway;
    this.#dateProvider = dateProvider;
    this.#compressionGateway = compressionGateway;
  }

  public snapshot(): EditorSnapshot {
    return {
      state: this.#state,
      canExport: this.#session !== undefined,
      canUndo: this.#undoStack.length > 0,
      canRedo: this.#redoStack.length > 0,
      canPaste: this.#session !== undefined && this.#clipboard !== undefined,
    };
  }

  public async openFile(
    file: LocalPdfFile,
    onProgress?: PdfOpenProgressListener,
  ): Promise<EditorSnapshot> {
    const openSequence = this.#openSequence + 1;
    this.#openSequence = openSequence;
    this.#disposeRenderDocument();
    this.#session = undefined;
    this.#originalBytes = undefined;
    this.#sourceDocumentDates = {};
    this.#hasUnsavedDocumentDates = false;
    this.#resetHistory();
    this.#clearClipboard();
    const {
      error: discardedOpenError,
      exportFilename: discardedExportFilename,
      ...openState
    } = this.#state;
    void discardedOpenError;
    void discardedExportFilename;
    this.#state = { ...openState, status: "loading" };
    const readResult = await this.#fileReader.read(file);
    if (openSequence !== this.#openSequence) {
      return this.snapshot();
    }
    if (!readResult.ok) {
      this.#state = { ...emptyState(), status: "error", error: readResult.error };
      return this.snapshot();
    }

    const originalBytes = cloneBytes(readResult.bytes);
    const openResult = await this.#pdfGateway.open(originalBytes);
    if (openSequence !== this.#openSequence) {
      return this.snapshot();
    }
    if (!openResult.ok) {
      this.#state = { ...emptyState(), status: "error", error: openResult.error };
      return this.snapshot();
    }

    const sizeClass = classifyDocumentSize(openResult.pages.length);
    if (sizeClass !== "normal") {
      onProgress?.({
        phase: "preparing-large-document",
        pageCount: openResult.pages.length,
        sizeClass,
      });
    }

    if (this.#renderGateway !== undefined) {
      const renderResult = await this.#renderGateway.openRenderDocument(originalBytes);
      if (openSequence !== this.#openSequence) {
        if (renderResult.ok) {
          this.#renderGateway.disposeRenderDocument(renderResult.documentId);
        }
        return this.snapshot();
      }
      if (!renderResult.ok) {
        this.#state = { ...emptyState(), status: "error", error: renderResult.error };
        return this.snapshot();
      }
      this.#renderDocumentId = renderResult.documentId;
    }

    if (openSequence !== this.#openSequence) {
      return this.snapshot();
    }
    this.#originalBytes = originalBytes;
    this.#resetHistory();
    this.#sourceDocumentDates = { ...openResult.documentDates };
    this.#session = DocumentSession.create({
      id: this.#idGenerator.nextId("session"),
      pages: openResult.pages,
      temporaryPersonalInfo: { originalFileName: readResult.fileName },
      sourceReference: this.#idGenerator.nextId("source"),
      documentDates: this.#sourceDocumentDates,
    });
    this.#resetHistory();
    this.#syncState({ fileName: readResult.fileName, status: "ready" });
    return this.snapshot();
  }

  public closeDocument(): EditorSnapshot {
    this.#openSequence += 1;
    this.#disposeRenderDocument();
    this.#session = undefined;
    this.#originalBytes = undefined;
    this.#sourceDocumentDates = {};
    this.#hasUnsavedDocumentDates = false;
    this.#resetHistory();
    this.#clearClipboard();
    this.#state = emptyState();
    return this.snapshot();
  }

  public selectPage(pageId: string): EditorSnapshot {
    const result = this.#session?.setCurrentPage(pageId);
    if (result?.ok !== true) {
      return this.#operationError("OperationRejected", "The requested page does not exist.");
    }
    this.#syncState();
    return this.snapshot();
  }

  public previousPage(): EditorSnapshot {
    const previousPage = this.#state.pages[this.#state.currentPageNumber - 2];
    return previousPage === undefined ? this.snapshot() : this.selectPage(previousPage.id);
  }

  public nextPage(): EditorSnapshot {
    const nextPage = this.#state.pages[this.#state.currentPageNumber];
    return nextPage === undefined ? this.snapshot() : this.selectPage(nextPage.id);
  }
  public setTool(tool: EditorTool): EditorSnapshot {
    this.#state = { ...this.#state, tool };
    return this.snapshot();
  }

  public selectElement(elementId: string): EditorSnapshot {
    const result = this.#session?.selectElement(elementId);
    if (result?.ok !== true) {
      return this.#operationError("MissingElement", "The selected element no longer exists.");
    }
    this.#syncState();
    return this.snapshot();
  }

  public clearSelection(): EditorSnapshot {
    const result = this.#session?.clearSelection();
    if (result?.ok !== true) {
      return this.#operationError("NoActiveDocument", "Open a PDF before editing.");
    }
    this.#syncState();
    return this.snapshot();
  }

  public copySelectedElement(): EditorSnapshot {
    const selectedElementId = this.#session?.selectedElementId;
    if (selectedElementId === undefined) {
      return this.snapshot();
    }
    const element = this.#session?.element(selectedElementId);
    if (element === undefined) {
      return this.snapshot();
    }
    this.#clipboard = clipboardElementFrom(element);
    return this.snapshot();
  }

  public pasteCopiedElement(): EditorSnapshot {
    const clipboardElement = this.#clipboard;
    if (this.#session === undefined || clipboardElement === undefined) {
      return this.snapshot();
    }
    const snapshot = this.#insertExistingElement({
      historyType: "paste-element",
      type: clipboardElement.type,
      bounds: this.#offsetPastedBounds(clipboardElement.bounds),
      ...(clipboardElement.color === undefined ? {} : { color: clipboardElement.color }),
      ...(clipboardElement.content === undefined
        ? {}
        : { content: { ...clipboardElement.content } }),
    });
    const pastedElementId = snapshot.state.selectedElementId;
    const pastedElement =
      pastedElementId === undefined ? undefined : this.#session.element(pastedElementId);
    if (pastedElement !== undefined) {
      this.#clipboard = clipboardElementFrom(pastedElement);
    }
    return this.snapshot();
  }
  public addText(
    point: { readonly x: number; readonly y: number },
    text = "Text",
    size: InitialElementSize = { width: 160, height: 40 },
  ): EditorSnapshot {
    return this.#addElement({
      type: "text",
      bounds: { x: point.x, y: point.y, width: size.width, height: size.height },
      text,
      fontSize: DEFAULT_TEXT_APPEARANCE.fontSize,
    });
  }

  public addWhiteout(bounds: Bounds): EditorSnapshot {
    return this.#addElement({ type: "whiteout", bounds });
  }

  public addTypedSignature(
    point: { readonly x: number; readonly y: number },
    input: TypedSignatureInput,
  ): EditorSnapshot {
    return this.#addElement({
      type: "signature",
      bounds: { x: point.x, y: point.y, width: 220, height: 70 },
      signatureContent: { kind: "typed", text: input.text, fontFamily: input.fontFamily },
    });
  }

  public addDrawnSignature(
    point: { readonly x: number; readonly y: number },
    image: SignatureImageInput,
  ): EditorSnapshot {
    return this.#addImageSignature("signature", point, image);
  }

  public addUploadedSignature(
    point: { readonly x: number; readonly y: number },
    image: SignatureImageInput,
  ): EditorSnapshot {
    return this.#addImageSignature("signature", point, { ...image, source: "upload" });
  }

  public addTypedInitials(
    point: { readonly x: number; readonly y: number },
    input: TypedSignatureInput,
  ): EditorSnapshot {
    return this.#addElement({
      type: "initials",
      bounds: { x: point.x, y: point.y, width: 96, height: 52 },
      signatureContent: { kind: "typed", text: input.text, fontFamily: input.fontFamily },
    });
  }

  public addDrawnInitials(
    point: { readonly x: number; readonly y: number },
    image: SignatureImageInput,
  ): EditorSnapshot {
    return this.#addImageSignature("initials", point, image);
  }

  public addImage(
    point: { readonly x: number; readonly y: number },
    image: ImageElementInput,
  ): EditorSnapshot {
    if (!this.#isValidImageInput(image)) {
      return this.#operationError("InvalidImage", "Image dimensions must be valid.");
    }
    const page = this.#state.currentPage;
    const size = this.#defaultImageSize(image, page);
    return this.#addElement({
      type: "image",
      bounds: {
        x: point.x - size.width / 2,
        y: point.y - size.height / 2,
        width: size.width,
        height: size.height,
      },
      imageContent: {
        kind: "image-element",
        dataUrl: image.dataUrl,
        mimeType: image.mimeType,
        naturalWidth: image.width,
        naturalHeight: image.height,
      },
    });
  }
  public addCheckmark(
    point: { readonly x: number; readonly y: number },
    size = DEFAULT_CHECKMARK_SIZE,
  ): EditorSnapshot {
    return this.#addElement({
      type: "checkmark",
      bounds: {
        x: point.x - size / 2,
        y: point.y - size / 2,
        width: size,
        height: size,
      },
    });
  }

  public addCross(
    point: { readonly x: number; readonly y: number },
    size = DEFAULT_CROSS_SIZE,
  ): EditorSnapshot {
    return this.#addElement({
      type: "cross",
      bounds: {
        x: point.x - size / 2,
        y: point.y - size / 2,
        width: size,
        height: size,
      },
    });
  }

  public addDate(
    point: { readonly x: number; readonly y: number },
    size: InitialElementSize = { width: 96, height: 28 },
  ): EditorSnapshot {
    return this.#addElement({
      type: "date",
      bounds: { x: point.x, y: point.y, width: size.width, height: size.height },
      text: formatLocalDate(this.#dateProvider.today()),
      fontSize: DEFAULT_DATE_APPEARANCE.fontSize,
    });
  }
  public updateText(elementId: string, text: string): EditorSnapshot {
    const element = this.#session?.element(elementId);
    if (element === undefined || !isTextLikeElement(element) || !isTextContent(element.content)) {
      return this.#operationError("MissingElement", "The text element no longer exists.");
    }
    return this.#commitTextUpdate({ ...element, content: { ...element.content, text } });
  }

  public updateTextAppearance(
    elementId: string,
    appearance: Partial<TextAppearance>,
  ): EditorSnapshot {
    const element = this.#session?.element(elementId);
    if (element === undefined || !isTextLikeElement(element) || !isTextContent(element.content)) {
      return this.#operationError("MissingElement", "The text element no longer exists.");
    }
    const content = element.content;
    return this.#commitElementUpdate({
      ...element,
      content: {
        ...content,
        ...(appearance.fontSize === undefined
          ? {}
          : { fontSize: clampTextFontSize(appearance.fontSize) }),
        ...(appearance.fontFamily === undefined ? {} : { fontFamily: appearance.fontFamily }),
        ...(appearance.bold === undefined ? {} : { bold: appearance.bold }),
        ...(appearance.italic === undefined ? {} : { italic: appearance.italic }),
        ...(appearance.underline === undefined ? {} : { underline: appearance.underline }),
        ...(appearance.alignment === undefined ? {} : { alignment: appearance.alignment }),
        ...(appearance.lineHeight === undefined ? {} : { lineHeight: appearance.lineHeight }),
        ...(appearance.letterSpacing === undefined
          ? {}
          : { letterSpacing: appearance.letterSpacing }),
      },
    });
  }
  public updateTextFontSize(elementId: string, fontSize: number): EditorSnapshot {
    const element = this.#session?.element(elementId);
    if (element === undefined || !isTextLikeElement(element) || !isTextContent(element.content)) {
      return this.#operationError("MissingElement", "The text element no longer exists.");
    }
    if (!Number.isFinite(fontSize)) {
      return this.#operationError("InvalidTextAppearance", "Text size must be a finite number.");
    }
    return this.#commitElementUpdate({
      ...element,
      content: { ...element.content, fontSize: clampTextFontSize(fontSize) },
    });
  }

  public updateElementColor(elementId: string, color: string): EditorSnapshot {
    const element = this.#session?.element(elementId);
    if (element === undefined || element.type === "whiteout" || element.type === "image") {
      return this.#operationError("MissingElement", "This element does not support an ink colour.");
    }
    if (
      (element.type === "signature" || element.type === "initials") &&
      element.content !== undefined &&
      "kind" in element.content &&
      element.content.kind === "image" &&
      element.content.source === "upload"
    ) {
      return this.#operationError(
        "OperationRejected",
        "Uploaded signatures retain their original colours.",
      );
    }
    if (!isHexColor(color)) {
      return this.#operationError("InvalidTextAppearance", "Choose a valid six-digit colour.");
    }
    return this.#commitElementUpdate({ ...element, color: color.toLowerCase() });
  }
  public previewTextResizeElement(
    elementId: string,
    bounds: Bounds,
    fontSize: number,
  ): EditorSnapshot {
    const element = this.#session?.element(elementId);
    if (element === undefined || !isTextLikeElement(element) || !isTextContent(element.content)) {
      return this.#operationError("MissingElement", "The text element no longer exists.");
    }
    if (!isFiniteBounds(bounds) || !Number.isFinite(fontSize)) {
      return this.#operationError("InvalidElementBounds", "Text resize values must be finite.");
    }
    return this.#previewElementUpdate({
      ...element,
      bounds: this.#constrainBounds(bounds),
      content: { ...element.content, fontSize: clampTextFontSize(fontSize) },
    });
  }

  public commitTextResizeElement(
    elementId: string,
    start: { readonly bounds: Bounds; readonly fontSize: number },
    end: { readonly bounds: Bounds; readonly fontSize: number },
  ): EditorSnapshot {
    const element = this.#session?.element(elementId);
    if (element === undefined || !isTextLikeElement(element) || !isTextContent(element.content)) {
      return this.#operationError("MissingElement", "The text element no longer exists.");
    }
    if (
      !isFiniteBounds(start.bounds) ||
      !isFiniteBounds(end.bounds) ||
      !Number.isFinite(start.fontSize) ||
      !Number.isFinite(end.fontSize)
    ) {
      return this.#operationError("InvalidElementBounds", "Text resize values must be finite.");
    }
    const beforeElement: EditorElement = {
      ...element,
      bounds: this.#constrainBounds(start.bounds),
      content: { ...element.content, fontSize: clampTextFontSize(start.fontSize) },
    };
    const afterElement: EditorElement = {
      ...element,
      bounds: this.#constrainBounds(end.bounds),
      content: { ...element.content, fontSize: clampTextFontSize(end.fontSize) },
    };
    if (elementsMatch(beforeElement, afterElement)) {
      return this.#previewElementUpdate(afterElement);
    }
    return this.#commitElementUpdate(
      afterElement,
      this.#historyStateWithElement(beforeElement, elementId),
    );
  }

  public previewMoveElement(
    elementId: string,
    point: { readonly x: number; readonly y: number },
  ): EditorSnapshot {
    const element = this.#session?.element(elementId);
    if (element === undefined) {
      return this.#operationError("MissingElement", "The element no longer exists.");
    }
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return this.#operationError("InvalidElementBounds", "Element position must be finite.");
    }
    return this.#previewElementUpdate({
      ...element,
      bounds: this.#constrainBounds({ ...element.bounds, x: point.x, y: point.y }),
    });
  }

  public commitMoveElement(
    elementId: string,
    startBounds: Bounds,
    endBounds: Bounds,
  ): EditorSnapshot {
    const element = this.#session?.element(elementId);
    if (element === undefined) {
      return this.#operationError("MissingElement", "The element no longer exists.");
    }
    if (!isFiniteBounds(startBounds) || !isFiniteBounds(endBounds)) {
      return this.#operationError("InvalidElementBounds", "Element bounds must be finite.");
    }
    const beforeElement: EditorElement = {
      ...element,
      bounds: this.#constrainBounds(startBounds),
    };
    const afterElement: EditorElement = {
      ...element,
      bounds: this.#constrainBounds({ ...startBounds, x: endBounds.x, y: endBounds.y }),
    };
    if (elementsMatch(beforeElement, afterElement)) {
      return this.#previewElementUpdate(afterElement);
    }
    return this.#commitElementUpdate(
      afterElement,
      this.#historyStateWithElement(beforeElement, elementId),
    );
  }

  public moveElement(
    elementId: string,
    point: { readonly x: number; readonly y: number },
  ): EditorSnapshot {
    return this.previewMoveElement(elementId, point);
  }

  public previewResizeElement(elementId: string, bounds: Bounds): EditorSnapshot {
    const element = this.#session?.element(elementId);
    if (element === undefined) {
      return this.#operationError("MissingElement", "The element no longer exists.");
    }
    if (!isFiniteBounds(bounds)) {
      return this.#operationError("InvalidElementBounds", "Element bounds must be finite.");
    }
    return this.#previewElementUpdate({
      ...element,
      bounds: this.#constrainBounds(this.#aspectRatioBounds(element, bounds)),
    });
  }

  public resizeElement(
    elementId: string,
    size: { readonly width: number; readonly height: number },
  ): EditorSnapshot {
    const element = this.#session?.element(elementId);
    if (element === undefined) {
      return this.#operationError("MissingElement", "The element no longer exists.");
    }
    return this.#replaceElement({
      ...element,
      bounds: this.#constrainBounds(
        this.#aspectRatioBounds(element, {
          ...element.bounds,
          width: size.width,
          height: size.height,
        }),
      ),
    });
  }

  public commitResizeElement(
    elementId: string,
    startBounds: Bounds,
    endBounds: Bounds,
  ): EditorSnapshot {
    const element = this.#session?.element(elementId);
    if (element === undefined) {
      return this.#operationError("MissingElement", "The element no longer exists.");
    }
    if (!isFiniteBounds(startBounds) || !isFiniteBounds(endBounds)) {
      return this.#operationError("InvalidElementBounds", "Element bounds must be finite.");
    }
    const beforeElement: EditorElement = {
      ...element,
      bounds: this.#constrainBounds(startBounds),
    };
    const afterElement: EditorElement = {
      ...element,
      bounds: this.#constrainBounds(this.#aspectRatioBounds(beforeElement, endBounds)),
    };
    if (elementsMatch(beforeElement, afterElement)) {
      return this.#previewElementUpdate(afterElement);
    }
    return this.#commitElementUpdate(
      afterElement,
      this.#historyStateWithElement(beforeElement, elementId),
    );
  }

  public duplicateElement(elementId: string): EditorSnapshot {
    const element = this.#session?.element(elementId);
    if (element === undefined) {
      return this.#operationError("MissingElement", "The element no longer exists.");
    }
    return this.#insertExistingElement({
      historyType: "duplicate-element",
      type: element.type,
      bounds: { ...element.bounds, x: element.bounds.x + 12, y: element.bounds.y + 12 },
      ...(element.color === undefined ? {} : { color: element.color }),
      ...(element.content === undefined ? {} : { content: { ...element.content } }),
    });
  }

  public reorderCurrentPageLayers(elementId: string, targetIndex: number): EditorSnapshot {
    const session = this.#session;
    const pageId = session?.currentPageId;
    if (session === undefined || pageId === undefined || !Number.isInteger(targetIndex)) {
      return this.#operationError("OperationRejected", "The layer order could not be updated.");
    }
    const frontToBack = session
      .elements()
      .filter((element) => element.pageId === pageId)
      .reverse();
    const currentIndex = frontToBack.findIndex((element) => element.id === elementId);
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= frontToBack.length) {
      return this.#operationError("MissingElement", "The layer no longer exists on this page.");
    }
    const nextFrontToBack = [...frontToBack];
    const [element] = nextFrontToBack.splice(currentIndex, 1);
    if (element === undefined) {
      return this.#operationError("MissingElement", "The layer no longer exists on this page.");
    }
    nextFrontToBack.splice(targetIndex, 0, element);
    if (nextFrontToBack.every((candidate, index) => candidate.id === frontToBack[index]?.id)) {
      return this.snapshot();
    }
    const before = this.#currentHistoryState(session.selectedElementId);
    const result = session.reorderPageElements(
      pageId,
      nextFrontToBack.map((candidate) => candidate.id).reverse(),
    );
    if (!result.ok) {
      return this.#operationError("OperationRejected", "The layer order could not be updated.");
    }
    this.#recordHistory(
      "reorder-layers",
      before,
      this.#currentHistoryState(session.selectedElementId),
    );
    this.#syncState();
    return this.snapshot();
  }
  public setElementVisibility(elementId: string, visible: boolean): EditorSnapshot {
    return this.#setElementState(elementId, { visible });
  }

  public setElementLocked(elementId: string, locked: boolean): EditorSnapshot {
    return this.#setElementState(elementId, { locked });
  }

  public setAllCurrentPageElementsVisibility(visible: boolean): EditorSnapshot {
    return this.#setCurrentPageElementState({ visible });
  }

  public setAllCurrentPageElementsLocked(locked: boolean): EditorSnapshot {
    return this.#setCurrentPageElementState({ locked });
  }
  public deleteElement(elementId: string): EditorSnapshot {
    const element = this.#session?.element(elementId);
    if (element === undefined) {
      return this.#operationError("MissingElement", "The element no longer exists.");
    }
    if (element.locked === true) {
      return this.#operationError("OperationRejected", "Unlock this element before deleting it.");
    }
    const before = this.#currentHistoryState(elementId);
    const result = this.#session?.deleteElement(elementId);
    if (result?.ok !== true) {
      return this.#operationError("MissingElement", "The element no longer exists.");
    }
    const after = this.#currentHistoryState(undefined);
    this.#recordHistory("delete-element", before, after);
    this.#syncState();
    return this.snapshot();
  }

  public undo(): EditorSnapshot {
    const entry = this.#undoStack.at(-1);
    if (entry === undefined) {
      return this.snapshot();
    }
    const result = this.#restoreHistoryState(entry.before);
    if (!result.ok) {
      return this.#operationError("OperationRejected", "The last action could not be undone.");
    }
    this.#undoStack.pop();
    this.#redoStack.push(entry);
    this.#currentRevision = entry.beforeRevision;
    this.#syncState();
    return this.snapshot();
  }

  public redo(): EditorSnapshot {
    const entry = this.#redoStack.at(-1);
    if (entry === undefined) {
      return this.snapshot();
    }
    const result = this.#restoreHistoryState(entry.after);
    if (!result.ok) {
      return this.#operationError(
        "OperationRejected",
        "The last undone action could not be redone.",
      );
    }
    this.#redoStack.pop();
    this.#undoStack.push(entry);
    this.#currentRevision = entry.afterRevision;
    this.#syncState();
    return this.snapshot();
  }
  /**
   * Chooses the Info dictionary dates the next export writes. Both dates are replaced at once:
   * an omitted date is not carried over, and leaves that date as the source file stores it.
   */
  public setDocumentDates(dates: DocumentDates): EditorSnapshot {
    const session = this.#session;
    if (session === undefined) {
      return this.#operationError("NoActiveDocument", "Open a PDF before changing its dates.");
    }
    const result = session.setDocumentDates(dates);
    if (!result.ok) {
      return this.#operationError("OperationRejected", result.error.message);
    }
    this.#hasUnsavedDocumentDates = true;
    this.#syncState();
    return this.snapshot();
  }

  public async exportCurrentPdf(options: PdfExportOptions = {}): Promise<EditorSnapshot> {
    const session = this.#session;
    const originalBytes = this.#originalBytes;
    if (session === undefined || originalBytes === undefined) {
      return this.#operationError("NoActiveDocument", "Open a PDF before downloading.");
    }

    const before = this.#state;
    const { error: discardedExportError, ...exportingState } = this.#state;
    void discardedExportError;
    this.#state = { ...exportingState, status: "exporting" };
    const documentDates = session.documentDates;
    const exportResult = await this.#pdfGateway.exportPdf({
      originalBytes,
      pages: session.pages(),
      elements: this.#orderedExportElements(),
      documentDates,
    });
    if (!exportResult.ok) {
      this.#state = { ...before, error: exportResult.error };
      return this.snapshot();
    }

    const mode = options.mode ?? "original";
    let bytes = exportResult.bytes;
    if (mode === "compressed") {
      if (this.#compressionGateway === undefined) {
        this.#state = {
          ...before,
          error: {
            code: "CompressionFailed",
            message: "PDF compression is not available in this browser.",
          },
        };
        return this.snapshot();
      }
      const compressed = await this.#compressionGateway.compress({
        bytes: exportResult.bytes,
        documentDates,
        ...(options.onCompressionProgress === undefined
          ? {}
          : { onProgress: options.onCompressionProgress }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });
      if (!compressed.ok) {
        this.#state = {
          ...before,
          error: {
            code: "CompressionFailed",
            message: compressed.cancelled ? "PDF compression was cancelled." : compressed.message,
          },
        };
        return this.snapshot();
      }
      if (compressed.bytes.byteLength >= exportResult.bytes.byteLength) {
        this.#state = {
          ...before,
          error: {
            code: "CompressionNotBeneficial",
            message:
              "Compression didn't reduce this PDF. Export the original-quality version instead.",
          },
        };
        return this.snapshot();
      }
      bytes = compressed.bytes;
    }

    const filename =
      options.filename === undefined
        ? safeExportFilename(this.#state.fileName)
        : exportFilenameFromInput(options.filename);
    try {
      this.#downloadAdapter.download({ bytes, filename, mimeType: "application/pdf" });
    } catch {
      this.#state = {
        ...before,
        error: { code: "DownloadFailed", message: "The edited PDF could not be downloaded." },
      };
      return this.snapshot();
    }

    session.markClean();
    this.#hasUnsavedDocumentDates = false;
    this.#cleanRevision = this.#currentRevision;
    this.#syncState({ status: "ready", exportFilename: filename });
    return this.snapshot();
  }
  #currentHistoryState(selectedElementId = this.#session?.selectedElementId): HistoryState {
    return cloneHistoryState({
      elements: this.#session?.elements() ?? [],
      ...(selectedElementId === undefined ? {} : { selectedElementId }),
    });
  }

  #historyStateWithElement(element: EditorElement, selectedElementId = element.id): HistoryState {
    return cloneHistoryState({
      elements: (this.#session?.elements() ?? []).map((candidate) =>
        candidate.id === element.id ? cloneHistoryElement(element) : candidate,
      ),
      selectedElementId,
    });
  }

  #restoreHistoryState(state: HistoryState): DomainResult {
    const session = this.#session;
    if (session === undefined) {
      return { ok: false, error: new DomainError("SessionDisposed", "No active session.") };
    }
    return session.replaceElements(state.elements, state.selectedElementId);
  }

  #recordHistory(type: HistoryEntry["type"], before: HistoryState, after: HistoryState): void {
    const beforeRevision = this.#currentRevision;
    const afterRevision = beforeRevision + 1;
    this.#currentRevision = afterRevision;
    this.#undoStack.push({
      type,
      before: cloneHistoryState(before),
      after: cloneHistoryState(after),
      beforeRevision,
      afterRevision,
    });
    if (this.#undoStack.length > COMMAND_HISTORY_LIMIT) {
      this.#undoStack.shift();
    }
    this.#redoStack = [];
  }

  #resetHistory(): void {
    this.#undoStack = [];
    this.#redoStack = [];
    this.#currentRevision = 0;
    this.#cleanRevision = 0;
  }
  #clearClipboard(): void {
    this.#clipboard = undefined;
  }

  #isValidImageInput(image: ImageElementInput): boolean {
    return (
      image.dataUrl.startsWith(`data:${image.mimeType};base64,`) &&
      Number.isFinite(image.width) &&
      Number.isFinite(image.height) &&
      image.width > 0 &&
      image.height > 0
    );
  }

  #defaultImageSize(
    image: ImageElementInput,
    page: DocumentPage | undefined,
  ): { readonly width: number; readonly height: number } {
    const maxWidth = page?.width ?? image.width;
    const maxHeight = page?.height ?? image.height;
    const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height);
    return {
      width: Math.max(MIN_ELEMENT_WIDTH, image.width * scale),
      height: Math.max(MIN_ELEMENT_HEIGHT, image.height * scale),
    };
  }

  #aspectRatioBounds(element: EditorElement, bounds: Bounds): Bounds {
    if (element.type !== "image" && element.type !== "checkmark" && element.type !== "cross") {
      return bounds;
    }
    const ratio = element.bounds.width / element.bounds.height;
    if (!Number.isFinite(ratio) || ratio <= 0) {
      return bounds;
    }
    const widthDelta = Math.abs(bounds.width - element.bounds.width);
    const heightDelta = Math.abs(bounds.height - element.bounds.height);
    if (heightDelta > widthDelta) {
      return { ...bounds, width: bounds.height * ratio };
    }
    return { ...bounds, height: bounds.width / ratio };
  }

  #offsetPastedBounds(bounds: Bounds): Bounds {
    const preferred = this.#constrainBounds({
      ...bounds,
      x: bounds.x + PASTE_OFFSET,
      y: bounds.y + PASTE_OFFSET,
    });
    if (
      (preferred.x !== bounds.x || preferred.y !== bounds.y) &&
      !this.#matchesExistingBounds(preferred)
    ) {
      return preferred;
    }
    return this.#constrainBounds({
      ...bounds,
      x: bounds.x - PASTE_OFFSET,
      y: bounds.y - PASTE_OFFSET,
    });
  }

  #matchesExistingBounds(bounds: Bounds): boolean {
    return (this.#session?.elements() ?? []).some(
      (element) =>
        element.bounds.x === bounds.x &&
        element.bounds.y === bounds.y &&
        element.bounds.width === bounds.width &&
        element.bounds.height === bounds.height,
    );
  }
  #addImageSignature(
    type: SignatureElementType,
    point: { readonly x: number; readonly y: number },
    image: SignatureImageInput,
  ): EditorSnapshot {
    if (
      !Number.isFinite(image.width) ||
      !Number.isFinite(image.height) ||
      image.width <= 0 ||
      image.height <= 0
    ) {
      return this.#operationError("InvalidSignature", "Signature image dimensions must be valid.");
    }
    const width = type === "signature" ? 220 : 96;
    const height = Math.max(MIN_ELEMENT_HEIGHT, width * (image.height / image.width));
    return this.#addElement({
      type,
      bounds: { x: point.x, y: point.y, width, height },
      signatureContent: {
        kind: "image",
        dataUrl: image.dataUrl,
        mimeType: image.mimeType,
        source: image.source,
      },
    });
  }

  #addElement(request: {
    readonly historyType?: HistoryEntry["type"];
    readonly type:
      "text" | "whiteout" | "signature" | "initials" | "image" | "checkmark" | "cross" | "date";
    readonly bounds: Bounds;
    readonly text?: string;
    readonly fontSize?: number;
    readonly signatureContent?: SignatureElementContent;
    readonly imageContent?: ImageElementContent;
    readonly color?: string;
  }): EditorSnapshot {
    const session = this.#session;
    const pageId = session?.currentPageId;
    if (session === undefined || pageId === undefined) {
      return this.#operationError("NoActiveDocument", "Open a PDF before adding elements.");
    }
    if (!isFiniteBounds(request.bounds)) {
      return this.#operationError("InvalidElementBounds", "Element bounds must be finite.");
    }
    if (
      (request.type === "signature" || request.type === "initials") &&
      request.signatureContent === undefined
    ) {
      return this.#operationError("InvalidSignature", "Signature content is required.");
    }
    if (request.type === "image" && request.imageContent === undefined) {
      return this.#operationError("InvalidImage", "Image content is required.");
    }

    const before = this.#currentHistoryState(
      request.historyType === "add-element" || request.historyType === undefined
        ? undefined
        : session.selectedElementId,
    );

    const element: EditorElement = {
      id: this.#idGenerator.nextId("element"),
      pageId,
      type: request.type,
      bounds: this.#constrainBounds(request.bounds),
      ...(request.type === "whiteout" || request.type === "image"
        ? {}
        : { color: request.color ?? "#000000" }),
      ...(request.type === "text" || request.type === "date"
        ? {
            content: {
              text:
                request.text ??
                (request.type === "date" ? formatLocalDate(this.#dateProvider.today()) : "Text"),
              fontSize:
                request.fontSize === undefined
                  ? request.type === "date"
                    ? DEFAULT_DATE_APPEARANCE.fontSize
                    : DEFAULT_TEXT_APPEARANCE.fontSize
                  : clampTextFontSize(request.fontSize),
            },
          }
        : {}),
      ...(request.type === "signature" || request.type === "initials"
        ? { content: request.signatureContent }
        : {}),
      ...(request.type === "image" ? { content: request.imageContent } : {}),
    };
    const result = session.addElement(element);
    if (!result.ok) {
      return this.#operationError("OperationRejected", "The element could not be added.");
    }
    session.selectElement(element.id);
    this.#recordHistory(
      request.historyType ?? "add-element",
      before,
      this.#currentHistoryState(element.id),
    );
    this.#syncState();
    return this.snapshot();
  }

  #insertExistingElement(request: {
    readonly historyType: "duplicate-element" | "paste-element";
    readonly type: EditorElement["type"];
    readonly bounds: Bounds;
    readonly color?: string;
    readonly content?: EditorElementContent;
  }): EditorSnapshot {
    const session = this.#session;
    const pageId = session?.currentPageId;
    if (session === undefined || pageId === undefined) {
      return this.#operationError("NoActiveDocument", "Open a PDF before adding elements.");
    }
    const before = this.#currentHistoryState(session.selectedElementId);
    const element: EditorElement = {
      id: this.#idGenerator.nextId("element"),
      pageId,
      type: request.type,
      bounds: this.#constrainBounds(request.bounds),
      ...(request.color === undefined ? {} : { color: request.color }),
      ...(request.content === undefined ? {} : { content: { ...request.content } }),
    };
    const result = session.addElement(element);
    if (!result.ok) {
      return this.#operationError("OperationRejected", "The element could not be added.");
    }
    session.selectElement(element.id);
    this.#recordHistory(request.historyType, before, this.#currentHistoryState(element.id));
    this.#syncState();
    return this.snapshot();
  }
  #setElementState(
    elementId: string,
    state: Pick<EditorElement, "visible" | "locked">,
  ): EditorSnapshot {
    const element = this.#session?.element(elementId);
    if (element === undefined) {
      return this.#operationError("MissingElement", "The element no longer exists.");
    }
    return this.#setCurrentPageElementState(state, [element]);
  }

  #setCurrentPageElementState(
    state: Pick<EditorElement, "visible" | "locked">,
    targets?: readonly EditorElement[],
  ): EditorSnapshot {
    const session = this.#session;
    const pageId = session?.currentPageId;
    if (session === undefined || pageId === undefined) {
      return this.#operationError("NoActiveDocument", "Open a PDF before editing layers.");
    }
    const pageElements =
      targets ?? session.elements().filter((element) => element.pageId === pageId);
    if (pageElements.length === 0) {
      return this.snapshot();
    }
    const nextElements = pageElements.map((element) => ({ ...element, ...state }));
    if (
      nextElements.every((element, index) => {
        const previousElement = pageElements[index];
        return previousElement !== undefined && elementsMatch(element, previousElement);
      })
    ) {
      return this.snapshot();
    }
    const before = this.#currentHistoryState(session.selectedElementId);
    const result = session.updateElements(nextElements);
    if (!result.ok) {
      return this.#operationError("OperationRejected", "The layer state could not be updated.");
    }
    const selected = session.selectedElementId;
    if (
      state.visible === false &&
      selected !== undefined &&
      nextElements.some((element) => element.id === selected)
    ) {
      session.clearSelection();
    }
    this.#recordHistory(
      "update-element",
      before,
      this.#currentHistoryState(session.selectedElementId),
    );
    this.#syncState();
    return this.snapshot();
  }
  #replaceElement(element: EditorElement): EditorSnapshot {
    return this.#commitElementUpdate(element);
  }

  #previewElementUpdate(element: EditorElement): EditorSnapshot {
    if (this.#session?.element(element.id)?.locked === true) {
      return this.#operationError("OperationRejected", "Unlock this element before editing it.");
    }
    const result = this.#session?.updateElement(element);
    if (result?.ok !== true) {
      return this.#operationError("OperationRejected", "The element could not be updated.");
    }
    this.#session?.selectElement(element.id);
    this.#syncState();
    return this.snapshot();
  }

  #commitTextUpdate(element: EditorElement): EditorSnapshot {
    const session = this.#session;
    if (session === undefined) {
      return this.#operationError("NoActiveDocument", "Open a PDF before editing.");
    }
    if (session.element(element.id)?.locked === true) {
      return this.#operationError("OperationRejected", "Unlock this element before editing it.");
    }
    const before = this.#currentHistoryState(element.id);
    const result = session.updateElement(element);
    if (!result.ok) {
      return this.#operationError("OperationRejected", "The text element could not be updated.");
    }
    session.selectElement(element.id);
    const after = this.#currentHistoryState(element.id);
    if (JSON.stringify(before.elements) === JSON.stringify(after.elements)) {
      this.#syncState();
      return this.snapshot();
    }

    const latest = this.#undoStack.at(-1);
    const shouldMergeWithInitialAdd =
      latest?.type === "add-element" && latest.after.selectedElementId === element.id;
    const shouldMergeTextEdit =
      latest?.type === "update-text" && latest.after.selectedElementId === element.id;
    if (shouldMergeWithInitialAdd || shouldMergeTextEdit) {
      this.#undoStack[this.#undoStack.length - 1] = {
        ...latest,
        after: cloneHistoryState(after),
      };
      this.#redoStack = [];
    } else {
      this.#recordHistory("update-text", before, after);
    }
    this.#syncState();
    return this.snapshot();
  }
  #commitElementUpdate(
    element: EditorElement,
    before = this.#currentHistoryState(element.id),
  ): EditorSnapshot {
    if (this.#session?.element(element.id)?.locked === true) {
      return this.#operationError("OperationRejected", "Unlock this element before editing it.");
    }
    const result = this.#session?.updateElement(element);
    if (result?.ok !== true) {
      return this.#operationError("OperationRejected", "The element could not be updated.");
    }
    this.#session?.selectElement(element.id);
    const after = this.#currentHistoryState(element.id);
    if (JSON.stringify(before.elements) !== JSON.stringify(after.elements)) {
      this.#recordHistory("update-element", before, after);
    }
    this.#syncState();
    return this.snapshot();
  }

  #orderedExportElements(): readonly ExportElement[] {
    return (this.#session?.elements().map(toExportElement) ?? []).filter(
      (element) =>
        (element.visible ?? true) &&
        ((element.type !== "text" && element.type !== "date") ||
          (element.text ?? "").trim().length > 0),
    );
  }

  #constrainBounds(bounds: Bounds): Bounds {
    const page = this.#state.currentPage;
    const width = Math.max(MIN_ELEMENT_WIDTH, bounds.width);
    const height = Math.max(MIN_ELEMENT_HEIGHT, bounds.height);
    if (page === undefined) {
      return { ...bounds, width, height };
    }
    return {
      x: Math.min(Math.max(bounds.x, 0), Math.max(0, page.width - width)),
      y: Math.min(Math.max(bounds.y, 0), Math.max(0, page.height - height)),
      width: Math.min(width, page.width),
      height: Math.min(height, page.height),
    };
  }

  #operationError(code: EditorErrorCode, message: string): EditorSnapshot {
    this.#state = { ...this.#state, error: { code, message } };
    return this.snapshot();
  }

  #disposeRenderDocument(): void {
    const renderDocumentId = this.#renderDocumentId;
    if (renderDocumentId !== undefined) {
      this.#renderGateway?.disposeRenderDocument(renderDocumentId);
      this.#renderDocumentId = undefined;
    }
  }

  #syncState(overrides: Partial<EditorState> = {}): void {
    const session = this.#session;
    if (session === undefined) {
      this.#state = emptyState();
      return;
    }
    const pages = session.pages();
    const currentPageIndex = Math.max(
      0,
      pages.findIndex((page) => page.id === session.currentPageId),
    );
    const elements = session.elements().map(toExportElement);
    const currentPage = pages[currentPageIndex];
    const originalFileName = session.temporaryPersonalInfo.originalFileName;
    const selectedElement = elements.find((element) => element.id === session.selectedElementId);
    const baseState: EditorState = {
      status: "ready",
      pageCount: pages.length,
      pages,
      currentPageNumber: currentPageIndex + 1,
      tool: this.#state.tool,
      isDirty: this.#currentRevision !== this.#cleanRevision || this.#hasUnsavedDocumentDates,
      elements,
      visibleElements: elements.filter(
        (element) => element.pageId === session.currentPageId && (element.visible ?? true),
      ),
      documentDates: session.documentDates,
      sourceDocumentDates: { ...this.#sourceDocumentDates },
      ...(originalFileName === undefined ? {} : { fileName: originalFileName }),
      ...(currentPage === undefined ? {} : { currentPage }),
      ...(this.#renderDocumentId === undefined ? {} : { renderDocumentId: this.#renderDocumentId }),
      ...(session.selectedElementId === undefined
        ? {}
        : { selectedElementId: session.selectedElementId }),
      ...(selectedElement === undefined ? {} : { selectedElement }),
    };
    this.#state = { ...baseState, ...overrides };
  }
}
