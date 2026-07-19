import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { OutputFormat, parseFormats } from "./formats.js";
import { resolvePrimarySourcePath } from "./primary-source.js";

export const DOCUMENT_FILE = "document.md";
export const CONVERT_CONFIG_FILE = "convert.yaml";
export const DEFAULT_OUT = ".output";

export type UnlistedMode = "individual" | "ignore" | "error";
export type AssetMode = "generate" | "reference";
export type LinkMarkdownMode = "output" | "preserve" | "remove";
export type MissingTargetMode = "warn" | "error" | "preserve";
export type ExternalLinkMode = "preserve";

export type ConvertOptions = {
  toc: boolean;
  cover_page: boolean;
  standalone: boolean;
  /** Package-relative path to a Pandoc --reference-doc (DOCX/PPTX). */
  reference_doc: string | null;
};

export type SourceConfig = {
  include: string[];
  exclude: string[];
  unlisted: UnlistedMode;
};

export type DocumentGroupConfig = {
  name: string;
  sources: string[];
  metadata: Record<string, unknown>;
};

export type AssetsConfig = {
  mode: AssetMode;
  directory: string;
  diagrams: { mermaid: boolean };
  copy_referenced_images: boolean;
};

export type LinksConfig = {
  markdown: LinkMarkdownMode;
  missing_target: MissingTargetMode;
  external: ExternalLinkMode;
};

export type ConvertConfig = {
  out: string;
  formats: OutputFormat[];
  options: ConvertOptions;
  metadata: Record<string, unknown>;
  pandoc_args: string[];
  sources: SourceConfig;
  documents: DocumentGroupConfig[] | null;
  assets: AssetsConfig;
  links: LinksConfig;
};

export type DocumentPackage = {
  dir: string;
  configPath: string;
  slug: string;
  config: ConvertConfig;
  /** Primary concept source (legacy document.md or title-named .md). */
  documentPath: string | null;
};

const DEFAULT_OPTIONS: ConvertOptions = {
  toc: false,
  cover_page: false,
  standalone: true,
  reference_doc: null,
};

const DEFAULT_SOURCES: SourceConfig = {
  include: ["**/*.md"],
  exclude: ["README.md", ".output/**", ".original/**", "**/index.md", "**/log.md"],
  unlisted: "individual",
};

const DEFAULT_ASSETS: AssetsConfig = {
  mode: "reference",
  directory: "assets",
  diagrams: { mermaid: false },
  copy_referenced_images: false,
};

const DEFAULT_LINKS: LinksConfig = {
  markdown: "output",
  missing_target: "warn",
  external: "preserve",
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  return value.map(String);
}

function parseEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
  label: string,
): T {
  if (value === undefined || value === null || value === "") return fallback;
  const v = String(value) as T;
  if (!allowed.includes(v)) {
    throw new Error(
      `Invalid ${label}: ${String(value)}. Allowed: ${allowed.join(", ")}`,
    );
  }
  return v;
}

export function isDocumentPackage(dir: string): boolean {
  return existsSync(path.join(dir, CONVERT_CONFIG_FILE));
}

export function loadConvertConfig(configPath: string): ConvertConfig {
  if (!existsSync(configPath)) {
    throw new Error(`Missing ${CONVERT_CONFIG_FILE}: ${configPath}`);
  }
  const raw = readFileSync(configPath, "utf8");
  const data = (parseYaml(raw) ?? {}) as Record<string, unknown>;

  const out =
    typeof data.out === "string" && data.out.trim()
      ? data.out.trim()
      : DEFAULT_OUT;

  let formats: OutputFormat[] = [];
  if (Array.isArray(data.formats)) {
    formats = parseFormats(data.formats.map(String).join(","));
  } else if (typeof data.formats === "string") {
    formats = parseFormats(data.formats);
  }

  const optRaw = asRecord(data.options);
  const referenceRaw = optRaw.reference_doc;
  const reference_doc =
    typeof referenceRaw === "string" && referenceRaw.trim()
      ? referenceRaw.trim().replaceAll("\\", "/")
      : DEFAULT_OPTIONS.reference_doc;
  const options: ConvertOptions = {
    toc: Boolean(optRaw.toc ?? DEFAULT_OPTIONS.toc),
    cover_page: Boolean(optRaw.cover_page ?? DEFAULT_OPTIONS.cover_page),
    standalone:
      optRaw.standalone === undefined
        ? DEFAULT_OPTIONS.standalone
        : Boolean(optRaw.standalone),
    reference_doc,
  };

  const metadata = asRecord(data.metadata);

  const pandoc_args = Array.isArray(data.pandoc_args)
    ? data.pandoc_args.map(String)
    : [];

  const srcRaw = asRecord(data.sources);
  const sources: SourceConfig = {
    include: asStringArray(srcRaw.include, DEFAULT_SOURCES.include),
    exclude: asStringArray(srcRaw.exclude, DEFAULT_SOURCES.exclude),
    unlisted: parseEnum(
      srcRaw.unlisted,
      ["individual", "ignore", "error"] as const,
      DEFAULT_SOURCES.unlisted,
      "sources.unlisted",
    ),
  };

  let documents: DocumentGroupConfig[] | null = null;
  if (Array.isArray(data.documents)) {
    documents = data.documents.map((item, index) => {
      const row = asRecord(item);
      const name = typeof row.name === "string" ? row.name.trim() : "";
      if (!name) {
        throw new Error(`documents[${index}] is missing a non-empty name`);
      }
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) {
        throw new Error(
          `documents[${index}].name "${name}" must be a safe output basename`,
        );
      }
      const sourceList = asStringArray(row.sources, []);
      if (sourceList.length === 0) {
        throw new Error(`documents[${index}] (${name}) has empty sources`);
      }
      return {
        name,
        sources: sourceList.map((s) => s.replaceAll("\\", "/")),
        metadata: asRecord(row.metadata),
      };
    });
  }

  const assetsRaw = asRecord(data.assets);
  const diagramsRaw = asRecord(assetsRaw.diagrams);
  const assets: AssetsConfig = {
    mode: parseEnum(
      assetsRaw.mode,
      ["generate", "reference"] as const,
      DEFAULT_ASSETS.mode,
      "assets.mode",
    ),
    directory:
      typeof assetsRaw.directory === "string" && assetsRaw.directory.trim()
        ? assetsRaw.directory.trim()
        : DEFAULT_ASSETS.directory,
    diagrams: {
      mermaid: Boolean(diagramsRaw.mermaid ?? DEFAULT_ASSETS.diagrams.mermaid),
    },
    copy_referenced_images: Boolean(
      assetsRaw.copy_referenced_images ?? DEFAULT_ASSETS.copy_referenced_images,
    ),
  };

  const linksRaw = asRecord(data.links);
  const links: LinksConfig = {
    markdown: parseEnum(
      linksRaw.markdown,
      ["output", "preserve", "remove"] as const,
      DEFAULT_LINKS.markdown,
      "links.markdown",
    ),
    missing_target: parseEnum(
      linksRaw.missing_target,
      ["warn", "error", "preserve"] as const,
      DEFAULT_LINKS.missing_target,
      "links.missing_target",
    ),
    external: parseEnum(
      linksRaw.external,
      ["preserve"] as const,
      DEFAULT_LINKS.external,
      "links.external",
    ),
  };

  return {
    out,
    formats,
    options,
    metadata,
    pandoc_args,
    sources,
    documents,
    assets,
    links,
  };
}

