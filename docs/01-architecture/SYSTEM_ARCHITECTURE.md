# System Architecture

## Architecture style

A client-only layered application with explicit ports and adapters.

```text
Presentation Layer
- React components
- Responsive layout
- Keyboard and touch interaction

Application Layer
- OpenDocument
- AddElement
- UpdateElement
- OrganizePages
- ExportDocument
- CloseDocument

Domain Layer
- DocumentSession
- PageModel
- EditorElement
- EditorOperation
- History
- Value objects and invariants

Infrastructure Layer
- PDF.js rendering adapter
- PDF export adapter
- Document import adapter (.docx to PDF conversion)
- Browser file picker adapter
- Browser download adapter
- Browser lifecycle adapter
- Web Worker adapters
```

## Document import boundary

Non-PDF sources are converted to PDF before they enter the editor. The
application defines a `DocumentImportGateway` port; the infrastructure adapter
converts a `.docx` file to PDF bytes entirely in the browser (see
`docs/07-decisions/ADR-006-DOCUMENT-IMPORT-CONVERSION.md`). Once converted, the
session is an ordinary PDF session and no import-specific code runs.

## Dependency rule

The domain layer depends on nothing outside itself. Application use cases depend on domain abstractions. Infrastructure implements ports defined by inner layers. UI invokes application use cases.

## Suggested source layout

```text
src/
├── domain/
├── application/
├── ports/
├── infrastructure/
├── presentation/
├── workers/
└── shared/
```

## No backend requirement

The production editor does not require an application API, database, user account, or document storage service.

Static hosting is sufficient.
