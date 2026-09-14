import { describe, expect, it } from "vitest";

import { readProjectFiles } from "./readProjectFiles";

const forbiddenDomainImports = [
  "react",
  "react-dom",
  "pdfjs-dist",
  "pdf-lib",
  "../infrastructure",
  "../presentation",
];
const forbiddenApplicationImports = [
  "react",
  "react-dom",
  "pdfjs-dist",
  "pdf-lib",
  "../presentation",
];
const normalizePath = (filePath: string): string => filePath.replaceAll("\\", "/");
const isTestFile = (filePath: string): boolean => /\.(?:test|spec)\.[^.]+$/.test(filePath);

describe("source dependency boundaries", () => {
  it("keeps the domain layer independent from UI, PDF libraries, and browser adapters", () => {
    const violations = readProjectFiles("src/domain", [".ts", ".tsx"]).flatMap((file) =>
      forbiddenDomainImports
        .filter((value) => file.contents.includes(`from "${value}`))
        .map((value) => `${file.path} imports ${value}`),
    );
    expect(violations).toEqual([]);
  });
  it("keeps application use cases independent from React and PDF libraries", () => {
    const violations = readProjectFiles("src/application", [".ts", ".tsx"]).flatMap((file) =>
      forbiddenApplicationImports
        .filter((value) => file.contents.includes(`from "${value}`))
        .map((value) => `${file.path} imports ${value}`),
    );
    expect(violations).toEqual([]);
  });
  it("isolates PDF library usage to PDF infrastructure", () => {
    const violations = readProjectFiles("src", [".ts", ".tsx"])
      .filter(
        (file) =>
          file.contents.includes('from "pdf-lib') || file.contents.includes('from "pdfjs-dist'),
      )
      .filter((file) => !normalizePath(file.path).includes("src/infrastructure/pdf"))
      .map((file) => `${file.path} imports a PDF library outside PDF infrastructure`);
    expect(violations).toEqual([]);
  });
  it("isolates document-conversion libraries to the import infrastructure", () => {
    const conversionLibraries = ["docx-preview", "html2canvas"];
    const violations = readProjectFiles("src", [".ts", ".tsx"])
      .filter((file) => !isTestFile(file.path))
      .flatMap((file) =>
        conversionLibraries
          .filter((library) => file.contents.includes(`"${library}"`))
          .filter(() => !normalizePath(file.path).includes("src/infrastructure/import/"))
          .map((library) => `${file.path} references ${library} outside import infrastructure`),
      );
    expect(violations).toEqual([]);
  });
  it("isolates service-worker browser APIs to PWA infrastructure", () => {
    const violations = readProjectFiles("src", [".ts", ".tsx"])
      .filter((file) => file.contents.includes("navigator.serviceWorker"))
      .filter((file) => !normalizePath(file.path).includes("src/infrastructure/pwa/"))
      .map((file) => `${file.path} accesses navigator.serviceWorker outside PWA infrastructure`);
    expect(violations).toEqual([]);
  });
  it("keeps persistence, analytics, document network APIs, and remote assets out of production source", () => {
    const patterns = [
      "localStorage",
      "sessionStorage",
      "indexedDB",
      "document.cookie",
      "gtag(",
      'from "analytics"',
      'from "telemetry"',
      "analytics.",
      "telemetry.",
      "fetch(",
      "XMLHttpRequest",
      "fonts.googleapis.com",
      "http://",
      "https://",
    ];
    const violations = readProjectFiles("src", [".ts", ".tsx", ".css"])
      .filter((file) => !isTestFile(file.path))
      .flatMap((file) =>
        patterns
          .filter((pattern) => file.contents.includes(pattern))
          .map((pattern) => `${file.path} contains ${pattern}`),
      );
    expect(violations).toEqual([]);
  });
});
