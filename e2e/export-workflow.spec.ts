import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { expect, test, type Page } from "@playwright/test";

const createPdf = async (): Promise<Buffer> => {
  const document = await PDFDocument.create();
  const page = document.addPage([300, 400]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  page.drawRectangle({ x: 40, y: 302, width: 120, height: 48, color: rgb(0, 0, 0) });
  page.drawText("SOURCE", { x: 45, y: 345, size: 20, font, color: rgb(1, 0, 0) });
  return Buffer.from(await document.save());
};

const createPageCountPdf = async (pageCount: number): Promise<Buffer> => {
  const document = await PDFDocument.create();
  for (let pageNumber = 0; pageNumber < pageCount; pageNumber += 1) {
    document.addPage([300, 400]);
  }
  return Buffer.from(await document.save());
};

const renderedCanvasHasVisibleContent = (page: Page): Promise<boolean> =>
  page
    .locator('canvas[aria-label="Rendered PDF page"]')
    .evaluate((node: SVGElement | HTMLElement) => {
      const canvas = node as HTMLCanvasElement;
      const context = canvas.getContext("2d");
      if (context === null || canvas.width === 0 || canvas.height === 0) {
        return false;
      }
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let index = 0; index < data.length; index += 4) {
        const red = data[index] ?? 255;
        const green = data[index + 1] ?? 255;
        const blue = data[index + 2] ?? 255;
        const alpha = data[index + 3] ?? 0;
        if (alpha > 0 && (red < 245 || green < 245 || blue < 245)) {
          return true;
        }
      }
      return false;
    });

const expectLayerActionInsideVisibleList = async (
  page: Page,
  accessibleName: string,
): Promise<void> => {
  const action = page.getByRole("button", { name: accessibleName });
  await action.scrollIntoViewIfNeeded();

  const [actionBox, listBox, headerBox, actionsBox, actionsHeadingBox] = await Promise.all([
    action.boundingBox(),
    page.locator(".layers-list").boundingBox(),
    page.locator(".layers-panel-header").boundingBox(),
    page.locator(".layers-bulk-actions").boundingBox(),
    page.locator(".layers-actions-heading").boundingBox(),
  ]);

  expect(actionBox).not.toBeNull();
  expect(listBox).not.toBeNull();
  expect(headerBox).not.toBeNull();
  expect(actionsBox).not.toBeNull();
  expect(actionsHeadingBox).not.toBeNull();
  if (
    actionBox === null ||
    listBox === null ||
    headerBox === null ||
    actionsBox === null ||
    actionsHeadingBox === null
  ) {
    return;
  }

  const center = {
    x: actionBox.x + actionBox.width / 2,
    y: actionBox.y + actionBox.height / 2,
  };
  const containsPoint = (
    box: {
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    },
    point: { readonly x: number; readonly y: number },
  ): boolean =>
    point.x >= box.x &&
    point.x <= box.x + box.width &&
    point.y >= box.y &&
    point.y <= box.y + box.height;

  expect(containsPoint(listBox, center)).toBe(true);
  expect(containsPoint(headerBox, center)).toBe(false);
  expect(containsPoint(actionsHeadingBox, center)).toBe(false);
  expect(containsPoint(actionsBox, center)).toBe(false);
};
const canvasRegionIsMostlyWhite = (
  page: Page,
  region: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  },
): Promise<boolean> =>
  page
    .locator('canvas[aria-label="Rendered PDF page"]')
    .evaluate((node: SVGElement | HTMLElement, sampleRegion) => {
      const canvas = node as HTMLCanvasElement;
      const context = canvas.getContext("2d");
      if (context === null) {
        return false;
      }
      const cssWidth = Number.parseFloat(
        canvas.style.width.length > 0 ? canvas.style.width : String(canvas.width),
      );
      const cssHeight = Number.parseFloat(
        canvas.style.height.length > 0 ? canvas.style.height : String(canvas.height),
      );
      const scaleX = canvas.width / cssWidth;
      const scaleY = canvas.height / cssHeight;
      const x = Math.floor(sampleRegion.x * scaleX);
      const y = Math.floor(sampleRegion.y * scaleY);
      const width = Math.max(1, Math.floor(sampleRegion.width * scaleX));
      const height = Math.max(1, Math.floor(sampleRegion.height * scaleY));
      const data = context.getImageData(x, y, width, height).data;
      let whitePixels = 0;
      const pixelCount = data.length / 4;
      for (let index = 0; index < data.length; index += 4) {
        const red = data[index] ?? 0;
        const green = data[index + 1] ?? 0;
        const blue = data[index + 2] ?? 0;
        const alpha = data[index + 3] ?? 0;
        if (alpha > 0 && red > 245 && green > 245 && blue > 245) {
          whitePixels += 1;
        }
      }
      return whitePixels / pixelCount > 0.9;
    }, region);
const canvasRegionHasDarkContent = (
  page: Page,
  region: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  },
): Promise<boolean> =>
  page
    .locator('canvas[aria-label="Rendered PDF page"]')
    .evaluate((node: SVGElement | HTMLElement, sampleRegion) => {
      const canvas = node as HTMLCanvasElement;
      const context = canvas.getContext("2d");
      if (context === null) {
        return false;
      }
      const cssWidth = Number.parseFloat(
        canvas.style.width.length > 0 ? canvas.style.width : String(canvas.width),
      );
      const cssHeight = Number.parseFloat(
        canvas.style.height.length > 0 ? canvas.style.height : String(canvas.height),
      );
      const scaleX = canvas.width / cssWidth;
      const scaleY = canvas.height / cssHeight;
      const x = Math.floor(sampleRegion.x * scaleX);
      const y = Math.floor(sampleRegion.y * scaleY);
      const width = Math.max(1, Math.floor(sampleRegion.width * scaleX));
      const height = Math.max(1, Math.floor(sampleRegion.height * scaleY));
      const data = context.getImageData(x, y, width, height).data;
      for (let index = 0; index < data.length; index += 4) {
        const red = data[index] ?? 255;
        const green = data[index + 1] ?? 255;
        const blue = data[index + 2] ?? 255;
        const alpha = data[index + 3] ?? 0;
        if (alpha > 0 && red < 80 && green < 80 && blue < 80) {
          return true;
        }
      }
      return false;
    }, region);

const canvasRegionHasNonWhiteContent = (
  page: Page,
  region: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  },
): Promise<boolean> =>
  page
    .locator('canvas[aria-label="Rendered PDF page"]')
    .evaluate((node: SVGElement | HTMLElement, sampleRegion) => {
      const canvas = node as HTMLCanvasElement;
      const context = canvas.getContext("2d");
      if (context === null) {
        return false;
      }
      const cssWidth = Number.parseFloat(
        canvas.style.width.length > 0 ? canvas.style.width : String(canvas.width),
      );
      const cssHeight = Number.parseFloat(
        canvas.style.height.length > 0 ? canvas.style.height : String(canvas.height),
      );
      const scaleX = canvas.width / cssWidth;
      const scaleY = canvas.height / cssHeight;
      const x = Math.floor(sampleRegion.x * scaleX);
      const y = Math.floor(sampleRegion.y * scaleY);
      const width = Math.max(1, Math.floor(sampleRegion.width * scaleX));
      const height = Math.max(1, Math.floor(sampleRegion.height * scaleY));
      const data = context.getImageData(x, y, width, height).data;
      for (let index = 0; index < data.length; index += 4) {
        const red = data[index] ?? 255;
        const green = data[index + 1] ?? 255;
        const blue = data[index + 2] ?? 255;
        const alpha = data[index + 3] ?? 0;
        if (alpha > 0 && (red < 245 || green < 245 || blue < 245)) {
          return true;
        }
      }
      return false;
    }, region);
const browserScaleSnapshot = (
  page: Page,
): Promise<{
  readonly devicePixelRatio: number;
  readonly bannerHeight: number;
}> =>
  page.evaluate(() => ({
    devicePixelRatio: window.devicePixelRatio,
    bannerHeight: document.querySelector("header")?.getBoundingClientRect().height ?? 0,
  }));

const modifiedWheel = async (page: Page, direction: "in" | "out", count = 1): Promise<void> => {
  await page.keyboard.down("Control");
  for (let index = 0; index < count; index += 1) {
    await page.mouse.wheel(0, direction === "out" ? 160 : -160);
  }
  await page.keyboard.up("Control");
};
const dragWhiteout = async (
  page: Page,
  start: { readonly x: number; readonly y: number },
  end: { readonly x: number; readonly y: number },
): Promise<void> => {
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await expect(page.getByLabel("Whiteout preview")).toBeVisible();
  await page.mouse.move(end.x, end.y);
  await expect(page.getByLabel("Whiteout preview")).toBeVisible();
  await page.mouse.up();
  await expect(page.getByLabel("Whiteout preview")).toHaveCount(0);
};

const borderWidthsFor = (page: Page, selector: string): Promise<string> =>
  page.locator(selector).evaluate((element) => {
    const style = window.getComputedStyle(element);
    return `${style.borderTopWidth} ${style.borderRightWidth} ${style.borderBottomWidth} ${style.borderLeftWidth}`;
  });

interface WheelListenerRecord {
  readonly tagName: string;
  readonly className: string;
  readonly ariaLabel: string | null;
}

interface WheelEventRecord {
  readonly target: string;
  readonly path: readonly string[];
  readonly editor: { readonly width: number; readonly height: number } | null;
  readonly viewport: { readonly width: number; readonly height: number } | null;
  readonly workspace: { readonly width: number; readonly height: number } | null;
  readonly pageFrame: { readonly width: number; readonly height: number } | null;
  readonly pointerInsideEditor: boolean;
  readonly pointerInsideViewport: boolean;
  readonly pointerInsideWorkspace: boolean;
  readonly pointerInsidePageFrame: boolean;
}

const installWheelListenerRecorder = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    type ListenerWindow = Window & { __quickPdfWheelListeners?: WheelListenerRecord[] };
    const listenerWindow = window as ListenerWindow;
    const originalAddEventListener = Reflect.get(EventTarget.prototype, "addEventListener");
    listenerWindow.__quickPdfWheelListeners = [];
    EventTarget.prototype.addEventListener = function (
      this: EventTarget,
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions,
    ): void {
      if (type === "wheel" && this instanceof HTMLElement) {
        listenerWindow.__quickPdfWheelListeners?.push({
          tagName: this.tagName,
          className: this.className,
          ariaLabel: this.getAttribute("aria-label"),
        });
      }
      originalAddEventListener.call(this, type, listener, options);
    };
  });
};

const startWheelEventRecorder = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    interface RectRecord {
      readonly width: number;
      readonly height: number;
    }
    type EventWindow = Window & { __quickPdfWheelEvents?: WheelEventRecord[] };
    const eventWindow = window as EventWindow;
    const describe = (target: EventTarget): string => {
      if (!(target instanceof HTMLElement)) {
        return target.constructor.name;
      }
      const label = target.getAttribute("aria-label");
      const className = target.className;
      return [target.tagName.toLowerCase(), className, label].filter(Boolean).join(".");
    };
    const rectFor = (selector: string): DOMRect | null =>
      document.querySelector(selector)?.getBoundingClientRect() ?? null;
    const sizeFor = (rect: DOMRect | null): RectRecord | null =>
      rect === null ? null : { width: rect.width, height: rect.height };
    const contains = (rect: DOMRect | null, event: WheelEvent): boolean =>
      rect !== null &&
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;

    eventWindow.__quickPdfWheelEvents = [];
    document.addEventListener(
      "wheel",
      (event) => {
        const editor = rectFor(".editor-viewer");
        const viewport = rectFor('[aria-label="PDF editor viewport"]');
        const workspace = rectFor('[aria-label="PDF workspace"]');
        const pageFrame = rectFor(".pdf-page-frame");
        eventWindow.__quickPdfWheelEvents?.push({
          target: describe(event.target ?? document),
          path: event.composedPath().map(describe).slice(0, 8),
          editor: sizeFor(editor),
          viewport: sizeFor(viewport),
          workspace: sizeFor(workspace),
          pageFrame: sizeFor(pageFrame),
          pointerInsideEditor: contains(editor, event),
          pointerInsideViewport: contains(viewport, event),
          pointerInsideWorkspace: contains(workspace, event),
          pointerInsidePageFrame: contains(pageFrame, event),
        });
      },
      { capture: true },
    );
  });
};

const wheelListenerRecords = (page: Page): Promise<WheelListenerRecord[]> =>
  page.evaluate(() => {
    type ListenerWindow = Window & { readonly __quickPdfWheelListeners?: WheelListenerRecord[] };
    return (window as ListenerWindow).__quickPdfWheelListeners ?? [];
  });

const wheelEventRecords = (page: Page): Promise<WheelEventRecord[]> =>
  page.evaluate(() => {
    type EventWindow = Window & { readonly __quickPdfWheelEvents?: WheelEventRecord[] };
    return (window as EventWindow).__quickPdfWheelEvents ?? [];
  });
const addDrawnSignature = async (page: Page): Promise<void> => {
  await page.getByRole("button", { name: "Signature" }).click();
  const signaturePad = page.getByLabel("Draw signature");
  const padBox = await signaturePad.boundingBox();
  expect(padBox).not.toBeNull();
  if (padBox === null) {
    return;
  }
  await page.mouse.move(padBox.x + 60, padBox.y + 90);
  await page.mouse.down();
  await page.mouse.move(padBox.x + 160, padBox.y + 45);
  await page.mouse.move(padBox.x + 280, padBox.y + 100);
  await page.mouse.up();
  await page.getByRole("button", { name: "Accept" }).click();
  await expect(page.getByRole("group", { name: "signature element" })).toBeVisible();
};

const addTypedSignature = async (page: Page, name: string): Promise<void> => {
  await page.getByRole("button", { name: "Signature" }).click();
  await page.getByRole("tab", { name: "Type" }).click();
  await page.getByLabel("Signature name").fill(name);
  await page.getByLabel("Font").selectOption("serif");
  await expect(page.getByLabel("Signature preview")).toHaveText(name);
  await page.getByRole("button", { name: "Accept" }).click();
  await expect(page.getByRole("group", { name: "signature element" })).toBeVisible();
};

const addTypedInitials = async (page: Page, initials: string): Promise<void> => {
  await page.getByRole("button", { name: "Initials" }).click();
  await page.getByRole("tab", { name: "Type" }).click();
  await page.getByLabel("Initials text").fill(initials);
  await expect(page.getByLabel("Signature preview")).toHaveText(initials);
  await page.getByRole("button", { name: "Accept" }).click();
  await expect(page.getByRole("group", { name: "initials element" })).toBeVisible();
};

