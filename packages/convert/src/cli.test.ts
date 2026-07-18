import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseArgs, runCli } from "./cli.js";

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

describe("runCli", () => {
  it("returns 1 when input missing", () => {
    assert.equal(runCli([]), 1);
  });

  it("returns 0 for help", () => {
    assert.equal(runCli(["--help"]), 0);
  });
});
