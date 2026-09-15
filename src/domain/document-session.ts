type Brand<TValue, TBrand extends string> = TValue & { readonly __brand: TBrand };

export type DocumentSessionId = Brand<string, "DocumentSessionId">;
export type PageId = Brand<string, "PageId">;
export type ElementId = Brand<string, "ElementId">;

export type DocumentSessionStatus = "ready" | "disposed";
export type EditorElementType =
  "text" | "whiteout" | "signature" | "initials" | "image" | "checkmark" | "cross" | "date";
export type PageRotation = 0 | 90 | 180 | 270;

export interface Bounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface TextElementContent {
  readonly text: string;
  readonly fontSize?: number;
  readonly fontFamily?: string;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly underline?: boolean;
  readonly alignment?: "left" | "center" | "right";
  readonly lineHeight?: number;
  readonly letterSpacing?: number;
}

export interface TypedSignatureContent {
  readonly kind: "typed";
  readonly text: string;
  readonly fontFamily: string;
}

export interface ImageSignatureContent {
  readonly kind: "image";
  readonly dataUrl: string;
  readonly mimeType: "image/png" | "image/jpeg";
  readonly source: "draw" | "upload";
}

export type SignatureElementContent = TypedSignatureContent | ImageSignatureContent;

export interface ImageElementContent {
  readonly kind: "image-element";
  readonly dataUrl: string;
  readonly mimeType: "image/png" | "image/jpeg";
  readonly naturalWidth: number;
  readonly naturalHeight: number;
}

export type EditorElementContent =
  TextElementContent | SignatureElementContent | ImageElementContent;

export interface DocumentPage {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
}

export interface EditorElement {
  readonly id: string;
  readonly pageId: string;
  readonly type: EditorElementType;
  readonly bounds: Bounds;
  readonly color?: string;
  readonly content?: EditorElementContent;
  readonly visible?: boolean;
  readonly locked?: boolean;
}

export interface TemporaryPersonalInfo {
  readonly originalFileName?: string;
}

/**
 * The document-level PDF dates, as epoch milliseconds so the domain never holds a mutable `Date`.
 * An absent field means the exporter decides that date.
 */
export interface DocumentDates {
  readonly creationDate?: number;
  readonly modificationDate?: number;
}

export interface CreateDocumentSessionRequest {
  readonly id: string;
  readonly pages: readonly DocumentPage[];
  readonly temporaryPersonalInfo?: TemporaryPersonalInfo;
  readonly sourceReference?: string;
  readonly documentDates?: DocumentDates;
}

export type DomainErrorCode =
  | "InvalidSessionId"
  | "InvalidPageId"
  | "InvalidElementId"
  | "NoPages"
  | "DuplicatePageId"
  | "DuplicateElementId"
  | "InvalidPageDimensions"
  | "InvalidPageRotation"
  | "InvalidElementBounds"
  | "PageNotFound"
  | "ElementNotFound"
  | "CannotDeleteLastPage"
  | "InvalidPageOrder"
  | "InvalidDocumentDate"
  | "SessionDisposed";

export class DomainError extends Error {
  public constructor(
    public readonly code: DomainErrorCode,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "DomainError";
  }
}

export interface DomainSuccess {
  readonly ok: true;
}

export interface DomainFailure {
  readonly ok: false;
  readonly error: DomainError;
}

export type DomainResult = DomainSuccess | DomainFailure;

const success: DomainSuccess = { ok: true };

export const isDomainError = (value: unknown): value is DomainError => value instanceof DomainError;

const fail = (code: DomainErrorCode, message: string): DomainFailure => ({
  ok: false,
  error: new DomainError(code, message),
});

const requireIdentifier = <TBrand extends "DocumentSessionId" | "PageId" | "ElementId">(
  value: string,
  code: DomainErrorCode,
): Brand<string, TBrand> => {
  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    throw new DomainError(code, "Identifier must not be empty.");
  }

  return trimmedValue as Brand<string, TBrand>;
};

const toPageId = (value: string): PageId =>
  requireIdentifier<PageId extends Brand<string, infer TBrand> ? TBrand : never>(
    value,
    "InvalidPageId",
  );

