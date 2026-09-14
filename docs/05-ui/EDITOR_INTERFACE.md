# NestlyPDF Editor Interface

## Purpose

This document defines the final editor layout and interaction model.

The document is the application. Every control exists to help the user complete the PDF quickly.

## Primary layout

Recommended hierarchy:

```text
Application header, when present
Sticky main editor toolbar
Compact floating selected-element inspector, when selected
Scrollable PDF editor viewport
Compact document status region
```

The PDF canvas and overlay share one aligned page frame within the viewport.

## Application header

The header should be minimal.

Possible contents:

- NestlyPDF wordmark;
- local file name;
- current document status;
- optional help/shortcuts entry.

Do not duplicate the full editor toolbar in the header.

## Sticky main toolbar

The toolbar remains visible while the editor viewport scrolls.

It must:

- sit above PDF content;
- preserve a stable height;
- avoid covering the page unexpectedly;
- remain keyboard navigable;
- adapt through horizontal scrolling, grouping, or compact labels on narrow layouts.

### Logical groups

#### File

- Open local PDF
- Download edited PDF

#### Edit

- Undo
- Redo
- Copy
- Paste

#### Insert and tools

- Select
- Text
- Whiteout
- Image
- Signature
- Initials
- Checkmark
- Cross
- Date

#### View

- Zoom out
- Zoom value
- Zoom in
- Reset zoom
- Fit width

#### Pages

- Previous page
- Current page / total pages
- Next page

The toolbar may visually reorganize, but these logical groups must remain understandable.

## Active tool

Every tool button must clearly indicate active state through:

- `aria-pressed` or equivalent semantics;
- primary background or outline;
- contrasting icon/text;
- optional small `Active` label in prototype/accessible layouts;
- visible keyboard focus independent from active state.

Users must never have to guess which tool is active.

## Tool policies

### One-shot tools

After one element is placed, return to Select:

- Text
- Image
- Signature
- Initials
- Checkmark
- Cross
- Date

### Persistent tool

Whiteout remains active after drawing so multiple regions can be covered efficiently.

### Select

Select is the neutral/default tool.

Clicking empty page or empty editor workspace while Select is active clears the current selection.

Tool changes:

- are presentation state;
- create no document history;
- do not mark dirty;
- do not invalidate Redo.

## PDF viewport

The editor viewport:

- owns scrolling;
- remains stable while the page zoom changes;
- contains the PDF page frame, canvas, and overlay;
- owns the non-passive modified-wheel zoom listener;
- fills available central space;
- uses a neutral background that distinguishes the page edge.

The page frame should cast a very subtle shadow and must not resemble a card-heavy dashboard.

## Zoom

Supported controls:

- toolbar buttons;
- zoom value/readout;
- fit width;
- reset;
- `Ctrl/Cmd + wheel` inside the editor viewport;
- `Ctrl/Cmd + +`;
- `Ctrl/Cmd + -`;
- `Ctrl/Cmd + 0`.

Browser page zoom must remain unchanged while the editor handles these shortcuts.

Modified-wheel gestures remain contained even at the viewer minimum and maximum zoom.

Zoom, fit width, and navigation never mark the document dirty or create history entries.

## Selected-element inspector

The inspector is compact, persistent while selected, and outside the PDF document flow.

Preferred placement:

- a horizontal floating bar below the toolbar; or
- a narrow right-side panel on large screens.

It must not:

- appear at the bottom of a long PDF page;
- reflow or shift the canvas;
- obscure a large portion of the PDF;
- disappear during scrolling.

### Shared controls

For every supported overlay:

- element type/status;
- Copy;
- Duplicate;
- Delete.

### Text controls

- font family;
- font size;
- future color/alignment only when explicitly implemented.

### Image/signature/initials controls

- dimensions when useful;
- no advanced image editing in the initial interface.

The inspector must not trap focus.

## Selection model

### Text

- new text enters edit mode automatically;
- single click existing text selects;
- double-click or Enter enters editing;
- Escape exits editing and keeps selection;
- click outside commits/exits and applies normal deselection policy;
- Delete/Backspace deletes the selected element only when not editing text.

### Other overlays

