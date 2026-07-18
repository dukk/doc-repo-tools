#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deconstructPaths } from "./deconstruct.js";

export function parseArgs(argv: string[]): {
  input: string;
  outDir: string;
  type: string;
  title: string;
  extractor: string;
  force: boolean;
  help: boolean;
} {
  let outDir = "";
  let type = "Reference";
  let title = "";
  let extractor = "auto";
  let force = false;
  let help = false;
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      help = true;
      continue;
    }
    if (arg === "--out" || arg === "-o") {
      outDir = argv[++i] ?? "";
      continue;
    }
    if (arg === "--type" || arg === "-t") {
      type = argv[++i] ?? type;
      continue;
    }
    if (arg === "--title") {
      title = argv[++i] ?? "";
      continue;
    }
    if (arg === "--extractor" || arg === "-e") {
      extractor = argv[++i] ?? "auto";
      continue;
    }
    if (arg === "--force") {
      force = true;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    positionals.push(arg);
  }

  return {
    input: positionals[0] ?? "",
    outDir,
    type,
    title,
    extractor,
    force,
    help,
  };
}

function printHelp(): void {
  console.log(`doc-deconstruct — import existing documents into OKF packages

Usage:
  doc-deconstruct <file-or-dir> --out <package-dir> [options]

Options:
  --out, -o <dir>       Output package directory (required)
  --type, -t <type>     OKF type (default: Reference)
  --title <title>       Override title (default: from metadata or filename)
  --extractor, -e <name>  auto | pandoc | custom extractor name (default: auto)
  --force               Overwrite generated files (never overwrites .original with different bytes)

Original source is copied verbatim to .original/ inside the package.
Generated: document.md, convert.yaml, deconstruct.yaml, assets/

Examples:
  doc-deconstruct imports/handbook.docx --out knowledge/text-heavy/handbook
  doc-deconstruct imports/ --out knowledge/imported
`);
}

async function main(): Promise<void> {
  const code = await runCli(process.argv.slice(2));
  process.exit(code);
}

export async function runCli(argv: string[]): Promise<number> {
  try {
    const args = parseArgs(argv);
    if (args.help || !args.input || !args.outDir) {
      printHelp();
      return args.help ? 0 : 1;
    }

    const results = await deconstructPaths({
      inputPath: args.input,
      outDir: args.outDir,
      type: args.type,
      title: args.title || undefined,
      extractor: args.extractor,
      force: args.force,
    });

    for (const result of results) {
      console.log(
        `${path.relative(process.cwd(), result.packageDir)} ← ${result.extractor} (${result.originalRel})`,
      );
      for (const file of result.sourceFiles) {
        console.log(`  wrote: ${file}`);
      }
      console.log(
        `  next: doc-convert ${path.relative(process.cwd(), result.packageDir)}`,
      );
    }
    console.log(`Deconstructed ${results.length} package(s).`);
    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    return 1;
  }
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return fileURLToPath(import.meta.url) === path.resolve(entry);
}

if (isDirectRun()) {
  void main();
}
