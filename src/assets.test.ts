import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { prepareSourceAssets } from "./assets.js";
import { loadDocumentPackage } from "./config.js";

const dirs: string[] = [];

after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe("prepareSourceAssets", () => {
  it("copies referenced images when assets.mode is generate", () => {
    const root = mkdtempSync(path.join(tmpdir(), "doc-repo-assets-"));
    dirs.push(root);
    const pkgDir = path.join(root, "pkg");
    const outDir = path.join(pkgDir, ".output");
    mkdirSync(path.join(pkgDir, "img"), { recursive: true });
    writeFileSync(path.join(pkgDir, "img", "logo.png"), "PNGDATA", "utf8");
    writeFileSync(
      path.join(pkgDir, "convert.yaml"),
      `out: .output
formats: [html]
assets:
  mode: generate
  directory: assets
  diagrams:
    mermaid: false
  copy_referenced_images: true
sources:
  include: ["**/*.md"]
  unlisted: individual
`,
      "utf8",
    );
    writeFileSync(
      path.join(pkgDir, "document.md"),
      "---\ntype: X\ntitle: T\n---\n\n![Logo](img/logo.png)\n",
      "utf8",
    );

    const pkg = loadDocumentPackage(pkgDir);
    const result = prepareSourceAssets(
      pkg,
      "document.md",
      "![Logo](img/logo.png)\n",
      outDir,
    );
    assert.match(result.body, /!\[Logo\]\(assets\/images\/img\/logo\.png\)/);
    assert.equal(result.assets.length, 1);
    assert.equal(
      readFileSync(result.assets[0].outputPath, "utf8"),
      "PNGDATA",
    );
  });

  it("leaves mermaid fences when mode is reference", () => {
    const root = mkdtempSync(path.join(tmpdir(), "doc-repo-assets-ref-"));
    dirs.push(root);
    const pkgDir = path.join(root, "pkg");
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      path.join(pkgDir, "convert.yaml"),
      `out: .output
formats: [html]
assets:
  mode: reference
sources:
  include: ["**/*.md"]
`,
      "utf8",
    );
    writeFileSync(
      path.join(pkgDir, "document.md"),
      "---\ntype: X\ntitle: T\n---\n",
      "utf8",
    );
    const body = "```mermaid\nflowchart LR\n  A-->B\n```\n";
    const result = prepareSourceAssets(
      loadDocumentPackage(pkgDir),
      "document.md",
      body,
      path.join(pkgDir, ".output"),
    );
    assert.equal(result.body, body);
    assert.equal(result.assets.length, 0);
  });
});
