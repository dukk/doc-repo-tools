import { formatsForSource } from "./formats.js";

export function buildConvertYaml(sourcePath: string): string {
  const formats = formatsForSource(sourcePath);
  return `out: .output
formats:
${formats.map((f) => `  - ${f}`).join("\n")}
options:
  toc: false
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
