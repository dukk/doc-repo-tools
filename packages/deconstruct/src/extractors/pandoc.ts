import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import path from "node:path";
import type { CommandRunner, Extractor, ExtractResult } from "../types.js";

export const PANDOC_EXTENSIONS = new Set([
  ".docx",
  ".doc",
  ".odt",
  ".rtf",
  ".pdf",
  ".html",
  ".htm",
  ".epub",
  ".pptx",
  ".ppt",
  ".md",
  ".markdown",
  ".rst",
  ".tex",
  ".latex",
  ".org",
  ".twiki",
  ".textile",
  ".wiki",
  ".dokuwiki",
  ".csv",
  ".tsv",
  ".ipynb",
  ".jats",
  ".json",
  ".xml",
  ".fb2",
  ".asciidoc",
  ".adoc",
]);

function walkFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

function rewriteMediaLinks(markdown: string): string {
  return markdown
    .replace(/(!\[[^\]]*\]\()\.?\/?media\//g, "$1assets/media/")
    .replace(/(\[[^\]]*\]\()\.?\/?media\//g, "$1assets/media/");
}

export function createPandocExtractor(runCommand: CommandRunner): Extractor {
  return {
    name: "pandoc",
    canHandle(input) {
      const ext = path.extname(input.path).toLowerCase();
      return PANDOC_EXTENSIONS.has(ext);
    },
    async extract(ctx): Promise<ExtractResult> {
      mkdirSync(path.join(ctx.workDir, "media"), { recursive: true });

      const result = await runCommand(
        "pandoc",
        [
          ctx.originalPath,
          "-t",
          "gfm",
          "--wrap=none",
          `--extract-media=${ctx.workDir}`,
        ],
        { cwd: ctx.workDir },
      );

      if (result.code !== 0) {
        throw new Error(
          `pandoc failed (exit ${result.code}): ${result.stderr.trim() || result.stdout.trim() || "unknown error"}`,
        );
      }

      let markdown = result.stdout;
      const assets: ExtractResult["assets"] = [];

      const extractedMedia = path.join(ctx.workDir, "media");
      if (existsSync(extractedMedia) && statSync(extractedMedia).isDirectory()) {
        for (const abs of walkFiles(extractedMedia)) {
          const relInsideMedia = path
            .relative(extractedMedia, abs)
            .split(path.sep)
            .join("/");
          assets.push({
            absPath: abs,
            relPath: `assets/media/${relInsideMedia}`,
          });
        }
        markdown = rewriteMediaLinks(markdown);
      }

      const metaPath = path.join(ctx.workDir, "meta.json");
      let metadata: Record<string, unknown> = {};
      if (existsSync(metaPath)) {
        try {
          metadata = JSON.parse(readFileSync(metaPath, "utf8")) as Record<
            string,
            unknown
          >;
        } catch {
          /* ignore */
        }
      }

      const h1 = markdown.match(/^#\s+(.+)$/m);
      if (h1?.[1] && !metadata.title) {
        metadata.title = h1[1].trim();
      }

      return { markdown, assets, metadata };
    },
  };
}
