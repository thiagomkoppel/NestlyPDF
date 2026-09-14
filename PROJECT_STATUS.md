# Project Status

## Current phase

Phase 0 - Architecture and technical proof of concept.

## Product status

Repository foundation initialized. The project has a Vite, React, and TypeScript static client scaffold with strict TypeScript, ESLint, Prettier, Vitest, React Testing Library, jsdom, Playwright configuration, CI workflow, and an accessible application shell.

Implemented proof-of-concept behavior:

- open one local PDF through browser File APIs;
- provide a manifest, mark-only install icons, standalone presentation, safe-area layout, explicit session-only iOS/Chromium installation guidance, and a non-intrusive landing install card before installation, with its install action shown only when a real platform install action is available, without a service worker or document cache;
- run a browser-local PDF.js renderer preflight before the application routes mount; only a confirmed probe failure blocks local PDF selection, while indeterminate outcomes preserve the existing pre-open safety guard;
- validate basic PDF file properties and signature bytes;
- parse PDF page metadata with `pdf-lib` behind an infrastructure adapter;
- render the active PDF page with PDF.js on a real canvas;
- size the canvas backing store with device pixel ratio while keeping CSS dimensions in page-space scale;
- keep text and whiteout overlays aligned over the rendered canvas during zoom;
- add temporary text overlay elements as one-shot placements, with bounded font-size changes in the Style tab, user-controlled canvas bounds, and bundled Patrick Hand handwriting-font support in the editor and exported PDFs;
- add temporary whiteout visual cover rectangles by click-drag creation;
- add drawn, typed, and uploaded signature overlays as one-shot placements;
- remove the paper behind an uploaded PNG/JPG signature entirely in the browser, keeping only the ink on a transparent background, trimmed to the strokes, with a preview and a toggle to keep the original image;
- add drawn and typed initials overlays as one-shot placements;
- add PNG, JPG, and JPEG image overlays through a browser-local file picker and click-to-place workflow;
- add checkmark, cross, and captured-date annotation overlays as one-shot placements;
- select, move, resize, duplicate, delete, and session-local copy/paste text, whiteout, signature, initials, image, checkmark, cross, and date overlays;
- reorder current-page overlay layers through the inspector with canvas/export synchronization and Undo/Redo;
- hide/show and lock/unlock all current-page overlays through Layer Actions; hidden layers remain session-local list entries but do not render or export, while locked layers remain visible/exportable and reject editing commands; bulk changes are individually undoable;
- undo and redo overlay add, paste, duplicate, delete, move, resize, text/date font-size, text/date resize, and image/annotation lifecycle commands with revision-based dirty state;
- export the current PDF with text, whiteout, signature, initials, image, checkmark, cross, and date overlays embedded;
- preserve original page count, page dimensions, page order, and untouched content during export;
- download the edited PDF through a browser adapter using a temporary object URL;
- offer Original Size export plus optional browser-local compressed export, which rasterizes the final edited pages sequentially and refuses output that is not smaller;
- choose the created and modified dates stored inside the downloaded PDF through a desktop-only PDF dates tool in the editor status bar; exporting no longer rewrites the Info dictionary with today's date or a pdf-lib producer, so an untouched date stays exactly as the opened file carried it;
- keep the editor session open after successful download;
- mark the current session clean after successful download;
- preserve the current session when export fails.

Overlay placement is anchored to the visible page area (the crop box clipped to the media box, the same area PDF.js renders) rather than to the media box. Page metadata reports that visible size, so the overlay grid covers exactly what the reader draws, and export writes overlays into the same space. Cropped pages, and pages whose media box does not start at the origin, previously shifted every exported overlay by the difference between the two top edges. Page rotation metadata is still reported without swapping the reported page dimensions.

Uploaded signature background removal runs on an offscreen canvas: the paper brightness is estimated on a local grid so uneven phone-photo lighting is followed rather than thresholded globally, ink is separated with a soft ramp and un-mixed from the paper colour so stroke edges carry no grey halo, faint islands that never reach solid ink are dropped as grain, and the result is cropped to the signature. Images whose paper cannot be told apart from the ink are kept exactly as uploaded and reported as such in the dialog.