- single click/tap selects;
- drag moves;
- corner handles resize;
- click empty space with Select active deselects.

### Borders

Unselected overlays have no decorative border.

Selected overlays display editor-only selection UI that is never exported.

## Layers

The right inspector always includes a page-specific Layer section while a document is open, independent of element selection. When no overlay is selected, the properties region shows document metadata while the current page layer list remains available.

For selected overlays, the inspector keeps tabs, element properties, and layers in separate fixed vertical regions. Property controls and layer rows scroll independently, so switching element types or tabs never shifts the Layers header.

- The top row is frontmost; lower rows render behind it.

- Bring to front, Move up, Move down, Send to back, and drag-and-drop use the same committed layer-order command.
- Reordering updates the canvas immediately, is undoable and redoable, and exports in the identical back-to-front drawing order.
- New, duplicated, and pasted overlays are inserted at the front of the current page stack.
- Layer order is session-only and never persists outside the active browser session.
- Layer Actions apply only to the current page. `Hide All` hides every current-page overlay in one undoable command; `Show All` restores them. Hidden overlays remain listed but are neither rendered nor exported.
- `Lock All` locks every current-page overlay in one undoable command; `Unlock All` restores editing. Locked overlays remain visible and export normally, may remain selected, but cannot be moved, resized, edited, or deleted.
- Mixed visibility and lock states are restored exactly by Undo and Redo. Hiding the selected overlay clears selection safely.

## Move and resize

- pointer gestures preview live;
- one completed gesture creates one history entry;
- Escape or pointer cancellation restores the starting state;
- no-op gestures create no history;
- selection remains after move/resize;
- text corner resize changes only the user-controlled bounds; font size changes only through the Style tab;
- images preserve aspect ratio during inspector and corner-handle resize;
- signatures and initials keep their current resize behavior;
- checkmarks and crosses preserve aspect ratio with corner handles;
- dates use text-like proportional resizing and font-size limits;
- whiteout supports rectangular resizing.

## Images

Image insertion uses only browser-local File APIs.

Supported file types:

- PNG;
- JPG;
- JPEG.

Workflow:

1. Activate Image.
2. Choose a supported local image file.
3. NestlyPDF validates and decodes the image in the browser.
4. The editor enters image placement mode.
5. Click the PDF page to place the image centered on that point.
6. The image is clamped inside the page and selected.

Images export as shown, including PNG transparency and JPG/JPEG images. Image data is session-only, participates in copy/paste and undo/redo through the shared overlay lifecycle, and is cleared when the document is closed or replaced.

Unsupported formats such as GIF, SVG, WebP, PDF-as-image, cropping, rotation, filters, opacity, and layer effects are intentionally out of scope.

## Annotations

Checkmark, Cross, and Date are fast one-shot annotation tools:

1. Activate the tool.
2. Click the PDF page.
3. NestlyPDF places one overlay, selects it, and returns to Select.

Checkmark and Cross render as transparent vector symbols, preserve aspect ratio during resize, and export as vector line artwork without relying on remote fonts or emoji glyphs.

Date captures today's local date at placement time in deterministic `MM/DD/YYYY` format. The captured value remains unchanged after placement; live updates, date pickers, time, timestamps, locale switching, rich formatting, rotation, and color controls are intentionally out of scope for this milestone.

Annotations support the shared overlay lifecycle: select, move, resize, duplicate, delete, session-local copy/paste, Undo/Redo, dirty-state tracking, current-page ownership, and export. Copying a Date preserves the captured date text, and pasting receives a new element ID on the current page using the existing bounded offset policy.

## Whiteout

Whiteout creation uses click-drag:

1. Activate Whiteout.
2. Pointer down starts preview.
3. Drag defines the rectangle in any direction.
4. Release commits a valid whiteout.
5. Tiny accidental drags are ignored.
6. Tool remains active.

Whiteout is always described as visual cover only, never secure redaction.

## Text controls

Initial supported standard fonts:

- Helvetica;
- Times Roman;
- Courier;
- Patrick Hand (bundled handwriting font).

Font changes update preview and export, preserve top-left anchoring, and are undoable.

Font size range: `8–96`.

