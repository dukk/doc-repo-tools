import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createPandocExtractor } from "./pandoc.js";
import type { CommandRunner } from "../types.js";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

describe("pandoc extractor", () => {
  it("handles docx via mocked pandoc", async () => {
    const runCommand: CommandRunner = async () => ({
      stdout: "# Title\n\n![img](./media/pic.png)\n",
      stderr: "",
      code: 0,
    });
    const extractor = createPandocExtractor(runCommand);
    assert.ok(extractor.canHandle({ path: "x.docx" }));
    assert.ok(!extractor.canHandle({ path: "x.unknown" }));

    const workDir = mkdtempSync(path.join(tmpdir(), "pan-"));
    const media = path.join(workDir, "media");
    mkdirSync(media, { recursive: true });
    writeFileSync(path.join(media, "pic.png"), "PNG", "utf8");
    try {
      const result = await extractor.extract({
        originalPath: path.join(workDir, "x.docx"),
        workDir,
      });
      assert.match(result.markdown, /assets\/media/);
      assert.equal(result.assets.length, 1);
      assert.equal(result.metadata.title, "Title");
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  it("surfaces pandoc failures", async () => {
    const runCommand: CommandRunner = async () => ({
      stdout: "",
      stderr: "boom",
      code: 1,
    });
    const extractor = createPandocExtractor(runCommand);
    const workDir = mkdtempSync(path.join(tmpdir(), "pan2-"));
    try {
      await assert.rejects(
        () =>
          extractor.extract({
            originalPath: path.join(workDir, "x.docx"),
            workDir,
          }),
        /pandoc failed/,
      );
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });
});