const downloadEditedPdf = async (
  page: Page,
  suggestedFilename: string,
  outputPath: string,
): Promise<void> => {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  await page
    .getByRole("dialog", { name: "Export PDF" })
    .getByRole("button", { name: "Export PDF" })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(suggestedFilename.replace(/-edited(?=\.pdf$)/, ""));
  await download.saveAs(outputPath);
};
const expectBoxNear = (
  box: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  } | null,
  expected: { readonly x: number; readonly y: number },
): void => {
  expect(box).not.toBeNull();
  if (box === null) {
    return;
  }
  expect(Math.abs(box.x - expected.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.y - expected.y)).toBeLessThanOrEqual(1);
};

test("normal PDF opening stays on the standard loading path", async ({ page }, testInfo) => {
  const fixturePath = testInfo.outputPath("normal-opening.pdf");
  await import("node:fs/promises").then(async (fs) => fs.writeFile(fixturePath, await createPdf()));

  await page.goto("/");
  await page.getByLabel("Choose a PDF file").setInputFiles(fixturePath);

  await expect(page.getByRole("status")).toBeVisible();
  await expect(page.getByText("Preparing large PDF...")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "normal-opening.pdf" })).toBeVisible();
  await expect(page.getByText("Rendering PDF page...")).toBeHidden();
});

test("large PDF opening reports page count before editor readiness", async ({ page }, testInfo) => {
  const fixturePath = testInfo.outputPath("large-opening.pdf");
  await import("node:fs/promises").then(async (fs) =>
    fs.writeFile(fixturePath, await createPageCountPdf(120)),
  );

  await page.goto("/");
  await page.getByLabel("Choose a PDF file").setInputFiles(fixturePath);

  await expect(page.getByText("Preparing large PDF...")).toBeVisible();
  await expect(
    page.getByText("This document has 120 pages. NestlyPDF is preparing it for editing."),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "large-opening.pdf" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Current page", exact: true })).toContainText(
    "1 / 120",
  );
});

