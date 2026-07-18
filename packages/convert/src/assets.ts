import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DocumentPackage } from "./config.js";

export type PreparedAsset = {
  /** Absolute path of generated/copied artifact in outDir. */
  outputPath: string;
  /** Relative posix path from outDir. */
  relativePath: string;
  kind: "image" | "mermaid";
};

const IMAGE_MD_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const MERMAID_FENCE_RE = /```mermaid\r?\n([\s\S]*?)```/gi;

function toPosix(p: string): string {
  return p.replaceAll("\\", "/");
}

function isExternal(href: string): boolean {
  return /^(https?:|mailto:|data:|#)/i.test(href);
}

function slugify(input: string): string {
  return input
    .replace(/\.md$/i, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "diagram";
}

function runShell(bin: string, args: string[]): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const command = [bin, ...args]
    .map((part) => {
      if (process.platform === "win32") {
        return /[\s"&<>|^%]/.test(part) ? `"${part.replaceAll('"', '""')}"` : part;
      }
      return /[^A-Za-z0-9_./:=+-]/.test(part)
        ? `'${part.replaceAll("'", `'\\''`)}'`
        : part;
    })
    .join(" ");
  const result = spawnSync(command, {
    encoding: "utf8",
    shell: true,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function resolveMmdc(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const binName = process.platform === "win32" ? "mmdc.cmd" : "mmdc";
  const candidates = [
    path.resolve(here, "..", "node_modules", ".bin", binName),
    path.resolve(process.cwd(), "tools/convert/node_modules/.bin", binName),
    path.resolve(process.cwd(), "node_modules/.bin", binName),
    "mmdc",
  ];
  for (const candidate of candidates) {
    if (candidate === "mmdc" || existsSync(candidate)) {
      const result = runShell(candidate, ["--version"]);
      if (result.status === 0) return candidate;
    }
  }
  throw new Error(
    "Mermaid CLI (mmdc) was not found. It is provided by @mermaid-js/mermaid-cli in this workspace. " +
      "Run `pnpm install`, ensure puppeteer build scripts are approved if needed, " +
      "or disable assets.diagrams.mermaid / set assets.mode to reference.",
  );
}

let cachedMmdc: string | null = null;

export function assertMermaidAvailable(): void {
  if (mermaidRenderHook) {
    cachedMmdc = "mock-mmdc";
    return;
  }
  cachedMmdc = resolveMmdc();
}

let mermaidRenderHook: ((code: string, outputSvg: string) => void) | null = null;

/** Test hook: bypass mmdc when set. */
export function setMermaidRenderHook(
  hook: ((code: string, outputSvg: string) => void) | null,
): void {
  mermaidRenderHook = hook;
  cachedMmdc = hook ? "mock-mmdc" : null;
}

function renderMermaid(source: string, outputSvg: string): void {
  if (mermaidRenderHook) {
    mkdirSync(path.dirname(outputSvg), { recursive: true });
    mermaidRenderHook(source, outputSvg);
    return;
  }
  mkdirSync(path.dirname(outputSvg), { recursive: true });
  const tmpMmd = `${outputSvg}.mmd`;
  writeFileSync(tmpMmd, source, "utf8");
  const bin = cachedMmdc ?? resolveMmdc();
  cachedMmdc = bin;
  const result = runShell(bin, ["-i", tmpMmd, "-o", outputSvg, "-b", "transparent"]);
  if (result.status !== 0) {
    throw new Error(
      `Mermaid render failed for ${outputSvg}: ${(result.stderr || result.stdout || "unknown error").trim()}`,
    );
  }
}

/**
 * Prepare assets for a single source markdown body.
 * Returns rewritten body and list of artifacts written under outDir.
 */
export function prepareSourceAssets(
  pkg: DocumentPackage,
  relativeSource: string,
  body: string,
  outDir: string,
): { body: string; assets: PreparedAsset[] } {
  if (pkg.config.assets.mode !== "generate") {
    return { body, assets: [] };
  }

  const assets: PreparedAsset[] = [];
  const assetDir = pkg.config.assets.directory;
  let next = body;
  const sourceDir = path.dirname(path.resolve(pkg.dir, relativeSource));

  if (pkg.config.assets.copy_referenced_images) {
    next = next.replace(IMAGE_MD_RE, (full, alt: string, hrefRaw: string) => {
      const href = hrefRaw.trim().replace(/^<|>$/g, "");
      if (isExternal(href)) return full;
      const abs = path.resolve(sourceDir, href);
      if (!existsSync(abs)) {
        return full;
      }
      const safeName = toPosix(path.relative(pkg.dir, abs))
        .replace(/[^A-Za-z0-9._/-]+/g, "-")
        .replace(/^-+/, "");
      const relOut = toPosix(path.posix.join(assetDir, "images", safeName));
      const outPath = path.join(outDir, ...relOut.split("/"));
      mkdirSync(path.dirname(outPath), { recursive: true });
      copyFileSync(abs, outPath);
      assets.push({
        outputPath: outPath,
        relativePath: relOut,
        kind: "image",
      });
      return `![${alt}](${relOut})`;
    });
  }

  if (pkg.config.assets.diagrams.mermaid) {
    assertMermaidAvailable();
    let diagramIndex = 0;
    next = next.replace(MERMAID_FENCE_RE, (_full, code: string) => {
      diagramIndex += 1;
      const base = `${slugify(relativeSource)}-${diagramIndex}`;
      const relOut = toPosix(path.posix.join(assetDir, "diagrams", `${base}.svg`));
      const outPath = path.join(outDir, ...relOut.split("/"));
      renderMermaid(code.trim() + "\n", outPath);
      assets.push({
        outputPath: outPath,
        relativePath: relOut,
        kind: "mermaid",
      });
      return `![Diagram ${diagramIndex}](${relOut})`;
    });
  }

  return { body: next, assets };
}

/** Utility for tests: extract image hrefs from markdown. */
export function collectImageHrefs(markdown: string): string[] {
  const hrefs: string[] = [];
  for (const match of markdown.matchAll(IMAGE_MD_RE)) {
    hrefs.push(match[2].trim().replace(/^<|>$/g, ""));
  }
  return hrefs;
}

/** Read package-relative source for asset path resolution helpers. */
export function readUtf8(filePath: string): string {
  return readFileSync(filePath, "utf8");
}
