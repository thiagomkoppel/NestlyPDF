# Product Requirements

## Functional requirements

### Document opening

- Open a PDF from local storage.
- Open a `.docx` file from local storage; convert it to PDF in the browser before
  editing (ADR-006).
- Support drag-and-drop on desktop.
- Support file picker on desktop and mobile.
- Reject unsupported or unreadable files with a clear message, including legacy
  `.doc` files.
- Show a conversion progress state while a `.docx` file is being converted.
- Never upload the selected file.

### Editing

- Add and edit text boxes.
- Add the current date.
- Add checkmarks and crosses.
- Draw, type, or import a signature.
- Add initials.
- Add an image.
- Add a whiteout rectangle.
- Add replacement text over whiteout.
- Move, resize, rotate, duplicate, and delete supported elements.
- Undo and redo supported operations.

### Existing forms

- Detect existing AcroForm fields.
- Allow values to be entered into supported field types.
- Preserve field values in the exported PDF.
- Report unsupported field behavior honestly.

### Pages

- Rotate pages.
- Reorder pages.
- Delete pages.
- Duplicate pages.
- Insert pages from another PDF.
- Export selected pages.

### Export

- Generate a valid downloadable PDF.
- Preserve original page dimensions and orientation.
- Apply editor elements at correct PDF coordinates.
- Preserve unmodified original content.
- Use a sensible filename derived locally from the original filename.

### Session

- Keep document bytes and edit state local to the browser.
- Warn before discarding unsaved changes.
- Clear document references when the user closes the document.
- Do not provide cloud recovery or document history.

## Non-functional requirements

- Strict privacy by architecture.
- Responsive UI.
- Keyboard accessibility.
- Graceful handling of large or unsupported files.
- Deterministic editor behavior.
- Reliable undo and redo.
- Modular PDF engine.
- Automated tests for critical workflows.