test("1000-page PDF becomes usable with lazy thumbnails and far navigation", async ({
  page,
}, testInfo) => {
  test.slow();
  const fixturePath = testInfo.outputPath("thousand-page-opening.pdf");
  await import("node:fs/promises").then(async (fs) =>
    fs.writeFile(fixturePath, await createPageCountPdf(1_001)),
  );

  await page.goto("/");
  await page.getByLabel("Choose a PDF file").setInputFiles(fixturePath);

  await expect(page.getByText("Preparing large PDF...")).toBeVisible();
  await expect(page.getByRole("heading", { name: "thousand-page-opening.pdf" })).toBeVisible();
  await expect(page.getByText("Rendering PDF page...")).toBeHidden();
  await expect(page.getByRole("status", { name: "Current page", exact: true })).toContainText(
    "1 / 1001",
  );
  await expect
    .poll(() =>
      page
        .locator('canvas[aria-label="Rendered PDF page"]')
        .evaluate((canvas: HTMLCanvasElement) => canvas.width > 0 && canvas.height > 0),
    )
    .toBe(true);
  await expect.poll(() => page.locator(".page-thumbnail-canvas").count()).toBeLessThanOrEqual(20);

  const pageRailList = page.locator(".page-rail-list");
  await pageRailList.evaluate((element) => {
    element.scrollTo({ top: element.scrollHeight, behavior: "auto" });
  });
  await expect.poll(() => pageRailList.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

  const lastPage = page.getByRole("button", { name: "page 1001", exact: true });
  await expect(lastPage).toBeVisible();
  await expect(lastPage.locator(".page-thumbnail-canvas")).toHaveCount(1);
  await lastPage.click();

  await expect(page.getByRole("status", { name: "Current page", exact: true })).toContainText(
    "1001 / 1001",
  );
  await expect(page.getByText("Rendering PDF page...")).toBeHidden();
  await expect.poll(() => page.locator(".page-thumbnail-canvas").count()).toBeLessThanOrEqual(20);
});

test("pans plain PDF page and green workspace through the shared gesture", async ({
  page,
}, testInfo) => {
  const fixturePath = testInfo.outputPath("workspace-pan-fixture.pdf");
  await import("node:fs/promises").then(async (fs) => fs.writeFile(fixturePath, await createPdf()));

  await page.goto("/");
  await page.getByLabel("Choose a PDF file").setInputFiles(fixturePath);
  await expect(page.getByRole("heading", { name: "workspace-pan-fixture.pdf" })).toBeVisible();
  await expect(page.getByText("Rendering PDF page...")).toBeHidden();

  for (let index = 0; index < 4; index += 1) {
    await page.getByRole("button", { name: "Zoom in" }).click();
  }

  const workspace = page.getByRole("main", { name: "PDF workspace" });
  const pageArea = page.getByLabel("PDF overlay");
  await workspace.evaluate((element) => {
    element.scrollTop = 120;
  });
  const pageBox = await pageArea.boundingBox();
  expect(pageBox).not.toBeNull();
  if (pageBox === null) {
    return;
  }

  const pageStartScroll = await workspace.evaluate((element) => element.scrollTop);
  await page.mouse.move(pageBox.x + pageBox.width / 2, pageBox.y + pageBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(pageBox.x + pageBox.width / 2, pageBox.y + pageBox.height / 2 - 60);
  await page.mouse.up();
  await expect
    .poll(() => workspace.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(pageStartScroll + 30);

  await workspace.evaluate((element) => {
    element.scrollTop = 120;
  });
  const greenPoint = await page.evaluate(() => {
    const workspaceElement = document.querySelector<HTMLElement>('[aria-label="PDF workspace"]');
    const pageFrame = document.querySelector<HTMLElement>(".pdf-page-frame");
    if (workspaceElement === null || pageFrame === null) {
      throw new Error("Workspace geometry is unavailable.");
    }
    const workspaceRect = workspaceElement.getBoundingClientRect();
    const pageRect = pageFrame.getBoundingClientRect();
    const y = workspaceRect.top + workspaceRect.height / 2;
    if (pageRect.left - workspaceRect.left > 24) {
      return { x: workspaceRect.left + 12, y };
    }
    if (workspaceRect.right - pageRect.right > 24) {
      return { x: workspaceRect.right - 12, y };
    }
    throw new Error("No visible green workspace pan surface.");
  });
  const workspaceStartScroll = await workspace.evaluate((element) => element.scrollTop);
  await page.mouse.move(greenPoint.x, greenPoint.y);
  await page.mouse.down();
  await page.mouse.move(greenPoint.x, greenPoint.y - 60);
  await page.mouse.up();
  await expect
    .poll(() => workspace.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(workspaceStartScroll + 30);
});

test("keeps compact Whiteout ahead of PDF-page pan", async ({ page }, testInfo) => {
  const fixturePath = testInfo.outputPath("compact-whiteout-pan-fixture.pdf");
  await import("node:fs/promises").then(async (fs) => fs.writeFile(fixturePath, await createPdf()));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.evaluate(() => {
    const nativeMatchMedia = window.matchMedia.bind(window);
    Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: 5 });
    window.matchMedia = (query: string) => {
      if (query === "(pointer: coarse)") {
        return {
          addEventListener: () => undefined,
          addListener: () => undefined,
          dispatchEvent: () => false,
          matches: true,
          media: query,
          onchange: null,
          removeEventListener: () => undefined,
          removeListener: () => undefined,
        } as MediaQueryList;
      }
      return nativeMatchMedia(query);
    };
  });

  await page.getByLabel("Choose a PDF file").setInputFiles(fixturePath);
  await expect(page.getByRole("region", { name: "compact-whiteout-pan-fixture.pdf" })).toHaveClass(
    /is-compact-editor/,
  );
  await expect(page.getByText("Rendering PDF page...")).toBeHidden();

  for (let index = 0; index < 4; index += 1) {
    await page.getByRole("button", { name: "Zoom in" }).click();
  }

  const workspace = page.getByRole("main", { name: "PDF workspace" });
  await workspace.evaluate((element) => {
    element.scrollTop = 80;
  });
  const points = await page.evaluate(() => {
    const workspaceElement = document.querySelector<HTMLElement>('[aria-label="PDF workspace"]');
    const overlay = document.querySelector<HTMLElement>(".overlay-layer");
    if (workspaceElement === null || overlay === null) {
      throw new Error("Whiteout pan geometry is unavailable.");
    }
    const workspaceRect = workspaceElement.getBoundingClientRect();
    const overlayRect = overlay.getBoundingClientRect();
    const left = Math.max(workspaceRect.left, overlayRect.left);
    const right = Math.min(workspaceRect.right, overlayRect.right);
    const top = Math.max(workspaceRect.top, overlayRect.top);
    const bottom = Math.min(workspaceRect.bottom, overlayRect.bottom);
    if (right - left < 180 || bottom - top < 140) {
      throw new Error("Not enough visible PDF page area for Whiteout and pan gestures.");
    }
    return {
      panEnd: { x: right - 30, y: top + 20 },
      panStart: { x: right - 30, y: top + 80 },
      whiteoutEnd: { x: left + 110, y: top + 80 },
      whiteoutStart: { x: left + 30, y: top + 30 },
    };
  });

  await page.getByRole("button", { name: "More editor tools" }).click();
  const moreTools = page.getByRole("dialog", { name: "More tools" });
  await moreTools.getByRole("button", { name: "Whiteout" }).click();
  await expect(moreTools).toBeHidden();

  const beforeWhiteoutScroll = await workspace.evaluate((element) => ({
    left: element.scrollLeft,
    top: element.scrollTop,
  }));
  await dragWhiteout(page, points.whiteoutStart, points.whiteoutEnd);
  await expect(page.getByRole("group", { name: "whiteout element" })).toBeVisible();
  await expect(page.locator('button[aria-label="Whiteout"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect
    .poll(() =>
      workspace.evaluate((element) => ({
        left: element.scrollLeft,
        top: element.scrollTop,
      })),
    )
    .toEqual(beforeWhiteoutScroll);

  await page.getByRole("button", { name: "Select" }).click();
  const beforePanScroll = await workspace.evaluate((element) => element.scrollTop);
  await page.mouse.move(points.panStart.x, points.panStart.y);
  await page.mouse.down();
  await page.mouse.move(points.panEnd.x, points.panEnd.y);
  await page.mouse.up();
  await expect
    .poll(() => workspace.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(beforePanScroll + 30);
});

test("renders and exports bundled Patrick Hand text", async ({ page }, testInfo) => {
  const fixturePath = testInfo.outputPath("patrick-hand-fixture.pdf");
  const fixtureBytes = await createPdf();
  await import("node:fs/promises").then((fs) => fs.writeFile(fixturePath, fixtureBytes));

  await page.goto("/");
  await page.getByLabel("Choose a PDF file").setInputFiles(fixturePath);
  await expect(page.getByRole("heading", { name: "patrick-hand-fixture.pdf" })).toBeVisible();
  await expect(page.getByText("Rendering PDF page...")).toBeHidden();

  const overlayBox = await page.locator(".overlay-layer").boundingBox();
  expect(overlayBox).not.toBeNull();
  if (overlayBox === null) return;

  await page.getByRole("button", { name: "Text" }).click();
  await page.mouse.click(overlayBox.x + 100, overlayBox.y + 140);
  await page.getByLabel("Edit text element").fill("John Doe");
  await page.getByLabel("Edit text element").press("Escape");
  await page.getByRole("tab", { name: "Style" }).click();
  await page.getByLabel("Text font", { exact: true }).selectOption("Patrick Hand");
  await expect(page.getByLabel("Text element content")).toHaveCSS("font-family", /Patrick Hand/);
  await page.screenshot({ path: testInfo.outputPath("patrick-hand-editor.png"), fullPage: true });

  const downloadedPath = testInfo.outputPath("patrick-hand-fixture-edited.pdf");
  await downloadEditedPdf(page, "patrick-hand-fixture-edited.pdf", downloadedPath);
  const exported = await PDFDocument.load(
    await import("node:fs/promises").then((fs) => fs.readFile(downloadedPath)),
  );
  expect(exported.getPageCount()).toBe(1);

  await page.goto("/");
  await page.getByLabel("Choose a PDF file").setInputFiles(downloadedPath);
  await expect(
    page.getByRole("heading", { name: "patrick-hand-fixture-edited.pdf" }),
  ).toBeVisible();
  await expect(page.getByText("Rendering PDF page...")).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath("patrick-hand-exported.png"), fullPage: true });
});
test("opens a visible synthetic PDF, aligns overlays, and downloads an edited PDF", async ({
  page,
}, testInfo) => {
  const fixturePath = testInfo.outputPath("export-fixture.pdf");
  const fixtureBytes = await createPdf();
  await import("node:fs/promises").then((fs) => fs.writeFile(fixturePath, fixtureBytes));
  await installWheelListenerRecorder(page);

  await page.goto("/");
  await page.getByLabel("Choose a PDF file").setInputFiles(fixturePath);
  await expect(page.getByRole("heading", { name: "export-fixture.pdf" })).toBeVisible();
  await expect(page.getByText("Rendering PDF page...")).toBeHidden();
  await expect.poll(() => renderedCanvasHasVisibleContent(page)).toBe(true);

  const overlayBox = await page.locator(".overlay-layer").boundingBox();
  expect(overlayBox).not.toBeNull();
  if (overlayBox === null) {
    return;
  }

  await page.getByRole("button", { name: "Whiteout" }).click();
  await expect(page.getByRole("button", { name: "Whiteout" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const currentOverlayBox = await page.locator(".overlay-layer").boundingBox();
  expect(currentOverlayBox).not.toBeNull();
  if (currentOverlayBox === null) {
    return;
  }
  await dragWhiteout(
    page,
    { x: currentOverlayBox.x + 40, y: currentOverlayBox.y + 50 },
    { x: currentOverlayBox.x + 160, y: currentOverlayBox.y + 98 },
  );
  const whiteout = page.getByRole("group", { name: "whiteout element" });
  await expect(whiteout).toBeVisible();
  expectBoxNear(await whiteout.boundingBox(), { x: overlayBox.x + 40, y: overlayBox.y + 50 });
  await expect.poll(() => borderWidthsFor(page, ".overlay-whiteout")).toBe("0px 0px 0px 0px");

  await page.getByRole("button", { name: "Text" }).click();
  await page.mouse.click(overlayBox.x + 130, overlayBox.y + 110);
  const textBox = page.getByLabel("Edit text element");
  await textBox.fill("Replacement");
  await textBox.press("Escape");
  const textOverlay = page.getByRole("group", { name: "text element" });
  expectBoxNear(await textOverlay.boundingBox(), { x: overlayBox.x + 130, y: overlayBox.y + 110 });

  await expect
    .poll(() => wheelListenerRecords(page))
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tagName: "SECTION",
          className: expect.stringContaining("editor-viewer"),
          ariaLabel: null,
        }),
      ]),
    );
  const pageFrameAtFullZoom = await page.locator(".pdf-page-frame").boundingBox();
  expect(pageFrameAtFullZoom).not.toBeNull();
  if (pageFrameAtFullZoom === null) {
    return;
  }
  await page.mouse.move(pageFrameAtFullZoom.x + 260, pageFrameAtFullZoom.y + 100);
  await startWheelEventRecorder(page);
  const browserScaleBeforeBoundaryZoom = await browserScaleSnapshot(page);
  await modifiedWheel(page, "out", 10);
  await expect(page.getByLabel("Zoom level")).toHaveText("50%");
  const pageFrameAtMinZoom = await page.locator(".pdf-page-frame").boundingBox();
  const workspaceAtMinZoom = await page.getByLabel("PDF workspace").boundingBox();
  expect(pageFrameAtMinZoom).not.toBeNull();
  expect(workspaceAtMinZoom).not.toBeNull();
  if (pageFrameAtMinZoom === null || workspaceAtMinZoom === null) {
    return;
  }
  const backgroundX = workspaceAtMinZoom.x + 2;
  const backgroundY = workspaceAtMinZoom.y + 2;
  expect(
    backgroundX < pageFrameAtMinZoom.x ||
      backgroundX > pageFrameAtMinZoom.x + pageFrameAtMinZoom.width ||
      backgroundY < pageFrameAtMinZoom.y ||
      backgroundY > pageFrameAtMinZoom.y + pageFrameAtMinZoom.height,
  ).toBe(true);
  await page.mouse.move(backgroundX, backgroundY);
  await modifiedWheel(page, "out", 3);
  await expect(page.getByLabel("Zoom level")).toHaveText("50%");
  const wheelRecordsAtMin = await wheelEventRecords(page);
  const lastWheelAtMin = wheelRecordsAtMin.at(-1);
  expect(lastWheelAtMin).toBeDefined();
  expect(lastWheelAtMin?.path.some((entry) => entry.startsWith("section.editor-viewer"))).toBe(
    true,
  );
  expect(lastWheelAtMin?.pointerInsideEditor).toBe(true);
  expect(lastWheelAtMin?.pointerInsidePageFrame).toBe(false);
  expect(lastWheelAtMin?.editor?.width).toBeGreaterThan(0);
  expect(lastWheelAtMin?.editor?.height).toBeGreaterThan(0);
  expect(lastWheelAtMin?.pageFrame?.width).toBe(150);
  expect(lastWheelAtMin?.pageFrame?.height).toBe(200);
  await expect.poll(() => browserScaleSnapshot(page)).toEqual(browserScaleBeforeBoundaryZoom);

  await modifiedWheel(page, "in", 10);
  await expect(page.getByLabel("Zoom level")).toHaveText("300%");
  const browserScaleBeforeMaxBoundaryZoom = await browserScaleSnapshot(page);
  await modifiedWheel(page, "in", 2);
  await expect(page.getByLabel("Zoom level")).toHaveText("300%");
  await expect.poll(() => browserScaleSnapshot(page)).toEqual(browserScaleBeforeMaxBoundaryZoom);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  await page
    .getByRole("dialog", { name: "Export PDF" })
    .getByRole("button", { name: "Export PDF" })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("export-fixture.pdf");
  const downloadedPath = testInfo.outputPath("export-fixture-edited.pdf");
  await download.saveAs(downloadedPath);
  const downloadedBytes = await import("node:fs/promises").then((fs) =>
    fs.readFile(downloadedPath),
  );
  const exported = await PDFDocument.load(downloadedBytes);
  expect(exported.getPageCount()).toBe(1);
  expect(exported.getPage(0).getWidth()).toBe(300);
  expect(exported.getPage(0).getHeight()).toBe(400);
  await expect(
    page.getByText("Downloaded export-fixture.pdf. The editor remains open."),
  ).toBeVisible();

  await page.goto("/");
  await page.getByLabel("Choose a PDF file").setInputFiles(downloadedPath);
  await expect(page.getByRole("heading", { name: "export-fixture-edited.pdf" })).toBeVisible();
  await expect
    .poll(() => canvasRegionIsMostlyWhite(page, { x: 130, y: 84, width: 20, height: 10 }))
    .toBe(true);
});

test("selects text with one click and edits text only through explicit edit actions", async ({
  page,
}, testInfo) => {
  const fixturePath = testInfo.outputPath("text-interaction-fixture.pdf");
  const fixtureBytes = await createPdf();
  await import("node:fs/promises").then((fs) => fs.writeFile(fixturePath, fixtureBytes));

  await page.goto("/");
  await page.getByLabel("Choose a PDF file").setInputFiles(fixturePath);
  await expect(page.getByRole("heading", { name: "text-interaction-fixture.pdf" })).toBeVisible();
  await expect(page.getByText("Rendering PDF page...")).toBeHidden();
  await expect.poll(() => renderedCanvasHasVisibleContent(page)).toBe(true);

  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.locator(".viewer-main").evaluate((workspace) => {
    workspace.scrollTop = 180;
  });
  await expect(page.getByRole("button", { name: "Download" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
  await page.getByRole("button", { name: "Fit page" }).click();

  const overlayBox = await page.locator(".overlay-layer").boundingBox();
  expect(overlayBox).not.toBeNull();
  if (overlayBox === null) {
    return;
  }

  await page.getByRole("button", { name: "Text" }).click();
  await page.locator(".overlay-layer").click({ position: { x: 80, y: 130 } });
  const initialEditor = page.getByLabel("Edit text element");
  await expect(initialEditor).toBeFocused();
  await initialEditor.fill("Click selectable text");
  await initialEditor.press("Escape");
  await expect(page.getByLabel("Edit text element")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Select" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.mouse.click(overlayBox.x + 22, overlayBox.y + 22);
  await expect(page.getByRole("group", { name: "text element" })).toHaveCount(1);

  const firstTextContent = page.getByLabel("Text element content");
  const firstTextBox = await firstTextContent.boundingBox();
  expect(firstTextBox).not.toBeNull();
  if (firstTextBox === null) {
    return;
  }
  await page.mouse.click(
    firstTextBox.x + firstTextBox.width / 2,
    firstTextBox.y + firstTextBox.height / 2,
  );
  await expect(page.getByRole("button", { name: "Duplicate" })).toBeVisible();
  await expect(page.getByLabel("Edit text element")).toHaveCount(0);
  await page.locator(".overlay-layer").click({ position: { x: 20, y: 20 } });
  await expect(page.getByRole("button", { name: "Duplicate" })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "text element" })).toHaveCount(1);
  await page.mouse.click(
    firstTextBox.x + firstTextBox.width / 2,
    firstTextBox.y + firstTextBox.height / 2,
  );
  await expect(page.getByRole("button", { name: "Duplicate" })).toBeVisible();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("group", { name: "text element" })).toHaveCount(0);

  await page.getByRole("button", { name: "Text" }).click();
  await page.mouse.click(overlayBox.x + 90, overlayBox.y + 180);
  const secondEditor = page.getByLabel("Edit text element");
  await secondEditor.fill("Draft text");
  await secondEditor.press("Escape");
  await page.getByRole("group", { name: "text element" }).focus();
  await page.keyboard.press("Enter");
  const reopenedEditor = page.getByLabel("Edit text element");
  await reopenedEditor.fill("Edited text");
  await reopenedEditor.press("Escape");
  await expect(page.getByLabel("Text element content")).toHaveText("Edited text");
  await expect(page.getByRole("button", { name: "Duplicate" })).toBeVisible();

  const selectedText = page.getByRole("group", { name: "text element" });
  const beforeResize = await selectedText.boundingBox();
  expect(beforeResize).not.toBeNull();
  if (beforeResize === null) {
    return;
  }
  const beforeFontSize = await page
    .getByLabel("Text element content")
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  const resizeHandle = page.getByLabel("Resize text element");
  const handleBox = await resizeHandle.boundingBox();
  expect(handleBox).not.toBeNull();
  if (handleBox === null) {
    return;
  }
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    handleBox.x + handleBox.width / 2 + 80,
    handleBox.y + handleBox.height / 2 + 48,
  );
  await page.mouse.up();
  const resizedText = await selectedText.boundingBox();
  expect(resizedText).not.toBeNull();
  if (resizedText === null) {
    return;
  }
  const resizedFontSize = await page
    .getByLabel("Text element content")
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(resizedText.width).toBeGreaterThan(beforeResize.width + 20);
  expect(resizedFontSize).toBeCloseTo(beforeFontSize, 1);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect
    .poll(async () => (await selectedText.boundingBox())?.width ?? 0)
    .toBeLessThan(resizedText.width - 10);
  await page.getByRole("button", { name: "Redo" }).click();
  await expect
    .poll(async () => (await selectedText.boundingBox())?.width ?? 0)
    .toBeGreaterThan(beforeResize.width + 20);

  const resizedDownloadPath = testInfo.outputPath("text-interaction-fixture-edited.pdf");
  await downloadEditedPdf(page, "text-interaction-fixture-edited.pdf", resizedDownloadPath);
  await page.goto("/");
  await page.getByLabel("Choose a PDF file").setInputFiles(resizedDownloadPath);
  await expect(
    page.getByRole("heading", { name: "text-interaction-fixture-edited.pdf" }),
  ).toBeVisible();
  await expect(page.getByText("Rendering PDF page...")).toBeHidden();
  await expect.poll(() => renderedCanvasHasVisibleContent(page)).toBe(true);
});
test("keeps Text and Date properties above Layers in the responsive desktop inspector", async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  const fixturePath = testInfo.outputPath("inspector-layout-fixture.pdf");
  await import("node:fs/promises").then(async (fs) => fs.writeFile(fixturePath, await createPdf()));
  const densityByViewport = new Map<
    string,
    {
      documentScrollWidth: number;
      exportDialogPadding: number;
      headerHeight: number;
      landingDropHeight: number;
      metadataRowHeight: number;
      previewHeight: number;
      propertiesPaddingTop: number;
      sectionGap: number;
      tabHeight: number;
      toolbarHeight: number;
      viewportWidth: number;
    }
  >();

  const expectPropertiesAboveLayers = async (): Promise<void> => {
    const properties = page.getByTestId("inspector-properties-region");
    const layers = page.getByTestId("inspector-layers-region");
    const lastStyleControl = page.getByLabel("Letter spacing");
    const initialLayout = await page.evaluate(() => {
      const propertiesElement = document.querySelector<HTMLElement>(
        '[data-testid="inspector-properties-region"]',
      );
      const propertiesScroll = document.querySelector<HTMLElement>(
        ".element-inspector__properties-scroll",
      );
      const layersElement = document.querySelector<HTMLElement>(
        '[data-testid="inspector-layers-region"]',
      );
      if (propertiesElement === null || propertiesScroll === null || layersElement === null) {
        throw new Error("Missing desktop inspector regions");
      }
      const propertiesBox = propertiesElement.getBoundingClientRect();
      const layersBox = layersElement.getBoundingClientRect();
      return {
        layersTop: layersBox.top,
        propertiesBottom: propertiesBox.bottom,
        propertiesHeight: propertiesBox.height,
        propertiesScrollHeight: propertiesScroll.scrollHeight,
      };
    });

    expect(initialLayout.propertiesBottom).toBeLessThanOrEqual(initialLayout.layersTop + 1);
    expect(initialLayout.propertiesHeight + 1).toBeGreaterThanOrEqual(
      initialLayout.propertiesScrollHeight,
    );

    await lastStyleControl.scrollIntoViewIfNeeded();
    await expect(lastStyleControl).toBeVisible();
    const visibleLayout = await Promise.all([
      properties.boundingBox(),
      layers.boundingBox(),
      lastStyleControl.boundingBox(),
    ]);
    const [propertiesBox, layersBox, controlBox] = visibleLayout;
    expect(propertiesBox).not.toBeNull();
    expect(layersBox).not.toBeNull();
    expect(controlBox).not.toBeNull();
    if (propertiesBox === null || layersBox === null || controlBox === null) return;
    expect(propertiesBox.y + propertiesBox.height).toBeLessThanOrEqual(layersBox.y + 1);
    expect(controlBox.y).toBeGreaterThanOrEqual(propertiesBox.y - 1);
    expect(controlBox.y + controlBox.height).toBeLessThanOrEqual(
      propertiesBox.y + propertiesBox.height + 1,
    );
  };

  const expectScrollableLayersRegion = async (): Promise<void> => {
    const layout = await page.evaluate(() => {
      const inspector = document.querySelector<HTMLElement>(".element-inspector");
      const inspectorContent = document.querySelector<HTMLElement>(".desktop-inspector-content");
      const layersRegion = document.querySelector<HTMLElement>(
        '[data-testid="inspector-layers-region"]',
      );
      const layersList = document.querySelector<HTMLElement>(".layers-list");
      const rows = [...document.querySelectorAll<HTMLElement>(".layers-list > li")];
      if (
        inspector === null ||
        inspectorContent === null ||
        layersRegion === null ||
        layersList === null
      ) {
        throw new Error("Missing scrollable Layers layout.");
      }
      const inspectorBox = inspector.getBoundingClientRect();
      const regionBox = layersRegion.getBoundingClientRect();
      const regionStyle = window.getComputedStyle(layersRegion);
      const listStyle = window.getComputedStyle(layersList);
      return {
        inspectorBottom: inspectorBox.bottom,
        inspectorOverflowY: window.getComputedStyle(inspectorContent).overflowY,
        listClientHeight: layersList.clientHeight,
        listOverflowY: listStyle.overflowY,
        listScrollHeight: layersList.scrollHeight,
        regionBottom: regionBox.bottom,
        regionClientHeight: layersRegion.clientHeight,
        regionOverflowX: regionStyle.overflowX,
        regionOverflowY: regionStyle.overflowY,
        regionScrollHeight: layersRegion.scrollHeight,
        regionScrollWidth: layersRegion.scrollWidth,
        regionClientWidth: layersRegion.clientWidth,
        rowHeights: rows.map((row) => row.getBoundingClientRect().height),
      };
    });

    expect(layout.inspectorOverflowY).toBe("hidden");
    expect(layout.regionOverflowY).toBe("auto");
    expect(layout.regionOverflowX).toBe("hidden");
    expect(layout.regionClientHeight).toBeGreaterThan(0);
    expect(layout.regionScrollHeight).toBeGreaterThan(layout.regionClientHeight + 1);
    expect(layout.regionBottom).toBeLessThanOrEqual(layout.inspectorBottom + 1);
    expect(layout.regionScrollWidth).toBeLessThanOrEqual(layout.regionClientWidth + 1);
    expect(layout.listOverflowY).toBe("visible");
    expect(layout.listScrollHeight).toBeLessThanOrEqual(layout.listClientHeight + 1);
    expect(layout.rowHeights.length).toBeGreaterThan(2);
    for (const rowHeight of layout.rowHeights) {
      expect(rowHeight).toBeGreaterThanOrEqual(64);
    }

    const layersRegion = page.getByTestId("inspector-layers-region");
    for (const target of [
      page.getByRole("heading", { name: "Layer Actions" }),
      page.getByText("How layers work", { exact: true }),
    ]) {
      await target.scrollIntoViewIfNeeded();
      const [regionBox, targetBox] = await Promise.all([
        layersRegion.boundingBox(),
        target.boundingBox(),
      ]);
      expect(regionBox).not.toBeNull();
      expect(targetBox).not.toBeNull();
      if (regionBox === null || targetBox === null) return;
      expect(targetBox.y).toBeGreaterThanOrEqual(regionBox.y - 1);
      expect(targetBox.y + targetBox.height).toBeLessThanOrEqual(
        regionBox.y + regionBox.height + 1,
      );
      await expect
        .poll(() => layersRegion.evaluate((element) => element.scrollTop))
        .toBeGreaterThan(0);
    }
  };

  for (const viewport of [
    { width: 1024, height: 600 },
    { width: 1152, height: 648 },
    { width: 1280, height: 720 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1536, height: 864 },
    { width: 1920, height: 1080 },
    { width: 2560, height: 1440 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const landingDropHeight = await page
      .locator(".file-drop")
      .evaluate((element) => element.getBoundingClientRect().height);
    await page.getByLabel("Choose a PDF file").setInputFiles(fixturePath);
    await expect(page.getByRole("region", { name: "inspector-layout-fixture.pdf" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Rendering PDF page...")).toBeHidden();

    const overlayBox = await page.locator(".overlay-layer").boundingBox();
    expect(overlayBox).not.toBeNull();
    if (overlayBox === null) return;

    await page.getByRole("button", { name: "Text" }).click();
    await page.locator(".overlay-layer").click({ position: { x: 80, y: 100 } });
    await page.getByLabel("Edit text element").fill("Inspector text");
    await page.getByLabel("Edit text element").press("Escape");
    await page.getByRole("tab", { name: "Style" }).click();
    await expectPropertiesAboveLayers();

    await page.getByRole("button", { name: "Date", exact: true }).click();
    await page.locator(".overlay-layer").click({
      position: { x: overlayBox.width * 0.75, y: overlayBox.height * 0.2 },
    });
    await page.getByRole("tab", { name: "Style" }).click();
    await expect
      .poll(() => page.evaluate(() => document.querySelector('[aria-label="Date layer"]') !== null))
      .toBe(true);
    await page.evaluate(() => {
      const dateLayer = document.querySelector<HTMLElement>('[aria-label="Date layer"]');
      dateLayer?.scrollIntoView({ block: "nearest" });
    });
    await expect(page.getByRole("button", { name: "Date layer", exact: true })).toBeVisible();
    if (viewport.width === 1024 && viewport.height === 600) {
      await expect
        .poll(() =>
          page.evaluate(() => {
            const dateLayer = document.querySelector<HTMLElement>('[aria-label="Date layer"]');
            return dateLayer?.closest<HTMLElement>(".element-inspector__layers-region")?.scrollTop;
          }),
        )
        .toBeGreaterThan(0);
    }
    await expectPropertiesAboveLayers();
    await expect(page.getByRole("heading", { name: "Order" })).toHaveCount(0);
    await expect(
      page.getByText("Top items appear in front of bottom items.", { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByLabel("Layer order controls")).toBeVisible();
    await page.getByRole("tab", { name: "Text" }).click();
    for (let index = 0; index < 8; index += 1) {
      await page.getByRole("button", { name: "Duplicate" }).click();
    }
    await page.getByRole("tab", { name: "Style" }).click();
    const layerRows = page.locator(".layers-list > li");
    await expect(layerRows).toHaveCount(10);
    await page.getByRole("button", { name: "Move down" }).click();
    await expect(layerRows.nth(1)).toHaveClass(/is-selected/);
    await expectScrollableLayersRegion();

    const whiteoutButton = page.getByRole("button", { name: "Whiteout", exact: true });
    await whiteoutButton.click();
    await expect(whiteoutButton).toHaveAttribute("aria-pressed", "true");
    const whiteoutSurface = await page.locator(".overlay-layer").boundingBox();
    expect(whiteoutSurface).not.toBeNull();
    if (whiteoutSurface === null) return;
    await dragWhiteout(
      page,
      { x: whiteoutSurface.x + 300, y: whiteoutSurface.y + 380 },
      { x: whiteoutSurface.x + 380, y: whiteoutSurface.y + 420 },
    );
    await expect(page.locator(".image-inspector-preview")).toBeVisible();
    const density = await page.evaluate(() => {
      const header = document.querySelector<HTMLElement>(".editor-header");
      const toolbar = document.querySelector<HTMLElement>(".viewer-toolbar");
      const tabs = document.querySelector<HTMLElement>(".text-inspector-tabs");
      const propertiesScroll = document.querySelector<HTMLElement>(
        ".element-inspector__properties-scroll",
      );
      const imageInspector = document.querySelector<HTMLElement>(".image-inspector");
      const preview = document.querySelector<HTMLElement>(".image-inspector-preview");
      const metadataRow = document.querySelector<HTMLElement>(".image-inspector-metadata div");
      if (
        header === null ||
        toolbar === null ||
        tabs === null ||
        propertiesScroll === null ||
        imageInspector === null ||
        preview === null ||
        metadataRow === null
      ) {
        throw new Error("Missing responsive density surfaces.");
      }
      const propertiesStyle = window.getComputedStyle(propertiesScroll);
      return {
        documentScrollWidth: document.documentElement.scrollWidth,
        headerHeight: header.getBoundingClientRect().height,
        metadataRowHeight: metadataRow.getBoundingClientRect().height,
        previewHeight: preview.getBoundingClientRect().height,
        propertiesPaddingTop: Number.parseFloat(propertiesStyle.paddingTop),
        sectionGap: Number.parseFloat(window.getComputedStyle(imageInspector).rowGap),
        tabHeight: tabs.getBoundingClientRect().height,
        toolbarHeight: toolbar.getBoundingClientRect().height,
        viewportWidth: window.innerWidth,
      };
    });
    expect(density.documentScrollWidth).toBeLessThanOrEqual(density.viewportWidth);
    const downloadButton = page.getByRole("button", { name: "Download", exact: true });
    await downloadButton.click();
    const exportDialog = page.getByRole("dialog", { name: "Export PDF" });
    await expect(exportDialog).toBeVisible();
    const exportGeometry = await exportDialog.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return {
        bottom: box.bottom,
        left: box.left,
        padding: Number.parseFloat(window.getComputedStyle(element).paddingTop),
        right: box.right,
        top: box.top,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
      };
    });
    expect(exportGeometry.left).toBeGreaterThanOrEqual(0);
    expect(exportGeometry.top).toBeGreaterThanOrEqual(0);
    expect(exportGeometry.right).toBeLessThanOrEqual(exportGeometry.viewportWidth);
    expect(exportGeometry.bottom).toBeLessThanOrEqual(exportGeometry.viewportHeight);
    await exportDialog.getByRole("button", { name: "Close export dialog" }).click();

    await page.getByRole("button", { name: "Signature", exact: true }).click();
    const signatureDialog = page.getByRole("dialog", { name: "Signature" });
    await expect(signatureDialog).toBeVisible();
    const signatureGeometry = await signatureDialog.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return {
        bottom: box.bottom,
        left: box.left,
        right: box.right,
        top: box.top,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
      };
    });
    expect(signatureGeometry.left).toBeGreaterThanOrEqual(0);
    expect(signatureGeometry.top).toBeGreaterThanOrEqual(0);
    expect(signatureGeometry.right).toBeLessThanOrEqual(signatureGeometry.viewportWidth);
    expect(signatureGeometry.bottom).toBeLessThanOrEqual(signatureGeometry.viewportHeight);
    await signatureDialog.getByRole("button", { name: "Close dialog" }).click();

    densityByViewport.set(`${String(viewport.width)}x${String(viewport.height)}`, {
      ...density,
      exportDialogPadding: exportGeometry.padding,
      landingDropHeight,
    });
  }

  const compactDensity = densityByViewport.get("1280x720");
  const largeDensity = densityByViewport.get("1920x1080");
  const wideDensity = densityByViewport.get("2560x1440");
  expect(compactDensity).toBeDefined();
  expect(largeDensity).toBeDefined();
  expect(wideDensity).toBeDefined();
  if (compactDensity === undefined || largeDensity === undefined || wideDensity === undefined)
    return;
  expect(compactDensity.headerHeight).toBeLessThan(largeDensity.headerHeight);
  expect(compactDensity.toolbarHeight).toBeLessThan(largeDensity.toolbarHeight);
  expect(compactDensity.landingDropHeight).toBeLessThan(largeDensity.landingDropHeight);
  expect(compactDensity.exportDialogPadding).toBeLessThan(largeDensity.exportDialogPadding);
  expect(compactDensity.tabHeight).toBeLessThan(largeDensity.tabHeight);
  expect(compactDensity.previewHeight).toBeLessThan(largeDensity.previewHeight);
  expect(compactDensity.metadataRowHeight).toBeLessThan(largeDensity.metadataRowHeight);
  expect(compactDensity.propertiesPaddingTop).toBeLessThan(largeDensity.propertiesPaddingTop);
  expect(wideDensity.headerHeight).toBeGreaterThanOrEqual(largeDensity.headerHeight);
  expect(wideDensity.toolbarHeight).toBeGreaterThanOrEqual(largeDensity.toolbarHeight);
  expect(wideDensity.previewHeight).toBeGreaterThanOrEqual(largeDensity.previewHeight);
  expect(wideDensity.propertiesPaddingTop).toBeGreaterThanOrEqual(
    largeDensity.propertiesPaddingTop,
  );
  expect(compactDensity.sectionGap).toBeLessThan(largeDensity.sectionGap);
});
test("undoes and redoes overlay add/delete history and exports the final state", async ({
  page,
}, testInfo) => {
  const fixturePath = testInfo.outputPath("history-fixture.pdf");
  const fixtureBytes = await createPdf();
  await import("node:fs/promises").then((fs) => fs.writeFile(fixturePath, fixtureBytes));

  await page.goto("/");
  await page.getByLabel("Choose a PDF file").setInputFiles(fixturePath);
  await expect(page.getByRole("heading", { name: "history-fixture.pdf" })).toBeVisible();
  await expect(page.getByText("Rendering PDF page...")).toBeHidden();
  await expect.poll(() => renderedCanvasHasVisibleContent(page)).toBe(true);

  const overlayBox = await page.locator(".overlay-layer").boundingBox();
  expect(overlayBox).not.toBeNull();
  if (overlayBox === null) {
    return;
  }

  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Redo" })).toBeDisabled();

  await page.getByRole("button", { name: "Text" }).click();
  await page.mouse.click(overlayBox.x + 170, overlayBox.y + 220);
  const firstText = page.getByLabel("Edit text element");
  await firstText.press("Escape");
  await expect(page.getByLabel("Edit text element")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("group", { name: "text element" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Redo" })).toBeEnabled();

  await page.getByRole("button", { name: "Redo" }).click();
  await expect(page.getByLabel("Text element content")).toHaveText("Text");

  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("group", { name: "text element" })).toHaveCount(0);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByLabel("Text element content")).toHaveText("Text");

  await page.keyboard.press("Control+Y");
  await expect(page.getByRole("group", { name: "text element" })).toHaveCount(0);

  await page.getByRole("button", { name: "Whiteout" }).click();
  await dragWhiteout(
    page,
    { x: overlayBox.x + 40, y: overlayBox.y + 50 },
    { x: overlayBox.x + 160, y: overlayBox.y + 98 },
  );
  await expect(page.getByRole("group", { name: "whiteout element" })).toBeVisible();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("group", { name: "whiteout element" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Redo" })).toBeEnabled();

  await page.getByRole("button", { name: "Text" }).click();
  await page.mouse.click(overlayBox.x + 170, overlayBox.y + 220);
  const finalText = page.getByLabel("Edit text element");
  await finalText.fill("Final state");
  await finalText.press("Escape");
  await expect(page.getByRole("button", { name: "Redo" })).toBeDisabled();

  const downloadedPath = testInfo.outputPath("history-fixture-edited.pdf");
  await downloadEditedPdf(page, "history-fixture-edited.pdf", downloadedPath);
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();

  await page.goto("/");
  await page.getByLabel("Choose a PDF file").setInputFiles(downloadedPath);
  await expect(page.getByRole("heading", { name: "history-fixture-edited.pdf" })).toBeVisible();
  await expect
    .poll(() => canvasRegionHasDarkContent(page, { x: 170, y: 220, width: 100, height: 40 }))
    .toBe(true);
  await expect
    .poll(() => canvasRegionIsMostlyWhite(page, { x: 40, y: 50, width: 120, height: 48 }))
    .toBe(false);
});
test("hides, restores, locks, and unlocks current-page layers through Layer Actions", async ({
  page,
}, testInfo) => {
  const fixturePath = testInfo.outputPath("layer-actions-fixture.pdf");
  await import("node:fs/promises").then(async (fs) => fs.writeFile(fixturePath, await createPdf()));

  await page.goto("/");
  await page.getByLabel("Choose a PDF file").setInputFiles(fixturePath);
  await expect(page.getByRole("heading", { name: "layer-actions-fixture.pdf" })).toBeVisible();
  await expect(page.getByText("Rendering PDF page...")).toBeHidden();
  await expect.poll(() => renderedCanvasHasVisibleContent(page)).toBe(true);

  const overlayBox = await page.locator(".overlay-layer").boundingBox();
  expect(overlayBox).not.toBeNull();
  if (overlayBox === null) {
    return;
  }

  await page.getByRole("button", { name: "Text" }).click();
  await page.mouse.click(overlayBox.x + 90, overlayBox.y + 130);
  await page.getByLabel("Edit text element").fill("Layer text");
  await page.getByLabel("Edit text element").press("Escape");

  await page.getByRole("button", { name: "Checkmark" }).click();
  await page.mouse.click(overlayBox.x + 180, overlayBox.y + 200);
  await expect(page.getByRole("group", { name: "text element" })).toBeVisible();
  await expect(page.getByRole("group", { name: "checkmark element" })).toBeVisible();
  await page.getByRole("button", { name: "Hide All" }).click();
  await expect(page.getByRole("button", { name: "Show All" })).toBeVisible();
  await expect(page.getByRole("group", { name: "text element" })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "checkmark element" })).toHaveCount(0);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("group", { name: "text element" })).toBeVisible();
  await expect(page.getByRole("group", { name: "checkmark element" })).toBeVisible();
  await page.getByRole("button", { name: "Hide All" }).click();
  await page.getByRole("button", { name: "Show All" }).click();
  await expect(page.getByRole("group", { name: "text element" })).toBeVisible();
  await expect(page.getByRole("group", { name: "checkmark element" })).toBeVisible();

  await page.getByRole("button", { name: "Text layer", exact: true }).click();
  const textElement = page.getByRole("group", { name: "text element" });
  const unlockedBounds = await textElement.boundingBox();
  expect(unlockedBounds).not.toBeNull();
  if (unlockedBounds === null) {
    return;
  }

  await page.getByRole("button", { name: "Lock All" }).click();
  await expect(page.getByRole("button", { name: "Unlock All" })).toBeVisible();
  await expect(textElement).toHaveAttribute("data-locked", "true");
  await expect(page.getByLabel("Resize text element")).toHaveCount(0);
  const lockedBoundsBeforeDrag = await textElement.boundingBox();
  expect(lockedBoundsBeforeDrag).not.toBeNull();
  if (lockedBoundsBeforeDrag === null) {
    return;
  }
  await page.mouse.move(
    lockedBoundsBeforeDrag.x + lockedBoundsBeforeDrag.width / 2,
    lockedBoundsBeforeDrag.y + lockedBoundsBeforeDrag.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    lockedBoundsBeforeDrag.x + lockedBoundsBeforeDrag.width / 2 + 48,
    lockedBoundsBeforeDrag.y + lockedBoundsBeforeDrag.height / 2 + 24,
  );
  await page.mouse.up();
  const lockedBoundsAfterDrag = await textElement.boundingBox();
  expectBoxNear(lockedBoundsAfterDrag, lockedBoundsBeforeDrag);

  await page.getByRole("button", { name: "Unlock All" }).click();
  await expect(textElement).toHaveAttribute("data-locked", "false");
  const unlockedBoundsAfterUnlock = await textElement.boundingBox();
  expect(unlockedBoundsAfterUnlock).not.toBeNull();
  if (unlockedBoundsAfterUnlock === null) {
    return;
  }
  await page.mouse.move(
    unlockedBoundsAfterUnlock.x + unlockedBoundsAfterUnlock.width / 2,
    unlockedBoundsAfterUnlock.y + unlockedBoundsAfterUnlock.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    unlockedBoundsAfterUnlock.x + unlockedBoundsAfterUnlock.width / 2 + 48,
    unlockedBoundsAfterUnlock.y + unlockedBoundsAfterUnlock.height / 2 + 24,
  );
  await page.mouse.up();
  const movedBounds = await textElement.boundingBox();
  expect(movedBounds).not.toBeNull();
  if (movedBounds === null) {
    return;
  }
  expect(movedBounds.x).toBeGreaterThan(unlockedBoundsAfterUnlock.x + 30);
  expect(movedBounds.y).toBeGreaterThan(unlockedBoundsAfterUnlock.y + 10);
});
test("toggles individual layer visibility and locks through the real Layers controls", async ({
  page,
}, testInfo) => {
  const fixturePath = testInfo.outputPath("individual-layer-actions-fixture.pdf");
  await import("node:fs/promises").then(async (fs) => fs.writeFile(fixturePath, await createPdf()));

  await page.goto("/");
  await page.getByLabel("Choose a PDF file").setInputFiles(fixturePath);
  await expect(
    page.getByRole("heading", { name: "individual-layer-actions-fixture.pdf" }),
  ).toBeVisible();
  await expect(page.getByText("Rendering PDF page...")).toBeHidden();
  await expect.poll(() => renderedCanvasHasVisibleContent(page)).toBe(true);

  const overlayBox = await page.locator(".overlay-layer").boundingBox();
  expect(overlayBox).not.toBeNull();
  if (overlayBox === null) {
    return;
  }

  await page.getByRole("button", { name: "Text" }).click();
  await page.mouse.click(overlayBox.x + 90, overlayBox.y + 130);
  await page.getByLabel("Edit text element").fill("Layer text");
  await page.getByLabel("Edit text element").press("Escape");
  await page.getByRole("button", { name: "Checkmark" }).click();
  await page.mouse.click(overlayBox.x + 180, overlayBox.y + 200);

  const textElement = page.getByRole("group", { name: "text element" });
  const checkmarkElement = page.getByRole("group", { name: "checkmark element" });
  await expect(textElement).toBeVisible();
  await expect(checkmarkElement).toBeVisible();
  await expectLayerActionInsideVisibleList(page, "Hide Text layer");
  await page.getByRole("button", { name: "Hide Text layer" }).click();
  await expect(textElement).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Text layer", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show Text layer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Hide All" })).toBeVisible();

  await page.getByRole("button", { name: "Show Text layer" }).click();
  await expect(textElement).toBeVisible();
  await page.getByRole("button", { name: "Hide Text layer" }).click();
  await expect(textElement).toHaveCount(0);

  await page.getByRole("button", { name: "Hide Checkmark layer" }).click();
  await expect(checkmarkElement).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Show All" })).toBeVisible();
  await page.getByRole("button", { name: "Show Checkmark layer" }).click();
  await expect(checkmarkElement).toBeVisible();
  await page.getByRole("button", { name: "Show Text layer" }).click();
  await expect(textElement).toBeVisible();
  await expect(page.getByRole("button", { name: "Hide All" })).toBeVisible();

  await page.getByRole("button", { name: "Text layer", exact: true }).click();
  const unlockedBounds = await textElement.boundingBox();
  expect(unlockedBounds).not.toBeNull();
  if (unlockedBounds === null) {
    return;
  }

  await page.getByRole("button", { name: "Lock Text layer" }).click();
  await expect(page.getByRole("button", { name: "Unlock Text layer" })).toBeVisible();
  await expect(textElement).toHaveAttribute("data-locked", "true");
  await expect(page.getByLabel("Resize text element")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Lock All" })).toBeVisible();
  const lockedBoundsBeforeDrag = await textElement.boundingBox();
  expect(lockedBoundsBeforeDrag).not.toBeNull();
  if (lockedBoundsBeforeDrag === null) {
    return;
  }
  await page.mouse.move(
    lockedBoundsBeforeDrag.x + lockedBoundsBeforeDrag.width / 2,
    lockedBoundsBeforeDrag.y + lockedBoundsBeforeDrag.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    lockedBoundsBeforeDrag.x + lockedBoundsBeforeDrag.width / 2 + 48,
    lockedBoundsBeforeDrag.y + lockedBoundsBeforeDrag.height / 2 + 24,
  );
  await page.mouse.up();
  const lockedBoundsAfterDrag = await textElement.boundingBox();
  expectBoxNear(lockedBoundsAfterDrag, lockedBoundsBeforeDrag);

  await page.getByRole("button", { name: "Unlock Text layer" }).click();
  const unlockedBoundsAfterUnlock = await textElement.boundingBox();
  expect(unlockedBoundsAfterUnlock).not.toBeNull();
  if (unlockedBoundsAfterUnlock === null) {
    return;
  }
  await page.mouse.move(
    unlockedBoundsAfterUnlock.x + unlockedBoundsAfterUnlock.width / 2,
    unlockedBoundsAfterUnlock.y + unlockedBoundsAfterUnlock.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    unlockedBoundsAfterUnlock.x + unlockedBoundsAfterUnlock.width / 2 + 48,
    unlockedBoundsAfterUnlock.y + unlockedBoundsAfterUnlock.height / 2 + 24,
  );
  await page.mouse.up();
  const movedBounds = await textElement.boundingBox();
  expect(movedBounds).not.toBeNull();
  if (movedBounds === null) {
    return;
  }
  expect(movedBounds.x).toBeGreaterThan(unlockedBoundsAfterUnlock.x + 30);

  await page.getByRole("button", { name: "Lock Checkmark layer" }).click();
  await expect(page.getByRole("button", { name: "Lock All" })).toBeVisible();
  await page.getByRole("button", { name: "Lock Text layer" }).click();
  await expect(page.getByRole("button", { name: "Unlock All" })).toBeVisible();
  await page.getByRole("button", { name: "Unlock Checkmark layer" }).click();
  await expect(page.getByRole("button", { name: "Lock All" })).toBeVisible();
});
test("deletes every selected overlay type and excludes deleted overlays from export", async ({
  page,
}, testInfo) => {
  const fixturePath = testInfo.outputPath("delete-overlays-fixture.pdf");
  const fixtureBytes = await createPdf();
  await import("node:fs/promises").then((fs) => fs.writeFile(fixturePath, fixtureBytes));

  await page.goto("/");
  await page.getByLabel("Choose a PDF file").setInputFiles(fixturePath);
  await expect(page.getByRole("heading", { name: "delete-overlays-fixture.pdf" })).toBeVisible();
  await expect(page.getByText("Rendering PDF page...")).toBeHidden();
  await expect.poll(() => renderedCanvasHasVisibleContent(page)).toBe(true);

  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.locator(".viewer-main").evaluate((workspace) => {
    workspace.scrollTop = 180;
  });
  await expect(page.getByRole("button", { name: "Download" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
  await page.getByRole("button", { name: "Fit page" }).click();

  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.locator(".viewer-main").evaluate((workspace) => {
    workspace.scrollTop = 180;
  });
  await expect(page.getByRole("button", { name: "Download" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
  await page.getByRole("button", { name: "Fit page" }).click();

  const overlayBox = await page.locator(".overlay-layer").boundingBox();
  expect(overlayBox).not.toBeNull();
  if (overlayBox === null) {
    return;
  }

  await page.getByRole("button", { name: "Text" }).click();
  await page.locator(".overlay-layer").click({ position: { x: 45, y: 120 } });
  const textToDelete = page.getByLabel("Edit text element");
  await textToDelete.fill("Delete me");
  await textToDelete.press("Escape");
  await expect(page.getByRole("button", { name: "Duplicate" })).toBeVisible();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("group", { name: "text element" })).toHaveCount(0);

  await page.getByRole("button", { name: "Whiteout" }).click();
  await expect(page.getByRole("button", { name: "Whiteout" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const currentOverlayBox = await page.locator(".overlay-layer").boundingBox();
  expect(currentOverlayBox).not.toBeNull();
  if (currentOverlayBox === null) {
    return;
  }
  await dragWhiteout(
    page,
    { x: currentOverlayBox.x + 40, y: currentOverlayBox.y + 50 },
    { x: currentOverlayBox.x + 160, y: currentOverlayBox.y + 98 },
  );
  await expect(page.getByRole("group", { name: "whiteout element" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Duplicate" })).toBeVisible();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("group", { name: "whiteout element" })).toHaveCount(0);

  await addTypedSignature(page, "Delete Me");
  await expect(page.getByRole("button", { name: "Duplicate" })).toBeVisible();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("group", { name: "signature element" })).toHaveCount(0);

  await addTypedInitials(page, "DM");
  await expect(page.getByRole("button", { name: "Duplicate" })).toBeVisible();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("group", { name: "initials element" })).toHaveCount(0);

  const downloadedPath = testInfo.outputPath("delete-overlays-fixture-edited.pdf");
  await downloadEditedPdf(page, "delete-overlays-fixture-edited.pdf", downloadedPath);

  await page.goto("/");
  await page.getByLabel("Choose a PDF file").setInputFiles(downloadedPath);
  await expect(
    page.getByRole("heading", { name: "delete-overlays-fixture-edited.pdf" }),
  ).toBeVisible();
  await page.keyboard.press("Control+0");
  await expect(page.getByLabel("Zoom level")).toHaveText("100%");
  await expect
    .poll(() => canvasRegionHasDarkContent(page, { x: 40, y: 50, width: 120, height: 48 }))
    .toBe(true);
  await expect
    .poll(() => canvasRegionHasDarkContent(page, { x: 45, y: 120, width: 120, height: 48 }))
    .toBe(false);
  await expect
    .poll(() => canvasRegionHasDarkContent(page, { x: 56, y: 180, width: 96, height: 52 }))
    .toBe(false);
  await expect
    .poll(() => canvasRegionHasDarkContent(page, { x: 56, y: 250, width: 220, height: 70 }))
    .toBe(false);
});
test("places annotation overlays, reuses shared history, and exports visible symbols", async ({
  page,
}, testInfo) => {
  const fixturePath = testInfo.outputPath("annotation-fixture.pdf");
  await import("node:fs/promises").then(async (fs) => fs.writeFile(fixturePath, await createPdf()));
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol === "http:" || url.protocol === "https:") {
      if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
        externalRequests.push(request.url());
      }
    }
  });

  await page.goto("/");
  await page.getByLabel("Choose a PDF file").setInputFiles(fixturePath);
  await expect(page.getByRole("heading", { name: "annotation-fixture.pdf" })).toBeVisible();
  await expect(page.getByText("Rendering PDF page...")).toBeHidden();
  await expect.poll(() => renderedCanvasHasVisibleContent(page)).toBe(true);

  const overlayBox = await page.locator(".overlay-layer").boundingBox();
  expect(overlayBox).not.toBeNull();
  if (overlayBox === null) {
    return;
  }

  await page.getByRole("button", { name: "Checkmark" }).click();
  await expect(page.getByRole("button", { name: /Checkmark/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.mouse.click(overlayBox.x + 80, overlayBox.y + 160);
  await expect(page.getByRole("button", { name: "Select" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const checkmark = page.getByRole("group", { name: "checkmark element" }).first();
  await expect(checkmark).toBeVisible();
  const checkmarkStart = await checkmark.boundingBox();
  expect(checkmarkStart).not.toBeNull();
  if (checkmarkStart === null) {
    return;
  }

  await page.mouse.move(
    checkmarkStart.x + checkmarkStart.width / 2,
    checkmarkStart.y + checkmarkStart.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    checkmarkStart.x + checkmarkStart.width / 2 + 40,
    checkmarkStart.y + checkmarkStart.height / 2 + 20,
  );
  await page.mouse.up();
  const checkmarkMoved = await checkmark.boundingBox();
  expect(checkmarkMoved).not.toBeNull();
  if (checkmarkMoved === null) {
    return;
  }
  expect(checkmarkMoved.x).toBeGreaterThan(checkmarkStart.x + 30);

  const checkmarkHandle = page.getByLabel("Resize checkmark element");
  const checkmarkHandleBox = await checkmarkHandle.boundingBox();
  expect(checkmarkHandleBox).not.toBeNull();
  if (checkmarkHandleBox === null) {
    return;
  }
  await page.mouse.move(
    checkmarkHandleBox.x + checkmarkHandleBox.width / 2,
    checkmarkHandleBox.y + checkmarkHandleBox.height / 2,
  );
  await page.mouse.down();
  const checkmarkResizeBoxes: { width: number; height: number }[] = [];
  for (const delta of [6, 12, 18, 24, 28]) {
    await page.mouse.move(
      checkmarkHandleBox.x + checkmarkHandleBox.width / 2 + delta,
      checkmarkHandleBox.y + checkmarkHandleBox.height / 2 + delta,
    );
    await page.waitForTimeout(16);
    const box = await checkmark.boundingBox();
    if (box !== null) {
      checkmarkResizeBoxes.push({ width: box.width, height: box.height });
    }
    await expect(checkmark).toBeVisible();
  }
  await page.mouse.up();
  expect(checkmarkResizeBoxes.length).toBeGreaterThan(2);
  for (let index = 1; index < checkmarkResizeBoxes.length; index += 1) {
    const previousBox = checkmarkResizeBoxes[index - 1];
    const currentBox = checkmarkResizeBoxes[index];
    expect(previousBox).toBeDefined();
    expect(currentBox).toBeDefined();
    if (previousBox === undefined || currentBox === undefined) {
      return;
    }
    expect(currentBox.width).toBeGreaterThanOrEqual(previousBox.width - 1);
    expect(currentBox.height).toBeGreaterThanOrEqual(previousBox.height - 1);
    expect(Math.abs(currentBox.width - currentBox.height)).toBeLessThanOrEqual(2);
  }
  const checkmarkResized = await checkmark.boundingBox();
  expect(checkmarkResized).not.toBeNull();
  if (checkmarkResized === null) {
    return;
  }
  expect(checkmarkResized.width).toBeGreaterThan(checkmarkMoved.width + 10);

  await page.getByRole("button", { name: "Undo" }).click();
  const checkmarkUndoResize = await checkmark.boundingBox();
  expect(checkmarkUndoResize).not.toBeNull();
  if (checkmarkUndoResize === null) {
    return;
  }
  expect(Math.abs(checkmarkUndoResize.width - checkmarkMoved.width)).toBeLessThanOrEqual(2);
  await page.getByRole("button", { name: "Redo" }).click();
  const checkmarkRedoResize = await checkmark.boundingBox();
  expect(checkmarkRedoResize).not.toBeNull();
  if (checkmarkRedoResize === null) {
    return;
  }
  expect(Math.abs(checkmarkRedoResize.width - checkmarkResized.width)).toBeLessThanOrEqual(2);

  await page.keyboard.press("Control+C");
  await page.keyboard.press("Control+V");
  await expect(page.getByRole("group", { name: "checkmark element" })).toHaveCount(2);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("group", { name: "checkmark element" })).toHaveCount(1);
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(page.getByRole("group", { name: "checkmark element" })).toHaveCount(2);

  await page.getByRole("button", { name: "Cross" }).click();
  await page.mouse.click(overlayBox.x + 180, overlayBox.y + 140);
  const cross = page.getByRole("group", { name: "cross element" });
  await expect(cross).toBeVisible();
  const crossBeforeResize = await cross.boundingBox();
  expect(crossBeforeResize).not.toBeNull();
  if (crossBeforeResize === null) {
    return;
  }
  const crossHandleBox = await page.getByLabel("Resize cross element").boundingBox();
  expect(crossHandleBox).not.toBeNull();
  if (crossHandleBox === null) {
    return;
  }
  await page.mouse.move(
    crossHandleBox.x + crossHandleBox.width / 2,
    crossHandleBox.y + crossHandleBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    crossHandleBox.x + crossHandleBox.width / 2 + 20,
    crossHandleBox.y + crossHandleBox.height / 2 + 20,
  );
  await page.mouse.up();
  const crossAfterResize = await cross.boundingBox();
  expect(crossAfterResize).not.toBeNull();
  if (crossAfterResize === null) {
    return;
  }
  expect(crossAfterResize.width).toBeGreaterThan(crossBeforeResize.width + 8);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect
    .poll(async () => (await cross.boundingBox())?.width ?? 0)
    .toBeLessThan(crossAfterResize.width - 6);
  await page.getByRole("button", { name: "Redo" }).click();
  await expect
    .poll(async () => (await cross.boundingBox())?.width ?? 0)
    .toBeGreaterThan(crossBeforeResize.width + 8);
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(cross).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(cross).toBeVisible();

  await page.getByRole("button", { name: "Date", exact: true }).click();
  const dateOverlayBox = await page.locator(".overlay-layer").boundingBox();
  expect(dateOverlayBox).not.toBeNull();
  if (dateOverlayBox === null) {
    return;
  }
  await page.mouse.click(dateOverlayBox.x + 80, dateOverlayBox.y + 240);
  const date = page.getByRole("group", { name: "date element" });
  await expect(date).toBeVisible();
  await expect(date).toHaveText(/\d{2}\/\d{2}\/\d{4}/);
  const dateHandle = page.getByLabel("Resize date element");
  const dateHandleBox = await dateHandle.boundingBox();
  expect(dateHandleBox).not.toBeNull();
  if (dateHandleBox === null) {
    return;
  }
  const dateBeforeResize = await date.boundingBox();
  expect(dateBeforeResize).not.toBeNull();
  if (dateBeforeResize === null) {
    return;
  }
  const dateFontBeforeResize = await page
    .getByLabel("Text element content")
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  await page.mouse.move(
    dateHandleBox.x + dateHandleBox.width / 2,
    dateHandleBox.y + dateHandleBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    dateHandleBox.x + dateHandleBox.width / 2 + 100,
    dateHandleBox.y + dateHandleBox.height / 2 + 40,
  );
  await page.mouse.up();
  const dateAfterResize = await date.boundingBox();
  expect(dateAfterResize).not.toBeNull();
  if (dateAfterResize === null) {
    return;
  }
  expect(dateAfterResize.width).toBeGreaterThan(dateBeforeResize.width + 20);
  await expect
    .poll(() =>
      page
        .getByLabel("Text element content")
        .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
    )
    .toBeGreaterThan(dateFontBeforeResize + 2);
  const dateFontAfterResize = await page
    .getByLabel("Text element content")
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));

  await page.getByRole("button", { name: "Undo" }).click();
  await expect
    .poll(async () => (await date.boundingBox())?.width ?? 0)
    .toBeLessThan(dateAfterResize.width - 10);
  await expect
    .poll(() =>
      page
        .getByLabel("Text element content")
        .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
    )
    .toBeLessThan(dateFontAfterResize - 1);
  await page.getByRole("button", { name: "Redo" }).click();
  await expect
    .poll(async () => (await date.boundingBox())?.width ?? 0)
    .toBeGreaterThan(dateBeforeResize.width + 20);
  await expect
    .poll(() =>
      page
        .getByLabel("Text element content")
        .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
    )
    .toBeGreaterThan(dateFontBeforeResize + 2);

  const downloadedPath = testInfo.outputPath("annotation-fixture-edited.pdf");
  await downloadEditedPdf(page, "annotation-fixture-edited.pdf", downloadedPath);

  await page.goto("/");
  await page.getByLabel("Choose a PDF file").setInputFiles(downloadedPath);
  await expect(page.getByRole("heading", { name: "annotation-fixture-edited.pdf" })).toBeVisible();
  await expect(page.getByText("Rendering PDF page...")).toBeHidden();
  await expect.poll(() => renderedCanvasHasVisibleContent(page)).toBe(true);
  await expect
    .poll(() => canvasRegionHasNonWhiteContent(page, { x: 100, y: 160, width: 90, height: 90 }))
    .toBe(true);
  await expect
    .poll(() => canvasRegionHasNonWhiteContent(page, { x: 160, y: 120, width: 70, height: 70 }))
    .toBe(true);
  await expect
    .poll(() => canvasRegionHasNonWhiteContent(page, { x: 80, y: 235, width: 160, height: 60 }))
    .toBe(true);
  expect(externalRequests).toEqual([]);
});
test("inserts, edits, copies, pastes, exports, and reopens an image overlay", async ({
  page,
}, testInfo) => {
  const fixturePath = testInfo.outputPath("image-fixture.pdf");
  await import("node:fs/promises").then(async (fs) => fs.writeFile(fixturePath, await createPdf()));
  const imagePath = testInfo.outputPath("quickpdf-image.png");
  const blackPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR42mNkAAAAAAUAAY27m/MAAAAASUVORK5CYII=",
    "base64",
  );
  await import("node:fs/promises").then((fs) => fs.writeFile(imagePath, blackPng));

  await page.goto("/");
  await page.getByLabel("Choose a PDF file").setInputFiles(fixturePath);
  await expect(page.getByRole("heading", { name: "image-fixture.pdf" })).toBeVisible();
  await expect.poll(() => renderedCanvasHasVisibleContent(page)).toBe(true);

  await expect(page.getByRole("button", { name: "Image" })).toHaveCount(1);
  await expect(page.locator('input[aria-label="Choose image"]')).toBeHidden();
  await expect(page.getByText(/Choose File|No file chosen/i)).toHaveCount(0);
  await page.getByRole("button", { name: "Image" }).click();
  await page.locator('input[aria-label="Choose image"]').setInputFiles(imagePath);
  await expect(page.getByText("Click the PDF page to place the image.")).toBeVisible();
  const overlayBox = await page.locator(".overlay-layer").boundingBox();
  expect(overlayBox).not.toBeNull();
  if (overlayBox === null) {
    return;
  }
  await page.mouse.click(overlayBox.x + 140, overlayBox.y + 160);
  const image = page.getByRole("group", { name: "image element" }).first();
  await expect(image).toBeVisible();
  await expect(page.getByRole("button", { name: "Duplicate" })).toBeVisible();
  const renderedImage = image.locator("img");
  const placedSelectionBox = await image.boundingBox();
  const placedImageBox = await renderedImage.boundingBox();
  expect(placedSelectionBox).not.toBeNull();
  expect(placedImageBox).not.toBeNull();
  if (placedSelectionBox === null || placedImageBox === null) {
    return;
  }
  expect(Math.abs(placedSelectionBox.x - placedImageBox.x)).toBeLessThan(1);
  expect(Math.abs(placedSelectionBox.y - placedImageBox.y)).toBeLessThan(1);
  expect(Math.abs(placedSelectionBox.width - placedImageBox.width)).toBeLessThan(1);
  expect(Math.abs(placedSelectionBox.height - placedImageBox.height)).toBeLessThan(1);

  const initialBox = await image.boundingBox();
  expect(initialBox).not.toBeNull();
  if (initialBox === null) {
    return;
  }
  const resizeHandle = page.getByLabel("Resize image element");
  const movedBox = initialBox;
  const imageSourceBeforeResize = await renderedImage.getAttribute("src");
  const intermediateBoxes: { width: number; height: number }[] = [];
  await resizeHandle.hover();
  await page.mouse.down();
  for (const delta of [4, 7, 10, 13, 16, 18]) {
    await page.mouse.move(
      movedBox.x + movedBox.width + delta,
      movedBox.y + movedBox.height + delta,
    );
    await page.waitForTimeout(20);
    const intermediateBox = await image.boundingBox();
    expect(intermediateBox).not.toBeNull();
    if (intermediateBox !== null) {
      intermediateBoxes.push({ width: intermediateBox.width, height: intermediateBox.height });
    }
    await expect(renderedImage).toBeVisible();
  }
  await page.mouse.up();
  expect(await renderedImage.getAttribute("src")).toBe(imageSourceBeforeResize);
  expect(intermediateBoxes.length).toBeGreaterThan(2);
  for (let index = 1; index < intermediateBoxes.length; index += 1) {
    const previousBox = intermediateBoxes[index - 1];
    const currentBox = intermediateBoxes[index];
    expect(previousBox).toBeDefined();
    expect(currentBox).toBeDefined();
    if (previousBox === undefined || currentBox === undefined) {
      return;
    }
    expect(currentBox.width).toBeGreaterThanOrEqual(previousBox.width - 1);
    expect(currentBox.height).toBeGreaterThanOrEqual(previousBox.height - 1);
  }
  const resizedSelectionBox = await image.boundingBox();
  const resizedImageBox = await renderedImage.boundingBox();
  expect(resizedSelectionBox).not.toBeNull();
  expect(resizedImageBox).not.toBeNull();
  if (resizedSelectionBox === null || resizedImageBox === null) {
    return;
  }
  expect(resizedSelectionBox.width).toBeGreaterThan(movedBox.width);
  expect(Math.abs(resizedSelectionBox.width - resizedImageBox.width)).toBeLessThan(1);
  expect(Math.abs(resizedSelectionBox.height - resizedImageBox.height)).toBeLessThan(1);

  await page.getByRole("button", { name: "Undo" }).click();
  const undoneResizeBox = await image.boundingBox();
  expect(undoneResizeBox).not.toBeNull();
  if (undoneResizeBox === null) {
    return;
  }
  expect(Math.abs(undoneResizeBox.width - movedBox.width)).toBeLessThan(1);
  await page.getByRole("button", { name: "Redo" }).click();
  const redoneResizeBox = await image.boundingBox();
  expect(redoneResizeBox).not.toBeNull();
  if (redoneResizeBox === null) {
    return;
  }
  expect(Math.abs(redoneResizeBox.width - resizedSelectionBox.width)).toBeLessThan(1);

  await page.keyboard.press("Control+C");
  await page.keyboard.press("Control+V");
  await expect(page.getByRole("group", { name: "image element" })).toHaveCount(2);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("group", { name: "image element" })).toHaveCount(1);
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(page.getByRole("group", { name: "image element" })).toHaveCount(2);

  const downloadedPath = testInfo.outputPath("image-fixture-edited.pdf");
  await downloadEditedPdf(page, "image-fixture-edited.pdf", downloadedPath);

  await page.goto("/");
  await page.getByLabel("Choose a PDF file").setInputFiles(downloadedPath);
  await expect(page.getByRole("heading", { name: "image-fixture-edited.pdf" })).toBeVisible();
  await expect.poll(() => renderedCanvasHasVisibleContent(page)).toBe(true);
});
test("draws, resizes, exports, and reopens a signature", async ({ page }, testInfo) => {
  const fixturePath = testInfo.outputPath("draw-signature-fixture.pdf");
  const fixtureBytes = await createPdf();
  await import("node:fs/promises").then((fs) => fs.writeFile(fixturePath, fixtureBytes));

  await page.goto("/");
  await page.getByLabel("Choose a PDF file").setInputFiles(fixturePath);
  await expect(page.getByRole("heading", { name: "draw-signature-fixture.pdf" })).toBeVisible();
  await expect(page.getByText("Rendering PDF page...")).toBeHidden();
  await addDrawnSignature(page);

  const signature = page.getByRole("group", { name: "signature element" });
  const signatureHandle = page.getByLabel("Resize signature element");
  const signatureHandleBox = await signatureHandle.boundingBox();
  expect(signatureHandleBox).not.toBeNull();
  if (signatureHandleBox === null) {
    return;
  }
  await page.mouse.move(signatureHandleBox.x + 8, signatureHandleBox.y + 8);
  await page.mouse.down();
  await page.mouse.move(signatureHandleBox.x + 48, signatureHandleBox.y + 20);
  await page.mouse.up();
  const resizedBox = await signature.boundingBox();
  expect(resizedBox?.width).toBeGreaterThan(220);

  const downloadedPath = testInfo.outputPath("draw-signature-fixture-edited.pdf");
  await downloadEditedPdf(page, "draw-signature-fixture-edited.pdf", downloadedPath);

  await page.goto("/");
  await page.getByLabel("Choose a PDF file").setInputFiles(downloadedPath);
  await expect(
    page.getByRole("heading", { name: "draw-signature-fixture-edited.pdf" }),
  ).toBeVisible();
  await page.keyboard.press("Control+0");
  await expect(page.getByLabel("Zoom level")).toHaveText("100%");
  await expect
    .poll(() => canvasRegionHasDarkContent(page, { x: 56, y: 250, width: 240, height: 90 }))
    .toBe(true);
});

test("types, exports, and reopens a signature", async ({ page }, testInfo) => {
  const fixturePath = testInfo.outputPath("typed-signature-fixture.pdf");
  const fixtureBytes = await createPdf();
  await import("node:fs/promises").then((fs) => fs.writeFile(fixturePath, fixtureBytes));

  await page.goto("/");
  await page.getByLabel("Choose a PDF file").setInputFiles(fixturePath);
  await expect(page.getByRole("heading", { name: "typed-signature-fixture.pdf" })).toBeVisible();
  await expect(page.getByText("Rendering PDF page...")).toBeHidden();
  await addTypedSignature(page, "Ada Lovelace");

  const downloadedPath = testInfo.outputPath("typed-signature-fixture-edited.pdf");
  await downloadEditedPdf(page, "typed-signature-fixture-edited.pdf", downloadedPath);

  await page.goto("/");
  await page.getByLabel("Choose a PDF file").setInputFiles(downloadedPath);
  await expect(
    page.getByRole("heading", { name: "typed-signature-fixture-edited.pdf" }),
  ).toBeVisible();
  await page.keyboard.press("Control+0");
  await expect(page.getByLabel("Zoom level")).toHaveText("100%");
  await expect
    .poll(() => canvasRegionHasDarkContent(page, { x: 56, y: 250, width: 220, height: 70 }))
    .toBe(true);
});

test("keeps the phone editor inside the viewport with a collapsed full-width inspector", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const fixturePath = testInfo.outputPath("mobile-layout-fixture.pdf");
  await import("node:fs/promises").then(async (fs) => fs.writeFile(fixturePath, await createPdf()));

  for (const viewport of [
    { width: 320, height: 568 },
    { width: 360, height: 640 },
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByLabel("Choose a PDF file").setInputFiles(fixturePath);
    await expect(page.getByRole("region", { name: "mobile-layout-fixture.pdf" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Rendering PDF page...")).toBeHidden();
    await expect(page.getByRole("button", { name: "Go to NestlyPDF home" })).toBeVisible();

    const layout = await page.evaluate(() => {
      const rectFor = (selector: string): DOMRect => {
        const element = document.querySelector(selector);
        if (element === null) {
          throw new Error(`Missing ${selector}`);
        }
        return element.getBoundingClientRect();
      };
      const labels = [
        ...document.querySelectorAll<HTMLElement>(
          '.toolbar-tools-group button[data-mobile-primary="true"] .toolbar-label',
        ),
      ]
        .map((label) => {
          const rect = label.getBoundingClientRect();
          return { left: rect.left, right: rect.right };
        })
        .sort((first, second) => first.left - second.left);
      const workspace = rectFor('[aria-label="PDF workspace"]');
      const toolbarElement = document.querySelector<HTMLElement>(".viewer-toolbar");
      const toolsElement = document.querySelector<HTMLElement>(".toolbar-tools-group");
      if (toolbarElement === null || toolsElement === null) {
        throw new Error("Missing mobile toolbar");
      }
      const pageFrame = rectFor(".pdf-page-frame");
      const inspector = rectFor(".element-inspector");
      const viewBar = rectFor(".editor-status-bar");
      const actionRect = (
        label: string,
      ): {
        bottom: number;
        height: number;
        left: number;
        right: number;
        top: number;
        width: number;
      } => {
        const action = document.querySelector<HTMLElement>(`[aria-label="${label}"]`);
        if (action === null) {
          throw new Error(`Missing ${label}`);
        }
        const rect = action.getBoundingClientRect();
        return {
          bottom: rect.bottom,
          height: rect.height,
          left: rect.left,
          right: rect.right,
          top: rect.top,
          width: rect.width,
        };
      };
      const header = rectFor(".editor-header");
      const brand = rectFor(".editor-header > .editor-home-link");
      const brandMark = rectFor(".editor-header > .editor-home-link img");
      const moreTool = document.querySelector<HTMLElement>(".mobile-tools-overflow > button");
      if (moreTool === null) throw new Error("Missing More editor tools button");
      const toolActions = [
        ...toolsElement.querySelectorAll<HTMLElement>('button[data-mobile-primary="true"]'),
        moreTool,
      ].map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          bottom: rect.bottom,
          height: rect.height,
          left: rect.left,
          right: rect.right,
          top: rect.top,
          width: rect.width,
        };
      });
      return {
        innerWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        inspector: { left: inspector.left, right: inspector.right, width: inspector.width },
        viewBar: { left: viewBar.left, right: viewBar.right },
        workspace: { width: workspace.width },
        toolbar: {
          clientWidth: toolbarElement.clientWidth,
          scrollWidth: toolbarElement.scrollWidth,
        },
        tools: { clientWidth: toolsElement.clientWidth, scrollWidth: toolsElement.scrollWidth },
        pageFrame: { width: pageFrame.width },
        criticalActions: [
          actionRect("Open page thumbnails"),
          actionRect("Undo"),
          actionRect("Redo"),
          actionRect("Download"),
        ],
        brand: { height: brand.height, left: brand.left, right: brand.right, width: brand.width },
        brandMarkWidth: brandMark.width,
        header: { bottom: header.bottom, left: header.left, right: header.right, top: header.top },
        labels,
        toolActions,
        inspectorBodyDisplay: (() => {
          const properties = document.querySelector(".element-inspector__properties-region");
          if (properties === null) {
            throw new Error("Missing inspector properties region");
          }
          return window.getComputedStyle(properties).display;
        })(),
      };
    });

    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.innerWidth);
    expect(layout.header.left).toBeGreaterThanOrEqual(-1);
    expect(layout.header.right).toBeLessThanOrEqual(layout.innerWidth + 1);
    expect(layout.brand.width).toBeGreaterThan(0);
    expect(layout.brand.height).toBeGreaterThan(0);
    expect(layout.brand.left).toBeGreaterThanOrEqual(-1);
    expect(layout.brand.right).toBeLessThanOrEqual(layout.innerWidth + 1);
    expect(layout.brandMarkWidth).toBeLessThanOrEqual(26.5);
    expect(layout.inspector.left).toBeGreaterThanOrEqual(-1);
    expect(layout.inspector.right).toBeLessThanOrEqual(layout.innerWidth + 1);
    expect(layout.inspector.width).toBeGreaterThanOrEqual(layout.innerWidth - 1);
    expect(layout.viewBar.left).toBeGreaterThanOrEqual(-1);
    expect(layout.viewBar.right).toBeLessThanOrEqual(layout.innerWidth + 1);
    expect(layout.pageFrame.width).toBeLessThanOrEqual(layout.workspace.width + 1);
    expect(layout.toolbar.scrollWidth).toBeLessThanOrEqual(layout.toolbar.clientWidth);
    expect(layout.tools.scrollWidth).toBeLessThanOrEqual(layout.tools.clientWidth);
    expect(layout.inspectorBodyDisplay).toBe("none");
    for (const action of layout.criticalActions) {
      expect(action.width).toBeGreaterThanOrEqual(44);
      expect(action.height).toBeGreaterThanOrEqual(44);
      expect(action.left).toBeGreaterThanOrEqual(-1);
      expect(action.right).toBeLessThanOrEqual(layout.innerWidth + 1);
      expect(action.top).toBeGreaterThanOrEqual(layout.header.top - 1);
      expect(action.bottom).toBeLessThanOrEqual(layout.header.bottom + 1);
    }
    expect(layout.toolActions).toHaveLength(7);
    for (const action of layout.toolActions) {
      expect(action.width).toBeGreaterThanOrEqual(44);
      expect(action.height).toBeGreaterThanOrEqual(44);
      expect(action.left).toBeGreaterThanOrEqual(-1);
      expect(action.right).toBeLessThanOrEqual(layout.innerWidth + 1);
    }
    for (let index = 1; index < layout.labels.length; index += 1) {
      expect(layout.labels[index - 1]?.right ?? 0).toBeLessThanOrEqual(
        (layout.labels[index]?.left ?? 0) + 1,
      );
    }

    await page.getByRole("button", { name: "More editor tools" }).click();
    const moreSheet = page.getByRole("dialog", { name: "More tools" });
    await expect(moreSheet).toBeVisible();
    const moreLayout = await moreSheet.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        documentScrollWidth: document.documentElement.scrollWidth,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
      };
    });
    expect(moreLayout.documentScrollWidth).toBeLessThanOrEqual(moreLayout.viewportWidth);
    expect(moreLayout.left).toBeGreaterThanOrEqual(0);
    expect(moreLayout.right).toBeLessThanOrEqual(moreLayout.viewportWidth);
    expect(moreLayout.top).toBeGreaterThanOrEqual(0);
    expect(moreLayout.bottom).toBeLessThanOrEqual(moreLayout.viewportHeight);
    await page.getByRole("button", { name: "Close", exact: true }).click();
  }
});
test.describe("phone landscape Quick Edit", () => {
  test.use({ hasTouch: true });
  test("keeps Phone Quick Edit active for landscape touch phones wider than 767px", async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    const fixturePath = testInfo.outputPath("phone-landscape-fixture.pdf");
    await import("node:fs/promises").then(async (fs) =>
      fs.writeFile(fixturePath, await createPdf()),
    );

    for (const viewport of [
      { width: 926, height: 428 },
      { width: 844, height: 390 },
      { width: 740, height: 360 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await page.evaluate(() => {
        const nativeMatchMedia = window.matchMedia.bind(window);
        Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: 5 });
        window.matchMedia = (query: string) => {
          if (query === "(pointer: coarse)") {
            return {
              addEventListener: () => undefined,
              addListener: () => undefined,
              dispatchEvent: () => false,
              matches: true,
              media: query,
              onchange: null,
              removeEventListener: () => undefined,
              removeListener: () => undefined,
            } as MediaQueryList;
          }
          return nativeMatchMedia(query);
        };
      });
      await expect
        .poll(() =>
          page.evaluate(() => ({
            coarsePointer: window.matchMedia("(pointer: coarse)").matches,
            maxTouchPoints: navigator.maxTouchPoints,
          })),
        )
        .toEqual({ coarsePointer: true, maxTouchPoints: 5 });

      await page.getByLabel("Choose a PDF file").setInputFiles(fixturePath);
      await expect(page.getByRole("region", { name: "phone-landscape-fixture.pdf" })).toBeVisible({
        timeout: 15_000,
      });
      await expect.poll(() => renderedCanvasHasVisibleContent(page)).toBe(true);

      const editor = page.getByRole("region", { name: "phone-landscape-fixture.pdf" });
      await expect(editor).toHaveClass(/is-compact-editor/);
      await expect(editor).not.toHaveClass(/is-tablet-quick-edit/);

      const layout = await page.evaluate(() => {
        const rectFor = (selector: string): DOMRect => {
          const element = document.querySelector(selector);
          if (element === null) {
            throw new Error(`Missing ${selector}`);
          }
          return element.getBoundingClientRect();
        };
        const actionRect = (label: string): { width: number; height: number } => {
          const action = document.querySelector<HTMLElement>(`[aria-label="${label}"]`);
          if (action === null) {
            throw new Error(`Missing ${label}`);
          }
          const rect = action.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        };
        const statusBar = rectFor(".editor-status-bar");
        const toolbar = rectFor(".viewer-toolbar");
        return {
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight,
          statusBar: { top: statusBar.top, bottom: statusBar.bottom, right: statusBar.right },
          toolbar: { right: toolbar.right },
          criticalActions: [
            actionRect("Undo"),
            actionRect("Redo"),
            actionRect("Download"),
            actionRect("Open page thumbnails"),
          ],
        };
      });

      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.innerWidth + 1);
      expect(layout.scrollHeight).toBeLessThanOrEqual(layout.innerHeight + 1);
      expect(layout.statusBar.bottom).toBeLessThanOrEqual(layout.innerHeight + 1);
      expect(layout.statusBar.right).toBeLessThanOrEqual(layout.innerWidth + 1);
      expect(layout.toolbar.right).toBeLessThanOrEqual(layout.innerWidth + 1);
      for (const action of layout.criticalActions) {
        expect(action.width).toBeGreaterThanOrEqual(44);
        expect(action.height).toBeGreaterThanOrEqual(44);
      }

      await page.getByRole("button", { name: "More editor tools" }).click();
      await expect(page.getByRole("dialog", { name: "More tools" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Whiteout" })).toBeVisible();
      await page.getByRole("button", { name: "Close", exact: true }).click();

      await page.screenshot({
        path: testInfo.outputPath(
          `phone-landscape-${String(viewport.width)}x${String(viewport.height)}.png`,
        ),
        fullPage: true,
      });
    }
  });
});
test("uses the simplified tablet Quick Edit layout without horizontal overflow", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const fixturePath = testInfo.outputPath("tablet-layout-fixture.pdf");
  await import("node:fs/promises").then(async (fs) => fs.writeFile(fixturePath, await createPdf()));

  for (const viewport of [
    { width: 768, height: 1024, mode: "portrait" },
    { width: 820, height: 1180, mode: "portrait" },
    { width: 1024, height: 768, mode: "landscape" },
    { width: 1180, height: 820, mode: "landscape" },
    { width: 1280, height: 800, mode: "landscape" },
  ] as const) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.evaluate(() => {
      const nativeMatchMedia = window.matchMedia.bind(window);
      Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: 5 });
      window.matchMedia = (query: string) => {
        if (query === "(pointer: coarse)") {
          return {
            addEventListener: () => undefined,
            addListener: () => undefined,
            dispatchEvent: () => false,
            matches: true,
            media: query,
            onchange: null,
            removeEventListener: () => undefined,
            removeListener: () => undefined,
          } as MediaQueryList;
        }
        return nativeMatchMedia(query);
      };
    });
    await expect
      .poll(() =>
        page.evaluate(() => ({
          coarsePointer: window.matchMedia("(pointer: coarse)").matches,
          maxTouchPoints: navigator.maxTouchPoints,
        })),
      )
      .toEqual({ coarsePointer: true, maxTouchPoints: 5 });

    await page.getByLabel("Choose a PDF file").setInputFiles(fixturePath);
    await expect(page.getByRole("region", { name: "tablet-layout-fixture.pdf" })).toBeVisible({
      timeout: 15_000,
    });
    await expect.poll(() => renderedCanvasHasVisibleContent(page)).toBe(true);
    await expect(page.getByRole("button", { name: "Go to NestlyPDF home" })).toBeVisible();

    const editor = page.getByRole("region", { name: "tablet-layout-fixture.pdf" });
    await expect(editor).toHaveClass(/is-tablet-quick-edit/);
    await expect(editor).toHaveClass(/is-compact-editor/);
    await expect(page.getByRole("status", { name: "Quick Edit mode" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Whiteout" })).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Initials" })).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Cross" })).not.toBeVisible();

    const performanceProfile = page.getByLabel("Editor performance profile");
    await performanceProfile.selectOption("light");
    await expect(editor).toHaveClass(/is-performance-light/);
    await performanceProfile.selectOption("full");
    await expect(editor).toHaveClass(/is-performance-full/);

    const layout = await page.evaluate(() => {
      const inspector = document.querySelector(".element-inspector");
      const workspace = document.querySelector(".editor-workspace-shell");
      const editorElement = document.querySelector(".editor-viewer");
      if (inspector === null || workspace === null || editorElement === null) {
        throw new Error("Tablet editor layout is incomplete.");
      }
      return {
        classes: editorElement.className,
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        inspectorInsideWorkspace: workspace.contains(inspector),
      };
    });

    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
    expect(layout.classes).not.toContain("is-tablet-editor");
    expect(layout.inspectorInsideWorkspace).toBe(false);

    await page.getByRole("button", { name: "Open editor inspector" }).click();
    await expect(page.locator(".element-inspector")).toHaveClass(/is-mobile-open/);
    await page.getByRole("button", { name: "Collapse inspector sheet" }).click();
    await expect(page.locator(".element-inspector")).not.toHaveClass(/is-mobile-open/);

    await page.getByRole("button", { name: "Open page thumbnails" }).first().click();
    await expect(page.locator(".page-rail")).toHaveClass(/is-mobile-open/);
    await page.getByRole("button", { name: "Close page thumbnails" }).click();
    await expect(page.locator(".page-rail")).not.toHaveClass(/is-mobile-open/);

    await page.getByRole("button", { name: "More editor tools" }).click();
    await expect(page.getByRole("dialog", { name: "More tools" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Whiteout" })).toBeVisible();
    await page.getByRole("button", { name: "Close", exact: true }).click();

    await page.screenshot({
      path: testInfo.outputPath(`tablet-${String(viewport.width)}x${String(viewport.height)}.png`),
      fullPage: true,
    });
  }
});
test("renders the phone landing with an accessible local-first menu", async ({ page }) => {
  for (const viewport of [
    { width: 320, height: 568, name: "320x568" },
    { width: 360, height: 640, name: "360x640" },
    { width: 375, height: 667, name: "375x667" },
    { width: 390, height: 844, name: "390x844" },
    { width: 430, height: 932, name: "430x932" },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    await expect(page.getByText("Private & Secure")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Edit PDFs privately/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Choose PDF" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Browse files" })).toBeVisible();
    await expect(page.getByText("Private by design")).toBeVisible();
    await expect(
      page.locator(".landing-badges").getByText("No Uploads", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("100% Free")).toBeVisible();
    await expect(page.locator(".landing-install-card")).toBeVisible();

    const deferUpdate = page.getByRole("button", { name: "Later" });
    if (await deferUpdate.isVisible()) {
      await deferUpdate.click();
    }

    const menuButton = page.getByRole("button", { name: "Open site menu" });
    await menuButton.click();
    await expect(menuButton).toHaveAttribute("aria-expanded", "true");
    await expect(
      page.locator("#mobile-site-menu").getByRole("link", { name: "Privacy" }),
    ).toBeVisible();
    const githubLink = page.locator("#mobile-site-menu").getByRole("link", { name: "GitHub" });
    await expect(githubLink).toBeVisible();
    await expect(githubLink).toHaveAttribute("href", "https://github.com/thiagomkoppel/QuickPDF");
    await page.keyboard.press("Escape");
    await expect(menuButton).toHaveAttribute("aria-expanded", "false");

    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
    await page.screenshot({
      path: `artifacts/ui-review/mobile-landing-${viewport.name}.png`,
      fullPage: true,
    });
  }
});
test("returns to the landing page after reloading a memory-only editor session", async ({
  page,
}, testInfo) => {
  const fixturePath = testInfo.outputPath("memory-only-session.pdf");
  await import("node:fs/promises").then(async (fs) => fs.writeFile(fixturePath, await createPdf()));

  await page.goto("/");
  await page.getByLabel("Choose a PDF file").setInputFiles(fixturePath);
  await expect(page.getByRole("heading", { name: "memory-only-session.pdf" })).toBeVisible();
  await expect(page.getByLabel("Rendered PDF page")).toBeVisible();

  await page.reload();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "Open a PDF file" })).toBeVisible();
  await expect(page.getByText("Open a PDF first")).toHaveCount(0);
  await expect(page.getByRole("group", { name: /element$/ })).toHaveCount(0);
});

