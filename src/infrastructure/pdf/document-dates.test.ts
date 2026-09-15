import { PDFDict, PDFDocument, PDFHexString, PDFName } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { applyDocumentDates, readDocumentDates } from "./document-dates";

const createdDocument = async (): Promise<PDFDocument> => {
  const document = await PDFDocument.create();
  document.addPage([300, 400]);
  return document;
};

describe("document dates", () => {
  it("reads the Info dictionary dates as epoch milliseconds", async () => {
    const document = await createdDocument();
    document.setCreationDate(new Date("2021-03-04T05:06:07Z"));
    document.setModificationDate(new Date("2022-07-08T09:10:11Z"));

    expect(readDocumentDates(document)).toEqual({
      creationDate: Date.parse("2021-03-04T05:06:07Z"),
      modificationDate: Date.parse("2022-07-08T09:10:11Z"),
    });
  });

  it("reports unreadable or missing dates as absent instead of throwing", async () => {
    const document = await createdDocument();
    const info = document.context.lookup(document.context.trailerInfo.Info);
    if (!(info instanceof PDFDict)) {
      throw new Error("Expected the created document to carry an Info dictionary.");
    }
    info.set(PDFName.of("CreationDate"), PDFHexString.fromText("not a date"));
    info.delete(PDFName.of("ModDate"));

    expect(readDocumentDates(document)).toEqual({});
  });

  it("writes only the dates that were chosen", async () => {
    const document = await createdDocument();
    document.setCreationDate(new Date("2021-03-04T05:06:07Z"));
    document.setModificationDate(new Date("2022-07-08T09:10:11Z"));

    applyDocumentDates(document, { modificationDate: Date.parse("2019-01-02T03:04:05Z") });

    expect(readDocumentDates(document)).toEqual({
      creationDate: Date.parse("2021-03-04T05:06:07Z"),
      modificationDate: Date.parse("2019-01-02T03:04:05Z"),
    });
  });

  it("leaves the document untouched when no dates were chosen", async () => {
    const document = await createdDocument();
    document.setCreationDate(new Date("2021-03-04T05:06:07Z"));
    document.setModificationDate(new Date("2022-07-08T09:10:11Z"));

    applyDocumentDates(document, undefined);
    applyDocumentDates(document, {});

    expect(readDocumentDates(document)).toEqual({
      creationDate: Date.parse("2021-03-04T05:06:07Z"),
      modificationDate: Date.parse("2022-07-08T09:10:11Z"),
    });
  });

  it("ignores dates no calendar date can represent", async () => {
    const document = await createdDocument();
    document.setCreationDate(new Date("2021-03-04T05:06:07Z"));

    applyDocumentDates(document, { creationDate: Number.NaN });

    expect(readDocumentDates(document).creationDate).toBe(Date.parse("2021-03-04T05:06:07Z"));
  });
});
