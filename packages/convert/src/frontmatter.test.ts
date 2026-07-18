import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mergeMetadata,
  okfToPandocMeta,
  parseFrontmatter,
  toPandocMarkdown,
} from "./frontmatter.js";

describe("frontmatter", () => {
  it("parses YAML frontmatter", () => {
    const doc = parseFrontmatter(
      "---\ntype: Policy\ntitle: Test\n---\n\nBody.\n",
    );
    assert.equal(doc.data.type, "Policy");
    assert.equal(doc.data.title, "Test");
    assert.equal(doc.body.trim(), "Body.");
  });

  it("returns raw body when no frontmatter", () => {
    const doc = parseFrontmatter("Hello");
    assert.deepEqual(doc.data, {});
    assert.equal(doc.body, "Hello");
  });

  it("merges metadata layers skipping empty values", () => {
    const merged = mergeMetadata(
      { title: "A", empty: "" },
      { subtitle: "B", title: "Override" },
    );
    assert.equal(merged.title, "Override");
    assert.equal(merged.subtitle, "B");
    assert.equal("empty" in merged, false);
  });

  it("maps OKF fields to Pandoc metadata", () => {
    const meta = okfToPandocMeta({
      title: "T",
      description: "D",
      timestamp: "2026-01-01",
      tags: ["a", "b"],
    });
    assert.equal(meta.title, "T");
    assert.equal(meta.subtitle, "D");
    assert.equal(meta.date, "2026-01-01");
    assert.deepEqual(meta.keywords, ["a", "b"]);
  });

  it("formats scalar metadata types in pandoc markdown", () => {
    const md = toPandocMarkdown("Body", { title: "T", draft: true, count: 3 }, false);
    assert.match(md, /draft: true/);
    assert.match(md, /count: 3/);
  });

  it("builds pandoc markdown with cover page", () => {
    const md = toPandocMarkdown("Body", { title: "Cover" }, true);
    assert.match(md, /^---\n/);
    assert.match(md, /# Cover/);
    assert.match(md, /Body/);
  });

  it("returns body unchanged when metadata empty and no cover", () => {
    assert.equal(toPandocMarkdown("Plain", {}, false), "Plain");
  });

  it("builds pandoc markdown with array metadata", () => {
    const md = toPandocMarkdown("Body", { keywords: ["a", "b"], title: "T" }, false);
    assert.match(md, /keywords:/);
    assert.match(md, /- "a"/);
  });
});
