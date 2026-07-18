import assert from "node:assert/strict";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { prepareSourceAssets } from "./assets.js";
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

/**
 * Stubbed prepare pipeline: group sources, copy images, rewrite links — no Pandoc.
 */
describe("stubbed conversion prepare pipeline", () => {
  it("groups five sources into two documents and rewrites links + copies images", () => {
    const root = mkdtempSync(path.join(tmpdir(), "doc-repo-pipe-"));
    dirs.push(root);
    const pkgDir = path.join(root, "handbook");
    const outDir = path.join(pkgDir, ".output");
    mkdirSync(path.join(pkgDir, "media"), { recursive: true });
    writeFileSync(path.join(pkgDir, "media", "chart.png"), "IMG", "utf8");

    writeFileSync(
      path.join(pkgDir, "convert.yaml"),
      `out: .output
formats: [docx, html]
sources:
  include: ["**/*.md"]
  unlisted: individual
documents:
  - name: handbook
    sources: [intro.md, policy.md, appendix.md]
  - name: quick-start
    sources: [quick.md]
assets:
  mode: generate
  directory: assets
  diagrams:
    mermaid: false
  copy_referenced_images: true
links:
  markdown: output
  missing_target: warn
`,
      "utf8",
    );

    const files: Record<string, string> = {
      "intro.md":
        "---\ntype: Reference\ntitle: Intro\n---\n\nSee [policy](policy.md) and [quick](quick.md).\n\n![Chart](media/chart.png)\n",
      "policy.md": "---\ntype: Policy\ntitle: Policy\n---\n\nPolicy body.\n",
      "appendix.md": "---\ntype: Reference\ntitle: Appendix\n---\n\nAppendix.\n",
      "quick.md": "---\ntype: Template\ntitle: Quick\n---\n\nQuick start.\n",
      "loose.md": "---\ntype: Note\ntitle: Loose\n---\n\nUnlisted individual.\n",
    };
    for (const [name, body] of Object.entries(files)) {
      writeFileSync(path.join(pkgDir, name), body, "utf8");
    }

    const pkg = loadDocumentPackage(pkgDir);
    const docs = resolveLogicalDocuments(pkg);
    assert.equal(docs.length, 3); // handbook, quick-start, loose
    const handbook = docs.find((d) => d.name === "handbook")!;
    assert.deepEqual(handbook.relativeSources, [
      "intro.md",
      "policy.md",
      "appendix.md",
    ]);

    const prepared = prepareSourceAssets(
      pkg,
      "intro.md",
      "See [policy](policy.md) and [quick](quick.md).\n\n![Chart](media/chart.png)\n",
      outDir,
    );
    assert.equal(prepared.assets.length, 1);
    assert.match(prepared.body, /assets\/images\/media\/chart\.png/);

    const manifest = buildOutputManifest([pkg], new Map([[pkg.dir, docs]]));
    const outDirs = new Map([[pkg.dir, outDir]]);
    const rewritten = rewriteMarkdownLinksWithOutDirs(
      prepared.body.replace(/!\[[^\]]*\]\([^)]+\)\n?/, ""),
      pkg,
      "intro.md",
      handbook,
      "docx",
      manifest,
      null,
      outDirs,
      [],
    );
    assert.match(rewritten, /\[policy\]\(#src-policy\)/);
    assert.match(rewritten, /\[quick\]\(quick-start\.docx\)/);

    // Touch chmod so Windows temp cleanup is less flaky on stubs
    try {
      chmodSync(pkgDir, 0o755);
    } catch {
      /* ignore */
    }
  });
});
