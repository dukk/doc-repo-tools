import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import {
  collectDocumentPackages,
  defaultConvertYaml,
  isDocumentPackage,
  loadConvertConfig,
} from "./config.js";

const dirs: string[] = [];
after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe("config", () => {
  it("loads convert.yaml with defaults", () => {
    const root = mkdtempSync(path.join(tmpdir(), "cfg-"));
    dirs.push(root);
    const pkgDir = path.join(root, "pkg");
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      path.join(pkgDir, "convert.yaml"),
      `formats: [pdf]\n`,
      "utf8",
    );
    const cfg = loadConvertConfig(path.join(pkgDir, "convert.yaml"));
    assert.deepEqual(cfg.formats, ["pdf"]);
    assert.equal(cfg.sources.unlisted, "individual");
    assert.match(cfg.sources.exclude.join(","), /\.original/);
  });

  it("detects document packages and skips .original", () => {
    const root = mkdtempSync(path.join(tmpdir(), "pkgs-"));
    dirs.push(root);
    const pkg = path.join(root, "alpha");
    mkdirSync(path.join(pkg, ".original"), { recursive: true });
    writeFileSync(path.join(pkg, "convert.yaml"), "formats: [pdf]\n", "utf8");
    writeFileSync(path.join(pkg, "document.md"), "# Hi\n", "utf8");
    assert.ok(isDocumentPackage(pkg));
    const found = collectDocumentPackages(root);
    assert.equal(found.length, 1);
    assert.equal(found[0].slug, "alpha");
  });

  it("defaultConvertYaml includes .original exclude", () => {
    assert.match(defaultConvertYaml(), /\.original\/\*\*/);
  });

  it("rejects invalid documents group", () => {
    const root = mkdtempSync(path.join(tmpdir(), "bad-"));
    dirs.push(root);
    const cfgPath = path.join(root, "convert.yaml");
    writeFileSync(
      cfgPath,
      `documents:\n  - name: ""\n    sources: []\n`,
      "utf8",
    );
    assert.throws(() => loadConvertConfig(cfgPath), /missing a non-empty name/);
  });

  it("collects packages from convert.yaml file path", () => {
    const root = mkdtempSync(path.join(tmpdir(), "cfg-file-"));
    dirs.push(root);
    const pkgDir = path.join(root, "pkg");
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(path.join(pkgDir, "convert.yaml"), "formats: [pdf]\n", "utf8");
    const found = collectDocumentPackages(path.join(pkgDir, "convert.yaml"));
    assert.equal(found.length, 1);
  });

  it("collects package from document.md file path", () => {
    const root = mkdtempSync(path.join(tmpdir(), "cfg-doc-"));
    dirs.push(root);
    const pkgDir = path.join(root, "pkg");
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(path.join(pkgDir, "convert.yaml"), "formats: [pdf]\n", "utf8");
    writeFileSync(path.join(pkgDir, "document.md"), "# X\n", "utf8");
    const found = collectDocumentPackages(path.join(pkgDir, "document.md"));
    assert.equal(found.length, 1);
  });

  it("loads convert.yaml with string formats", () => {
    const root = mkdtempSync(path.join(tmpdir(), "cfg-str-"));
    dirs.push(root);
    const cfgPath = path.join(root, "convert.yaml");
    writeFileSync(cfgPath, "formats: pdf, docx\n", "utf8");
    const cfg = loadConvertConfig(cfgPath);
    assert.deepEqual(cfg.formats, ["pdf", "docx"]);
  });

  it("errors on invalid enum values", () => {
    const root = mkdtempSync(path.join(tmpdir(), "cfg-enum-"));
    dirs.push(root);
    const cfgPath = path.join(root, "convert.yaml");
    writeFileSync(cfgPath, "sources:\n  unlisted: bogus\n", "utf8");
    assert.throws(() => loadConvertConfig(cfgPath), /Invalid sources.unlisted/);
  });
});
