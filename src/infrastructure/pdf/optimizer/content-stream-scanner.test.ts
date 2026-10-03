import { describe, expect, it } from "vitest";

import {
  drawnSizeInPoints,
  findXObjectInvocations,
  multiplyMatrices,
  tokenizeContentStream,
} from "./content-stream-scanner";

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

describe("content stream scanner", () => {
  it("composes cm matrices in PDF order (new × current)", () => {
    const scaled = multiplyMatrices([2, 0, 0, 3, 0, 0], [1, 0, 0, 1, 10, 20]);
    expect(scaled).toEqual([2, 0, 0, 3, 10, 20]);
    const translatedThenScaled = multiplyMatrices([1, 0, 0, 1, 10, 20], [2, 0, 0, 3, 0, 0]);
    expect(translatedThenScaled).toEqual([2, 0, 0, 3, 20, 60]);
  });

  it("measures rotated placements by the length of each axis", () => {
    const size = drawnSizeInPoints([0, 200, -100, 0, 300, 50]);
    expect(size).toEqual({ width: 200, height: 100 });
  });

  it("reports each Do with the transformation in effect and restores it after Q", () => {
    const invocations = findXObjectInvocations(
      bytes("q 2 0 0 2 0 0 cm q 100 0 0 50 10 10 cm /Im1 Do Q /Fm1 Do Q /Im2 Do"),
    );
    expect(invocations).toEqual([
      { name: "Im1", matrix: [200, 0, 0, 100, 20, 20] },
      { name: "Fm1", matrix: [2, 0, 0, 2, 0, 0] },
      { name: "Im2", matrix: [1, 0, 0, 1, 0, 0] },
    ]);
  });

  it("ignores operators that only appear inside strings, arrays and dictionaries", () => {
    const content = bytes(
      "BT (q 9 0 0 9 0 0 cm \\) /Fake Do) Tj [(Q) 120 (cm)] TJ ET " +
        "/Span <</ActualText (Do) /MCID 3>> BDC <48656c6c6f> Tj EMC " +
        "% 5 0 0 5 0 0 cm /Commented Do\n" +
        "q 30 0 0 40 0 0 cm /Real Do Q",
    );
    expect(findXObjectInvocations(content)).toEqual([
      { name: "Real", matrix: [30, 0, 0, 40, 0, 0] },
    ]);
  });

  it("skips binary inline image data without treating it as operators", () => {
    const content = bytes(
      "q 10 0 0 10 0 0 cm BI /W 2 /H 1 /CS /G /BPC 8 ID \u0000Do Q cmÿ EI Q q 5 0 0 5 0 0 cm /Im0 Do Q",
    );
    expect(findXObjectInvocations(content)).toEqual([{ name: "Im0", matrix: [5, 0, 0, 5, 0, 0] }]);
  });

  it("tolerates unbalanced Q and malformed cm operands", () => {
    const invocations = findXObjectInvocations(bytes("Q Q 1 2 cm /Im0 Do"), [3, 0, 0, 3, 0, 0]);
    expect(invocations).toEqual([{ name: "Im0", matrix: [3, 0, 0, 3, 0, 0] }]);
  });

  it("tokenizes numbers and names as operands", () => {
    const operators = [...tokenizeContentStream(bytes("-1.5 .5 +3 /Name#20X gs"))];
    expect(operators).toEqual([{ operator: "gs", operands: [-1.5, 0.5, 3, { name: "Name#20X" }] }]);
  });
});
