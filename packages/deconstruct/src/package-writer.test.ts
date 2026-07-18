import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildConvertYaml, buildDeconstructYaml } from "./package-writer.js";

describe("package-writer", () => {
  it("builds convert.yaml with .original exclude", () => {
    const yaml = buildConvertYaml("file.pptx");
    assert.match(yaml, /\.original\/\*\*/);
    assert.match(yaml, /pptx/);
  });

  it("builds deconstruct provenance yaml", () => {
    const yaml = buildDeconstructYaml({
      sourcePath: "C:/imports/a.docx",
      originalRel: ".original/a.docx",
      sha256: "abc",
      extractor: "pandoc",
      importedAt: "2026-01-01T00:00:00.000Z",
    });
    assert.match(yaml, /sha256: "abc"/);
    assert.match(yaml, /extractor: "pandoc"/);
  });
});
