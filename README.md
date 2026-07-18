# doc-repo-tools

Tooling for [OKF document repos](https://github.com/dukk/doc-repo-template). This repository publishes **`@dukk/doc-repo-convert`** — convert OKF document packages to **PDF**, **DOCX**, **HTML**, and **PPTX** using Pandoc.

License: [Apache-2.0](LICENSE).

## Install (GitHub Packages)

```bash
# .npmrc (in the consuming project)
@dukk:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

`NODE_AUTH_TOKEN` must be a GitHub PAT (or `gh` token) with `read:packages`.

```bash
pnpm add @dukk/doc-repo-convert
# or
npm install @dukk/doc-repo-convert
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

From a doc-repo template clone, the usual wrapper is `pnpm convert` (invokes `doc-convert`).

## Document package

```
my-doc/
  convert.yaml          # required
  document.md           # classic single-source package
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
  exclude: ["README.md", ".output/**", "index.md", "log.md"]
  unlisted: individual   # individual | ignore | error

documents:
  - name: handbook
    sources: [intro.md, body.md, appendix.md]
    metadata:
      title: Team handbook

options:
  toc: false
  cover_page: false
  standalone: true

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

Reserved navigation files (`index.md`, `log.md`) are not document packages and are skipped when walking a tree.

## Develop

```bash
pnpm install
pnpm build
pnpm test
```

### Local link into a sibling template

When working next to [doc-repo-template](https://github.com/dukk/doc-repo-template) in the multi-root workspace:

```bash
# in doc-repo-tools
pnpm build
pnpm link --global

# in doc-repo-template
pnpm link --global @dukk/doc-repo-convert
```

Or temporarily set `"@dukk/doc-repo-convert": "link:../doc-repo-tools"` in the template `package.json` (do not commit that override).

## Publish

```bash
pnpm publish
```

Publishes to `https://npm.pkg.github.com` as `@dukk/doc-repo-convert`. Requires a token with `write:packages`.

## Next

A one-command scaffold (`npx` / similar) that initializes a full doc-repo directory tree from this tooling is planned; today, clone [doc-repo-template](https://github.com/dukk/doc-repo-template) and run `pnpm init-repo`.
