# PDF Export Compression

NestlyPDF exposes two export-only modes. **Original Size** is the default and uses the existing pdf-lib export gateway without quality changes. **Compress PDF** first creates the final edited PDF and then optimizes that file locally at one of three levels.

## Levels

| Level              | Images                                    | JPEG quality | Keeps text selectable              | Notes                                                                     |
| ------------------ | ----------------------------------------- | ------------ | ---------------------------------- | ------------------------------------------------------------------------- |
| Balanced (default) | 150 DPI of drawn size                     | 0.75         | Yes                                | Equivalent to the common "ebook" preset; prints well on office printers.  |
| Strong             | 110 DPI of drawn size                     | 0.60         | Yes                                | Also drops the XMP metadata packet. Intended for email and upload limits. |
| Maximum            | as Strong, or flattened at 120 DPI / 0.65 | 0.60 / 0.65  | Only if the structured result wins | Runs both and keeps the smaller file; ties keep the structured PDF.       |

## Structure-preserving optimizer

`src/infrastructure/pdf/optimizer/pdf-structure-optimizer.ts` rewrites the PDF with pdf-lib instead of rasterizing it:

1. **Image resampling by real use.** A small content-stream scanner follows `q`/`Q`/`cm` and form XObject matrices to find the largest size each image XObject is drawn at. Images whose effective resolution exceeds the level's DPI are downsampled (area average) to exactly what the page needs. Images not reached from page content are capped by 1.5× the largest page at the target DPI.
2. **Image re-encoding.** Photographic images become JPEG through the browser canvas (`CanvasJpegCodec`). Screenshots, charts and line art (few distinct colours) stay lossless and are stored as Flate with PNG row prediction. Gray-only RGB data is stored with one channel when lossless. A same-size lossy re-encode must save at least 10% or the original is kept. Soft masks are resampled with their image.
3. **Skipped on purpose:** CMYK, Indexed, Lab, JPX, JBIG2, CCITT, image masks, `/Decode` arrays, colour-key masks and images that the browser cannot decode. They are copied unchanged.
4. **Stream recompression.** Unfiltered, ASCIIHex, ASCII85, LZW and RunLength streams without decode parameters are re-encoded as Flate when that is smaller.
5. **Deduplication and garbage collection.** Byte-identical streams with identical dictionaries are merged and every object unreachable from the trailer is dropped (this removes incremental-update leftovers and orphaned resources).
6. **Private data.** Page thumbnails and `PieceInfo` application data are always removed; XMP metadata only at Strong and above. The Info dictionary, including the dates chosen in the PDF dates tool, is kept.
7. The document is saved with object streams and compressed cross-reference streams, without regenerating form field appearances.

Encrypted PDFs are not restructured; compression reports a failure and Original Size remains available.

## Behaviour

Compression never changes session bytes, overlays, history, or the source document. Progress is reported per image (structured optimizer) or per page (flattening). The application compares compressed bytes with the normal final export; if the result is not smaller it does not download it and asks the user to try a stronger level or export the original. Compression can be cancelled through an AbortSignal. No document bytes leave the browser.

## Why some PDFs barely shrink

A PDF whose images are already stored near the target resolution with efficient JPEG encoding, or whose bulk is fonts and vector content that is already Flate-compressed, has little left to remove without visible quality loss. Strong and Maximum trade more quality for size; Balanced deliberately does not.
