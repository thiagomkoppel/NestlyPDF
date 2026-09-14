# AGENTS.md

This file is the primary operating contract for every coding agent working in this repository.

## 1. Product mission

Build a free, private, browser-based PDF utility for everyday tasks:

- open a local PDF;
- fill existing form fields;
- place text anywhere;
- add dates, checkmarks, crosses, initials, signatures, and images;
- make visual corrections using whiteout and replacement text;
- rotate, reorder, duplicate, insert, extract, and delete pages;
- download the completed PDF;
- discard all document data when the session ends.

Do not turn the product into a cloud document platform, account system, collaboration suite, or subscription product.

## 2. Non-negotiable product rules

1. PDF bytes must not be uploaded to an application server.
2. Document contents must not be included in logs, analytics, crash reports, URLs, or browser history.
3. No user account is required.
4. No watermark or artificial export limitation is allowed.
5. The original PDF must remain unchanged in memory. Edits are represented as operations or overlay elements until export.
6. Closing or refreshing the page may discard the document. The application must clearly warn about unsaved work.
7. Visual whiteout is not secure redaction and must never be described as such.
8. Existing arbitrary PDF text editing is outside the initial scope unless explicitly approved in a later architectural decision.
9. The approved NestlyPDF logo is immutable: every product route, viewport, and state uses the repository mark with the white NestlyPDF wordmark. Do not recolor, resize, restyle, or replace it as part of unrelated UI work.

## 3. Development method

All production behavior must be developed using test-driven development:

1. Write or update a failing test that describes the desired behavior.
2. Implement the smallest change that makes the test pass.
3. Refactor while keeping all tests green.
4. Run the relevant unit, integration, component, and end-to-end tests.
5. Update documentation when behavior, architecture, public interfaces, or constraints change.

A change is incomplete when it adds behavior without tests.

Exceptions are limited to:

- documentation-only changes;
- formatting-only changes;
- generated assets;
- build configuration that cannot reasonably be exercised through an automated test.

Any exception must be stated in the completion report.

## 4. Architecture rules

### 4.1 Dependency direction

Dependencies must point inward:

```text
UI / Browser Adapters
        ↓
Application Use Cases
        ↓
Domain Model
        ↑
Infrastructure Adapters
```

The domain layer must not import React, PDF.js, pdf-lib, browser APIs, storage APIs, or framework code.

### 4.2 Required boundaries

The following concepts must be isolated behind interfaces:

- PDF loading and parsing;
- PDF rendering;
- PDF export;
- page manipulation;
- signature generation;
- file selection and download;
- browser lifecycle and unload warnings;
- optional temporary session persistence;
- time and ID generation.

### 4.3 Encapsulation

- Do not expose mutable collections from domain objects.
- Do not allow UI components to mutate document state directly.
- State changes must occur through commands, use cases, or domain methods.
- Invariants must be enforced where data enters the domain.
- Avoid public setters.
- Prefer value objects for coordinates, dimensions, colors, page references, and identifiers.

### 4.4 Decoupling

- PDF.js may render but must not become the domain model.
- pdf-lib may export but must not be referenced throughout the UI.
- React components must not construct or manipulate raw PDF objects.
- Browser APIs must be wrapped in adapters.
- The editor must be testable without opening a real PDF viewer.

### 4.5 State model

The editor state must be deterministic and replayable.

Prefer commands such as:

- `AddElement`
- `MoveElement`
- `ResizeElement`
- `UpdateText`
- `DeleteElement`
- `RotatePage`
- `ReorderPage`
- `DeletePage`

Undo and redo must operate on explicit state transitions. Avoid storing closures as history entries.

## 5. Code quality rules

- Use TypeScript strict mode.
- Do not use `any` without an inline justification.
- Prefer small modules with one responsibility.
- Prefer composition over inheritance.
- Avoid global mutable state.
- Avoid hidden side effects.
- Validate external data at boundaries.
- Return typed errors or result objects for expected failures.
- Do not silently catch errors.
- Do not duplicate business rules across UI components.
- Public APIs must be documented through names, types, and focused comments where intent is not obvious.
- Comments explain why, not what.
- Remove dead code rather than commenting it out.

## 6. Testing rules

Required test layers:

### Unit tests

Cover:

- domain invariants;
- editor commands;
- coordinate conversion;
- page transformations;
- element validation;
- undo and redo;
- serialization of editor state;
- export planning;
- privacy-sensitive utilities.

