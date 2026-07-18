import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildFrontmatter,
  descriptionFromBody,
  renderDocumentMd,
  titleFromMetadata,
} from "./frontmatter.js";

describe("deconstruct frontmatter", () => {
  it("extracts description from first paragraph", () => {
    const desc = descriptionFromBody("# Title\n\nFirst paragraph here.\n\nSecond.");
    assert.equal(desc, "First paragraph here.");
  });

  it("builds frontmatter with deconstructed tag", () => {
    const fm = buildFrontmatter({
      type: "Reference",
      title: "T",
      description: "D",
      resource: ".original/x.docx",
    });
    assert.equal(fm.status, "draft");
    assert.ok(fm.tags.includes("deconstructed"));
  });

  it("renders document.md with frontmatter", () => {
    const fm = buildFrontmatter({
      type: "Reference",
      title: "T",
      description: "D",
      resource: ".original/x.docx",
      timestamp: "2026-01-01T00:00:00.000Z",
    });
    const md = renderDocumentMd(fm, "# Body\n");
    assert.match(md, /^---\n/);
    assert.match(md, /type: Reference/);
    assert.match(md, /# Body/);
  });

  it("reads title from metadata", () => {
    assert.equal(titleFromMetadata({ title: " From meta " }), "From meta");
  });

  it("truncates long descriptions", () => {
    const long = "word ".repeat(80).trim();
    const desc = descriptionFromBody(`${long}\n\nSecond.`);
    assert.ok(desc.endsWith("…"));
    assert.ok(desc.length <= 240);
  });
});
