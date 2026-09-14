# NestlyPDF Landing Page

## Purpose

The landing page has one primary job:

> Help the user open a local PDF immediately and confidently.

It must not become a long marketing site or dashboard.

## Product promise

Primary heading:

> Edit PDFs in seconds.

Supporting message:

> Your files stay in your browser.

The page should communicate:

- no upload;
- no account;
- free to use;
- session-only document handling.

## Information hierarchy

1. NestlyPDF identity
2. Clear product promise
3. Large drag-and-drop interaction
4. Privacy reassurance
5. Minimal supporting details

Avoid testimonials, pricing tables, blog cards, comparison grids, and oversized navigation.

## Desktop layout

Recommended structure:

```text
Header: NestlyPDF logo/name

Hero heading
Supporting privacy message

Large interactive drop zone

Short reassurance row:
Private · Browser-only · No account · Free

Minimal footer links
```

The drop zone must be the dominant interactive object.

## Entire drop zone is interactive

The full drop zone must:

- accept drag-and-drop;
- open the file picker on click;
- be keyboard activatable;
- have a clear accessible name;
- support focus styling;
- not require clicking a small nested button.

The nested **Choose PDF** button may remain as a secondary explicit affordance.

## Drop-zone states

### Idle

Visual behavior:

- large rounded surface;
- subtle dashed or softly segmented border;
- centered document/PDF icon;
- calm low-opacity primary glow;
- concise title and support text;
- prominent Choose PDF button.

Suggested copy:

> Drop your PDF here

> or choose a file from your device

Supporting line:

> Your document never leaves this browser session.

### Keyboard focus

- visible focus ring around the complete drop zone;
- no layout shift;
- Enter and Space open the file picker;
- screen reader announces accepted file type.

### Drag enter

When a valid drag first enters the page:

- drop zone brightens;
- border becomes primary;
- glow intensifies slightly;
- surface lifts by approximately `2–4px`;
- icon rises or tilts subtly;
- message becomes `Release to open your PDF`.

The response should be immediate but calm.

### Drag over

While the pointer remains over the drop zone:

- keep the elevated state stable;
- optionally render a subtle cursor-following radial highlight;
- do not run distracting particles continuously;
- do not obscure text;
- keep motion under the reduced-motion policy.

### Drag leave

- return smoothly to idle within `150–200ms`;
- avoid flickering when moving over child elements;
- use drag-depth tracking or equivalent logic.

### Valid drop

Suggested sequence:

1. Prevent browser navigation.
2. Validate the file locally.
3. Show a brief landing response: icon/card settles toward center.
4. Replace idle content with `Opening your PDF…`.
5. Show progress/spinner without delaying actual work.
6. Transition into the editor without a full-screen visual flash.

The file-opening operation must start immediately. Animation must never become a blocking preloader.

### Loading

- stable drop-zone dimensions;
- progress indicator and plain-language message;
- file name may be shown only locally and must not enter telemetry;
- no layout jump;
- prevent duplicate opens while loading;
- provide cancellation only if the current architecture can do so safely.

### Success transition

- crossfade or shared-surface transition into the editor;
- total transition target: approximately `180–300ms`;
- keep the editor usable as soon as the PDF is ready;
- avoid celebratory effects.

## Word document import

The landing page also accepts a single `.docx` file through the same drop zone
and file picker. The file input `accept` list includes `.pdf` and `.docx`.

- When a `.docx` file is opened, the app converts it to a PDF in the browser
  before entering the editor (ADR-006).
- The loading state shows a `Converting your document…` message during
  conversion, then continues with the normal opening sequence.
- Legacy binary `.doc` files are rejected on the landing page:

  > Word 97-2003 `.doc` files can't be opened here. Save the file as `.docx` or
  > PDF and try again.

- Conversion failure keeps the user on the landing page with a concise,
  non-technical error and a ready-to-retry drop zone.

### Invalid file

Examples:

- wrong extension/type;
- malformed PDF;
- unreadable file;
- multiple files;
- unsupported encrypted/password-protected PDF;
- legacy `.doc` file;
- `.docx` file that could not be converted.

Behavior:

- keep the user on the landing page;
- show a concise error inside or immediately below the drop zone;
- use icon, text, and color;
- optional small horizontal shake: maximum `4–6px`, one cycle;
- return to ready state without requiring a page reload;
- do not expose stack traces or raw library errors.

Suggested copy:

> That file could not be opened as a PDF. Choose another file and try again.

## Install onboarding

Show a calm **Install NestlyPDF** card directly below the PDF upload surface and before the privacy reassurance row whenever the app is not installed. It explains the local native-app benefit. When a supported browser exposes a genuine install path, its action launches the Chromium browser prompt or the iOS Safari Add to Home Screen instructions. The action is absent when no accurate install action is available; the card itself is absent only in standalone mode or after installation.

### Multiple files

NestlyPDF initially accepts one PDF at a time.

Suggested copy:

> Open one PDF at a time.

Do not silently choose the first file.

### Password-protected PDF

Until password entry is supported:

> This PDF is password protected and cannot be opened yet.

Do not imply that the password can be removed.

### Oversized or resource-heavy PDF

If the app enforces a practical limit or fails gracefully:

- explain that the document is too large for the current browser session;
- avoid claiming an arbitrary universal file-size maximum unless enforced;
- keep the original file untouched.

## Visual style

- warm off-white application background;
- large white drop zone;
- low-opacity purple/indigo glow;
- subtle document/page texture at `2–3%` opacity;
- generous whitespace;
- no stock photography;
- no fake cloud illustrations.

## Signature micro-interaction

The drag-and-drop interaction is a defining NestlyPDF experience.

Preferred motion:

- idle icon floating movement: optional and extremely subtle;
- drag enter lift: `160–200ms`;
- glow increase: `180ms`;
- drop settle: `180–240ms`;
- loading transition: immediate with no artificial delay.

Reduced motion:

- remove floating, tilt, ripple, and scale effects;
- retain border, color, text, and progress changes.

## Mobile

- drop zone remains large and centered;
- minimum touch height should comfortably exceed `180px`;
- primary button spans most of the drop-zone width;
- drag copy remains, but file-picker use is expected to dominate;
- privacy message stays visible without requiring deep scrolling.

## Accessibility

- semantic button or label/input relationship;
- drag-and-drop is never the only method;
- errors announced through an appropriate live region;
- loading state announced without repetitive updates;
- full keyboard operation;
- focus is restored appropriately after errors;
- contrast meets WCAG AA.

## Privacy copy

Use accurate language:

- `Your PDF stays in this browser session.`
- `Word documents are converted to PDF in this browser session.`
- `Nothing is uploaded to NestlyPDF.`
- `Closing the document or tab may discard your edits.`

Avoid unverifiable claims such as cryptographic deletion from memory.

## Explicitly avoid

- account/sign-in prompts;
- recent-files lists;
- cloud import buttons;
- pricing banners;
- subscription upsells;
- testimonial walls;
- large feature grids before the drop zone;
- automatic upload wording;
- animations that delay file opening.

## Phone landing

Below 768px, the landing page uses a native-app entry layout: a compact NestlyPDF header with a keyboard-accessible menu for Privacy and GitHub, a concise Private & Secure hero, picker-first Open a PDF card, three trust cards, and a privacy footer. The same local staged opening workflow is used for picker and supported drag-and-drop input. Desktop and tablet landing layouts remain unchanged.
