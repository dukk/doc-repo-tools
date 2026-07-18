import { formatsForSource } from "./formats.js";

function isDocxPath(filePath: string): boolean {
  return /\.docx$/i.test(filePath);
}

/**
 * Build convert.yaml for a deconstructed package.
 * @param sourcePath Original import path (used for format defaults).
 * @param originalRel Package-relative path under `.original/` (used for reference_doc).
 */
export function buildConvertYaml(
  sourcePath: string,
  originalRel?: string,
): string {
  const formats = formatsForSource(sourcePath);
  const docx =
    isDocxPath(sourcePath) ||
    (typeof originalRel === "string" && isDocxPath(originalRel));
  const referenceDoc =
    docx && originalRel
      ? originalRel.replaceAll("\\", "/")
      : null;
  const referenceLine = referenceDoc
    ? `\n  reference_doc: ${JSON.stringify(referenceDoc)}`
    : "";

  return `out: .output
formats:
${formats.map((f) => `  - ${f}`).join("\n")}
options:
  toc: false
  cover_page: ${docx}
  standalone: true${referenceLine}
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
    - index.md
    - log.md
  unlisted: individual
assets:
  mode: reference
  directory: assets
  diagrams:
    mermaid: false
  copy_referenced_images: false
links:
  markdown: output
  missing_target: warn
  external: preserve
`;
}

export function buildDeconstructYaml(opts: {
  sourcePath: string;
  originalRel: string;
  sha256: string;
  extractor: string;
  importedAt: string;
}): string {
  return `source:
  path: ${JSON.stringify(opts.sourcePath)}
  original: ${JSON.stringify(opts.originalRel)}
  sha256: ${JSON.stringify(opts.sha256)}
extractor: ${JSON.stringify(opts.extractor)}
imported_at: ${JSON.stringify(opts.importedAt)}
`;
}
