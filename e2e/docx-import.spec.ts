import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { expect, test } from "@playwright/test";

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const textParagraph = (text: string): string =>
  `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

const PAGE_BREAK = `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;

const documentXml = (
  bodyBlocks: readonly string[],
): string => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyBlocks.join("\n    ")}
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>
  </w:body>
</w:document>`;

const createDocx = async (bodyBlocks: readonly string[]): Promise<Buffer> => {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.folder("_rels")?.file(".rels", ROOT_RELS);
  zip.folder("word")?.file("document.xml", documentXml(bodyBlocks));
  return zip.generateAsync({ type: "nodebuffer" });
};

const readPdfPageCount = async (path: string): Promise<number> => {
  const bytes = await import("node:fs/promises").then((fs) => fs.readFile(path));
  return (await PDFDocument.load(bytes)).getPageCount();
};

const addAnchorText = async (page: import("@playwright/test").Page): Promise<void> => {
  const overlayBox = await page.locator(".overlay-layer").boundingBox();
  if (overlayBox === null) throw new Error("overlay layer not found");
  await page.getByRole("button", { name: "Text" }).click();
  await page.mouse.click(overlayBox.x + 60, overlayBox.y + 60);
  await page.getByLabel("Edit text element").fill("x");
  await page.getByLabel("Edit text element").press("Escape");
};

const exportEditedPdf = async (
  page: import("@playwright/test").Page,
  outputPath: string,
): Promise<void> => {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  await page
    .getByRole("dialog", { name: "Export PDF" })
    .getByRole("button", { name: "Export PDF" })
    .click();
  await (await downloadPromise).saveAs(outputPath);
};

test("converts a single-page Word document and exports it", async ({ page }, testInfo) => {
  const fixturePath = testInfo.outputPath("word-letter.docx");
  await import("node:fs/promises").then(async (fs) =>
    fs.writeFile(
      fixturePath,
      await createDocx([
        textParagraph("NestlyPDF converts this Word document in the browser."),
        textParagraph("It becomes a rasterized PDF that stays on this device."),
      ]),
    ),
  );

  await page.goto("/");
  await page.getByLabel("Choose a PDF file").setInputFiles(fixturePath);

  await expect(page.getByText("Converting your document...")).toBeVisible();
  await expect(page.getByRole("heading", { name: "word-letter.docx" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("Rendering PDF page...")).toBeHidden();

  const overlayBox = await page.locator(".overlay-layer").boundingBox();
  expect(overlayBox).not.toBeNull();
  if (overlayBox === null) return;

  await page.getByRole("button", { name: "Text" }).click();
  await page.mouse.click(overlayBox.x + 80, overlayBox.y + 80);
  await page.getByLabel("Edit text element").fill("Signed");
  await page.getByLabel("Edit text element").press("Escape");

  const downloadedPath = testInfo.outputPath("word-letter-edited.pdf");
  await exportEditedPdf(page, downloadedPath);

  expect(await readPdfPageCount(downloadedPath)).toBe(1);
});

test("keeps the page count of a Word document with explicit page breaks", async ({
  page,
}, testInfo) => {
  const fixturePath = testInfo.outputPath("word-three-pages.docx");
  await import("node:fs/promises").then(async (fs) =>
    fs.writeFile(
      fixturePath,
      await createDocx([
        textParagraph("Page one."),
        PAGE_BREAK,
        textParagraph("Page two."),
        PAGE_BREAK,
        textParagraph("Page three."),
      ]),
    ),
  );

  await page.goto("/");
  await page.getByLabel("Choose a PDF file").setInputFiles(fixturePath);
  await expect(page.getByRole("heading", { name: "word-three-pages.docx" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("Rendering PDF page...")).toBeHidden();

  await expect(page.getByRole("button", { name: /page 3/i })).toBeVisible();

  await addAnchorText(page);
  const downloadedPath = testInfo.outputPath("word-three-pages.pdf");
  await exportEditedPdf(page, downloadedPath);

  expect(await readPdfPageCount(downloadedPath)).toBe(3);
});

test("paginates a Word document whose content overflows one page", async ({ page }, testInfo) => {
  const fixturePath = testInfo.outputPath("word-long.docx");
  const paragraphs = Array.from({ length: 180 }, (_, index) =>
    textParagraph(`Line ${String(index + 1)} of a document that runs well past a single page.`),
  );
  await import("node:fs/promises").then(async (fs) =>
    fs.writeFile(fixturePath, await createDocx(paragraphs)),
  );

  await page.goto("/");
  await page.getByLabel("Choose a PDF file").setInputFiles(fixturePath);
  await expect(page.getByRole("heading", { name: "word-long.docx" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("Rendering PDF page...")).toBeHidden();

  await addAnchorText(page);
  const downloadedPath = testInfo.outputPath("word-long.pdf");
  await exportEditedPdf(page, downloadedPath);

  expect(await readPdfPageCount(downloadedPath)).toBeGreaterThanOrEqual(3);
});

test("rejects a legacy .doc file on the landing page", async ({ page }, testInfo) => {
  const legacyPath = testInfo.outputPath("memo.doc");
  await import("node:fs/promises").then((fs) =>
    fs.writeFile(legacyPath, Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])),
  );

  await page.goto("/");
  await page.getByLabel("Choose a PDF file").setInputFiles(legacyPath);

  await expect(page.getByRole("alert")).toContainText(
    "Word 97-2003 .doc files can't be opened here",
  );
  await expect(page.getByRole("heading", { name: "memo.doc" })).toBeHidden();
});
