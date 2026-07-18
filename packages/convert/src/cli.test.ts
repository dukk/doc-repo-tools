import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseArgs } from "./cli.js";

describe("parseArgs", () => {
  it("parses format and out overrides", () => {
    const args = parseArgs([
      "knowledge/foo",
      "--format",
      "pdf,html",
      "--out",
      ".output",
    ]);
    assert.equal(args.input, "knowledge/foo");
    assert.equal(args.formats, "pdf,html");
    assert.equal(args.outDir, ".output");
    assert.equal(args.help, false);
  });

  it("sets help flag", () => {
    const args = parseArgs(["--help"]);
    assert.equal(args.help, true);
    assert.equal(args.input, "");
  });

  it("throws on unknown option", () => {
    assert.throws(() => parseArgs(["--nope"]), /Unknown option/);
  });
});
