import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFObject,
  PDFRawStream,
  PDFRef,
  PDFStream,
  decodePDFRawStream,
  type PDFContext,
} from "pdf-lib";

import {
  IDENTITY_MATRIX,
  drawnSizeInPoints,
  findXObjectInvocations,
  multiplyMatrices,
  type Matrix,
} from "./content-stream-scanner";
import {
  applyPngPredictor,
  downsamplePixels,
  hasFewDistinctColors,
  isGrayscaleRgb,
  removePngPredictor,
  rgbToGray,
  type RasterPixels,
} from "./pixel-operations";

/**
 * The only image work the optimizer cannot do in plain TypeScript: JPEG encoding and decoding.
 * The browser adapter uses a canvas; tests use a fake.
 */
export interface EncodedJpeg {
  readonly bytes: Uint8Array;
  /** 1 for a grayscale JPEG, 3 for YCbCr/RGB. The PDF colour space must match it. */
  readonly components: 1 | 3;
}

export interface JpegCodec {
  /** Decodes a JPEG and re-encodes it at the requested size. Undefined when not possible. */
  transcodeJpeg(
    bytes: Uint8Array,
    width: number,
    height: number,
    quality: number,
  ): Promise<EncodedJpeg | undefined>;
  /** Encodes raw pixels as a baseline JPEG. Undefined when not possible. */
  encodeJpeg(pixels: RasterPixels, quality: number): Promise<EncodedJpeg | undefined>;
}

export interface PdfOptimizationOptions {
  /** Images drawn at a higher effective resolution than this are resampled down to it. */
  readonly imageDpi: number;
  /** JPEG quality (0–1) for photographic images that are re-encoded. */
  readonly jpegQuality: number;
  /** Also drop the XMP metadata packet (the Info dictionary and its dates are always kept). */
  readonly stripXmpMetadata: boolean;
  readonly signal?: AbortSignal;
  readonly onImageProgress?: (done: number, total: number) => void;
}

export interface PdfOptimizationReport {
  readonly imagesRecompressed: number;
  readonly streamsRecompressed: number;
  readonly duplicatesMerged: number;
  readonly objectsRemoved: number;
}

export type PdfOptimizationResult =
  | { readonly ok: true; readonly bytes: Uint8Array; readonly report: PdfOptimizationReport }
  | { readonly ok: false; readonly reason: "encrypted" | "cancelled" | "failed" };

/** A replacement stream must beat the original by this factor to be worth any quality change. */
const LOSSY_GAIN_THRESHOLD = 0.9;
/** Resampling by less than this is not worth a generation of quality loss. */
const MIN_DOWNSAMPLE = 0.85;
/** Tiny images (icons, bullets) cost more to inspect than they could ever save. */
const MIN_IMAGE_STREAM_BYTES = 8 * 1024;
const MIN_IMAGE_PIXELS = 64 * 64;
const MAX_FORM_DEPTH = 12;

class OptimizationCancelled extends Error {
  public constructor() {
    super("cancelled");
    this.name = "OptimizationCancelled";
  }
}

const name = (value: string): PDFName => PDFName.of(value);

const refKey = (ref: PDFRef): string =>
  `${String(ref.objectNumber)} ${String(ref.generationNumber)}`;

const numberValue = (object: PDFObject | undefined): number | undefined =>
  object instanceof PDFNumber ? object.asNumber() : undefined;

const filterNames = (dict: PDFDict): string[] | undefined => {
  const filter = dict.lookup(name("Filter"));
  if (filter === undefined) return [];
  if (filter instanceof PDFName) return [filter.decodeText()];
  if (filter instanceof PDFArray) {
    const names: string[] = [];
    for (let index = 0; index < filter.size(); index += 1) {
      const entry = filter.lookup(index);
      if (!(entry instanceof PDFName)) return undefined;
      names.push(entry.decodeText());
    }
    return names;
  }
  return undefined;
};

// ---------------------------------------------------------------------------------------------
// Object graph helpers
// ---------------------------------------------------------------------------------------------

const forEachChild = (object: PDFObject, visit: (child: PDFObject) => void): void => {
  if (object instanceof PDFDict) {
    for (const [, value] of object.entries()) visit(value);
  } else if (object instanceof PDFArray) {
    for (let index = 0; index < object.size(); index += 1) visit(object.get(index));
  } else if (object instanceof PDFStream) {
    for (const [, value] of object.dict.entries()) visit(value);
  }
};