## Copy and paste

Overlay clipboard shortcuts:

- `Ctrl/Cmd+C` — copy selected overlay;
- `Ctrl/Cmd+V` — paste copied overlay.

The overlay clipboard is session-local and application-owned.

Inside active text editing, native text copy/paste remains available and overlay shortcuts must not interfere.

Pasted overlays:

- receive a new ID;
- appear with a predictable bounded offset;
- are selected;
- create one undoable history entry;
- preserve image data and dimensions when the copied overlay is an image;
- preserve captured date text when the copied overlay is a Date;
- preserve checkmark and cross geometry without storing separate symbol assets.

## Undo and redo

Controls:

- sticky toolbar buttons;
- `Ctrl/Cmd+Z` — Undo;
- `Ctrl+Y` or `Ctrl/Cmd+Shift+Z` — Redo.

History includes all current output-changing overlay operations.

History does not include:

- selection;
- tool switching;
- zoom;
- page navigation;
- opening inspector controls;
- copy without paste;
- export itself.

## Status

Show a compact document state:

- `Unsaved changes`;
- `Downloaded`;
- `Exporting…`;
- recoverable error.

After export, the current revision becomes clean. Further edits become dirty again.

The status region also carries the desktop-only **PDF dates** action, at its trailing edge. It is a
document-level setting rather than an overlay tool, so it belongs beside document state and not in
the insert toolbar. Touch layouts hide it: Quick Edit keeps only the tools needed to complete a page
by hand.

## Dialogs

Signature and Initials dialogs:

- Draw;
- Type;
- Upload for Signature where supported;
- Clear;
- Accept;
- Cancel.

They must trap focus, support Escape, and restore focus.

The PDF dates dialog offers the created and modified dates stored inside the downloaded file,
prefilled from the open document, with a way back to the dates the file was opened with. An empty
field means the exported PDF keeps the date the source file already carried. Dates are entered and
shown in the viewer's own time zone.

Image selection uses a local file picker and validation state. Unsupported, unreadable, oversized, and corrupted image files must show friendly errors without leaving placement mode active.

## Responsive behavior

Desktop:

- full sticky toolbar;
- floating horizontal inspector or right-side inspector;
- generous viewport.

Tablet:

- toolbar groups may horizontally scroll;
- inspector wraps or becomes a compact sheet;
- touch targets increase.

Mobile:

- primary tools move to a bottom or compact sticky toolbar;
- secondary controls use drawers/sheets;
- inspector becomes a small bottom sheet or horizontally scrollable bar;
- PDF remains the largest visible region.

## Keyboard shortcuts

At minimum:

- Undo/Redo;
- Copy/Paste;
- Delete/Backspace selected element;
- Enter edit text;
- Escape exit/cancel/deselect according to context;
- viewer zoom shortcuts.

A shortcut help dialog may be added later.

## Explicitly avoid

- multiple stacked toolbars;
- inspector below the full canvas;
- floating windows scattered over the PDF;
- hidden essential actions;
- advanced controls for unsupported features;
- exported selection borders;
- browser-level zoom while using editor zoom;
- UI state stored in document history.

## Phone Quick Edit

Below `768px`, NestlyPDF uses a reduced **Quick Edit** layout. It keeps the PDF workspace dominant and exposes only Select, Text, Signature, Checkmark, Date, Image, Undo, Redo, Download, simple page navigation, and viewer zoom. A dismissible session-only notice directs users to desktop or tablet for layers, advanced formatting, and the complete toolset.

On an empty phone workspace while Select is active, a one-finger drag pans the zoomed document directly without creating history or changing dirty state. Two-finger gestures retain pinch zoom; overlay movement, resizing, whiteout placement, and text editing keep ownership of their own touch interactions.

The phone inspector is a two-state contextual bottom panel: collapsed when nothing is selected and open for a selected overlay. It intentionally omits desktop inspector tabs, Layers, ordering, font family, typography controls beyond Text size and color, and precise geometry controls. Existing Whiteout, Initials, and Cross overlays remain viewable, movable where supported, and deletable, with an explanation that advanced editing is available on desktop or tablet. Tablet and desktop retain the full editor.
