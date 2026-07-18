import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EXT, parseFormats, SUPPORTED_FORMATS } from "./formats.js";

describe("formats", () => {
  it("parses comma-separated formats", () => {
    assert.deepEqual(parseFormats("pdf, docx, pdf"), ["pdf", "docx"]);
  });

  it("rejects unsupported formats", () => {
    assert.throws(() => parseFormats("pdf,xyz"), /Unsupported format/);
  });

  it("requires at least one format", () => {
    assert.throws(() => parseFormats("  ,  "), /At least one format/);
  });

  it("maps extensions", () => {
    for (const fmt of SUPPORTED_FORMATS) {
      assert.ok(EXT[fmt].startsWith("."));
    }
  });
});
