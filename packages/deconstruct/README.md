# @dukk/doc-repo-deconstruct

Import existing documents into OKF **document packages** with originals preserved under `.original/`.

## Usage

```bash
doc-deconstruct <file-or-dir> --out <package-dir> [options]
```

Options: `--type`, `--title`, `--extractor auto|pandoc|<name>`, `--force`.

## Output layout

```
my-doc/
  .original/source.docx
  deconstruct.yaml
  <title-slug>.md
  convert.yaml
  assets/…
```

## Custom extractors

See repo-root [`deconstruct.extractors.yaml`](../../deconstruct.extractors.yaml).