### Integration tests

Cover:

- loading PDF bytes through the PDF adapter;
- rendering page metadata;
- applying editor elements during export;
- preserving original page count and dimensions;
- page reorder and deletion;
- interactive form filling;
- browser file download adapter.

### Component tests

Cover:

- toolbar interactions;
- property panel behavior;
- mobile bottom sheets;
- keyboard navigation;
- signature dialog;
- unsaved-work warning;
- page thumbnail selection.

### End-to-end tests

Cover the critical user journeys:

1. Open PDF → add text → download.
2. Open PDF → sign → add date → download.
3. Open PDF → fill form fields → download.
4. Open PDF → rotate and reorder pages → download.
5. Open PDF → make visual correction → download.
6. Attempt to close with unsaved changes → warning appears.
7. Close session → no document remains recoverable from application storage.

### Test fixtures

Maintain small, purpose-built PDF fixtures:

- one-page blank PDF;
- multi-page PDF with mixed orientations;
- interactive AcroForm PDF;
- scanned image-only PDF;
- PDF with embedded fonts;
- PDF with rotation metadata;
- malformed or unsupported PDF.

Do not use confidential or real user documents as fixtures.

## 7. Privacy and security rules

- Never send document bytes over the network.
- Configure the application so document bytes cannot be captured by analytics or error reporting.
- Never put filenames or extracted text into telemetry.
- Avoid third-party scripts on the editor route.
- Use a restrictive Content Security Policy.
- Treat PDFs as untrusted input.
- Disable or ignore embedded JavaScript, launch actions, and external file actions.
- Prevent object URLs from being retained longer than necessary.
- Revoke object URLs during cleanup.
- Clear in-memory document references when the document is closed.
- Do not claim cryptographic deletion from memory; describe the behavior accurately as session disposal.

## 8. Accessibility rules

- All tools must be keyboard accessible.
- Focus must remain visible.
- Buttons must have accessible names.
- Color must not be the only status indicator.
- Dialogs must trap focus and restore it when closed.
- Touch targets must be appropriately sized.
- Zoom must not break layout or prevent access to controls.
- Screen-reader users must be able to identify the current page, selected element, tool, and unsaved state.

## 9. Performance rules

- Heavy PDF parsing and export work should run in Web Workers where practical.
- Do not render every page at full resolution simultaneously.
- Use thumbnail and viewport virtualization.
- Release canvases and object URLs when pages are no longer needed.
- Large-document failure must be graceful and understandable.
- Avoid unnecessary copies of full PDF byte arrays.

## 10. Scope discipline

Before implementing a feature, verify that it appears in the current phase plan.

Do not add:

- authentication;
- cloud storage;
- collaboration;
- server-side processing;
- email delivery;
- signature-request workflows;
- paid plans;
- OCR;
- true secure redaction;
- arbitrary original-text editing;
- PSD support;
- AI features;

unless a new approved decision record explicitly changes scope.

In scope by approved decision record:

- `.docx` import via in-browser conversion to PDF (ADR-006). Legacy binary
  `.doc` remains out of scope.

## 11. Required workflow for each task

1. Read `README.md`, `PROJECT_STATUS.md`, and `docs/DOCUMENT_INDEX.md`.
2. Read the relevant product, architecture, domain, and security documents.
3. Identify affected invariants and boundaries.
4. Add failing tests first.
5. Implement the smallest cohesive change.
6. Refactor for clarity and separation.
7. Run typecheck, lint, unit tests, integration tests, and relevant end-to-end tests.
8. Update documentation and `PROJECT_STATUS.md`.
9. Provide a completion report.

For any UI, interaction, or workflow implementation, the following documents are mandatory reading:

- DESIGN_SYSTEM.md
- LANDING_PAGE.md
- EDITOR_INTERFACE.md
- USER_EXPERIENCE.md
- RESPONSIVE_DESIGN.md
- USER_WARNINGS.md

## 12. Completion report format

Every completed task must report:

```text
Summary:
- What changed.

Tests added or updated:
- Test names or areas.

Verification:
- typecheck
- lint
- unit tests
- integration tests
- end-to-end tests, when applicable
- production build

Architecture and security impact:
- Boundaries or invariants affected.

Documentation updated:
- Files changed.

Not changed:
- Explicitly state important adjacent areas that were not modified.

Remaining risks or follow-ups:
- Known limitations or next work.
```

Do not claim a command passed unless it was actually run successfully.
