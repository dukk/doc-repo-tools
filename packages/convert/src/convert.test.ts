import assert from "node:assert/strict";
import {
  chmodSync,
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
import { setMermaidRenderHook } from "./assets.js";
import { loadDocumentPackage } from "./config.js";
import {
  combineBodies,
  convertPaths,
  findKnowledgeRoot,
  previewLogicalDocuments,
} from "./convert.js";

const dirs: string[] = [];
after(() => {
  setMermaidRenderHook(null);
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe("convert helpers", () => {
  it("previewLogicalDocuments resolves package docs", () => {
    const root = mkdtempSync(path.join(tmpdir(), "conv-"));
    dirs.push(root);
    const pkgDir = path.join(root, "sample");
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      path.join(pkgDir, "convert.yaml"),
      `formats: [pdf]\nsources:\n  include: ["**/*.md"]\n`,
      "utf8",
    );
    writeFileSync(path.join(pkgDir, "document.md"), "# Doc\n", "utf8");
    const pkg = loadDocumentPackage(pkgDir);
    const docs = previewLogicalDocuments(pkg);
    assert.equal(docs.length, 1);
    assert.equal(docs[0].name, "sample");
  });

  it("combineBodies adds anchors for multi-source docs", () => {
    const combined = combineBodies([
      { relativeSource: "a.md", body: "A", title: "Alpha" },
      { relativeSource: "b.md", body: "B", title: "Beta" },
    ]);
    assert.match(combined, /# Alpha/);
    assert.match(combined, /# Beta/);
    assert.match(combined, /id="src-a"/);
  });

  it("combineBodies uses single anchor for one part", () => {
    const combined = combineBodies([
      { relativeSource: "only.md", body: "Only body" },
    ]);
    assert.match(combined, /id="src-only"/);
    assert.doesNotMatch(combined, /^# /m);
  });

  it("findKnowledgeRoot walks parents", () => {
    const root = mkdtempSync(path.join(tmpdir(), "kr-"));
    dirs.push(root);
    const knowledge = path.join(root, "knowledge", "cat", "slug");
    mkdirSync(knowledge, { recursive: true });
    assert.equal(findKnowledgeRoot(knowledge), path.join(root, "knowledge"));
  });
});

describe("convertPaths", () => {
  it("writes outputs using injected pandoc runtime", () => {
    const root = mkdtempSync(path.join(tmpdir(), "conv-paths-"));
    dirs.push(root);
    const pkgDir = path.join(root, "knowledge", "demo");
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      path.join(pkgDir, "convert.yaml"),
      `out: .output
formats: [html, pdf]
sources:
  include: ["**/*.md"]
links:
  markdown: preserve
`,
      "utf8",
    );
    writeFileSync(
      path.join(pkgDir, "document.md"),
      "---\ntype: Reference\ntitle: Demo\n---\n\nHello export.\n",
      "utf8",
    );

    const written: string[] = [];
    const results = convertPaths(
      pkgDir,
      {},
      {
        assertPandocAvailable: () => {},
        runPandoc: (_input, outputFile) => {
          mkdirSync(path.dirname(outputFile), { recursive: true });
          writeFileSync(outputFile, "MOCK", "utf8");
          written.push(outputFile);
        },
      },
    );

    assert.equal(results.length, 1);
    assert.equal(results[0].outputs.length, 2);
    assert.ok(existsSync(path.join(pkgDir, ".output", "demo.html")));
    assert.ok(existsSync(path.join(pkgDir, ".output", "demo.pdf")));
    assert.equal(written.length, 2);
  });

  it("renders mermaid assets when configured", () => {
    const root = mkdtempSync(path.join(tmpdir(), "conv-mmd-"));
    dirs.push(root);
    const pkgDir = path.join(root, "diagram");
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      path.join(pkgDir, "convert.yaml"),
      `out: .output
formats: [html]
sources:
  include: ["**/*.md"]
assets:
  mode: generate
  directory: assets
  diagrams:
    mermaid: true
  copy_referenced_images: false
links:
  markdown: preserve
`,
      "utf8",
    );
    writeFileSync(
      path.join(pkgDir, "document.md"),
      "```mermaid\ngraph TD\n  A-->B\n```\n",
      "utf8",
    );

    setMermaidRenderHook((code, out) => {
      writeFileSync(out, `<svg>${code.length}</svg>`, "utf8");
    });

    convertPaths(
      pkgDir,
      { formats: ["html"] },
      {
        assertPandocAvailable: () => {},
        runPandoc: (inputMd, outputFile) => {
          writeFileSync(outputFile, readFileSync(inputMd, "utf8"), "utf8");
        },
      },
    );

    const svg = path.join(pkgDir, ".output", "assets", "diagrams", "document-md-1.svg");
    assert.ok(existsSync(svg));
    try {
      chmodSync(pkgDir, 0o755);
    } catch {
      /* ignore */
    }
  });

  it("errors when no packages found", () => {
    const root = mkdtempSync(path.join(tmpdir(), "conv-empty-"));
    dirs.push(root);
    assert.throws(
      () =>
        convertPaths(root, {}, { assertPandocAvailable: () => {}, runPandoc: () => {} }),
      /No document packages/,
    );
  });
});
