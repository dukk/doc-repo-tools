#!/usr/bin/env node
import path from "node:path";
import { convertPaths, parseFormats, SUPPORTED_FORMATS } from "./convert.js";

function printHelp(): void {
  console.log(`doc-convert — export OKF document packages via Pandoc

Usage:
  doc-convert <package-or-tree> [--format <fmt[,fmt...]>] [--out <dir>]

Each document package is a directory with convert.yaml and one or more Markdown sources.
convert.yaml controls:
  - documents[]     named outputs with ordered source lists
  - sources.*       include/exclude globs and unlisted policy
  - assets.*        generate/copy image + Mermaid artifacts before Pandoc
  - links.*         rewrite .md links to output artifacts / anchors

Formats: ${SUPPORTED_FORMATS.join(", ")}

--format and --out override convert.yaml when provided.
If --format is omitted, formats from each package's convert.yaml are used.
Default out (from convert.yaml): .output relative to the package directory.

Examples:
  doc-convert knowledge/text-heavy/operating-model
  doc-convert knowledge/text-and-diagrams --format pdf
  doc-convert knowledge/diagrams/system-map --out .output
`);
}

function parseArgs(argv: string[]): {
  formats: string;
  outDir: string | undefined;
  input: string;
  help: boolean;
} {
  let formats = "";
  let outDir: string | undefined;
  let help = false;
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      help = true;
      continue;
    }
    if (arg === "--format" || arg === "-f") {
      formats = argv[++i] ?? "";
      continue;
    }
    if (arg === "--out" || arg === "-o") {
      outDir = argv[++i] ?? ".output";
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    positionals.push(arg);
  }

  return {
    formats,
    outDir,
    input: positionals[0] ?? "",
    help,
  };
}

function main(): void {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help || !args.input) {
      printHelp();
      process.exit(args.help ? 0 : 1);
    }

    const overrides: {
      formats?: ReturnType<typeof parseFormats>;
      outDir?: string;
    } = {};
    if (args.formats) {
      overrides.formats = parseFormats(args.formats);
    }
    if (args.outDir !== undefined) {
      overrides.outDir = args.outDir;
    }

    const results = convertPaths(args.input, overrides);
    let warnCount = 0;

    for (const result of results) {
      console.log(
        `${path.relative(process.cwd(), result.packageDir)} → ${result.documentName} (${result.sources.length} source(s))`,
      );
      for (const src of result.sources) {
        console.log(`    source: ${src}`);
      }
      for (const output of result.outputs) {
        console.log(`  → ${path.relative(process.cwd(), output)}`);
      }
      for (const asset of result.assets) {
        console.log(`  asset → ${path.relative(process.cwd(), asset)}`);
      }
      for (const warning of result.warnings) {
        warnCount += 1;
        console.warn(`  warn: ${warning.source}: ${warning.message}`);
      }
    }
    console.log(
      `Converted ${results.length} logical document(s)${warnCount ? ` with ${warnCount} warning(s)` : ""}.`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    process.exit(1);
  }
}

main();
