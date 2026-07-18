import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { prepareSourceAssets, PreparedAsset } from "./assets.js";
import { collectDocumentPackages, DocumentPackage } from "./config.js";
import { EXT, OutputFormat, parseFormats, SUPPORTED_FORMATS } from "./formats.js";
import {
  mergeMetadata,
  okfToPandocMeta,
  parseFrontmatter,
  toPandocMarkdown,
} from "./frontmatter.js";
import {
  buildOutputManifest,
  LinkWarning,
  rewriteMarkdownLinksWithOutDirs,
} from "./links.js";
import {
  LogicalDocument,
  resolveLogicalDocuments,
  sourceAnchorId,
} from "./sources.js";

export { SUPPORTED_FORMATS, parseFormats };
export type { OutputFormat };

export type ConvertOverrides = {
  formats?: OutputFormat[];
  /** When set (CLI --out), resolved relative to cwd and used for all packages. */
  outDir?: string;
};

export type ConvertResult = {
  packageDir: string;
  packageSlug: string;
  documentName: string;
  sources: string[];
  outputs: string[];
  assets: string[];
  warnings: LinkWarning[];
};

export function assertPandocAvailable(): void {
  const result = spawnSync("pandoc", ["--version"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    throw new Error(
      "pandoc was not found on PATH. Install from https://pandoc.org/installing.html",
    );
  }
}

function findKnowledgeRoot(startDir: string): string | null {
  let dir = path.resolve(startDir);
  while (true) {
    const candidate = path.join(dir, "knowledge");
    if (existsSync(candidate)) return candidate;
    // If we are already inside knowledge/, return that root
    if (path.basename(dir) === "knowledge") return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function combineBodies(
  parts: Array<{ relativeSource: string; body: string; title?: string }>,
): string {
  if (parts.length === 1) {
    const only = parts[0];
    const anchor = sourceAnchorId(only.relativeSource);
    return `<a id="${anchor}"></a>\n\n${only.body.trim()}\n`;
  }

  return parts
    .map((part) => {
      const anchor = sourceAnchorId(part.relativeSource);
      const heading = part.title || path.posix.basename(part.relativeSource, ".md");
      return `<a id="${anchor}"></a>\n\n# ${heading}\n\n${part.body.trim()}\n`;
    })
    .join("\n\n");
}

function runPandoc(
  inputMd: string,
  outputFile: string,
  format: OutputFormat,
  pkg: DocumentPackage,
): void {
  const args = [inputMd, "-o", outputFile, "-t", format];
  if (pkg.config.options.toc) args.push("--toc");
  if (format === "html" && pkg.config.options.standalone) {
    args.push("--standalone");
  }
  // Resource path so generated assets resolve
  args.push(`--resource-path=${path.dirname(outputFile)}`);
  for (const extra of pkg.config.pandoc_args) {
    args.push(extra);
  }

  const result = spawnSync("pandoc", args, {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "unknown pandoc error").trim();
    throw new Error(`pandoc failed → ${format}: ${detail}`);
  }
}

export function convertPaths(
  inputPath: string,
  overrides: ConvertOverrides = {},
): ConvertResult[] {
  assertPandocAvailable();
  const packages = collectDocumentPackages(inputPath);
  if (packages.length === 0) {
    throw new Error(
      `No document packages (convert.yaml) found under ${path.resolve(inputPath)}`,
    );
  }

  const docsByPackage = new Map<string, LogicalDocument[]>();
  const outDirByPackage = new Map<string, string>();

  for (const pkg of packages) {
    docsByPackage.set(pkg.dir, resolveLogicalDocuments(pkg));
    const outDir = overrides.outDir
      ? path.resolve(overrides.outDir)
      : path.resolve(pkg.dir, pkg.config.out || ".output");
    outDirByPackage.set(pkg.dir, outDir);
  }

  const manifest = buildOutputManifest(packages, docsByPackage);
  const knowledgeRoot = findKnowledgeRoot(packages[0].dir);
  const results: ConvertResult[] = [];

  for (const pkg of packages) {
    const formats =
      overrides.formats && overrides.formats.length > 0
        ? overrides.formats
        : pkg.config.formats;
    if (!formats || formats.length === 0) {
      throw new Error(
        `No formats configured for ${pkg.dir}. Set formats in convert.yaml or pass --format.`,
      );
    }

    const outDir = outDirByPackage.get(pkg.dir)!;
    mkdirSync(outDir, { recursive: true });
    const docs = docsByPackage.get(pkg.dir)!;

    for (const doc of docs) {
      const warnings: LinkWarning[] = [];
      const preparedParts: Array<{
        relativeSource: string;
        body: string;
        title?: string;
        meta: Record<string, unknown>;
      }> = [];
      const assets: PreparedAsset[] = [];

      for (let i = 0; i < doc.sources.length; i++) {
        const abs = doc.sources[i];
        const rel = doc.relativeSources[i];
        const parsed = parseFrontmatter(readFileSync(abs, "utf8"));
        const prepared = prepareSourceAssets(pkg, rel, parsed.body, outDir);
        assets.push(...prepared.assets);

        preparedParts.push({
          relativeSource: rel,
          body: prepared.body,
          title: typeof parsed.data.title === "string" ? parsed.data.title : undefined,
          meta: okfToPandocMeta(parsed.data),
        });
      }

      // Metadata: first source OKF → package metadata → document group metadata
      const meta = mergeMetadata(
        preparedParts[0]?.meta ?? {},
        pkg.config.metadata,
        doc.metadata,
      );

      const allAssets = [...new Set(assets.map((a) => a.relativePath))];
      const outputs: string[] = [];

      for (const format of formats) {
        const rewrittenParts = preparedParts.map((part) => ({
          ...part,
          body: rewriteMarkdownLinksWithOutDirs(
            part.body,
            pkg,
            part.relativeSource,
            doc,
            format,
            manifest,
            knowledgeRoot,
            outDirByPackage,
            warnings,
          ),
        }));

        const combined = combineBodies(rewrittenParts);
        const pandocMd = toPandocMarkdown(
          combined,
          meta,
          pkg.config.options.cover_page,
        );

        const tempDir = mkdtempSync(path.join(tmpdir(), "doc-repo-convert-"));
        const tempMd = path.join(tempDir, "input.md");
        try {
          writeFileSync(tempMd, pandocMd, "utf8");
          const outputFile = path.join(outDir, `${doc.name}${EXT[format]}`);
          runPandoc(tempMd, outputFile, format, pkg);
          outputs.push(outputFile);
        } finally {
          rmSync(tempDir, { recursive: true, force: true });
        }
      }

      results.push({
        packageDir: pkg.dir,
        packageSlug: pkg.slug,
        documentName: doc.name,
        sources: doc.relativeSources,
        outputs,
        assets: allAssets.map((rel) => path.join(outDir, ...rel.split("/"))),
        warnings,
      });
    }
  }

  return results;
}

/** Exported for tests: resolve docs without converting. */
export function previewLogicalDocuments(pkg: DocumentPackage): LogicalDocument[] {
  return resolveLogicalDocuments(pkg);
}
