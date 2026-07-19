import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { CONVERT_CONFIG_FILE, DOCUMENT_FILE } from "./config.js";
import { isOkfReservedMarkdown } from "./okf-reserved.js";

/** List non-reserved Markdown sources at the package root (not nested dirs). */
export function listPackageMarkdownSources(pkgDir: string): string[] {
  if (!existsSync(pkgDir)) return [];
  return readdirSync(pkgDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.toLowerCase().endsWith(".md") &&
        !isOkfReservedMarkdown(entry.name),
    )
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Resolve the primary concept source for a document package directory.
 * Backward compat: legacy `document.md` wins when present.
 */
export function resolvePrimarySourceRel(
  pkgDir: string,
  slug = path.basename(pkgDir),
): string | null {
  const legacy = path.join(pkgDir, DOCUMENT_FILE);
  if (existsSync(legacy)) return DOCUMENT_FILE;

  if (!existsSync(path.join(pkgDir, CONVERT_CONFIG_FILE))) {
    return null;
  }

  const sources = listPackageMarkdownSources(pkgDir);
  if (sources.length === 0) return null;
  if (sources.length === 1) return sources[0]!;

  const slugMatch = sources.find((name) => {
    const stem = name.replace(/\.md$/i, "");
    return stem === slug || stem.startsWith(`${slug}-`);
  });
  if (slugMatch) return slugMatch;

  const secondary = /^sow(-|$|\d)/i;
  const primaryCandidates = sources.filter(
    (name) => !secondary.test(name.replace(/\.md$/i, "")),
  );
  const pool = primaryCandidates.length > 0 ? primaryCandidates : sources;

  return pool[0]!;
}

export function resolvePrimarySourcePath(
  pkgDir: string,
  slug?: string,
): string | null {
  const rel = resolvePrimarySourceRel(pkgDir, slug);
  return rel ? path.join(pkgDir, rel) : null;
}
