import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type { CommandRunner, Extractor, ExtractorsFile } from "../types.js";
import { createCustomExtractor } from "./custom.js";
import { createPandocExtractor } from "./pandoc.js";

export function loadCustomExtractorConfigs(
  repoRoot: string,
): ExtractorsFile["extractors"] {
  const configPath = path.join(repoRoot, "deconstruct.extractors.yaml");
  if (!existsSync(configPath)) return [];
  const raw = readFileSync(configPath, "utf8");
  const parsed = (parseYaml(raw) ?? {}) as ExtractorsFile;
  return parsed.extractors ?? [];
}

export function buildRegistry(opts: {
  repoRoot: string;
  runCommand: CommandRunner;
}): Extractor[] {
  const customs = (loadCustomExtractorConfigs(opts.repoRoot) ?? []).map((cfg) =>
    createCustomExtractor(cfg, opts.runCommand),
  );
  return [...customs, createPandocExtractor(opts.runCommand)];
}

export function selectExtractor(
  registry: Extractor[],
  inputPath: string,
  preferred?: string,
): Extractor {
  if (preferred && preferred !== "auto") {
    const forced = registry.find((e) => e.name === preferred);
    if (!forced) {
      const names = registry.map((e) => e.name).join(", ");
      throw new Error(
        `Unknown extractor "${preferred}". Available: ${names || "(none)"}`,
      );
    }
    return forced;
  }

  const match = registry.find((e) => e.canHandle({ path: inputPath }));
  if (!match) {
    throw new Error(
      `No extractor can handle "${inputPath}". Register a custom extractor in deconstruct.extractors.yaml or use --extractor pandoc to force Pandoc.`,
    );
  }
  return match;
}
