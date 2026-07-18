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
import { loadDocumentPackage } from "./config.js";
import { previewLogicalDocuments } from "./convert.js";

const dirs: string[] = [];
after(() => {
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
    try {
      chmodSync(pkgDir, 0o755);
    } catch {
      /* ignore */
    }
  });
});