/** Every object reachable from the trailer; everything else is dead weight. */
const reachableRefs = (context: PDFContext): Set<string> => {
  const reached = new Set<string>();
  const pending: PDFObject[] = [];
  const { Root, Info, Encrypt, ID } = context.trailerInfo;
  for (const entry of [Root, Info, Encrypt, ID]) if (entry !== undefined) pending.push(entry);
  while (pending.length > 0) {
    const object = pending.pop();
    if (object === undefined) continue;
    if (object instanceof PDFRef) {
      const key = refKey(object);
      if (reached.has(key)) continue;
      reached.add(key);
      const target = context.lookup(object);
      if (target !== undefined) pending.push(target);
      continue;
    }
    forEachChild(object, (child) => pending.push(child));
  }
  return reached;
};

const removeUnreachableObjects = (context: PDFContext): number => {
  const reached = reachableRefs(context);
  let removed = 0;
  for (const [ref] of context.enumerateIndirectObjects()) {
    if (!reached.has(refKey(ref))) {
      context.delete(ref);
      removed += 1;
    }
  }
  return removed;
};

const replaceRefs = (object: PDFObject, replacements: ReadonlyMap<string, PDFRef>): void => {
  const dict = object instanceof PDFStream ? object.dict : object;
  if (dict instanceof PDFDict) {
    for (const [key, value] of dict.entries()) {
      if (value instanceof PDFRef) {
        const replacement = replacements.get(refKey(value));
        if (replacement !== undefined) dict.set(key, replacement);
      } else {
        replaceRefs(value, replacements);
      }
    }
  } else if (dict instanceof PDFArray) {
    for (let index = 0; index < dict.size(); index += 1) {
      const value = dict.get(index);
      if (value instanceof PDFRef) {
        const replacement = replacements.get(refKey(value));
        if (replacement !== undefined) dict.set(index, replacement);
      } else {
        replaceRefs(value, replacements);
      }
    }
  }
};

const fnv1a = (bytes: Uint8Array, seed = 0x811c9dc5): number => {
  let hash = seed;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
};

const sameBytes = (left: Uint8Array, right: Uint8Array): boolean => {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1)
    if (left[index] !== right[index]) return false;
  return true;
};

const dictSignature = (dict: PDFDict): string =>
  dict
    .entries()
    .filter(([key]) => key !== name("Length"))
    .map(([key, value]) => `${key.toString()} ${value.toString()}`)
    .sort()
    .join("\n");

/** Producers often embed the same logo or font once per page; keep one copy of each. */
const mergeDuplicateStreams = (context: PDFContext): number => {
  const buckets = new Map<string, { ref: PDFRef; stream: PDFRawStream }[]>();
  const replacements = new Map<string, PDFRef>();
  for (const [ref, object] of context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;
    const type = object.dict.lookup(name("Type"));
    // Page content may legitimately repeat; merging it is harmless but never saves much.
    if (type === name("Metadata")) continue;
    const contents = object.getContents();
    const signature = dictSignature(object.dict);
    const key = `${String(contents.length)}:${String(fnv1a(contents))}:${signature}`;
    const bucket = buckets.get(key) ?? [];
    const match = bucket.find(
      (candidate) =>
        sameBytes(candidate.stream.getContents(), contents) &&
        dictSignature(candidate.stream.dict) === signature,
    );
    if (match === undefined) {
      bucket.push({ ref, stream: object });
      buckets.set(key, bucket);
    } else {
      replacements.set(refKey(ref), match.ref);
    }
  }
  if (replacements.size === 0) return 0;
  for (const [, object] of context.enumerateIndirectObjects()) replaceRefs(object, replacements);
  const { Root, Info } = context.trailerInfo;
  for (const entry of [Root, Info]) if (entry !== undefined) replaceRefs(entry, replacements);
  return replacements.size;
};

// ---------------------------------------------------------------------------------------------
// Private data that viewers never show
// ---------------------------------------------------------------------------------------------

