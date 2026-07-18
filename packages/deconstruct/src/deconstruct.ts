import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildRegistry, selectExtractor } from "./extractors/registry.js";
import { formatsForSource, titleFromFilename } from "./formats.js";
import {
  buildFrontmatter,
  descriptionFromBody,
  renderDocumentMd,
  titleFromMetadata,
} from "./frontmatter.js";
import { sha256File } from "./hash.js";
import {
  buildConvertYaml,
  buildDeconstructYaml,
} from "./package-writer.js";
import { defaultRunCommand } from "./run-command.js";
import type { DeconstructOptions, DeconstructResult } from "./types.js";

export function findRepoRoot(startDir: string): string {
  let dir = path.resolve(startDir);
  while (true) {
    if (existsSync(path.join(dir, "deconstruct.extractors.yaml"))) {
      return dir;
    }
    if (existsSync(path.join(dir, "package.json"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return process.cwd();
    dir = parent;
  }
}

function isSupportedFile(filePath: string): boolean {
  const st = statSync(filePath);
  if (!st.isFile()) return false;
  const base = path.basename(filePath);
  if (base.startsWith(".")) return false;
  return true;
}

export function listInputFiles(inputPath: string): string[] {
  const abs = path.resolve(inputPath);
  const st = statSync(abs);
  if (st.isFile()) return [abs];
  if (!st.isDirectory()) {
    throw new Error(`Not a file or directory: ${abs}`);
  }
  const files: string[] = [];
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const full = path.join(abs, entry.name);
    if (isSupportedFile(full)) files.push(full);
  }
  return files.sort((a, b) => a.localeCompare(b));
}

export function resolvePackageDir(
  outDir: string,
  inputFile: string,
  batch: boolean,
): string {
  if (!batch) return path.resolve(outDir);
  const slug = path
    .basename(inputFile, path.extname(inputFile))
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return path.join(path.resolve(outDir), slug || "document");
}

export async function deconstructFile(
  opts: DeconstructOptions & { inputFile: string; batch?: boolean },
): Promise<DeconstructResult> {
  const runCommand = opts.runCommand ?? defaultRunCommand;
  const repoRoot = opts.repoRoot ?? findRepoRoot(process.cwd());
  const registry = buildRegistry({ repoRoot, runCommand });
  const inputFile = path.resolve(opts.inputFile);
  const packageDir = resolvePackageDir(
    opts.outDir,
    inputFile,
    Boolean(opts.batch),
  );

  if (existsSync(packageDir) && !opts.force) {
    const hasPackage =
      existsSync(path.join(packageDir, "document.md")) ||
      existsSync(path.join(packageDir, "deconstruct.yaml"));
    if (hasPackage) {
      throw new Error(
        `Package already exists at ${packageDir}. Pass --force to overwrite generated files (original copy is preserved if unchanged).`,
      );
    }
  }

  const extractor = selectExtractor(
    registry,
    inputFile,
    opts.extractor ?? "auto",
  );

  mkdirSync(packageDir, { recursive: true });
  const originalDir = path.join(packageDir, ".original");
  mkdirSync(originalDir, { recursive: true });

  const originalName = path.basename(inputFile);
  const originalPath = path.join(originalDir, originalName);
  if (!existsSync(originalPath)) {
    copyFileSync(inputFile, originalPath);
  } else if (opts.force) {
    const existingHash = sha256File(originalPath);
    const sourceHash = sha256File(inputFile);
    if (existingHash !== sourceHash) {
      throw new Error(
        `Refusing to overwrite .original/${originalName} with different content. Remove .original manually if intentional.`,
      );
    }
  }

  const sourceHash = sha256File(originalPath);
  const workDir = mkdtempSync(path.join(tmpdir(), "doc-repo-deconstruct-"));
  const sourceFiles: string[] = [];

  try {
    const extracted = await extractor.extract({
      originalPath,
      workDir,
    });

    const originalRel = `.original/${originalName}`;
    const title =
      opts.title ??
      titleFromMetadata(extracted.metadata) ??
      titleFromFilename(inputFile);
    const description = descriptionFromBody(extracted.markdown);
    const frontmatter = buildFrontmatter({
      type: opts.type ?? "Reference",
      title,
      description,
      resource: originalRel,
    });

    writeFileSync(
      path.join(packageDir, "document.md"),
      renderDocumentMd(frontmatter, extracted.markdown),
      "utf8",
    );
    sourceFiles.push("document.md");

    for (const asset of extracted.assets) {
      const dest = path.join(packageDir, asset.relPath);
      mkdirSync(path.dirname(dest), { recursive: true });
      cpSync(asset.absPath, dest);
      sourceFiles.push(asset.relPath);
    }

    writeFileSync(
      path.join(packageDir, "convert.yaml"),
      buildConvertYaml(inputFile, originalRel),
      "utf8",
    );
    sourceFiles.push("convert.yaml");

    const importedAt = new Date().toISOString();
    writeFileSync(
      path.join(packageDir, "deconstruct.yaml"),
      buildDeconstructYaml({
        sourcePath: inputFile,
        originalRel,
        sha256: sourceHash,
        extractor: extractor.name,
        importedAt,
      }),
      "utf8",
    );
    sourceFiles.push("deconstruct.yaml");

    return {
      packageDir,
      originalRel,
      extractor: extractor.name,
      sourceFiles,
    };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

export async function deconstructPaths(
  opts: DeconstructOptions,
): Promise<DeconstructResult[]> {
  const files = listInputFiles(opts.inputPath);
  if (files.length === 0) {
    throw new Error(`No supported files found under ${path.resolve(opts.inputPath)}`);
  }
  const batch = files.length > 1 || statSync(path.resolve(opts.inputPath)).isDirectory();
  const results: DeconstructResult[] = [];
  for (const file of files) {
    results.push(
      await deconstructFile({
        ...opts,
        inputFile: file,
        batch,
      }),
    );
  }
  return results;
}

export { formatsForSource };
