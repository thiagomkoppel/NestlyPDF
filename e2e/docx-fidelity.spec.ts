import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { PDFDocument } from "pdf-lib";
import { expect, test } from "@playwright/test";

import {
  planSectionSegments,
  type SectionMetrics,
} from "../src/infrastructure/import/browser-docx-to-pdf-gateway";

const TEST_DOCX = fileURLToPath(new URL("../tests/TEST.docx", import.meta.url));
const JSZIP = fileURLToPath(new URL("../node_modules/jszip/dist/jszip.min.js", import.meta.url));
const DOCX_PREVIEW = fileURLToPath(
  new URL("../node_modules/docx-preview/dist/docx-preview.min.js", import.meta.url),
);

/** Last text line the user confirmed sits at the bottom of each page in Word. */
const EXPECTED_PAGE_ENDINGS = [
  "machines, lamps, and basically anything else that had wires coming out of it.",
  "No explanation.",
  "Her name was Clara.",
];

interface DocxProbe {
  readonly metrics: SectionMetrics;
  readonly paragraphBottoms: (number | null)[];
}

/**
 * Renders TEST.docx with docx-preview and measures the first section exactly the
 * way the conversion gateway does, plus the bottom of each expected page-ending
 * paragraph.
 */
const probeTestDocx = async (page: import("@playwright/test").Page): Promise<DocxProbe> => {
  const base64 = readFileSync(TEST_DOCX).toString("base64");
  await page.setContent("<!doctype html><html><body></body></html>");
  await page.addScriptTag({ path: JSZIP });
  await page.addScriptTag({ path: DOCX_PREVIEW });

  return page.evaluate(
    async ({ base64, endings }): Promise<DocxProbe> => {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

      const container = document.createElement("div");
      container.style.cssText = "position:absolute;left:0;top:0;width:816px;background:#fff";
      document.body.appendChild(container);
      const docx = (
        window as unknown as { docx: { renderAsync: (...args: unknown[]) => Promise<unknown> } }
      ).docx;
      await docx.renderAsync(new Blob([bytes]), container, undefined, {
        inWrapper: true,
        breakPages: true,
        ignoreLastRenderedPageBreak: false,
      });

      const section = container.querySelector<HTMLElement>("section.docx");
      if (section === null) throw new Error("no section rendered");
      const view = section.ownerDocument.defaultView;
      if (view === null) throw new Error("no default view");
      const computed = view.getComputedStyle(section);
      const sectionTop = section.getBoundingClientRect().top;
      const num = (v: string): number => {
        const n = Number.parseFloat(v);
        return Number.isFinite(n) ? n : 0;
      };

      const raw: { topPx: number; bottomPx: number }[] = [];
      const pushRect = (r: DOMRect): void => {
        if (r.height > 3) raw.push({ topPx: r.top - sectionTop, bottomPx: r.bottom - sectionTop });
      };
      const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        if ((node.nodeValue ?? "").trim().length === 0) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of Array.from(range.getClientRects())) pushRect(rect);
      }
      for (const media of Array.from(section.querySelectorAll("img, svg, canvas, table"))) {
        pushRect(media.getBoundingClientRect());
      }
      raw.sort((a, b) => a.topPx - b.topPx);
      const lines: { topPx: number; bottomPx: number }[] = [];
      for (const rect of raw) {
        const last = lines[lines.length - 1];
        const overlap = last
          ? Math.min(rect.bottomPx, last.bottomPx) - Math.max(rect.topPx, last.topPx)
          : 0;
        if (last && overlap > 4) {
          last.topPx = Math.min(last.topPx, rect.topPx);
          last.bottomPx = Math.max(last.bottomPx, rect.bottomPx);
        } else {
          lines.push({ ...rect });
        }
      }

      const blocks = Array.from(section.querySelectorAll("p, h1, h2, h3, h4, li"));
      const paragraphBottoms = endings.map((ending) => {
        const match = blocks.find((b) =>
          (b.textContent || "").replace(/\s+/g, " ").trim().endsWith(ending),
        );
        return match === undefined ? null : match.getBoundingClientRect().bottom - sectionTop;
      });

      return {
        metrics: {
          widthPx: num(computed.width),
          pageHeightPx: num(computed.minHeight),
          padTopPx: num(computed.paddingTop),
          padBottomPx: num(computed.paddingBottom),
          totalHeightPx: Math.max(
            section.getBoundingClientRect().height,
            section.scrollHeight,
            section.offsetHeight,
          ),
          lines,
        },
        paragraphBottoms,
      };
    },
    { base64, endings: EXPECTED_PAGE_ENDINGS },
  );
};

test("paginates TEST.docx exactly like the source document", async ({ page }) => {
  const { metrics, paragraphBottoms } = await probeTestDocx(page);
  const segments = planSectionSegments(metrics);

  // The document is four pages in Word.
  expect(segments).toHaveLength(4);

  // Each confirmed last line ends its page: it sits inside its segment and within
  // about two lines of the page break, with nothing else after it on that page.
  paragraphBottoms.forEach((bottom, index) => {
    const segment = segments[index];
    expect(bottom, `paragraph ${String(index + 1)} not found`).not.toBeNull();
    expect(segment, `segment ${String(index + 1)} missing`).toBeDefined();
    if (bottom === null || segment === undefined) return;
    expect(bottom).toBeGreaterThan(segment.startPx);
    expect(bottom).toBeLessThanOrEqual(segment.endPx + 2);
    expect(segment.endPx - bottom).toBeLessThan(48);
  });
});

test("opens TEST.docx as a four-page workspace and exports four pages", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.getByLabel("Choose a PDF file").setInputFiles(TEST_DOCX);

  await expect(page.getByRole("heading", { name: "TEST.docx" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Rendering PDF page...")).toBeHidden();

  await expect(page.getByRole("button", { name: /page 4/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /page 5/i })).toHaveCount(0);

  const overlayBox = await page.locator(".overlay-layer").boundingBox();
  expect(overlayBox).not.toBeNull();
  if (overlayBox === null) return;
  await page.getByRole("button", { name: "Text" }).click();
  await page.mouse.click(overlayBox.x + 60, overlayBox.y + 60);
  await page.getByLabel("Edit text element").fill("x");
  await page.getByLabel("Edit text element").press("Escape");

  const downloadedPath = testInfo.outputPath("test-docx-edited.pdf");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  await page
    .getByRole("dialog", { name: "Export PDF" })
    .getByRole("button", { name: "Export PDF" })
    .click();
  await (await downloadPromise).saveAs(downloadedPath);

  const exported = await PDFDocument.load(readFileSync(downloadedPath));
  expect(exported.getPageCount()).toBe(4);
});