const stripPrivateData = (document: PDFDocument, stripXmp: boolean): void => {
  const { catalog } = document;
  catalog.delete(name("PieceInfo"));
  if (stripXmp) catalog.delete(name("Metadata"));
  for (const page of document.getPages()) {
    page.node.delete(name("Thumb"));
    page.node.delete(name("PieceInfo"));
    if (stripXmp) page.node.delete(name("Metadata"));
  }
};

// ---------------------------------------------------------------------------------------------
// Image usage: how big is every image actually drawn?
// ---------------------------------------------------------------------------------------------

const decodedContent = (stream: PDFObject | undefined): Uint8Array | undefined => {
  if (!(stream instanceof PDFRawStream)) return undefined;
  try {
    return decodePDFRawStream(stream).decode();
  } catch {
    return undefined;
  }
};

const pageContentBytes = (context: PDFContext, contents: PDFObject | undefined): Uint8Array => {
  const resolved = contents instanceof PDFRef ? context.lookup(contents) : contents;
  const parts: Uint8Array[] = [];
  if (resolved instanceof PDFArray) {
    for (let index = 0; index < resolved.size(); index += 1) {
      const part = decodedContent(resolved.lookup(index));
      if (part !== undefined) parts.push(part);
    }
  } else {
    const part = decodedContent(resolved);
    if (part !== undefined) parts.push(part);
  }
  const total = parts.reduce((sum, part) => sum + part.length + 1, 0);
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
    joined[offset] = 0x0a;
    offset += 1;
  }
  return joined;
};

const matrixFrom = (object: PDFObject | undefined): Matrix => {
  if (!(object instanceof PDFArray) || object.size() !== 6) return IDENTITY_MATRIX;
  const values = Array.from({ length: 6 }, (_, index) => numberValue(object.lookup(index)));
  return values.every((value) => value !== undefined)
    ? (values as unknown as Matrix)
    : IDENTITY_MATRIX;
};

/** Largest drawn size, in points, of every image XObject reached from page content. */
const measureImageUsage = (
  document: PDFDocument,
): Map<string, { width: number; height: number }> => {
  const { context } = document;
  const usage = new Map<string, { width: number; height: number }>();

  const walk = (
    content: Uint8Array,
    resources: PDFDict | undefined,
    base: Matrix,
    depth: number,
    activeForms: Set<string>,
  ): void => {
    const xobjects = resources?.lookupMaybe(name("XObject"), PDFDict);
    if (xobjects === undefined) return;
    for (const invocation of findXObjectInvocations(content, base)) {
      const ref = xobjects.get(name(invocation.name));
      if (!(ref instanceof PDFRef)) continue;
      const target = context.lookup(ref);
      if (!(target instanceof PDFRawStream)) continue;
      const subtype = target.dict.lookup(name("Subtype"));
      const key = refKey(ref);
      if (subtype === name("Image")) {
        const drawn = drawnSizeInPoints(invocation.matrix);
        const previous = usage.get(key);
        usage.set(key, {
          width: Math.max(previous?.width ?? 0, drawn.width),
          height: Math.max(previous?.height ?? 0, drawn.height),
        });
      } else if (subtype === name("Form") && depth < MAX_FORM_DEPTH && !activeForms.has(key)) {
        const formContent = decodedContent(target);
        if (formContent === undefined) continue;
        const formResources = target.dict.lookupMaybe(name("Resources"), PDFDict) ?? resources;
        activeForms.add(key);
        walk(
          formContent,
          formResources,
          multiplyMatrices(matrixFrom(target.dict.lookup(name("Matrix"))), invocation.matrix),
          depth + 1,
          activeForms,
        );
        activeForms.delete(key);
      }
    }
  };

  for (const page of document.getPages()) {
    const content = pageContentBytes(context, page.node.get(name("Contents")));
    walk(content, page.node.Resources(), IDENTITY_MATRIX, 0, new Set());
  }
  return usage;
};

// ---------------------------------------------------------------------------------------------
// Image recompression
// ---------------------------------------------------------------------------------------------

type ColorModel =
  | { readonly kind: "gray"; readonly space: PDFObject }
  | { readonly kind: "rgb"; readonly space: PDFObject };

