/**
 * A deliberately small PDF content-stream reader. It understands only what the optimizer needs
 * to know: how large each image XObject is drawn on the page. Everything else (text, paths,
 * colours) is tokenized and discarded, so an unusual stream degrades to "size unknown" instead
 * of failing the export.
 */

/** Affine matrix in PDF order: [a b c d e f]. */
export type Matrix = readonly [number, number, number, number, number, number];

export const IDENTITY_MATRIX: Matrix = [1, 0, 0, 1, 0, 0];

/** `m` applied first, then `n` — the PDF rule for `cm` is CTM' = M × CTM. */
export const multiplyMatrices = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[1] * n[2],
  m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2],
  m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4],
  m[4] * n[1] + m[5] * n[3] + n[5],
];

/** Size in points of the unit square (an image's own space) drawn through `matrix`. */
export const drawnSizeInPoints = (
  matrix: Matrix,
): { readonly width: number; readonly height: number } => ({
  width: Math.hypot(matrix[0], matrix[1]),
  height: Math.hypot(matrix[2], matrix[3]),
});

export type ContentOperand = number | { readonly name: string } | null;

export interface ContentOperator {
  readonly operator: string;
  readonly operands: readonly ContentOperand[];
}

const isWhitespace = (byte: number): boolean =>
  byte === 0x20 || byte === 0x0a || byte === 0x0d || byte === 0x09 || byte === 0x0c || byte === 0;

const isDelimiter = (byte: number): boolean =>
  byte === 0x28 || // (
  byte === 0x29 || // )
  byte === 0x3c || // <
  byte === 0x3e || // >
  byte === 0x5b || // [
  byte === 0x5d || // ]
  byte === 0x7b || // {
  byte === 0x7d || // }
  byte === 0x2f || // /
  byte === 0x25; // %

const isRegular = (byte: number): boolean => !isWhitespace(byte) && !isDelimiter(byte);

const decodeAscii = (bytes: Uint8Array, start: number, end: number): string => {
  let text = "";
  for (let index = start; index < end; index += 1) text += String.fromCharCode(bytes[index] ?? 0);
  return text;
};

/** Skips an inline image (`BI … ID <binary> EI`) starting just after the `ID` keyword. */
const skipInlineImageData = (bytes: Uint8Array, start: number): number => {
  let index = start + 1;
  while (index < bytes.length - 2) {
    if (
      bytes[index] === 0x45 && // E
      bytes[index + 1] === 0x49 && // I
      isWhitespace(bytes[index - 1] ?? 0) &&
      (index + 2 >= bytes.length || !isRegular(bytes[index + 2] ?? 0))
    ) {
      return index + 2;
    }
    index += 1;
  }
  return bytes.length;
};

/**
 * Streams operators with their numeric and name operands. Strings, arrays and dictionaries are
 * reduced to `null` operands: the optimizer never needs their contents.
 */
export function* tokenizeContentStream(bytes: Uint8Array): Generator<ContentOperator> {
  let operands: ContentOperand[] = [];
  let index = 0;
  let nesting = 0;
  while (index < bytes.length) {
    const byte = bytes[index] ?? 0;
    if (isWhitespace(byte)) {
      index += 1;
      continue;
    }
    if (byte === 0x25) {
      while (index < bytes.length && bytes[index] !== 0x0a && bytes[index] !== 0x0d) index += 1;
      continue;
    }
    if (byte === 0x28) {
      let depth = 0;
      while (index < bytes.length) {
        const current = bytes[index];
        if (current === 0x5c) {
          index += 2;
          continue;
        }
        if (current === 0x28) depth += 1;
        if (current === 0x29) {
          depth -= 1;
          if (depth === 0) break;
        }
        index += 1;
      }
      index += 1;
      if (nesting === 0) operands.push(null);
      continue;
    }
    if (byte === 0x3c) {
      if (bytes[index + 1] === 0x3c) {
        nesting += 1;
        index += 2;
        continue;
      }
      while (index < bytes.length && bytes[index] !== 0x3e) index += 1;
      index += 1;
      if (nesting === 0) operands.push(null);
      continue;
    }
    if (byte === 0x3e) {
      index += bytes[index + 1] === 0x3e ? 2 : 1;
      nesting = Math.max(0, nesting - 1);
      if (nesting === 0) operands.push(null);
      continue;
    }
    if (byte === 0x5b || byte === 0x7b) {
      nesting += 1;
      index += 1;
      continue;
    }
    if (byte === 0x5d || byte === 0x7d) {
      nesting = Math.max(0, nesting - 1);
      index += 1;
      if (nesting === 0) operands.push(null);
      continue;
    }
    if (byte === 0x2f) {
      const start = index + 1;
      index = start;
      while (index < bytes.length && isRegular(bytes[index] ?? 0)) index += 1;
      if (nesting === 0) operands.push({ name: decodeAscii(bytes, start, index) });
      continue;
    }
    const start = index;
    while (index < bytes.length && isRegular(bytes[index] ?? 0)) index += 1;
    if (index === start) {
      index += 1;
      continue;
    }
    const word = decodeAscii(bytes, start, index);
    if (nesting > 0) continue;
    const numeric = Number(word);
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word) && Number.isFinite(numeric)) {
      operands.push(numeric);
      continue;
    }
    if (word === "true" || word === "false" || word === "null") {
      operands.push(null);
      continue;
    }
    if (word === "ID") {
      index = skipInlineImageData(bytes, index);
      operands = [];
      continue;
    }
    yield { operator: word, operands };
    operands = [];
  }
}

export interface XObjectInvocation {
  readonly name: string;
  readonly matrix: Matrix;
}

const MAX_GRAPHICS_STATE_DEPTH = 256;

/**
 * Walks one content stream and reports each `Do` with the transformation in effect, starting
 * from `baseMatrix`. Unbalanced `Q` operators are tolerated.
 */
export const findXObjectInvocations = (
  bytes: Uint8Array,
  baseMatrix: Matrix = IDENTITY_MATRIX,
): XObjectInvocation[] => {
  const invocations: XObjectInvocation[] = [];
  const stack: Matrix[] = [];
  let current = baseMatrix;
  for (const { operator, operands } of tokenizeContentStream(bytes)) {
    if (operator === "q") {
      if (stack.length < MAX_GRAPHICS_STATE_DEPTH) stack.push(current);
    } else if (operator === "Q") {
      current = stack.pop() ?? baseMatrix;
    } else if (operator === "cm") {
      const values = operands.slice(-6);
      if (values.length === 6 && values.every((value) => typeof value === "number")) {
        current = multiplyMatrices(values as unknown as Matrix, current);
      }
    } else if (operator === "Do") {
      const name = operands[operands.length - 1];
      if (name !== null && typeof name === "object") {
        invocations.push({ name: name.name, matrix: current });
      }
    }
  }
  return invocations;
};
