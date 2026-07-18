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

  it("preserves links when policy is preserve", () => {
    const yaml = `out: .output
formats: [docx]
sources:
  include: ["**/*.md"]
links:
  markdown: preserve
`;
    const dir = writePkg("pack4", yaml, {
      "document.md": "---\ntype: X\ntitle: A\n---\n\nSee [B](b.md).\n",
      "b.md": "---\ntype: X\ntitle: B\n---\n\n",
    });
    const pkg = loadDocumentPackage(dir);
    const docs = resolveLogicalDocuments(pkg);
    const doc = docs[0];
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
    assert.equal(rewritten, "See [B](b.md).");
  });

  it("errors on missing targets when configured", () => {
    const yaml = `out: .output
formats: [docx]
sources:
  include: ["**/*.md"]
links:
  markdown: output
  missing_target: error
`;
    const dir = writePkg("pack5", yaml, {
      "document.md": "---\ntype: X\ntitle: A\n---\n\n",
    });
    const pkg = loadDocumentPackage(dir);
    const docs = resolveLogicalDocuments(pkg);
    assert.throws(
      () =>
        rewriteMarkdownLinksWithOutDirs(
          "See [X](missing.md).",
          pkg,
          "document.md",
          docs[0],
          "docx",
          buildOutputManifest([pkg], new Map([[pkg.dir, docs]])),
          null,
          new Map([[pkg.dir, path.join(dir, ".output")]]),
          [],
        ),
      /unresolved markdown link target/,
    );
  });

  it("warns on missing targets without rewriting", () => {
    const yaml = `out: .output
formats: [docx]
sources:
  include: ["**/*.md"]
links:
  markdown: output
  missing_target: warn
`;
    const dir = writePkg("pack6", yaml, {
      "document.md": "---\ntype: X\ntitle: A\n---\n\n",
    });
    const pkg = loadDocumentPackage(dir);
    const docs = resolveLogicalDocuments(pkg);
    const warnings: import("./links.js").LinkWarning[] = [];
    const rewritten = rewriteMarkdownLinksWithOutDirs(
      "See [X](missing.md).",
      pkg,
      "document.md",
      docs[0],
      "docx",
      buildOutputManifest([pkg], new Map([[pkg.dir, docs]])),
      null,
      new Map([[pkg.dir, path.join(dir, ".output")]]),
      warnings,
    );
    assert.equal(rewritten, "See [X](missing.md).");
    assert.equal(warnings.length, 1);
  });

  it("rewrites hash links within the same combined document", () => {
    const yaml = `out: .output
formats: [html]
sources:
  include: ["**/*.md"]
documents:
  - name: book
    sources: [a.md, b.md]
links:
  markdown: output
`;
    const dir = writePkg("pack7", yaml, {
      "a.md": "---\ntype: X\ntitle: A\n---\n\nSee [B](b.md#section)\n",
      "b.md": "---\ntype: X\ntitle: B\n---\n\n## Section\n",
    });
    const pkg = loadDocumentPackage(dir);
    const docs = resolveLogicalDocuments(pkg);
    const book = docs[0];
    const rewritten = rewriteMarkdownLinksWithOutDirs(
      "See [B](b.md#section)",
      pkg,
      "a.md",
      book,
      "html",
      buildOutputManifest([pkg], new Map([[pkg.dir, docs]])),
      null,
      new Map([[pkg.dir, path.join(dir, ".output")]]),
      [],
    );
    assert.equal(rewritten, "See [B](#section)");
  });

  it("preserves missing links when missing_target is preserve", () => {
    const yaml = `out: .output
formats: [docx]
sources:
  include: ["**/*.md"]
links:
  markdown: output
  missing_target: preserve
`;
    const dir = writePkg("pack8", yaml, {
      "document.md": "---\ntype: X\ntitle: A\n---\n\n",
    });
    const pkg = loadDocumentPackage(dir);
    const docs = resolveLogicalDocuments(pkg);
    const warnings: import("./links.js").LinkWarning[] = [];
    const rewritten = rewriteMarkdownLinksWithOutDirs(
      "See [X](missing.md).",
      pkg,
      "document.md",
      docs[0],
      "docx",
      buildOutputManifest([pkg], new Map([[pkg.dir, docs]])),
      null,
      new Map([[pkg.dir, path.join(dir, ".output")]]),
      warnings,
    );
    assert.equal(rewritten, "See [X](missing.md).");
    assert.equal(warnings.length, 0);
  });

  it("rewrites cross-package links using relative output paths", () => {
    const root = mkdtempSync(path.join(tmpdir(), "link-cross-"));
    dirs.push(root);
    const alpha = writePkg("alpha", `out: .output
formats: [docx]
sources:
  include: ["**/*.md"]
  unlisted: ignore
documents:
  - name: alpha-doc
    sources: [a.md]
links:
  markdown: output
`, {
      "a.md": "---\ntype: X\ntitle: A\n---\n\nSee [B](../beta/b.md).\n",
    });
    const beta = writePkg("beta", `out: .output
formats: [docx]
sources:
  include: ["**/*.md"]
  unlisted: ignore
documents:
  - name: beta-doc
    sources: [b.md]
links:
  markdown: output
`, {
      "b.md": "---\ntype: X\ntitle: B\n---\n\nB\n",
    });
    // relocate beta beside alpha under shared root
    const shared = path.join(root, "shared");
    mkdirSync(shared, { recursive: true });
    const alphaDir = path.join(shared, "alpha");
    const betaDir = path.join(shared, "beta");
    mkdirSync(alphaDir, { recursive: true });
    mkdirSync(betaDir, { recursive: true });
    writeFileSync(path.join(alphaDir, "convert.yaml"), readFileSync(path.join(alpha, "convert.yaml"), "utf8"), "utf8");
    writeFileSync(path.join(alphaDir, "a.md"), readFileSync(path.join(alpha, "a.md"), "utf8"), "utf8");
    writeFileSync(path.join(betaDir, "convert.yaml"), readFileSync(path.join(beta, "convert.yaml"), "utf8"), "utf8");
    writeFileSync(path.join(betaDir, "b.md"), readFileSync(path.join(beta, "b.md"), "utf8"), "utf8");

    const pkgA = loadDocumentPackage(alphaDir);
    const pkgB = loadDocumentPackage(betaDir);
    const docsA = resolveLogicalDocuments(pkgA);
    const docsB = resolveLogicalDocuments(pkgB);
    const manifest = buildOutputManifest(
      [pkgA, pkgB],
      new Map([
        [pkgA.dir, docsA],
        [pkgB.dir, docsB],
      ]),
    );
    const outA = path.join(alphaDir, ".output");
    const outB = path.join(betaDir, ".output");
    const rewritten = rewriteMarkdownLinksWithOutDirs(
      "See [B](../beta/b.md).",
      pkgA,
      "a.md",
      docsA[0],
      "docx",
      manifest,
      null,
      new Map([
        [pkgA.dir, outA],
        [pkgB.dir, outB],
      ]),
      [],
    );
    assert.match(rewritten, /beta-doc\.docx/);
  });
});