const colorModelOf = (dict: PDFDict, context: PDFContext): ColorModel | undefined => {
  const raw = dict.get(name("ColorSpace"));
  const space = raw instanceof PDFRef ? context.lookup(raw) : raw;
  if (space === name("DeviceGray") || space === name("G"))
    return { kind: "gray", space: name("DeviceGray") };
  if (space === name("DeviceRGB") || space === name("RGB"))
    return { kind: "rgb", space: name("DeviceRGB") };
  if (space instanceof PDFArray && space.size() >= 2) {
    const family = space.lookup(0);
    if (family === name("ICCBased")) {
      const profile = space.lookup(1);
      const components =
        profile instanceof PDFStream ? numberValue(profile.dict.lookup(name("N"))) : undefined;
      if (components === 1 && raw !== undefined) return { kind: "gray", space: raw };
      if (components === 3 && raw !== undefined) return { kind: "rgb", space: raw };
    }
    if (family === name("CalRGB") && raw !== undefined) return { kind: "rgb", space: raw };
    if (family === name("CalGray") && raw !== undefined) return { kind: "gray", space: raw };
  }
  return undefined;
};

const TRANSPORT_FILTERS = new Set([
  "ASCIIHexDecode",
  "ASCII85Decode",
  "LZWDecode",
  "RunLengthDecode",
  "FlateDecode",
]);

/** The decode parameters that apply to filter number `index` of a stream. */
const decodeParamsAt = (dict: PDFDict, index: number): PDFDict | undefined => {
  const params = dict.lookup(name("DecodeParms"));
  if (params instanceof PDFDict) return index === 0 ? params : undefined;
  if (params instanceof PDFArray) return params.lookupMaybe(index, PDFDict);
  return undefined;
};

/** Only the last filter of a chain may carry parameters (a predictor) we know how to undo. */
const hasOnlyTrailingParams = (dict: PDFDict, filterCount: number): boolean => {
  for (let index = 0; index < filterCount - 1; index += 1) {
    if (decodeParamsAt(dict, index) !== undefined) return false;
  }
  return true;
};

/** Decodes the transport layers (ASCII85, LZW, …) of a JPEG so only the DCT data remains. */
const jpegBytesOf = (stream: PDFRawStream, filters: readonly string[]): Uint8Array | undefined => {
  if (filters[filters.length - 1] !== "DCTDecode") return undefined;
  const transport = filters.slice(0, -1);
  if (transport.length === 0) return stream.getContents();
  if (!transport.every((filter) => TRANSPORT_FILTERS.has(filter))) return undefined;
  if (stream.dict.has(name("DecodeParms"))) return undefined;
  const layers = PDFDict.withContext(stream.dict.context);
  layers.set(name("Filter"), PDFArray.withContext(stream.dict.context));
  const filterArray = layers.lookup(name("Filter"), PDFArray);
  for (const filter of transport) filterArray.push(name(filter));
  try {
    return decodePDFRawStream(PDFRawStream.of(layers, stream.getContents())).decode();
  } catch {
    return undefined;
  }
};

/** Raw 8-bit samples of a losslessly stored image, undoing every filter and PNG predictor. */
const decodeLosslessImage = (
  stream: PDFRawStream,
  channels: 1 | 3,
  width: number,
  height: number,
): RasterPixels | undefined => {
  const filters = filterNames(stream.dict);
  if (filters === undefined) return undefined;
  if (!filters.every((filter) => TRANSPORT_FILTERS.has(filter))) return undefined;
  if (!hasOnlyTrailingParams(stream.dict, filters.length)) return undefined;
  const params =
    filters[filters.length - 1] === "FlateDecode" || filters[filters.length - 1] === "LZWDecode"
      ? decodeParamsAt(stream.dict, filters.length - 1)
      : undefined;
  let data: Uint8Array;
  try {
    data = filters.length === 0 ? stream.getContents() : decodePDFRawStream(stream).decode();
  } catch {
    return undefined;
  }
  const predictor = numberValue(params?.lookup(name("Predictor"))) ?? 1;
  const rowBytes = width * channels;
  if (predictor >= 10) {
    const colors = numberValue(params?.lookup(name("Colors"))) ?? 1;
    const bits = numberValue(params?.lookup(name("BitsPerComponent"))) ?? 8;
    const columns = numberValue(params?.lookup(name("Columns"))) ?? 1;
    if (colors !== channels || bits !== 8 || columns !== width) return undefined;
    const unpredicted = removePngPredictor(data, rowBytes, channels, height);
    if (unpredicted === undefined) return undefined;
    data = unpredicted;
  } else if (predictor !== 1) {
    return undefined;
  }
  if (data.length < rowBytes * height) return undefined;
  return { width, height, channels, data: data.subarray(0, rowBytes * height) };
};

