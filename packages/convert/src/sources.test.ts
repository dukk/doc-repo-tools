import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, after } from "node:test";
import { loadConvertConfig, loadDocumentPackage } from "./config.js";
import { globToRegExp, resolveLogicalDocuments, sourceAnchorId } from "./sources.js";

const dirs: string[] = [];

function tempPkg(files: Record<string, string>, convertYaml: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "doc-repo-src-"));
  dirs.push(dir);
  writeFileSync(path.join(dir, "convert.yaml"), convertYaml, "utf8");
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(dir, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, body, "utf8");
  }
  return dir;
}

after(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("globToRegExp", () => {
  it("matches recursive markdown globs", () => {
    const re = globToRegExp("**/*.md");
    assert.equal(re.test("document.md"), true);
    assert.equal(re.test("a/b/c.md"), true);
    assert.equal(re.test("a/b/c.txt"), false);
  });

  it("matches single-segment wildcards", () => {
    const re = globToRegExp("?.md");
    assert.equal(re.test("a.md"), true);
    assert.equal(re.test("ab.md"), false);
  });
});

describe("resolveLogicalDocuments", () => {
  it("keeps classic document.md packages as a single output", () => {
    const dir = tempPkg(
      {
        "document.md": "---\ntype: Reference\ntitle: Solo\n---\n\n# Solo\n",
      },
      `out: .output
formats: [pdf]
sources:
  include: ["**/*.md"]
  exclude: [".output/**"]
  unlisted: individual
`,
    );
    const pkg = loadDocumentPackage(dir);
    const docs = resolveLogicalDocuments(pkg);
    assert.equal(docs.length, 1);
    assert.equal(docs[0].name, path.basename(dir));
    assert.deepEqual(docs[0].relativeSources, ["document.md"]);
  });

  it("combines explicit document groups in order", () => {
    const dir = tempPkg(
      {
        "a.md": "---\ntype: Playbook\ntitle: A\n---\n\nA\n",
        "b.md": "---\ntype: Playbook\ntitle: B\n---\n\nB\n",
        "c.md": "---\ntype: Playbook\ntitle: C\n---\n\nC\n",
      },
      `out: .output
formats: [docx]
sources:
  include: ["**/*.md"]
  exclude: []
  unlisted: ignore
documents:
  - name: handbook
    sources: [a.md, b.md]
  - name: quick
    sources: [c.md]
`,
    );
    const docs = resolveLogicalDocuments(loadDocumentPackage(dir));
    assert.equal(docs.length, 2);
    assert.deepEqual(docs[0].relativeSources, ["a.md", "b.md"]);
    assert.equal(docs[0].name, "handbook");
    assert.deepEqual(docs[1].relativeSources, ["c.md"]);
  });

  it("errors on duplicate source membership", () => {
    const dir = tempPkg(
      {
        "a.md": "---\ntype: Playbook\ntitle: A\n---\n\nA\n",
      },
      `out: .output
formats: [docx]
sources:
  include: ["**/*.md"]
  unlisted: ignore
documents:
  - name: one
    sources: [a.md]
  - name: two
    sources: [a.md]
`,
    );
    assert.throws(() => resolveLogicalDocuments(loadDocumentPackage(dir)), /belongs to both/);
  });

  it("creates individual outputs for unlisted sources", () => {
    const dir = tempPkg(
      {
        "a.md": "---\ntype: Playbook\ntitle: A\n---\n\nA\n",
        "extra.md": "---\ntype: Playbook\ntitle: Extra\n---\n\nE\n",
      },
      `out: .output
formats: [docx]
sources:
  include: ["**/*.md"]
  unlisted: individual
documents:
  - name: one
    sources: [a.md]
`,
    );
    const docs = resolveLogicalDocuments(loadDocumentPackage(dir));
    assert.equal(docs.length, 2);
    assert.ok(docs.some((d) => d.name === "extra"));
  });

  it("errors when unlisted mode is error", () => {
    const dir = tempPkg(
      {
        "a.md": "---\ntype: Playbook\ntitle: A\n---\n\nA\n",
        "extra.md": "---\ntype: Playbook\ntitle: Extra\n---\n\nE\n",
      },
      `out: .output
formats: [docx]
sources:
  include: ["**/*.md"]
  unlisted: error
documents:
  - name: one
    sources: [a.md]
`,
    );
    assert.throws(() => resolveLogicalDocuments(loadDocumentPackage(dir)), /Unlisted markdown/);
  });
});

describe("sourceAnchorId", () => {
  it("builds stable anchors", () => {
    assert.equal(sourceAnchorId("01-purpose.md"), "src-01-purpose");
    assert.equal(sourceAnchorId("nested/file.md"), "src-nested-file");
  });
});

describe("loadConvertConfig", () => {
  it("parses assets and links defaults", () => {
    const dir = tempPkg(
      { "document.md": "---\ntype: X\ntitle: T\n---\n" },
      `out: .output
formats: [pdf]
assets:
  mode: generate
  diagrams:
    mermaid: true
  copy_referenced_images: true
links:
  markdown: remove
  missing_target: error
`,
    );
    const cfg = loadConvertConfig(path.join(dir, "convert.yaml"));
    assert.equal(cfg.assets.mode, "generate");
    assert.equal(cfg.assets.diagrams.mermaid, true);
    assert.equal(cfg.links.markdown, "remove");
    assert.equal(cfg.links.missing_target, "error");
  });
});
