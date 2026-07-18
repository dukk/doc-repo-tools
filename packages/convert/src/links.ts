import { existsSync } from "node:fs";
import path from "node:path";
import { DocumentPackage } from "./config.js";
import { EXT, OutputFormat } from "./formats.js";
import { LogicalDocument, sourceAnchorId } from "./sources.js";

export type SourceLocation = {
  packageSlug: string;
  packageDir: string;
  relativeSource: string;
  documentName: string;
  /** True when this source is one of several in a combined document. */
  combined: boolean;
};

export type OutputManifest = {
  /** key: absolute normalized source path */
  bySourcePath: Map<string, SourceLocation>;
  /** key: packageDir|relativeSource (posix) */
  byPackageRel: Map<string, SourceLocation>;
};

export type LinkWarning = {
  source: string;
  href: string;
  message: string;
};

const MD_LINK_RE = /(?<!!)\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

function toPosix(p: string): string {
  return p.replaceAll("\\", "/");
}

function normalizeAbs(p: string): string {
  return path.normalize(path.resolve(p));
}

function isExternal(href: string): boolean {
  return /^(https?:|mailto:)/i.test(href);
}

function stripHash(href: string): { target: string; hash: string } {
  const idx = href.indexOf("#");
  if (idx === -1) return { target: href, hash: "" };
  return { target: href.slice(0, idx), hash: href.slice(idx) };
}

export function buildOutputManifest(
  packages: DocumentPackage[],
  docsByPackage: Map<string, LogicalDocument[]>,
): OutputManifest {
  const bySourcePath = new Map<string, SourceLocation>();
  const byPackageRel = new Map<string, SourceLocation>();

  for (const pkg of packages) {
    const docs = docsByPackage.get(pkg.dir) ?? [];
    for (const doc of docs) {
      const combined = doc.sources.length > 1;
      for (let i = 0; i < doc.sources.length; i++) {
        const abs = normalizeAbs(doc.sources[i]);
        const rel = toPosix(doc.relativeSources[i]);
        const loc: SourceLocation = {
          packageSlug: pkg.slug,
          packageDir: pkg.dir,
          relativeSource: rel,
          documentName: doc.name,
          combined,
        };
        bySourcePath.set(abs, loc);
        byPackageRel.set(`${normalizeAbs(pkg.dir)}|${rel}`, loc);
      }
    }
  }

  return { bySourcePath, byPackageRel };
}

function resolveMdTarget(
  fromPkg: DocumentPackage,
  fromRelSource: string,
  hrefTarget: string,
  knowledgeRoot: string | null,
  manifest: OutputManifest,
): { abs: string | null; loc: SourceLocation | null } {
  let candidate: string;
  if (hrefTarget.startsWith("/")) {
    if (!knowledgeRoot) {
      return { abs: null, loc: null };
    }
    candidate = path.resolve(knowledgeRoot, hrefTarget.replace(/^\//, ""));
  } else {
    const fromDir = path.dirname(path.resolve(fromPkg.dir, fromRelSource));
    candidate = path.resolve(fromDir, hrefTarget);
  }

  if (!candidate.toLowerCase().endsWith(".md")) {
    // Directory link → document.md
    const asDoc = path.join(candidate, "document.md");
    if (existsSync(asDoc)) {
      candidate = asDoc;
    } else if (!existsSync(candidate)) {
      return { abs: null, loc: null };
    }
  }

  const abs = normalizeAbs(candidate);
  const loc = manifest.bySourcePath.get(abs) ?? null;
  return { abs, loc };
}

/**
 * Rewrite markdown links in a source body for a specific output format.
 */
export function rewriteMarkdownLinksWithOutDirs(
  markdown: string,
  fromPkg: DocumentPackage,
  fromRelSource: string,
  fromDoc: LogicalDocument,
  format: OutputFormat,
  manifest: OutputManifest,
  knowledgeRoot: string | null,
  outDirByPackage: Map<string, string>,
  warnings: LinkWarning[],
): string {
  const policy = fromPkg.config.links;
  if (policy.markdown === "preserve") {
    return markdown;
  }

  return markdown.replace(MD_LINK_RE, (full, text: string, hrefRaw: string) => {
    const href = hrefRaw.trim().replace(/^<|>$/g, "");
    if (!href || href.startsWith("#")) return full;
    if (isExternal(href)) return full;

    const { target, hash } = stripHash(href);
    if (!target) return full;

    const looksMd =
      target.toLowerCase().endsWith(".md") ||
      target.endsWith("/") ||
      (!path.extname(target) && !target.includes("://"));
    if (!looksMd) return full;

    if (policy.markdown === "remove") {
      return text;
    }

    const { loc } = resolveMdTarget(
      fromPkg,
      fromRelSource,
      target,
      knowledgeRoot,
      manifest,
    );

    if (!loc) {
      const message = `unresolved markdown link target: ${href}`;
      if (policy.missing_target === "error") {
        throw new Error(`${fromRelSource}: ${message}`);
      }
      if (policy.missing_target === "warn") {
        warnings.push({ source: fromRelSource, href, message });
      }
      return full;
    }

    if (loc.packageDir === fromPkg.dir && loc.documentName === fromDoc.name) {
      if (loc.relativeSource === fromRelSource && hash) {
        return `[${text}](${hash})`;
      }
      const anchor = hash || `#${sourceAnchorId(loc.relativeSource)}`;
      const normalized = anchor.startsWith("#") ? anchor : `#${anchor}`;
      return `[${text}](${normalized})`;
    }

    const outName = `${loc.documentName}${EXT[format]}`;
    const fromOut = outDirByPackage.get(fromPkg.dir);
    const toOut = outDirByPackage.get(loc.packageDir);
    let linkTarget = outName;
    if (fromOut && toOut) {
      linkTarget = toPosix(path.relative(fromOut, path.join(toOut, outName))) || outName;
    }
    return `[${text}](${linkTarget}${hash})`;
  });
}