/** Flate with PNG row prediction: what a PNG encoder would write, as PDF stream data. */
const losslessStreamParts = (
  context: PDFContext,
  pixels: RasterPixels,
): { readonly bytes: Uint8Array; readonly params: PDFDict } => {
  const params = context.obj({
    Predictor: 15,
    Colors: pixels.channels,
    BitsPerComponent: 8,
    Columns: pixels.width,
  });
  return { bytes: context.flateStream(applyPngPredictor(pixels)).getContents(), params };
};

interface ImageCandidate {
  readonly ref: PDFRef;
  readonly stream: PDFRawStream;
  readonly drawn: { readonly width: number; readonly height: number } | undefined;
}

interface ImageContext {
  readonly context: PDFContext;
  readonly codec: JpegCodec;
  readonly options: PdfOptimizationOptions;
  readonly fallbackSize: { readonly width: number; readonly height: number };
}

/** Pixel size the image needs at the target DPI, never larger than it already is. */
const targetPixelSize = (
  width: number,
  height: number,
  drawn: { readonly width: number; readonly height: number },
  dpi: number,
): { width: number; height: number } => {
  const neededWidth = (drawn.width / 72) * dpi;
  const neededHeight = (drawn.height / 72) * dpi;
  // One factor for both axes keeps the aspect ratio and never undersamples either direction.
  const scale = Math.min(1, Math.max(neededWidth / width, neededHeight / height));
  if (scale > MIN_DOWNSAMPLE) return { width, height };
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};

/** Resamples a soft mask to match its resized parent and stores it losslessly. */
const resizedSoftMask = (
  context: PDFContext,
  mask: PDFRawStream,
  width: number,
  height: number,
): PDFRawStream | undefined => {
  const maskWidth = numberValue(mask.dict.lookup(name("Width")));
  const maskHeight = numberValue(mask.dict.lookup(name("Height")));
  if (maskWidth === undefined || maskHeight === undefined) return undefined;
  if (numberValue(mask.dict.lookup(name("BitsPerComponent"))) !== 8) return undefined;
  if (mask.dict.has(name("Decode")) || mask.dict.has(name("Matte"))) return undefined;
  const pixels = decodeLosslessImage(mask, 1, maskWidth, maskHeight);
  if (pixels === undefined) return undefined;
  const scaled = downsamplePixels(pixels, width, height);
  const lossless = losslessStreamParts(context, scaled);
  const dict = mask.dict.clone(context);
  dict.delete(name("Length"));
  dict.set(name("DecodeParms"), lossless.params);
  dict.set(name("Width"), PDFNumber.of(scaled.width));
  dict.set(name("Height"), PDFNumber.of(scaled.height));
  dict.set(name("Filter"), name("FlateDecode"));
  return PDFRawStream.of(dict, lossless.bytes);
};