const toElementId = (value: string): ElementId =>
  requireIdentifier<ElementId extends Brand<string, infer TBrand> ? TBrand : never>(
    value,
    "InvalidElementId",
  );

const clonePage = (page: DocumentPage): DocumentPage => ({ ...page });

const cloneElement = (element: EditorElement): EditorElement => ({
  ...element,
  bounds: { ...element.bounds },
  ...(element.color === undefined ? {} : { color: element.color }),
  ...(element.content === undefined ? {} : { content: { ...element.content } }),
  visible: element.visible ?? true,
  locked: element.locked ?? false,
});

const validRotations: ReadonlySet<number> = new Set([0, 90, 180, 270]);

const validatePage = (page: DocumentPage): DocumentPage => {
  toPageId(page.id);

  if (page.width <= 0 || page.height <= 0) {
    throw new DomainError("InvalidPageDimensions", "Page width and height must be positive.");
  }

  if (!validRotations.has(page.rotation)) {
    throw new DomainError("InvalidPageRotation", "Page rotation must be 0, 90, 180, or 270.");
  }

  return clonePage(page);
};

const validateElementBounds = (bounds: Bounds): void => {
  if (bounds.width <= 0 || bounds.height <= 0) {
    throw new DomainError("InvalidElementBounds", "Element width and height must be positive.");
  }
};

const validateElement = (element: EditorElement): EditorElement => {
  toElementId(element.id);
  toPageId(element.pageId);
  validateElementBounds(element.bounds);

  return cloneElement(element);
};

/** The widest instant `Date` can represent; anything beyond it cannot become a PDF date. */
const MAX_CALENDAR_DATE_MS = 8.64e15;

const validateDocumentDate = (value: number | undefined, field: string): number | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isFinite(value) || Math.abs(value) > MAX_CALENDAR_DATE_MS) {
    throw new DomainError(
      "InvalidDocumentDate",
      `${field} must be an instant a calendar date can represent.`,
    );
  }

  return Math.trunc(value);
};

const validateDocumentDates = (dates: DocumentDates): DocumentDates => {
  const creationDate = validateDocumentDate(dates.creationDate, "Creation date");
  const modificationDate = validateDocumentDate(dates.modificationDate, "Modification date");

  return {
    ...(creationDate === undefined ? {} : { creationDate }),
    ...(modificationDate === undefined ? {} : { modificationDate }),
  };
};

export class DocumentSession {
  readonly #id: DocumentSessionId;
  #status: DocumentSessionStatus = "ready";
  #pagesById = new Map<string, DocumentPage>();
  #pageOrder: string[] = [];
  #elementsById = new Map<string, EditorElement>();
  #currentPageId: string | undefined;
  #selectedElementId: string | undefined;
  #isDirty = false;
  #temporaryPersonalInfo: TemporaryPersonalInfo;
  #sourceReference: string | undefined;
  #documentDates: DocumentDates;

  private constructor(request: CreateDocumentSessionRequest) {
    this.#id = requireIdentifier<
      DocumentSessionId extends Brand<string, infer TBrand> ? TBrand : never
    >(request.id, "InvalidSessionId");
    this.#temporaryPersonalInfo = { ...request.temporaryPersonalInfo };
    this.#sourceReference = request.sourceReference;
    this.#documentDates = validateDocumentDates(request.documentDates ?? {});
    this.#initializePages(request.pages);
  }

  public static create(request: CreateDocumentSessionRequest): DocumentSession {
    return new DocumentSession(request);
  }

  public get id(): string {
    return this.#id;
  }

  public get status(): DocumentSessionStatus {
    return this.#status;
  }

  public get isDirty(): boolean {
    return this.#isDirty;
  }

  public get currentPageId(): string | undefined {
    return this.#currentPageId;
  }

  public get selectedElementId(): string | undefined {
    return this.#selectedElementId;
  }

