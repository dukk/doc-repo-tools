import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseArgs, runCli } from "./cli.js";

describe("deconstruct parseArgs", () => {
  it("parses required out and options", () => {
    const args = parseArgs([
      "file.docx",
      "--out",
      "knowledge/foo",
      "--type",
      "Policy",
      "--title",
      "My Doc",
      "--extractor",
      "pandoc",
      "--force",
    ]);
    assert.equal(args.input, "file.docx");
    assert.equal(args.outDir, "knowledge/foo");
    assert.equal(args.type, "Policy");
    assert.equal(args.title, "My Doc");
    assert.equal(args.extractor, "pandoc");
    assert.equal(args.force, true);
  });

  it("throws on unknown flags", () => {
    assert.throws(() => parseArgs(["x", "--out", "y", "--bad"]), /Unknown option/);
  });

  it("defaults type and extractor", () => {
    const args = parseArgs(["in.docx", "--out", "out"]);
    assert.equal(args.type, "Reference");
    assert.equal(args.extractor, "auto");
    assert.equal(args.force, false);
  });
});

describe("runCli", () => {
  it("returns 1 when out is missing", async () => {
    assert.equal(await runCli(["file.docx"]), 1);
  });

  it("returns 0 for help", async () => {
    assert.equal(await runCli(["--help"]), 0);
  });

  it("returns 1 when deconstruct fails", async () => {
    assert.equal(await runCli(["missing.docx", "--out", "out"]), 1);
  });
});