const recompressImage = async (
  candidate: ImageCandidate,
  { context, codec, options, fallbackSize }: ImageContext,
): Promise<boolean> => {
  const { stream } = candidate;
  const { dict } = stream;
  const originalSize = stream.getContentsSize();
  if (originalSize < MIN_IMAGE_STREAM_BYTES) return false;
  if (dict.has(name("ImageMask")) || dict.has(name("Decode")) || dict.has(name("Mask")))
    return false;
  if (dict.has(name("SMaskInData")) || dict.has(name("Matte"))) return false;
  if (numberValue(dict.lookup(name("BitsPerComponent"))) !== 8) return false;
  const width = numberValue(dict.lookup(name("Width")));
  const height = numberValue(dict.lookup(name("Height")));
  if (width === undefined || height === undefined || width * height < MIN_IMAGE_PIXELS)
    return false;
  const model = colorModelOf(dict, context);
  if (model === undefined) return false;
  const filters = filterNames(dict);
  if (filters === undefined) return false;

  const target = targetPixelSize(width, height, candidate.drawn ?? fallbackSize, options.imageDpi);
  const resizing = target.width !== width || target.height !== height;

  const softMaskRef = dict.get(name("SMask"));
  const softMask = softMaskRef instanceof PDFRef ? context.lookup(softMaskRef) : undefined;
  if (softMaskRef !== undefined && !(softMask instanceof PDFRawStream)) return false;
  let newSoftMask: PDFRawStream | undefined;
  if (resizing && softMask instanceof PDFRawStream) {
    newSoftMask = resizedSoftMask(context, softMask, target.width, target.height);
    if (newSoftMask === undefined) return false;
  }

  interface Encoded {
    readonly bytes: Uint8Array;
    readonly filter: "DCTDecode" | "FlateDecode";
    readonly gray: boolean;
    readonly lossy: boolean;
    readonly params?: PDFDict;
  }
  const fromJpeg = (jpeg: EncodedJpeg | undefined): Encoded | undefined =>
    jpeg === undefined
      ? undefined
      : { bytes: jpeg.bytes, filter: "DCTDecode", gray: jpeg.components === 1, lossy: true };

  let encoded: Encoded | undefined;
  const jpegBytes = jpegBytesOf(stream, filters);
  if (jpegBytes !== undefined) {
    encoded = fromJpeg(
      await codec.transcodeJpeg(jpegBytes, target.width, target.height, options.jpegQuality),
    );
  } else {
    const channels = model.kind === "gray" ? 1 : 3;
    const decoded = decodeLosslessImage(stream, channels, width, height);
    if (decoded === undefined) return false;
    let pixels = downsamplePixels(decoded, target.width, target.height);
    if (isGrayscaleRgb(pixels)) pixels = rgbToGray(pixels);
    if (hasFewDistinctColors(pixels)) {
      // Screenshots, charts and line art stay lossless; only their resolution may change.
      const lossless = losslessStreamParts(context, pixels);
      encoded = {
        bytes: lossless.bytes,
        filter: "FlateDecode",
        gray: pixels.channels === 1,
        lossy: false,
        params: lossless.params,
      };
    } else {
      encoded = fromJpeg(await codec.encodeJpeg(pixels, options.jpegQuality));
    }
  }
  if (encoded === undefined) return false;
  // A lossy re-encode at the same size must clearly pay for the generation of quality it costs.
  const threshold = encoded.lossy && !resizing ? LOSSY_GAIN_THRESHOLD : 0.98;
  if (encoded.bytes.length >= originalSize * threshold) return false;

  const newDict = dict.clone(context);
  newDict.delete(name("DecodeParms"));
  newDict.delete(name("Length"));
  if (encoded.params !== undefined) newDict.set(name("DecodeParms"), encoded.params);
  newDict.set(name("Filter"), name(encoded.filter));
  newDict.set(name("Width"), PDFNumber.of(target.width));
  newDict.set(name("Height"), PDFNumber.of(target.height));
  newDict.set(name("BitsPerComponent"), PDFNumber.of(8));
  // The colour space has to describe what was actually written: a canvas only produces
  // three-component JPEGs, and gray-only RGB images are stored with one channel.
  const writtenKind = encoded.gray ? "gray" : "rgb";
  newDict.set(
    name("ColorSpace"),
    writtenKind === model.kind ? model.space : name(encoded.gray ? "DeviceGray" : "DeviceRGB"),
  );
  if (newSoftMask !== undefined && softMaskRef instanceof PDFRef) {
    context.assign(softMaskRef, newSoftMask);
  }
  context.assign(candidate.ref, PDFRawStream.of(newDict, encoded.bytes));
  return true;
};

// ---------------------------------------------------------------------------------------------
// Generic (non-image) streams
// ---------------------------------------------------------------------------------------------

const RECODABLE_FILTERS = new Set([
  "ASCIIHexDecode",
  "ASCII85Decode",
  "LZWDecode",
  "RunLengthDecode",
  "FlateDecode",
]);