Document dates: opening a PDF now reads its Info dictionary CreationDate and ModDate without rewriting them, the session carries those dates as the values the next export will write, and the status-bar PDF dates tool replaces them. Clearing a field leaves that date exactly as the source file stored it. The tool is desktop-only; touch layouts keep the Quick Edit tool set. Date choices are not part of the undo history, but they do mark the session dirty so the unsaved-work warning still applies.

Not implemented: form filling, page organization, OCR, secure redaction, native editing of existing PDF text, arbitrary symbol picker, stickers, emojis, date picker, custom annotation colors, annotation rotation, image cropping, image rotation, image filters, image opacity, persistence, backend services.

UI redesign progress: the shared presentation tokens and branded, browser-local landing experience are complete. A public `/privacy` route now documents the local-only processing model, session-only lifetime, hosting-metadata caveat, and whiteout limitation. The landing page now provides accessible click-to-browse and drag-and-drop opening states, local processing messaging, reduced-motion support, recoverable opening errors, and a phone-only native-app landing layout with a compact menu and picker-first upload card. Part 2 of the UI redesign now provides the full-viewport Compact Professional desktop editor shell: a compact application header, grouped command toolbar, collapsible rail with browser-local PDF.js page thumbnails, dominant central PDF viewport, contextual right inspector, and compact status/navigation bar. Page selection uses stable page IDs, and Previous, Next, direct thumbnail selection, Fit Page, Fit Width, and 100% manual view synchronize the rendered page and visible indicators without entering history or changing dirty state. Signature and Initials dialogs now use the same dark compact design language. New text, date, typed/drawn signature or initials, checkmark, and cross overlays render and export black by default. Editor routes without an active in-memory document now redirect directly to the landing page, preserving the session-only privacy model. Application startup now shows a root-owned compatibility screen for at least five seconds while the real local PDF.js probe runs; no landing or unsupported page is rendered while checking. Phone Quick Edit supports direct one-finger panning on empty workspace space while preserving overlay manipulation and two-finger pinch zoom. Tablet now uses one simplified Quick Edit presentation in both orientations, including the existing dismissible session-only Quick Edit notice, selected from the live visual viewport, orientation, shortest edge, and touch capability rather than width alone. It keeps the PDF dominant with a compact header, primary tool strip, page/zoom bar, temporary Pages drawer, and temporary contextual inspector; secondary tools stay behind More rather than permanently consuming tablet workspace. Touch editor sessions now offer a reversible Automatic/Light Mode/Full Quality performance profile: low-capacity touch devices use a 1x canvas and thumbnail backing scale with editor-only visual effects reduced, while geometry, editing behavior, export, and session privacy remain unchanged. Small-phone responsive hardening now keeps startup content, the compact editor brand, critical header actions, the full phone tool strip, and the More sheet within the viewport from 320x568 through 430x932 without horizontal overflow; the 768x1024 tablet layout remains unchanged.

## Current objective

Prove that the application can safely and reliably:

1. open a local PDF without uploading it; Done for proof of concept.
2. add text, visual whiteout, signatures, initials, images, checkmarks, crosses, and dates as overlay elements; Done for current page.
3. export a valid PDF containing those additions; Done for text, whiteout, signature, initials, image, checkmark, cross, and date overlays.
4. discard the document and editing state when the session ends; Done for intentional navigation, replacement, browser history, and browser-native unload protection.

## Blocking decisions

- Live PDF rendering adapter and visual fidelity checks.
- Export coordinate behavior for rotated pages beyond the current metadata-preserving baseline.
- Undo/redo command history model.
- Larger fixture set and PDF complexity limits.

## Recent assessment

Live PDF rendering now uses PDF.js behind an infrastructure boundary. The editor renders the active page to a canvas, aligns overlays in CSS page units, supports temporary signature, initials, image, checkmark, cross, and date overlays, and keeps export coordinates independent from zoom and device pixel ratio.

Offline shell work: production builds now generate a NestlyPDF-only service worker that precaches the application shell, PDF.js worker, and Patrick Hand font while excluding user documents and editor session data. Each build exposes package-version, SHA, branch, and mode identity in the landing footer and PWA Diagnostics; diagnostics can compare that app identity with active, waiting, and installing worker metadata without reading document or user data. Cloudflare static-assets deployment now serves `/index.html` for unmatched browser navigation routes while preserving exact static asset responses.