export function loadDocumentPackage(dir: string): DocumentPackage {
  const abs = path.resolve(dir);
  const configPath = path.join(abs, CONVERT_CONFIG_FILE);
  if (!existsSync(configPath)) {
    throw new Error(`Not a document package (missing ${CONVERT_CONFIG_FILE}): ${abs}`);
  }
  const primarySource = resolvePrimarySourcePath(abs, path.basename(abs));
  return {
    dir: abs,
    configPath,
    slug: path.basename(abs),
    config: loadConvertConfig(configPath),
    documentPath: primarySource,
  };
}

/** Walk a tree and collect document package directories. */
export function collectDocumentPackages(inputPath: string): DocumentPackage[] {
  const abs = path.resolve(inputPath);
  const st = statSync(abs);

  if (st.isFile()) {
    if (path.basename(abs) === DOCUMENT_FILE || path.basename(abs) === CONVERT_CONFIG_FILE) {
      return [loadDocumentPackage(path.dirname(abs))];
    }
    if (abs.toLowerCase().endsWith(".md")) {
      // A markdown file inside a package: load that package.
      let dir = path.dirname(abs);
      while (true) {
        if (isDocumentPackage(dir)) {
          return [loadDocumentPackage(dir)];
        }
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }
    }
    throw new Error(
      `Expected a document package directory, ${DOCUMENT_FILE}, or ${CONVERT_CONFIG_FILE}, got: ${abs}`,
    );
  }

  if (!st.isDirectory()) {
    throw new Error(`Not a file or directory: ${abs}`);
  }

  if (isDocumentPackage(abs)) {
    return [loadDocumentPackage(abs)];
  }

  const packages: DocumentPackage[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (
        entry.name === "node_modules" ||
        entry.name === ".output" ||
        entry.name === ".original" ||
        entry.name === "dist"
      ) {
        continue;
      }
      const full = path.join(dir, entry.name);
      if (isDocumentPackage(full)) {
        packages.push(loadDocumentPackage(full));
      } else {
        walk(full);
      }
    }
  };
  walk(abs);
  return packages.sort((a, b) => a.dir.localeCompare(b.dir));
}

export function defaultConvertYaml(extra: Partial<{
  formats: string[];
  toc: boolean;
  assetsMode: AssetMode;
  mermaid: boolean;
}> = {}): string {
  const formats = extra.formats ?? ["pdf", "docx"];
  const toc = extra.toc ?? false;
  const assetsMode = extra.assetsMode ?? "reference";
  const mermaid = extra.mermaid ?? false;
  return `out: .output
formats:
${formats.map((f) => `  - ${f}`).join("\n")}
options:
  toc: ${toc}
  cover_page: false
  standalone: true
metadata:
  author: ""
pandoc_args: []
sources:
  include:
    - "**/*.md"
  exclude:
    - README.md
    - ".output/**"
    - ".original/**"
    - "**/index.md"
    - "**/log.md"
  unlisted: individual
assets:
  mode: ${assetsMode}
  directory: assets
  diagrams:
    mermaid: ${mermaid}
  copy_referenced_images: ${assetsMode === "generate"}
links:
  markdown: output
  missing_target: warn
  external: preserve
`;
}
