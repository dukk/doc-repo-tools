# doc-repo-tools

Tooling for [OKF document repos](https://github.com/dukk/doc-repo-template). This monorepo publishes:

| Package | CLI | Role |
|---------|-----|------|
| `@dukk/doc-repo-convert` | `doc-convert` | Export OKF packages → PDF, DOCX, HTML, PPTX |
| `@dukk/doc-repo-deconstruct` | `doc-deconstruct` | Import existing documents → OKF Markdown packages |

License: [Apache-2.0](LICENSE).

## Install (GitHub Packages)

```bash
# .npmrc (in the consuming project)
@dukk:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

`NODE_AUTH_TOKEN` must be a GitHub PAT (or `gh` token) with `read:packages`.

```bash
pnpm add @dukk/doc-repo-convert @dukk/doc-repo-deconstruct
```

## Prerequisites

- Node.js 20+
- [Pandoc](https://pandoc.org/installing.html) on your `PATH`
- Optional: [Mermaid CLI](https://github.com/mermaid-js/mermaid-cli) (`mmdc`) when generating Mermaid diagram assets

## Usage

```bash
# Formats/out/documents from each package's convert.yaml
doc-convert knowledge/text-heavy/operating-model

# Override formats
doc-convert --format pdf knowledge/text-and-diagrams/

# Convert every package under a tree
doc-convert knowledge/

# Override output directory (cwd-relative)
doc-convert knowledge/diagrams/system-map --out .output
```

From a doc-repo template clone, the usual wrappers are `pnpm convert` and `pnpm deconstruct`.

## Deconstruct existing documents

Import legacy sources into maintainable OKF packages. Originals are copied verbatim to `.original/` inside each package.

```bash
doc-deconstruct imports/handbook.docx --out knowledge/text-heavy/handbook
doc-deconstruct imports/ --out knowledge/imported
doc-deconstruct source.docx --out knowledge/foo --type Policy --force
```

Register custom extractors in repo-root `deconstruct.extractors.yaml` (see [`deconstruct.extractors.yaml`](deconstruct.extractors.yaml)). Built-in Pandoc extraction runs when no custom matcher applies.

## Document package

```
my-doc/
  convert.yaml          # required
  operating-model.md    # title-named single-source package (kebab-case from title)
  # — or —
  intro.md              # multi-source package
  body.md
  appendix.md
```

### `convert.yaml`

```yaml
out: .output
formats: [pdf, docx, html]

sources:
  include: ["**/*.md"]
  exclude: ["README.md", ".output/**", "**/index.md", "**/log.md"]
  unlisted: individual   # individual | ignore | error

documents:
  - name: handbook
    sources: [intro.md, body.md, appendix.md]
    metadata:
      title: Team handbook

options:
  toc: false
  cover_page: false          # title page + page break when true
  standalone: true
  reference_doc: null        # package-relative path; --reference-doc for docx/pptx (headers/footers/styles)

metadata:
  author: ""

assets:
  mode: generate         # generate | reference
  directory: assets
  diagrams:
    mermaid: true
  copy_referenced_images: true

links:
  markdown: output       # output | preserve | remove
  missing_target: warn   # warn | error | preserve
  external: preserve

pandoc_args: []
```

Reserved OKF navigation files (`index.md`, `log.md`) are always excluded from auto-discovery by basename at any depth. They are not document packages and are skipped when walking a tree. Include them only via explicit `documents[].sources` entries.

## Develop

```bash
pnpm install
pnpm build
pnpm test
pnpm test:coverage   # enforces ≥80% lines/branches/functions/statements (c8)
```

Packages live under `packages/convert` and `packages/deconstruct`. CI runs `pnpm test:coverage` on every push/PR.

### Local link into a sibling template

When working next to [doc-repo-template](https://github.com/dukk/doc-repo-template) in the multi-root workspace:

```bash
# in doc-repo-tools
pnpm build
pnpm link --global

# in doc-repo-template
pnpm link --global @dukk/doc-repo-convert @dukk/doc-repo-deconstruct
```

Or temporarily set workspace links in the template `package.json` (do not commit):

```json
"@dukk/doc-repo-convert": "link:../doc-repo-tools/packages/convert",
"@dukk/doc-repo-deconstruct": "link:../doc-repo-tools/packages/deconstruct"
```

## Publish

```bash
pnpm -r publish
```

Publishes both packages to `https://npm.pkg.github.com`. Requires a token with `write:packages`.
