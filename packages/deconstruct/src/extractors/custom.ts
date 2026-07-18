import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type {
  CommandRunner,
  CustomExtractorConfig,
  Extractor,
  ExtractResult,
} from "../types.js";

export function matchGlob(pattern: string, filePath: string): boolean {
  const base = path.basename(filePath);
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  const re = new RegExp(`^${escaped}$`, "i");
  return re.test(base) || re.test(filePath.replaceAll("\\", "/"));
}

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

function expandTemplate(
  parts: string[],
  vars: Record<string, string>,
): string[] {
  return parts.map((part) => {
    let out = part;
    for (const [key, value] of Object.entries(vars)) {
      out = out.replaceAll(`{{${key}}}`, value);
    }
    return out;
  });
}

export function createCustomExtractor(
  config: CustomExtractorConfig,
  runCommand: CommandRunner,
): Extractor {
  return {
    name: config.name,
    canHandle(input) {
      return config.match.some((p) => matchGlob(p, input.path));
    },
    async extract(ctx): Promise<ExtractResult> {
      const vars = {
        input: ctx.originalPath,
        workDir: ctx.workDir,
        original: ctx.originalPath,
      };
      const expanded = expandTemplate(config.command, vars);
      if (expanded.length === 0) {
        throw new Error(`Custom extractor "${config.name}" has empty command`);
      }
      const [command, ...args] = expanded;
      const result = await runCommand(command!, args, { cwd: ctx.workDir });
      if (result.code !== 0) {
        throw new Error(
          `Extractor "${config.name}" failed (exit ${result.code}): ${result.stderr.trim() || result.stdout.trim() || "unknown error"}`,
        );
      }

      const docPath = path.join(ctx.workDir, "document.md");
      let markdown = "";
      if (existsSync(docPath)) {
        markdown = readFileSync(docPath, "utf8");
      } else {
        markdown = result.stdout;
      }

      if (!markdown.trim()) {
        throw new Error(
          `Extractor "${config.name}" produced empty markdown (write workDir/document.md or print to stdout)`,
        );
      }

      const assetsDir = path.join(ctx.workDir, "assets");
      const assets: ExtractResult["assets"] = [];
      if (existsSync(assetsDir)) {
        for (const abs of walkFiles(assetsDir)) {
          const rel = path.relative(ctx.workDir, abs).split(path.sep).join("/");
          assets.push({ absPath: abs, relPath: rel });
        }
      }

      return { markdown, assets, metadata: {} };
    },
  };
}
