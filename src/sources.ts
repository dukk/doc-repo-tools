import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  DOCUMENT_FILE,
  DocumentGroupConfig,
  DocumentPackage,
} from "./config.js";

export type LogicalDocument = {
  name: string;
  /** Absolute source paths in order. */
  sources: string[];
  /** Package-relative posix paths in order. */
  relativeSources: string[];
  metadata: Record<string, unknown>;
};

function toPosix(p: string): string {
  return p.replaceAll("\\", "/");
}

function escapeRegex(s: string): string {
  return s.replace(/[.+^${}()|[\]\\]/g, "\\$&");
}

/** Convert a simple glob (`*`, `**`, `?`) to a RegExp matching posix relative paths. */
export function globToRegExp(pattern: string): RegExp {
  const posix = toPosix(pattern);
  let re = "^";
  for (let i = 0; i < posix.length; i++) {
    const ch = posix[i];
    if (ch === "*" && posix[i + 1] === "*") {
      re += ".*";
      i++;
      if (posix[i + 1] === "/") i++;
      continue;
    }
    if (ch === "*") {
      re += "[^/]*";
      continue;
    }
    if (ch === "?") {
      re += "[^/]";
      continue;
    }
    re += escapeRegex(ch);
  }
  re += "$";
  return new RegExp(re, "i");
}

function walkFiles(dir: string, root: string): string[] {
  /** @type {string[]} */
  const files: string[] = [];
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".output" || entry.name === "node_modules" || entry.name === "dist") {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(full, root));
    } else if (entry.isFile()) {
      files.push(toPosix(path.relative(root, full)));
    }
  }
  return files;
}

export function discoverMarkdownSources(pkg: DocumentPackage): string[] {
  const all = walkFiles(pkg.dir, pkg.dir);
  const include = pkg.config.sources.include.map(globToRegExp);
  const exclude = pkg.config.sources.exclude.map(globToRegExp);

  return all
    .filter((rel) => rel.toLowerCase().endsWith(".md"))
    .filter((rel) => include.some((re) => re.test(rel)))
    .filter((rel) => !exclude.some((re) => re.test(rel)))
    .sort((a, b) => a.localeCompare(b));
}

function resolveListedSource(
  pkg: DocumentPackage,
  listed: string,
  available: Set<string>,
): string {
  const normalized = toPosix(listed).replace(/^\.\//, "");
  if (!available.has(normalized)) {
    const abs = path.resolve(pkg.dir, normalized);
    if (!existsSync(abs) || !statSync(abs).isFile()) {
      throw new Error(
        `Configured source not found in package ${pkg.slug}: ${normalized}`,
      );
    }
  }
  const abs = path.resolve(pkg.dir, normalized);
  const rel = toPosix(path.relative(pkg.dir, abs));
  if (rel.startsWith("..")) {
    throw new Error(
      `Configured source escapes package directory ${pkg.slug}: ${listed}`,
    );
  }
  return rel;
}

function stemName(relPath: string): string {
  const base = path.posix.basename(relPath);
  return base.replace(/\.md$/i, "");
}

function safeOutputName(name: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) {
    throw new Error(`Unsafe output name: ${name}`);
  }
  return name;
}

/**
 * Resolve logical documents for a package.
 * When `documents` is omitted:
 * - if document.md exists → one document named after the package slug
 * - otherwise treat discovered sources via unlisted policy
 */
export function resolveLogicalDocuments(pkg: DocumentPackage): LogicalDocument[] {
  const discovered = discoverMarkdownSources(pkg);
  const available = new Set(discovered);
  const claimed = new Map<string, string>();
  const docs: LogicalDocument[] = [];

  const addDoc = (
    name: string,
    relativeSources: string[],
    metadata: Record<string, unknown>,
  ) => {
    const safe = safeOutputName(name);
    if (docs.some((d) => d.name === safe)) {
      throw new Error(`Duplicate output document name in ${pkg.slug}: ${safe}`);
    }
    for (const rel of relativeSources) {
      if (claimed.has(rel)) {
        throw new Error(
          `Source ${rel} belongs to both "${claimed.get(rel)}" and "${safe}" in ${pkg.slug}`,
        );
      }
      claimed.set(rel, safe);
    }
    docs.push({
      name: safe,
      relativeSources,
      sources: relativeSources.map((rel) => path.resolve(pkg.dir, rel)),
      metadata,
    });
  };

  if (pkg.config.documents && pkg.config.documents.length > 0) {
    for (const group of pkg.config.documents as DocumentGroupConfig[]) {
      const rels = group.sources.map((s) =>
        resolveListedSource(pkg, s, available),
      );
      addDoc(group.name, rels, group.metadata);
    }
  } else if (pkg.documentPath) {
    const rel = toPosix(path.relative(pkg.dir, pkg.documentPath));
    addDoc(pkg.slug, [rel || DOCUMENT_FILE], {});
  } else if (discovered.length === 1) {
    addDoc(pkg.slug, [discovered[0]], {});
  }

  const unlisted = discovered.filter((rel) => !claimed.has(rel));
  if (unlisted.length > 0) {
    const mode = pkg.config.sources.unlisted;
    if (mode === "error") {
      throw new Error(
        `Unlisted markdown sources in ${pkg.slug}: ${unlisted.join(", ")}. ` +
          `Add them to documents[], or set sources.unlisted to individual/ignore.`,
      );
    }
    if (mode === "individual") {
      for (const rel of unlisted) {
        addDoc(stemName(rel), [rel], {});
      }
    }
    // ignore → drop
  }

  if (docs.length === 0) {
    throw new Error(
      `No logical documents resolved for package ${pkg.slug}. ` +
        `Add document.md, configure documents[], or include markdown sources.`,
    );
  }

  return docs;
}

/** Stable HTML/Pandoc-friendly anchor for a source file within a combined document. */
export function sourceAnchorId(relativeSource: string): string {
  return `src-${toPosix(relativeSource)
    .replace(/\.md$/i, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()}`;
}
