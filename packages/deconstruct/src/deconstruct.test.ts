import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { deconstructFile, findRepoRoot, listInputFiles } from "./deconstruct.js";
import { sha256File } from "./hash.js";
import type { CommandRunner } from "./types.js";

const dirs: string[] = [];
after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe("deconstructFile", () => {
  it("copies source to .original and writes OKF package", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "dec-"));
    dirs.push(root);
    const source = path.join(root, "handbook.docx");
    writeFileSync(source, "FAKE-DOCX-BYTES", "utf8");
    const outDir = path.join(root, "pkg");

    const runCommand: CommandRunner = async () => ({
      stdout: "# Handbook\n\nImported body paragraph.\n",
      stderr: "",
      code: 0,
    });

    const result = await deconstructFile({
      inputPath: source,
      inputFile: source,
      outDir,
      runCommand,
      repoRoot: root,
    });

    const originalPath = path.join(result.packageDir, ".original", "handbook.docx");
    assert.ok(existsSync(originalPath));
    assert.equal(readFileSync(originalPath, "utf8"), "FAKE-DOCX-BYTES");
    assert.equal(sha256File(originalPath), sha256File(source));

    const doc = readFileSync(path.join(result.packageDir, "handbook.md"), "utf8");
    assert.match(doc, /type: Reference/);
    assert.match(doc, /resource: \.original\/handbook\.docx/);
    assert.match(doc, /Imported body paragraph/);

    assert.ok(existsSync(path.join(result.packageDir, "convert.yaml")));
    assert.ok(existsSync(path.join(result.packageDir, "deconstruct.yaml")));
    assert.equal(result.extractor, "pandoc");
  });

  it("refuses overwrite without force", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "dec2-"));
    dirs.push(root);
    const source = path.join(root, "a.docx");
    writeFileSync(source, "X", "utf8");
    const outDir = path.join(root, "pkg");
    const runCommand: CommandRunner = async () => ({
      stdout: "Body",
      stderr: "",
      code: 0,
    });
    await deconstructFile({
      inputPath: source,
      inputFile: source,
      outDir,
      runCommand,
      repoRoot: root,
    });
    await assert.rejects(
      () =>
        deconstructFile({
          inputPath: source,
          inputFile: source,
          outDir,
          runCommand,
          repoRoot: root,
        }),
      /Package already exists/,
    );
  });

  it("lists files in input directory", () => {
    const root = mkdtempSync(path.join(tmpdir(), "dec3-"));
    dirs.push(root);
    writeFileSync(path.join(root, "a.docx"), "1", "utf8");
    writeFileSync(path.join(root, "b.pdf"), "2", "utf8");
    writeFileSync(path.join(root, ".hidden"), "3", "utf8");
    const files = listInputFiles(root);
    assert.equal(files.length, 2);
  });

  it("deconstructs batch directory into slugged packages", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "dec4-"));
    dirs.push(root);
    const imports = path.join(root, "imports");
    mkdirSync(imports, { recursive: true });
    writeFileSync(path.join(imports, "one.docx"), "1", "utf8");
    writeFileSync(path.join(imports, "two.docx"), "2", "utf8");
    const outRoot = path.join(root, "out");
    const runCommand: CommandRunner = async () => ({
      stdout: "Body text.",
      stderr: "",
      code: 0,
    });
    const { deconstructPaths } = await import("./deconstruct.js");
    const results = await deconstructPaths({
      inputPath: imports,
      outDir: outRoot,
      runCommand,
      repoRoot: root,
    });
    assert.equal(results.length, 2);
    assert.ok(existsSync(path.join(outRoot, "one", "one.md")));
    assert.ok(existsSync(path.join(outRoot, "two", "two.md")));
  });

  it("errors when no extractor matches", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "dec5-"));
    dirs.push(root);
    const source = path.join(root, "weird.xyz");
    writeFileSync(source, "x", "utf8");
    const runCommand: CommandRunner = async () => ({
      stdout: "",
      stderr: "",
      code: 0,
    });
    await assert.rejects(
      () =>
        deconstructFile({
          inputPath: source,
          inputFile: source,
          outDir: path.join(root, "pkg"),
          runCommand,
          repoRoot: root,
        }),
      /No extractor can handle/,
    );
  });

  it("findRepoRoot prefers deconstruct.extractors.yaml", () => {
    const root = mkdtempSync(path.join(tmpdir(), "dec6-"));
    dirs.push(root);
    writeFileSync(
      path.join(root, "deconstruct.extractors.yaml"),
      "extractors: []\n",
      "utf8",
    );
    assert.equal(findRepoRoot(root), root);
  });

  it("allows force re-run when original hash matches", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "dec7-"));
    dirs.push(root);
    const source = path.join(root, "a.docx");
    writeFileSync(source, "SAME", "utf8");
    const outDir = path.join(root, "pkg");
    const runCommand: CommandRunner = async () => ({
      stdout: "Body one.",
      stderr: "",
      code: 0,
    });
    await deconstructFile({
      inputPath: source,
      inputFile: source,
      outDir,
      runCommand,
      repoRoot: root,
    });
    await deconstructFile({
      inputPath: source,
      inputFile: source,
      outDir,
      runCommand,
      repoRoot: root,
      force: true,
    });
    const doc = readFileSync(path.join(outDir, "a.md"), "utf8");
    assert.match(doc, /Body one/);
  });

  it("refuses force when original bytes differ", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "dec8-"));
    dirs.push(root);
    const source = path.join(root, "a.docx");
    writeFileSync(source, "ONE", "utf8");
    const outDir = path.join(root, "pkg");
    const runCommand: CommandRunner = async () => ({
      stdout: "Body",
      stderr: "",
      code: 0,
    });
    await deconstructFile({
      inputPath: source,
      inputFile: source,
      outDir,
      runCommand,
      repoRoot: root,
    });
    writeFileSync(source, "TWO", "utf8");
    await assert.rejects(
      () =>
        deconstructFile({
          inputPath: source,
          inputFile: source,
          outDir,
          runCommand,
          repoRoot: root,
          force: true,
        }),
      /Refusing to overwrite .original/,
    );
  });

  it("uses explicit title override", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "dec10-"));
    dirs.push(root);
    const source = path.join(root, "a.docx");
    writeFileSync(source, "X", "utf8");
    const runCommand: CommandRunner = async () => ({
      stdout: "# Ignored\n",
      stderr: "",
      code: 0,
    });
    await deconstructFile({
      inputPath: source,
      inputFile: source,
      outDir: path.join(root, "pkg"),
      title: "Custom Title",
      runCommand,
      repoRoot: root,
    });
    const doc = readFileSync(path.join(root, "pkg", "custom-title.md"), "utf8");
    assert.match(doc, /title: Custom Title/);
  });

  it("errors when input directory has no files", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "dec9-"));
    dirs.push(root);
    const empty = path.join(root, "empty");
    mkdirSync(empty, { recursive: true });
    const { deconstructPaths } = await import("./deconstruct.js");
    await assert.rejects(
      () =>
        deconstructPaths({
          inputPath: empty,
          outDir: path.join(root, "out"),
          runCommand: async () => ({ stdout: "x", stderr: "", code: 0 }),
          repoRoot: root,
        }),
      /No supported files/,
    );
  });
});
