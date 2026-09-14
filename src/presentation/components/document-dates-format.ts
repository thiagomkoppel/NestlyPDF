import type { DocumentDates } from "../../application/editor-application";

/** The widest instant `Date` can represent; anything beyond it has no calendar value to show. */
const MAX_CALENDAR_DATE_MS = 8.64e15;

const DATE_TIME_LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

const padded = (value: number, length = 2): string => String(value).padStart(length, "0");

/** The `datetime-local` field value for an instant, expressed in the viewer's own time zone. */
export const dateTimeLocalValue = (epochMilliseconds: number | undefined): string => {
  if (
    epochMilliseconds === undefined ||
    !Number.isFinite(epochMilliseconds) ||
    Math.abs(epochMilliseconds) > MAX_CALENDAR_DATE_MS
  ) {
    return "";
  }

  const date = new Date(epochMilliseconds);
  return `${padded(date.getFullYear(), 4)}-${padded(date.getMonth() + 1)}-${padded(
    date.getDate(),
  )}T${padded(date.getHours())}:${padded(date.getMinutes())}`;
};

/** The instant a `datetime-local` field describes, or undefined when it holds no usable date. */
export const epochMillisecondsFromDateTimeLocal = (value: string): number | undefined => {
  const match = DATE_TIME_LOCAL_PATTERN.exec(value.trim());
  if (match === null) {
    return undefined;
  }

  const [, year, month, day, hours, minutes, seconds] = match;
  if (Number(year) < 1) {
    // A PDF date needs a real four-digit year; year zero is a typo, not a date.
    return undefined;
  }

  const parsed = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hours),
    Number(minutes),
    seconds === undefined ? 0 : Number(seconds),
  );
  // The Date constructor reads years 0-99 as 1900-1999, which would silently store a date the
  // user never picked.
  parsed.setFullYear(Number(year));
  const time = parsed.getTime();
  if (Number.isNaN(time) || parsed.getMonth() !== Number(month) - 1) {
    // A rolled-over month means the field described a day or time that does not exist.
    return undefined;
  }

  return time;
};

/** A readable rendering of a stored document date, for places that only report it. */
export const formatDocumentDate = (epochMilliseconds: number | undefined): string => {
  if (
    epochMilliseconds === undefined ||
    !Number.isFinite(epochMilliseconds) ||
    Math.abs(epochMilliseconds) > MAX_CALENDAR_DATE_MS
  ) {
    return "Not set";
  }

  return new Date(epochMilliseconds).toLocaleString();
};

export type DocumentDateFields = Readonly<{ creationDate: string; modificationDate: string }>;

export type DocumentDateFieldsResult =
  | { readonly ok: true; readonly dates: DocumentDates }
  | { readonly ok: false; readonly message: string };

export const INCOMPLETE_DOCUMENT_DATE_MESSAGE =
  "Enter a full date and time, or clear the field to keep the date already in the file.";

/**
 * The dates two `datetime-local` fields describe. An empty field means "keep the date the PDF
 * already carries"; a field holding something that is not a full date is refused rather than
 * silently dropped.
 */
export const documentDatesFromFields = (fields: DocumentDateFields): DocumentDateFieldsResult => {
  const creationDate = epochMillisecondsFromDateTimeLocal(fields.creationDate);
  const modificationDate = epochMillisecondsFromDateTimeLocal(fields.modificationDate);
  const isIncomplete =
    (fields.creationDate.trim().length > 0 && creationDate === undefined) ||
    (fields.modificationDate.trim().length > 0 && modificationDate === undefined);

  if (isIncomplete) {
    return { ok: false, message: INCOMPLETE_DOCUMENT_DATE_MESSAGE };
  }

  return {
    ok: true,
    dates: {
      ...(creationDate === undefined ? {} : { creationDate }),
      ...(modificationDate === undefined ? {} : { modificationDate }),
    },
  };
};
