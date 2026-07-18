import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { loadDocumentPackage } from "./config.js";
import {
  buildOutputManifest,
  rewriteMarkdownLinksWithOutDirs,
} from "./links.js";
import { resolveLogicalDocuments } from "./sources.js";

const dirs: string[] = [];

after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function writePkg(
  name: string,
  convertYaml: string,
  files: Record<string, string>,
): string {
  const root = mkdtempSync(path.join(tmpdir(), "doc-repo-link-"));
  dirs.push(root);
  const dir = path.join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "convert.yaml"), convertYaml, "utf8");
  for (const [rel, body] of Object.entries(files)) {
    writeFileSync(path.join(dir, rel), body, "utf8");
  }
  return dir;
}

describe("rewriteMarkdownLinksWithOutDirs", () => {
  it("rewrites sibling document links to the current format", () => {
    const yaml = `out: .output
formats: [docx]
sources:
  include: ["**/*.md"]
  unlisted: ignore
documents:
  - name: alpha
    sources: [a.md]
  - name: beta
    sources: [b.md]
links:
  markdown: output
  missing_target: warn
`;
    const dir = writePkg("pack", yaml, {
      "a.md": "---\ntype: X\ntitle: A\n---\n\nSee [B](b.md).\n",
      "b.md": "---\ntype: X\ntitle: B\n---\n\nB\n",
    });
    const pkg = loadDocumentPackage(dir);
    const docs = resolveLogicalDocuments(pkg);
    const manifest = buildOutputManifest([pkg], new Map([[pkg.dir, docs]]));
    const outDir = path.join(dir, ".output");
    const outDirs = new Map([[pkg.dir, outDir]]);
    const alpha = docs.find((d) => d.name === "alpha")!;
    const rewritten = rewriteMarkdownLinksWithOutDirs(
      "See [B](b.md).",
      pkg,
      "a.md",
      alpha,
      "docx",
      manifest,
      null,
      outDirs,
      [],
    );
    assert.equal(rewritten, "See [B](beta.docx).");
  });

  it("rewrites same-document links to anchors", () => {
    const yaml = `out: .output
formats: [html]
sources:
  include: ["**/*.md"]
  unlisted: ignore
documents:
  - name: book
    sources: [a.md, b.md]
links:
  markdown: output
`;
    const dir = writePkg("pack2", yaml, {
      "a.md": "---\ntype: X\ntitle: A\n---\n\nTo [B](b.md)\n",
      "b.md": "---\ntype: X\ntitle: B\n---\n\nB\n",
    });
    const pkg = loadDocumentPackage(dir);
    const docs = resolveLogicalDocuments(pkg);
    const manifest = buildOutputManifest([pkg], new Map([[pkg.dir, docs]]));
    const book = docs[0];
    const rewritten = rewriteMarkdownLinksWithOutDirs(
      "To [B](b.md)",
      pkg,
      "a.md",
      book,
      "html",
      manifest,
      null,
      new Map([[pkg.dir, path.join(dir, ".output")]]),
      [],
    );
    assert.equal(rewritten, "To [B](#src-b)");
  });

  it("removes links when policy is remove", () => {
    const yaml = `out: .output
formats: [docx]
sources:
  include: ["**/*.md"]
  unlisted: individual
links:
  markdown: remove
`;
    const dir = writePkg("pack3", yaml, {
      "document.md": "---\ntype: X\ntitle: A\n---\n\n",
      "b.md": "---\ntype: X\ntitle: B\n---\n\n",
    });
    const pkg = loadDocumentPackage(dir);
    const docs = resolveLogicalDocuments(pkg);
    const doc = docs.find((d) => d.relativeSources.includes("document.md"))!;
    const rewritten = rewriteMarkdownLinksWithOutDirs(
      "See [B](b.md).",
      pkg,
      "document.md",
      doc,
      "docx",
      buildOutputManifest([pkg], new Map([[pkg.dir, docs]])),
      null,
      new Map([[pkg.dir, path.join(dir, ".output")]]),
      [],
    );
    assert.equal(rewritten, "See B.");
  });
});