test("guards dirty Open before launching the replacement picker", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const currentPath = testInfo.outputPath("current-document.pdf");
  const replacementPath = testInfo.outputPath("replacement-document.pdf");
  await import("node:fs/promises").then(async (fs) => {
    await fs.writeFile(currentPath, await createPdf());
    await fs.writeFile(replacementPath, await createPdf());
  });

  await page.goto("/");
  await page.getByLabel("Choose a PDF file").setInputFiles(currentPath);
  await expect(page.getByLabel("PDF workspace")).toBeVisible({ timeout: 15_000 });

  const overlayBox = await page.locator(".overlay-layer").boundingBox();
  expect(overlayBox).not.toBeNull();
  if (overlayBox === null) return;
  await page.getByRole("button", { name: "Text" }).click();
  await page.mouse.click(overlayBox.x + 70, overlayBox.y + 90);
  await expect(page.getByLabel("Edit text element")).toBeVisible();

  await page.getByRole("button", { name: "Open" }).click();
  await expect(page).toHaveURL(/\/editor$/);
  await expect(page.getByRole("dialog", { name: "Leave without saving?" })).toBeVisible();
  await page.getByRole("button", { name: "Stay here" }).click();
  await expect(page.getByLabel("PDF workspace")).toBeVisible();

  await page.getByRole("button", { name: "Open" }).click();
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Leave without saving" }).click();
  const replacementChooser = await fileChooserPromise;
  await replacementChooser.setFiles(replacementPath);

  await expect(page.getByRole("heading", { name: "replacement-document.pdf" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByLabel("PDF workspace")).toBeVisible();
});
test("guards dirty editor logo navigation before discarding the browser-memory session", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const fixturePath = testInfo.outputPath("guarded-logo-navigation.pdf");
  await import("node:fs/promises").then(async (fs) => fs.writeFile(fixturePath, await createPdf()));

  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "phone", width: 390, height: 844 },
    { name: "tablet", width: 768, height: 1024 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    if (viewport.name === "tablet") {
      await page.evaluate(() => {
        const nativeMatchMedia = window.matchMedia.bind(window);
        Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: 5 });
        window.matchMedia = (query: string) => {
          if (query === "(pointer: coarse)") {
            return {
              addEventListener: () => undefined,
              addListener: () => undefined,
              dispatchEvent: () => false,
              matches: true,
              media: query,
              onchange: null,
              removeEventListener: () => undefined,
              removeListener: () => undefined,
            } as MediaQueryList;
          }
          return nativeMatchMedia(query);
        };
      });
    }
    await page.getByLabel("Choose a PDF file").setInputFiles(fixturePath);
    await expect(page.getByLabel("PDF workspace")).toBeVisible({ timeout: 15_000 });

    const overlayBox = await page.locator(".overlay-layer").boundingBox();
    expect(overlayBox).not.toBeNull();
    if (overlayBox === null) return;
    await page.getByRole("button", { name: "Text" }).click();
    await page.mouse.click(overlayBox.x + 70, overlayBox.y + 90);
    await expect(page.getByLabel("Edit text element")).toBeVisible();
    await expect(page.locator(".editor-subtitle")).toHaveText("Unsaved temporary edits");
    await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();

    const logo = page.getByRole("button", { name: "Go to NestlyPDF home" });
    await expect(logo).toHaveAttribute("type", "button");
    await expect(logo).not.toHaveAttribute("href");
    await expect
      .poll(() =>
        logo.evaluate((element) => {
          const styles = window.getComputedStyle(element);
          return {
            backgroundColor: styles.backgroundColor,
            color: styles.color,
            borderTopWidth: styles.borderTopWidth,
            borderRadius: styles.borderRadius,
          };
        }),
      )
      .toEqual({
        backgroundColor: "rgba(0, 0, 0, 0)",
        color: "rgb(244, 251, 252)",
        borderTopWidth: "0px",
        borderRadius: "0px",
      });

    await logo.click();
    await expect(page).toHaveURL(/\/editor$/);
    await expect(page.getByRole("dialog", { name: "Leave without saving?" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Leave without saving?" })).toBeHidden();
    await expect(page.getByLabel("PDF workspace")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();

    if (viewport.name === "desktop") {
      await page.getByRole("button", { name: "Open" }).click();
    } else {
      await page.getByRole("button", { name: "More editor tools" }).click();
      await page.getByRole("button", { name: "Open PDF" }).click();
    }
    await expect(page.getByRole("dialog", { name: "Leave without saving?" })).toBeVisible();
    await page.getByRole("button", { name: "Stay here" }).click();

    await logo.click();
    await page.getByRole("button", { name: "Leave without saving" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByLabel("Choose a PDF file")).toBeVisible();
  }
});

test("writes the PDF dates chosen in the status-bar tool into the downloaded file", async ({
  page,
}, testInfo) => {
  const fixturePath = testInfo.outputPath("document-dates-fixture.pdf");
  const source = await PDFDocument.create();
  source.addPage([300, 400]);
  source.setCreationDate(new Date(2019, 4, 6, 7, 8));
  source.setModificationDate(new Date(2020, 5, 7, 8, 9));
  const fixtureBytes = Buffer.from(await source.save());
  await import("node:fs/promises").then((fs) => fs.writeFile(fixturePath, fixtureBytes));

  await page.goto("/");
  await page.getByLabel("Choose a PDF file").setInputFiles(fixturePath);
  await expect(page.getByRole("heading", { name: "document-dates-fixture.pdf" })).toBeVisible();
  await expect(page.getByText("Rendering PDF page...")).toBeHidden();

  await page.getByRole("button", { name: "Edit PDF dates" }).click();
  const datesDialog = page.getByRole("dialog", { name: "PDF dates" });
  await expect(datesDialog.getByLabel("Created")).toHaveValue("2019-05-06T07:08");
  await expect(datesDialog.getByLabel("Modified")).toHaveValue("2020-06-07T08:09");

  await datesDialog.getByLabel("Created").fill("2001-02-03T04:05");
  await datesDialog.getByLabel("Modified").fill("2002-03-04T05:06");
  await datesDialog.getByRole("button", { name: "Apply dates" }).click();
  await expect(datesDialog).toBeHidden();
  await expect(page.getByText("Unsaved temporary edits")).toBeVisible();

  const downloadedPath = testInfo.outputPath("document-dates-fixture-edited.pdf");
  await downloadEditedPdf(page, "document-dates-fixture-edited.pdf", downloadedPath);

  const exported = await PDFDocument.load(
    await import("node:fs/promises").then((fs) => fs.readFile(downloadedPath)),
    { updateMetadata: false },
  );
  expect(exported.getCreationDate()?.getTime()).toBe(new Date(2001, 1, 3, 4, 5).getTime());
  expect(exported.getModificationDate()?.getTime()).toBe(new Date(2002, 2, 4, 5, 6).getTime());
});