  public get temporaryPersonalInfo(): TemporaryPersonalInfo {
    return { ...this.#temporaryPersonalInfo };
  }

  public get sourceReference(): string | undefined {
    return this.#sourceReference;
  }

  public get documentDates(): DocumentDates {
    return { ...this.#documentDates };
  }

  public pages(): DocumentPage[] {
    if (this.#isDisposed()) {
      return [];
    }

    return this.#pageOrder.map((pageId) => clonePage(this.#requireStoredPage(pageId)));
  }

  public page(pageId: string): DocumentPage | undefined {
    if (this.#isDisposed()) {
      return undefined;
    }

    const page = this.#pagesById.get(pageId);
    return page === undefined ? undefined : clonePage(page);
  }

  public elements(): EditorElement[] {
    if (this.#isDisposed()) {
      return [];
    }

    return Array.from(this.#elementsById.values(), cloneElement);
  }

  public element(elementId: string): EditorElement | undefined {
    if (this.#isDisposed()) {
      return undefined;
    }

    const element = this.#elementsById.get(elementId);
    return element === undefined ? undefined : cloneElement(element);
  }

  public setCurrentPage(pageId: string): DomainResult {
    const disposed = this.#rejectDisposed();
    if (disposed !== undefined) {
      return disposed;
    }

    if (!this.#pagesById.has(pageId)) {
      return fail("PageNotFound", "Current page must exist in the session.");
    }

    this.#currentPageId = pageId;
    return success;
  }

  public addPage(page: DocumentPage): DomainResult {
    const disposed = this.#rejectDisposed();
    if (disposed !== undefined) {
      return disposed;
    }

    try {
      const validatedPage = validatePage(page);

      if (this.#pagesById.has(validatedPage.id)) {
        return fail("DuplicatePageId", "Page identifiers must be unique within a session.");
      }

      this.#pagesById.set(validatedPage.id, validatedPage);
      this.#pageOrder.push(validatedPage.id);
      this.#isDirty = true;
      return success;
    } catch (error) {
      if (isDomainError(error)) {
        return fail(error.code, error.message);
      }
      throw error;
    }
  }

  public reorderPages(nextPageOrder: readonly string[]): DomainResult {
    const disposed = this.#rejectDisposed();
    if (disposed !== undefined) {
      return disposed;
    }

    if (!this.#isSamePageSet(nextPageOrder)) {
      return fail("InvalidPageOrder", "Page order must contain every active page exactly once.");
    }

    this.#pageOrder = [...nextPageOrder];
    this.#isDirty = true;
    return success;
  }

  public deletePage(pageId: string): DomainResult {
    const disposed = this.#rejectDisposed();
    if (disposed !== undefined) {
      return disposed;
    }

    if (!this.#pagesById.has(pageId)) {
      return fail("PageNotFound", "Cannot delete a missing page.");
    }

    if (this.#pageOrder.length === 1) {
      return fail("CannotDeleteLastPage", "Deleting the last remaining page is not allowed.");
    }

    const pageIndex = this.#pageOrder.indexOf(pageId);
    const nextPageOrder = this.#pageOrder.filter((storedPageId) => storedPageId !== pageId);
    const nextCurrentPageId =
      this.#currentPageId === pageId
        ? nextPageOrder[Math.min(pageIndex, nextPageOrder.length - 1)]
        : this.#currentPageId;

    const removedElementIds = new Set(
      Array.from(this.#elementsById.values())
        .filter((element) => element.pageId === pageId)
        .map((element) => element.id),
    );

    this.#pagesById.delete(pageId);
    this.#pageOrder = nextPageOrder;
    for (const elementId of removedElementIds) {
      this.#elementsById.delete(elementId);
    }
    this.#currentPageId = nextCurrentPageId;
    if (this.#selectedElementId !== undefined && removedElementIds.has(this.#selectedElementId)) {
      this.#selectedElementId = undefined;
    }
    this.#isDirty = true;
    return success;
  }

  public addElement(element: EditorElement): DomainResult {
    const disposed = this.#rejectDisposed();
    if (disposed !== undefined) {
      return disposed;
    }

    try {
      const validatedElement = validateElement(element);

      if (!this.#pagesById.has(validatedElement.pageId)) {
        return fail("PageNotFound", "Element page must exist in the session.");
      }

      if (this.#elementsById.has(validatedElement.id)) {
        return fail("DuplicateElementId", "Element identifiers must be unique within a session.");
      }

      this.#elementsById.set(validatedElement.id, validatedElement);
      this.#isDirty = true;
      return success;
    } catch (error) {
      if (isDomainError(error)) {
        return fail(error.code, error.message);
      }
      throw error;
    }
  }

  public updateElement(element: EditorElement): DomainResult {
    const disposed = this.#rejectDisposed();
    if (disposed !== undefined) {
      return disposed;
    }

    try {
      const validatedElement = validateElement(element);

      if (!this.#elementsById.has(validatedElement.id)) {
        return fail("ElementNotFound", "Cannot update a missing element.");
      }

      if (!this.#pagesById.has(validatedElement.pageId)) {
        return fail("PageNotFound", "Element page must exist in the session.");
      }

      this.#elementsById.set(validatedElement.id, validatedElement);
      this.#isDirty = true;
      return success;
    } catch (error) {
      if (isDomainError(error)) {
        return fail(error.code, error.message);
      }
      throw error;
    }
  }

  public updateElements(elements: readonly EditorElement[]): DomainResult {
    const disposed = this.#rejectDisposed();
    if (disposed !== undefined) {
      return disposed;
    }

    try {
      const validatedElements = elements.map(validateElement);
      const updates = new Map(validatedElements.map((element) => [element.id, element]));
      for (const element of validatedElements) {
        if (!this.#elementsById.has(element.id)) {
          return fail("ElementNotFound", "Cannot update a missing element.");
        }
        if (!this.#pagesById.has(element.pageId)) {
          return fail("PageNotFound", "Element page must exist in the session.");
        }
      }
      this.#elementsById = new Map(
        Array.from(this.#elementsById.values(), (element) => [
          element.id,
          updates.get(element.id) ?? element,
        ]),
      );
      this.#isDirty = true;
      return success;
    } catch (error) {
      if (isDomainError(error)) {
        return fail(error.code, error.message);
      }
      throw error;
    }
  }
  public reorderPageElements(pageId: string, nextElementOrder: readonly string[]): DomainResult {
    const disposed = this.#rejectDisposed();
    if (disposed !== undefined) {
      return disposed;
    }
    const pageElements = Array.from(this.#elementsById.values()).filter(
      (element) => element.pageId === pageId,
    );
    if (
      !this.#pagesById.has(pageId) ||
      nextElementOrder.length !== pageElements.length ||
      new Set(nextElementOrder).size !== nextElementOrder.length ||
      nextElementOrder.some(
        (elementId) => !pageElements.some((element) => element.id === elementId),
      )
    ) {
      return fail("ElementNotFound", "Layer order must contain every element on the current page.");
    }
    const byId = new Map(pageElements.map((element) => [element.id, element]));
    const orderedPageElements: EditorElement[] = [];
    for (const elementId of nextElementOrder) {
      const element = byId.get(elementId);
      if (element === undefined) {
        return fail(
          "ElementNotFound",
          "Layer order must contain every element on the current page.",
        );
      }
      orderedPageElements.push(element);
    }
    const nextElements: EditorElement[] = [];
    let inserted = false;
    for (const element of this.#elementsById.values()) {
      if (element.pageId !== pageId) {
        nextElements.push(element);
      } else if (!inserted) {
        nextElements.push(...orderedPageElements);
        inserted = true;
      }
    }
    this.#elementsById = new Map(nextElements.map((element) => [element.id, element]));
    this.#isDirty = true;
    return success;
  }
  public deleteElement(elementId: string): DomainResult {
    const disposed = this.#rejectDisposed();
    if (disposed !== undefined) {
      return disposed;
    }

    if (!this.#elementsById.has(elementId)) {
      return fail("ElementNotFound", "Cannot delete a missing element.");
    }

    this.#elementsById.delete(elementId);
    if (this.#selectedElementId === elementId) {
      this.#selectedElementId = undefined;
    }
    this.#isDirty = true;
    return success;
  }
  public replaceElements(
    elements: readonly EditorElement[],
    selectedElementId?: string,
  ): DomainResult {
    const disposed = this.#rejectDisposed();
    if (disposed !== undefined) {
      return disposed;
    }

    try {
      const nextElements = elements.map(validateElement);
      const seenElementIds = new Set<string>();
      for (const element of nextElements) {
        if (!this.#pagesById.has(element.pageId)) {
          return fail("PageNotFound", "Element page must exist in the session.");
        }
        if (seenElementIds.has(element.id)) {
          return fail("DuplicateElementId", "Element identifiers must be unique within a session.");
        }
        seenElementIds.add(element.id);
      }
      if (selectedElementId !== undefined && !seenElementIds.has(selectedElementId)) {
        return fail("ElementNotFound", "Selected element must exist in the session.");
      }

      this.#elementsById.clear();
      for (const element of nextElements) {
        this.#elementsById.set(element.id, element);
      }
      this.#selectedElementId = selectedElementId;
      this.#isDirty = true;
      return success;
    } catch (error) {
      if (isDomainError(error)) {
        return fail(error.code, error.message);
      }
      throw error;
    }
  }

  public selectElement(elementId: string): DomainResult {
    const disposed = this.#rejectDisposed();
    if (disposed !== undefined) {
      return disposed;
    }

    if (!this.#elementsById.has(elementId)) {
      return fail("ElementNotFound", "Selected element must exist in the session.");
    }

    this.#selectedElementId = elementId;
    return success;
  }

  public clearSelection(): DomainResult {
    const disposed = this.#rejectDisposed();
    if (disposed !== undefined) {
      return disposed;
    }

    this.#selectedElementId = undefined;
    return success;
  }

  /** Replaces both dates at once: an omitted field clears that date rather than keeping it. */
  public setDocumentDates(dates: DocumentDates): DomainResult {
    const disposed = this.#rejectDisposed();
    if (disposed !== undefined) {
      return disposed;
    }

    try {
      this.#documentDates = validateDocumentDates(dates);
      this.#isDirty = true;
      return success;
    } catch (error) {
      if (isDomainError(error)) {
        return fail(error.code, error.message);
      }
      throw error;
    }
  }

  public markClean(): DomainResult {
    const disposed = this.#rejectDisposed();
    if (disposed !== undefined) {
      return disposed;
    }

    this.#isDirty = false;
    return success;
  }

  public dispose(): DomainResult {
    this.#status = "disposed";
    this.#pagesById.clear();
    this.#pageOrder = [];
    this.#elementsById.clear();
    this.#currentPageId = undefined;
    this.#selectedElementId = undefined;
    this.#temporaryPersonalInfo = {};
    this.#sourceReference = undefined;
    this.#documentDates = {};
    this.#isDirty = false;
    return success;
  }

  #initializePages(pages: readonly DocumentPage[]): void {
    if (pages.length === 0) {
      throw new DomainError("NoPages", "A document session must start with at least one page.");
    }

    for (const page of pages) {
      const validatedPage = validatePage(page);

      if (this.#pagesById.has(validatedPage.id)) {
        throw new DomainError(
          "DuplicatePageId",
          "Page identifiers must be unique within a session.",
        );
      }

      this.#pagesById.set(validatedPage.id, validatedPage);
      this.#pageOrder.push(validatedPage.id);
    }

    this.#currentPageId = this.#pageOrder[0];
  }

  #isDisposed(): boolean {
    return this.#status === "disposed";
  }

  #rejectDisposed(): DomainFailure | undefined {
    return this.#isDisposed()
      ? fail("SessionDisposed", "Disposed sessions reject mutation operations.")
      : undefined;
  }

  #requireStoredPage(pageId: string): DocumentPage {
    const page = this.#pagesById.get(pageId);

    if (page === undefined) {
      throw new DomainError("PageNotFound", "Page order referenced a missing page.");
    }

    return page;
  }

  #isSamePageSet(nextPageOrder: readonly string[]): boolean {
    if (nextPageOrder.length !== this.#pageOrder.length) {
      return false;
    }

    const seenPageIds = new Set<string>();
    for (const pageId of nextPageOrder) {
      if (!this.#pagesById.has(pageId) || seenPageIds.has(pageId)) {
        return false;
      }
      seenPageIds.add(pageId);
    }

    return true;
  }
}
