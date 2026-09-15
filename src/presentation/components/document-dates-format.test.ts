import { describe, expect, it } from "vitest";

import {
  dateTimeLocalValue,
  documentDatesFromFields,
  epochMillisecondsFromDateTimeLocal,
  formatDocumentDate,
  INCOMPLETE_DOCUMENT_DATE_MESSAGE,
} from "./document-dates-format";

describe("document date fields", () => {
  it("renders an instant as a local datetime-local value", () => {
    const local = new Date(2021, 2, 4, 5, 6);

    expect(dateTimeLocalValue(local.getTime())).toBe("2021-03-04T05:06");
  });

  it("renders an unknown or unrepresentable instant as an empty field", () => {
    expect(dateTimeLocalValue(undefined)).toBe("");
    expect(dateTimeLocalValue(Number.NaN)).toBe("");
    expect(dateTimeLocalValue(8.64e15 + 1)).toBe("");
  });

  it("reads a local datetime-local value back as the same instant", () => {
    const local = new Date(2021, 2, 4, 5, 6);

    expect(epochMillisecondsFromDateTimeLocal("2021-03-04T05:06")).toBe(local.getTime());
    expect(epochMillisecondsFromDateTimeLocal("2021-03-04T05:06:07")).toBe(
      new Date(2021, 2, 4, 5, 6, 7).getTime(),
    );
  });

  it("reads an empty or malformed field as no chosen date", () => {
    expect(epochMillisecondsFromDateTimeLocal("")).toBeUndefined();
    expect(epochMillisecondsFromDateTimeLocal("   ")).toBeUndefined();
    expect(epochMillisecondsFromDateTimeLocal("not-a-date")).toBeUndefined();
    expect(epochMillisecondsFromDateTimeLocal("2021-13-40T99:99")).toBeUndefined();
  });

  it("keeps early years intact and rejects a year no PDF date can hold", () => {
    const early = epochMillisecondsFromDateTimeLocal("0040-01-02T03:04");

    expect(early).toBeDefined();
    expect(new Date(early ?? 0).getFullYear()).toBe(40);
    expect(epochMillisecondsFromDateTimeLocal("0000-01-01T00:00")).toBeUndefined();
  });

  it("describes a stored date for people, and says so when there is none", () => {
    const local = new Date(2021, 2, 4, 5, 6);

    expect(formatDocumentDate(local.getTime())).toContain("2021");
    expect(formatDocumentDate(undefined)).toBe("Not set");
  });
  it("reads both fields as the dates an export should write", () => {
    expect(
      documentDatesFromFields({
        creationDate: "2001-02-03T04:05",
        modificationDate: "2002-03-04T05:06",
      }),
    ).toEqual({
      ok: true,
      dates: {
        creationDate: new Date(2001, 1, 3, 4, 5).getTime(),
        modificationDate: new Date(2002, 2, 4, 5, 6).getTime(),
      },
    });
  });

  it("reads cleared fields as dates the export should leave alone", () => {
    expect(documentDatesFromFields({ creationDate: "", modificationDate: "" })).toEqual({
      ok: true,
      dates: {},
    });
  });

  it("refuses a field that holds something other than a full date", () => {
    expect(documentDatesFromFields({ creationDate: "2001-02-03T", modificationDate: "" })).toEqual({
      ok: false,
      message: INCOMPLETE_DOCUMENT_DATE_MESSAGE,
    });
  });
});