/** Uncompressed or weakly encoded streams (content, fonts, ICC profiles) become Flate. */
const recompressGenericStreams = (context: PDFContext, skip: ReadonlySet<string>): number => {
  let changed = 0;
  for (const [ref, object] of context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream) || skip.has(refKey(ref))) continue;
    const { dict } = object;
    if (dict.lookup(name("Subtype")) === name("Image")) continue;
    if (dict.lookup(name("Type")) === name("Metadata")) continue;
    if (dict.has(name("DecodeParms")) || dict.has(name("F"))) continue;
    const filters = filterNames(dict);
    if (filters === undefined) continue;
    if (filters.length === 1 && filters[0] === "FlateDecode") continue;
    if (!filters.every((filter) => RECODABLE_FILTERS.has(filter))) continue;
    const originalSize = object.getContentsSize();
    if (originalSize < 64) continue;
    let decoded: Uint8Array;
    try {
      decoded = filters.length === 0 ? object.getContents() : decodePDFRawStream(object).decode();
    } catch {
      continue;
    }
    const deflated = context.flateStream(decoded).getContents();
    if (deflated.length >= originalSize) continue;
    const newDict = dict.clone(context);
    newDict.delete(name("Length"));
    newDict.set(name("Filter"), name("FlateDecode"));
    context.assign(ref, PDFRawStream.of(newDict, deflated));
    changed += 1;
  }
  return changed;
};

// ---------------------------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------------------------

const largestPageSize = (document: PDFDocument): { width: number; height: number } => {
  let width = 0;
  let height = 0;
  for (const page of document.getPages()) {
    const size = page.getSize();
    width = Math.max(width, size.width);
    height = Math.max(height, size.height);
  }
  return { width: Math.max(width, 1), height: Math.max(height, 1) };
};

const throwIfAborted = (signal: AbortSignal | undefined): void => {
  if (signal?.aborted) throw new OptimizationCancelled();
};

/**
 * Rebuilds a PDF smaller while keeping it a real PDF: text stays selectable and searchable,
 * vectors stay sharp, forms and links keep working. Savings come from resampling oversized
 * images, re-encoding photos, compressing raw streams, merging duplicates and dropping
 * unreachable objects and private application data.
 */
export const optimizePdfStructure = async (
  bytes: Uint8Array,
  codec: JpegCodec,
  options: PdfOptimizationOptions,
): Promise<PdfOptimizationResult> => {
  try {
    throwIfAborted(options.signal);
    const document = await PDFDocument.load(bytes, {
      updateMetadata: false,
      ignoreEncryption: true,
    });
    if (document.isEncrypted) return { ok: false, reason: "encrypted" };
    const { context } = document;

    stripPrivateData(document, options.stripXmpMetadata);
    const usage = measureImageUsage(document);

    const softMasks = new Set<string>();
    const images: ImageCandidate[] = [];
    for (const [, object] of context.enumerateIndirectObjects()) {
      if (!(object instanceof PDFRawStream)) continue;
      if (object.dict.lookup(name("Subtype")) !== name("Image")) continue;
      const mask = object.dict.get(name("SMask"));
      if (mask instanceof PDFRef) softMasks.add(refKey(mask));
    }
    for (const [ref, object] of context.enumerateIndirectObjects()) {
      if (!(object instanceof PDFRawStream)) continue;
      if (object.dict.lookup(name("Subtype")) !== name("Image")) continue;
      if (softMasks.has(refKey(ref))) continue;
      images.push({ ref, stream: object, drawn: usage.get(refKey(ref)) });
    }

    const page = largestPageSize(document);
    const imageContext: ImageContext = {
      context,
      codec,
      options,
      fallbackSize: { width: page.width * 1.5, height: page.height * 1.5 },
    };
    let imagesRecompressed = 0;
    for (const [index, candidate] of images.entries()) {
      throwIfAborted(options.signal);
      if (await recompressImage(candidate, imageContext)) imagesRecompressed += 1;
      options.onImageProgress?.(index + 1, images.length);
    }

    throwIfAborted(options.signal);
    const streamsRecompressed = recompressGenericStreams(context, softMasks);
    const duplicatesMerged = mergeDuplicateStreams(context);
    const objectsRemoved = removeUnreachableObjects(context);
    throwIfAborted(options.signal);

    const output = await document.save({
      useObjectStreams: true,
      addDefaultPage: false,
      updateFieldAppearances: false,
    });
    return {
      ok: true,
      bytes: output,
      report: { imagesRecompressed, streamsRecompressed, duplicatesMerged, objectsRemoved },
    };
  } catch (error) {
    if (error instanceof OptimizationCancelled) return { ok: false, reason: "cancelled" };
    return { ok: false, reason: "failed" };
  }
};
