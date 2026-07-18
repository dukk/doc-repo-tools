import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatsForSource,
  slugFromFilename,
  titleFromFilename,
} from "./formats.js";

describe("deconstruct formats", () => {
  it("infers export formats from extension", () => {
    assert.deepEqual(formatsForSource("a.pptx"), ["pptx", "pdf"]);
    assert.deepEqual(formatsForSource("a.pdf"), ["pdf", "docx"]);
    assert.deepEqual(formatsForSource("a.docx"), ["pdf", "docx"]);
  });

  it("slugifies filenames", () => {
    assert.equal(slugFromFilename("My Handbook.docx"), "my-handbook");
  });

  it("title-cases filename stems", () => {
    assert.equal(titleFromFilename("my-handbook.docx"), "My Handbook");
  });
});
