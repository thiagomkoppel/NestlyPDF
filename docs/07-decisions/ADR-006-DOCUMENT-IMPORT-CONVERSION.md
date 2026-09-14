# ADR-006: Word Document Import via Local Conversion

## Status

Accepted.

## Context

Users frequently need to fill, sign, or correct a document that they only have
as a Word file. Today the application accepts PDF only, so those users must find
another tool to produce a PDF first.

A server-side conversion service is not an option: ADR-001 keeps all document
processing in the browser. Legacy binary `.doc` (Word 97-2003) has no reliable
pure-browser converter. Modern `.docx` is an Office Open XML package that can be
rendered to DOM in the browser with existing libraries.

Two client-side conversion strategies were considered:

1. **Text-layout reconstruction** - map `.docx` structure to drawn PDF text.
   Produces small output with selectable text, but tables, columns, floats, and
   images degrade badly and the implementation is large.
2. **Rasterization** - render the `.docx` to a laid-out DOM and capture each page
   as an image embedded in a generated PDF. Reliable visual match; the output has
   no selectable or searchable text.

## Decision

The application will accept `.docx` files and convert them to PDF entirely in the
browser at import time, using the rasterization strategy.

- Conversion happens behind an application-owned `DocumentImportGateway` port
  (consistent with ADR-003). The infrastructure adapter renders the `.docx` to a
  hidden, off-viewport DOM container, then paginates each rendered section by
  measuring its line boxes: it estimates the page count the way a word processor
  packs pages and spreads the content evenly across that many pages, breaking
  only in the gaps between lines so a line is never split and no thin trailing
  page is emitted. Each page is captured as a raster image and assembled into a
  PDF through the existing `pdf-lib` infrastructure.
- The original `.docx` bytes and the scratch DOM container are released as soon
  as conversion finishes or fails.
- After conversion the session is an ordinary PDF session. The overlay editing
  model (ADR-002), export, and session lifecycle are unchanged.
- Legacy `.doc` files are rejected with a clear message that explains the
  browser-only limitation and suggests saving as `.docx` or PDF.

## Consequences

### Positive

- Word users can complete a document without a separate conversion tool.
- The privacy model is preserved: conversion is local, nothing is uploaded.
- Editing, export, and session code paths are untouched.

### Negative

- The converted PDF is a rasterized visual copy: text is not selectable or
  searchable, and complex layouts (tables, multi-column, floated images) may not
  match Word exactly.
- Pagination is reconstructed from the browser's own layout, which differs
  slightly from Word's line metrics; page count and page breaks are matched
  closely (verified against a real multi-page document) but not guaranteed
  identical for every document. A single `PAGE_PACK_TARGET` constant tunes it.
- A table taller than one page is not split across pages.
- Conversion runs on the main thread and on large documents can be slow; input is
  size-capped and a conversion progress state is shown.
- Two rendering libraries (`docx-preview`, `html2canvas`) are added to the
  bundle.
- Legacy `.doc` remains unsupported.

## Scope note

This decision changes the MVP scope defined in `docs/00-product/MVP_SCOPE.md` to
include `.docx` import. It does not introduce OCR, server-side processing, or
arbitrary PDF text editing, all of which remain excluded.
