import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import type { CommandRunner } from "../types.js";
import { createCustomExtractor } from "./custom.js";
import { buildRegistry, selectExtractor } from "./registry.js";

const dirs: string[] = [];
after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe("extractor registry", () => {
  it("selects custom extractor before pandoc", () => {
    const root = mkdtempSync(path.join(tmpdir(), "reg-"));
    dirs.push(root);
    writeFileSync(
      path.join(root, "deconstruct.extractors.yaml"),
      `extractors:
  - name: echo
    match: ["*.echo.txt"]
    command: ["node", "-e", "console.log('custom')"]
`,
      "utf8",
    );
    const runCommand: CommandRunner = async () => ({
      stdout: "ignored",
      stderr: "",
      code: 0,
    });
    const registry = buildRegistry({ repoRoot: root, runCommand });
    const picked = selectExtractor(registry, "sample.echo.txt", "auto");
    assert.equal(picked.name, "echo");
  });

  it("falls back to pandoc for docx", () => {
    const root = mkdtempSync(path.join(tmpdir(), "reg2-"));
    dirs.push(root);
    const runCommand: CommandRunner = async () => ({
      stdout: "",
      stderr: "",
      code: 0,
    });
    const registry = buildRegistry({ repoRoot: root, runCommand });
    const picked = selectExtractor(registry, "file.docx", "auto");
    assert.equal(picked.name, "pandoc");
  });

  it("forces extractor by name", () => {
    const root = mkdtempSync(path.join(tmpdir(), "reg3-"));
    dirs.push(root);
    const runCommand: CommandRunner = async () => ({
      stdout: "",
      stderr: "",
      code: 0,
    });
    const registry = buildRegistry({ repoRoot: root, runCommand });
    const picked = selectExtractor(registry, "file.docx", "pandoc");
    assert.equal(picked.name, "pandoc");
  });

  it("throws when extractor name is unknown", () => {
    const root = mkdtempSync(path.join(tmpdir(), "reg4-"));
    dirs.push(root);
    const runCommand: CommandRunner = async () => ({
      stdout: "",
      stderr: "",
      code: 0,
    });
    const registry = buildRegistry({ repoRoot: root, runCommand });
    assert.throws(
      () => selectExtractor(registry, "file.docx", "missing"),
      /Unknown extractor/,
    );
  });

  it("custom extractor reads stdout markdown", async () => {
    const runCommand: CommandRunner = async () => ({
      stdout: "# From stdout\n",
      stderr: "",
      code: 0,
    });
    const extractor = createCustomExtractor(
      { name: "mock", match: ["*.txt"], command: ["echo", "hi"] },
      runCommand,
    );
    const workDir = mkdtempSync(path.join(tmpdir(), "cust-"));
    dirs.push(workDir);
    const result = await extractor.extract({
      originalPath: path.join(workDir, "x.txt"),
      workDir,
    });
    assert.match(result.markdown, /From stdout/);
  });
});
