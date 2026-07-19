import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import {
  listPackageMarkdownSources,
  resolvePrimarySourceRel,
} from "./primary-source.js";
import { titleToSourceFilename } from "./title-filename.js";

const dirs: string[] = [];
after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function mkPkg(files: Record<string, string>, slug = "about"): string {
  const root = mkdtempSync(path.join(tmpdir(), "primary-src-"));
  dirs.push(root);
  const pkgDir = path.join(root, slug);
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(
    path.join(pkgDir, "convert.yaml"),
    "formats: [pdf]\n",
    "utf8",
  );
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(path.join(pkgDir, name), body, "utf8");
  }
  return pkgDir;
}

describe("titleToSourceFilename", () => {
  it("slugifies titles into .md filenames", () => {
    assert.equal(titleToSourceFilename("Privacy Policy"), "privacy-policy.md");
    assert.equal(
      titleToSourceFilename("About Infuze Partners"),
      "about-infuze-partners.md",
    );
    assert.equal(
      titleToSourceFilename("SOW #1 — Retained Technology MSP"),
      "sow-1-retained-technology-msp.md",
    );
  });
});

describe("resolvePrimarySourceRel", () => {
  it("prefers legacy document.md when present", () => {
    const pkgDir = mkPkg({
      "document.md": "# Legacy\n",
      "about-infuze-partners.md": "# New\n",
    });
    assert.equal(resolvePrimarySourceRel(pkgDir), "document.md");
  });

  it("returns the only markdown source", () => {
    const pkgDir = mkPkg({ "about-infuze-partners.md": "# About\n" });
    assert.equal(resolvePrimarySourceRel(pkgDir), "about-infuze-partners.md");
  });

  it("prefers a source whose stem matches the package slug", () => {
    const pkgDir = mkPkg(
      {
        "sow-1-retained-technology-msp.md": "# SOW\n",
        "technology-managed-services-agreement.md": "# MSP\n",
      },
      "technology-msp",
    );
    assert.equal(
      resolvePrimarySourceRel(pkgDir, "technology-msp"),
      "technology-managed-services-agreement.md",
    );
  });

  it("ignores reserved navigation files", () => {
    const pkgDir = mkPkg(
      {
        "index.md": "# Nav\n",
        "people.md": "# People\n",
      },
      "people",
    );
    assert.deepEqual(listPackageMarkdownSources(pkgDir), ["people.md"]);
  });
});
