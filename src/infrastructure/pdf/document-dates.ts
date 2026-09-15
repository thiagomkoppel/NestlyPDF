import type { PDFDocument } from "pdf-lib";

import type { DocumentDates } from "../../application/editor-application";

/** The widest instant `Date` can represent; anything beyond it cannot become a PDF date. */
const MAX_CALENDAR_DATE_MS = 8.64e15;

const epochMillisecondsOf = (read: () => Date | undefined): number | undefined => {
  try {
    // A malformed Info date makes pdf-lib throw while decoding, and an absent one returns
    // undefined. Neither should stop a document from opening.
    const value = read()?.getTime();
    return value === undefined || Number.isNaN(value) ? undefined : value;
  } catch {
    return undefined;
  }
};

const calendarDateOf = (epochMilliseconds: number | undefined): Date | undefined =>
  epochMilliseconds === undefined ||
  !Number.isFinite(epochMilliseconds) ||
  Math.abs(epochMilliseconds) > MAX_CALENDAR_DATE_MS
    ? undefined
    : new Date(epochMilliseconds);

/** The Info dictionary dates the document currently carries, as epoch milliseconds. */
export const readDocumentDates = (document: PDFDocument): DocumentDates => {
  const creationDate = epochMillisecondsOf(() => document.getCreationDate());
  const modificationDate = epochMillisecondsOf(() => document.getModificationDate());

  return {
    ...(creationDate === undefined ? {} : { creationDate }),
    ...(modificationDate === undefined ? {} : { modificationDate }),
  };
};

/** Stamps the chosen dates; an omitted date keeps whatever the document already carries. */
export const applyDocumentDates = (
  document: PDFDocument,
  dates: DocumentDates | undefined,
): void => {
  const creationDate = calendarDateOf(dates?.creationDate);
  if (creationDate !== undefined) {
    document.setCreationDate(creationDate);
  }

  const modificationDate = calendarDateOf(dates?.modificationDate);
  if (modificationDate !== undefined) {
    document.setModificationDate(modificationDate);
  }
};
