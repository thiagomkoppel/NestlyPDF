import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), "utf8");

const headersSource = read("public/_headers");

const headerValue = (name: string): string => {
  const line = headersSource
    .split("\n")
    .map((entry) => entry.trim())
    .find((entry) => entry.toLowerCase().startsWith(`${name.toLowerCase()}:`));
  if (line === undefined) throw new Error(`Missing header ${name}`);
  return line.slice(name.length + 1).trim();
};

const directive = (policy: string, name: string): string[] => {
  const entry = policy
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `) || part === name);
  if (entry === undefined) throw new Error(`Missing CSP directive ${name}`);
  return entry.split(/\s+/).slice(1);
};

describe("Cloudflare security headers", () => {
  it("applies one rule block to every path", () => {
    const rules = headersSource.split("\n").filter((line) => line.startsWith("/"));
    expect(rules).toEqual(["/*"]);
  });

  it("keeps every header line below Cloudflare's 2000 character limit", () => {
    for (const line of headersSource.split("\n")) expect(line.length).toBeLessThan(2000);
  });

  it("sets a restrictive Content-Security-Policy with no remote origins", () => {
    const policy = headerValue("Content-Security-Policy");
    expect(directive(policy, "default-src")).toEqual(["'self'"]);
    expect(directive(policy, "object-src")).toEqual(["'none'"]);
    expect(directive(policy, "base-uri")).toEqual(["'self'"]);
    expect(directive(policy, "form-action")).toEqual(["'none'"]);
    expect(directive(policy, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(policy, "connect-src")).not.toContain("*");
    expect(policy).not.toMatch(/https?:\/\//);
    expect(directive(policy, "script-src")).not.toContain("'unsafe-inline'");
    expect(directive(policy, "script-src")).not.toContain("'unsafe-eval'");
  });

  it("allows the inline boot script in index.html only through its exact hash", () => {
    const html = read("index.html");
    const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
    expect(scripts.length).toBeGreaterThan(0);
    const allowed = directive(headerValue("Content-Security-Policy"), "script-src");
    for (const [, body] of scripts) {
      const hash = `'sha256-${createHash("sha256")
        .update((body ?? "").replace(/\r\n/g, "\n"))
        .digest("base64")}'`;
      expect(allowed).toContain(hash);
    }
  });

  it("sends privacy and anti-embedding headers", () => {
    expect(headerValue("Referrer-Policy")).toBe("no-referrer");
    expect(headerValue("X-Content-Type-Options")).toBe("nosniff");
    expect(headerValue("X-Frame-Options")).toBe("DENY");
    expect(headerValue("Cross-Origin-Opener-Policy")).toBe("same-origin");
  });

  it("denies powerful browser features the app never uses", () => {
    const policy = headerValue("Permissions-Policy");
    for (const feature of ["camera", "microphone", "geolocation", "payment", "usb"]) {
      expect(policy).toContain(`${feature}=()`);
    }
  });

  it("publishes robots.txt that keeps normal crawling open", () => {
    const robots = read("public/robots.txt");
    expect(robots).toMatch(/User-agent: \*\s+Allow: \//);
    expect(robots).toMatch(/User-agent: GPTBot\s+Disallow: \//);
  });
});
