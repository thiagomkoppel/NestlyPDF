import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

import type { DocumentDates } from "../../application/editor-application";
import {
  dateTimeLocalValue,
  documentDatesFromFields,
  type DocumentDateFields,
} from "./document-dates-format";

interface DocumentDatesDialogProps {
  /** The dates the next export will write. */
  readonly documentDates: DocumentDates;
  /** The dates the file carried when it was opened, offered as a way back. */
  readonly sourceDocumentDates: DocumentDates;
  readonly onCancel: () => void;
  readonly onApply: (dates: DocumentDates) => void;
}

const fieldsFrom = (dates: DocumentDates): DocumentDateFields => ({
  creationDate: dateTimeLocalValue(dates.creationDate),
  modificationDate: dateTimeLocalValue(dates.modificationDate),
});

export const DocumentDatesDialog = ({
  documentDates,
  sourceDocumentDates,
  onCancel,
  onApply,
}: DocumentDatesDialogProps): React.ReactElement => {
  const [fields, setFields] = useState<DocumentDateFields>(() => fieldsFrom(documentDates));
  const [error, setError] = useState<string | undefined>();
  const creationInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    creationInputRef.current?.focus();
    const closeOnEscape = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCancel();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onCancel]);

  const trapFocus = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key !== "Tab") return;
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>("input, button")].filter(
      (control) => !control.hasAttribute("disabled"),
    );
    const first = controls[0];
    const last = controls.at(-1);
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const apply = (): void => {
    const result = documentDatesFromFields(fields);
    if (!result.ok) {
      setError(result.message);
      return;
    }

    onApply(result.dates);
  };

  return createPortal(
    <div
      className="export-dialog-backdrop document-dates-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        aria-describedby="document-dates-description"
        aria-labelledby="document-dates-title"
        aria-modal="true"
        className="export-dialog document-dates-dialog"
        role="dialog"
        onKeyDown={trapFocus}
      >
        <header>
          <span aria-hidden="true" className="export-dialog__icon">
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
              <path d="M20.5 11.5V6.9a1.4 1.4 0 0 0-1.4-1.4H4.9a1.4 1.4 0 0 0-1.4 1.4v12.2a1.4 1.4 0 0 0 1.4 1.4h6.6" />
              <path d="M3.5 9.6h17" />
              <path d="M8 3.5v3.4" />
              <path d="M16 3.5v3.4" />
              <circle cx="17.4" cy="17.4" r="4.1" />
              <path d="M17.4 15.4v2.1l1.4 1" />
            </svg>
          </span>
          <div>
            <h2 id="document-dates-title">PDF dates</h2>
            <p id="document-dates-description">
              Choose the created and modified dates stored inside the PDF you download.
            </p>
          </div>
          <button aria-label="Close PDF dates dialog" type="button" onClick={onCancel}>
            {"×"}
          </button>
        </header>
        <div className="document-dates-dialog__fields">
          <label>
            Created
            <input
              ref={creationInputRef}
              step="60"
              type="datetime-local"
              value={fields.creationDate}
              onChange={(event) => {
                const creationDate = event.currentTarget.value;
                setError(undefined);
                setFields((current) => ({ ...current, creationDate }));
              }}
            />
          </label>
          <label>
            Modified
            <input
              step="60"
              type="datetime-local"
              value={fields.modificationDate}
              onChange={(event) => {
                const modificationDate = event.currentTarget.value;
                setError(undefined);
                setFields((current) => ({ ...current, modificationDate }));
              }}
            />
          </label>
        </div>
        <p className="document-dates-dialog__note">
          Dates use this device&apos;s time zone and are written into the downloaded file. Clear a
          field to keep the date the PDF already carries.
        </p>
        {error === undefined ? null : (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        <footer>
          <button
            type="button"
            onClick={() => {
              setError(undefined);
              setFields(fieldsFrom(sourceDocumentDates));
            }}
          >
            Restore original dates
          </button>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" onClick={apply}>
            Apply dates
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
};
