# Documentation Index

## Repository

### `REPOSITORY_ASSESSMENT.md`

Assesses the repository baseline, current implementation state, risks, and recommended remediation priorities.

## Product

### `00-product/PRODUCT_VISION.md`

Defines NestlyPDF's product purpose, target users, core promise, and intentionally narrow browser-only direction.

### `00-product/PRODUCT_REQUIREMENTS.md`

Defines functional and non-functional requirements for opening, editing, exporting, privacy, and usability.

### `00-product/MVP_SCOPE.md`

Defines what is included and excluded from the MVP so the product remains focused on quick everyday PDF edits.

### `00-product/USER_FLOWS.md`

Defines the primary user journeys from opening a local PDF through editing, downloading, and leaving the session.

## Architecture

### `01-architecture/SYSTEM_ARCHITECTURE.md`

Defines the major system layers, dependency direction, browser-only runtime, and external library boundaries.

### `01-architecture/PDF_ENGINE_ARCHITECTURE.md`

Defines how PDF.js rendering and `pdf-lib` export are isolated behind application-facing adapters.

### `01-architecture/EDITOR_STATE_ARCHITECTURE.md`

Defines deterministic editor state, command-driven mutations, history behavior, and export snapshot requirements.

### `01-architecture/FILE_LIFECYCLE.md`

Defines the lifetime of original PDF bytes, rendered resources, edited state, export artifacts, and cleanup.

## Domain

### `02-domain/DOMAIN_MODEL.md`

Defines the core document, page, overlay element, geometry, selection, and value concepts.

### `02-domain/DOCUMENT_SESSION.md`

Defines the active browser-memory document session and its lifecycle constraints.

### `02-domain/EDITOR_OPERATIONS.md`

Defines deterministic editor operations and the distinction between low-level UI events and committed mutations.

### `02-domain/INVARIANTS.md`

Defines rules that must remain true across every valid document session transition.

## Engineering

### `03-engineering/PROJECT_PHILOSOPHY.md`

Defines the engineering values that keep NestlyPDF local, small, understandable, and honest about limitations.

### `03-engineering/CODING_STANDARDS.md`

Defines implementation conventions, boundaries, naming, TypeScript expectations, and maintainability rules.

### `03-engineering/TESTING_STRATEGY.md`

Defines TDD expectations, the test pyramid, privacy checks, rendering/export coverage, and undo/redo coverage.

### `03-engineering/PDF_EXPORT_COMPRESSION.md`

Defines browser-local optional PDF compression, its rasterization tradeoff, size guard, cancellation, and privacy boundary.

### `03-engineering/ERROR_HANDLING.md`

Defines typed failure handling, application error mapping, user-safe messages, and recovery behavior.

### `03-engineering/COMMAND_PATTERN.md`

Defines the reversible command contract, application boundary, transaction rules, and command-coalescing policy.

### `03-engineering/COMMAND_HISTORY.md`

Defines undo/redo stack behavior, history limits, revision-aware dirty state, resets, memory, and privacy rules.

### `03-engineering/UNDO_REDO.md`

Defines user-facing Undo/Redo behavior, shortcuts, toolbar states, supported operations, and interaction expectations.

## Security

### `04-security/PRIVACY_MODEL.md`

Defines the local-only privacy promise and prohibited transmission or persistence of document data.

### `PRIVACY_POLICY.md`

Defines the public policy language for the browser-local implementation, session lifetime, local exports, hosting metadata, and whiteout limitation.

### `04-security/FILE_SECURITY.md`

Defines safe file validation, browser-memory handling, download behavior, and resource cleanup.

### `04-security/THREAT_MODEL.md`

Identifies relevant threats and mitigations for a browser-only PDF editing application.

### `04-security/SESSION_LIFECYCLE.md`

Defines session creation, dirty-state warnings, replacement, disposal, and unload behavior.

## UI

### `05-ui/ACCESSIBILITY.md`

Defines keyboard, focus, semantic, contrast, status-announcement, and touch-accessibility expectations.

### `05-ui/DESIGN_SYSTEM.md`

Defines the visual language of NestlyPDF, including colors, typography, spacing, buttons, icons, and motion.

### `05-ui/LANDING_PAGE.md`

Defines the entry page, drag-and-drop workflow, privacy messaging, and visual hierarchy.

### `05-ui/EDITOR_INTERFACE.md`

Defines the editor layout, tools, inspector, selection/editing model, zoom, image insertion, overlays, clipboard, and Undo/Redo controls.

### `05-ui/USER_EXPERIENCE.md`

Defines the overall “Open → Edit → Download” journey and principles for keeping workflows fast and understandable.

### `05-ui/RESPONSIVE_DESIGN.md`

Defines desktop, tablet, and mobile behavior, including toolbar adaptation and touch targets.

### `05-ui/USER_WARNINGS.md`

Defines discard confirmations, browser unload behavior, dirty-session warnings, and required wording principles.

## Delivery

### `06-delivery/PHASE_0_PLAN.md`

Defines the initial repository and architecture foundation milestone.

### `06-delivery/MVP_IMPLEMENTATION_PLAN.md`

Defines the staged implementation sequence for delivering the browser-only editor MVP.

### `06-delivery/RELEASE_CRITERIA.md`

Defines the functional, privacy, testing, accessibility, and quality gates required for release.

## Decisions

### `07-decisions/ADR-001-LOCAL_ONLY-PROCESSING.md`

Records the decision to keep PDF processing entirely in the browser.

### `07-decisions/ADR-002-OVERLAY-EDITING.md`

Records the decision to preserve original PDF content and model edits as exportable overlays.

### `07-decisions/ADR-003-PDF-ENGINE-BOUNDARY.md`

Records the decision to isolate PDF libraries behind explicit architecture boundaries.

### `07-decisions/ADR-004-VITE-REACT-STATIC-SPA.md`

Records the decision to use Vite, React, strict TypeScript, and static deployment.

### `07-decisions/ADR-005-COMMAND-HISTORY.md`

Records the decision to use application-owned, reversible, mergeable command history for Undo/Redo.

### `07-decisions/ADR-006-DOCUMENT-IMPORT-CONVERSION.md`

Records the decision to accept `.docx` files and convert them to PDF entirely in the browser at import time, and to reject legacy `.doc`.

## Roadmap

### `08-roadmap/BROWSER_COMPATIBILITY.md`

Defines NestlyPDF's supported-browser policy, required runtime capabilities, compatibility gate, and documented legacy-browser limitation.

### `08-roadmap/PWA.md`

Defines the installability-only PWA foundation and its explicit no-service-worker, no-document-cache privacy boundary.
