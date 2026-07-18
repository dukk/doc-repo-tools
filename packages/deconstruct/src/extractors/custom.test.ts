import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { createCustomExtractor } from "./custom.js";
import type { CommandRunner } from "../types.js";

const dirs: string[] = [];
after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe("custom extractor", () => {
  it("reads document.md from workDir when present", async () => {
    const runCommand: CommandRunner = async () => ({
      stdout: "ignored",
      stderr: "",
      code: 0,
    });
    const extractor = createCustomExtractor(
      { name: "mock", match: ["*.txt"], command: ["echo", "hi"] },
      runCommand,
    );
    const workDir = mkdtempSync(path.join(tmpdir(), "cust2-"));
    dirs.push(workDir);
    writeFileSync(path.join(workDir, "document.md"), "# From file\n", "utf8");
    const result = await extractor.extract({
      originalPath: path.join(workDir, "x.txt"),
      workDir,
    });
    assert.match(result.markdown, /From file/);
  });

  it("errors on failed command", async () => {
    const runCommand: CommandRunner = async () => ({
      stdout: "",
      stderr: "fail",
      code: 2,
    });
    const extractor = createCustomExtractor(
      { name: "bad", match: ["*.txt"], command: ["false"] },
      runCommand,
    );
    const workDir = mkdtempSync(path.join(tmpdir(), "cust3-"));
    dirs.push(workDir);
    await assert.rejects(
      () =>
        extractor.extract({
          originalPath: path.join(workDir, "x.txt"),
          workDir,
        }),
      /failed \(exit 2\)/,
    );
  });

  it("errors on empty command config", async () => {
    const runCommand: CommandRunner = async () => ({
      stdout: "",
      stderr: "",
      code: 0,
    });
    const extractor = createCustomExtractor(
      { name: "empty", match: ["*.txt"], command: [] },
      runCommand,
    );
    const workDir = mkdtempSync(path.join(tmpdir(), "cust4-"));
    dirs.push(workDir);
    await assert.rejects(
      () =>
        extractor.extract({
          originalPath: path.join(workDir, "x.txt"),
          workDir,
        }),
      /empty command/,
    );
  });

  it("collects assets from workDir/assets", async () => {
    const runCommand: CommandRunner = async () => ({
      stdout: "Body",
      stderr: "",
      code: 0,
    });
    const extractor = createCustomExtractor(
      { name: "assets", match: ["*.txt"], command: ["echo", "x"] },
      runCommand,
    );
    const workDir = mkdtempSync(path.join(tmpdir(), "cust5-"));
    dirs.push(workDir);
    const assetsDir = path.join(workDir, "assets", "img");
    mkdirSync(assetsDir, { recursive: true });
    writeFileSync(path.join(assetsDir, "a.png"), "PNG", "utf8");
    const result = await extractor.extract({
      originalPath: path.join(workDir, "x.txt"),
      workDir,
    });
    assert.equal(result.assets.length, 1);
    assert.match(result.assets[0].relPath, /assets\/img\/a\.png/);
  });
});
