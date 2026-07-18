import { parse as parseYaml } from "yaml";

export type OkfFrontmatter = {
  type?: string;
  title?: string;
  description?: string;
  tags?: string[];
  timestamp?: string;
  status?: string;
  audience?: string;
  resource?: string;
  [key: string]: unknown;
};

export type ParsedDocument = {
  data: OkfFrontmatter;
  body: string;
  raw: string;
};

export function parseFrontmatter(raw: string): ParsedDocument {
  if (!raw.startsWith("---\n") && !raw.startsWith("---\r\n")) {
    return { data: {}, body: raw, raw };
  }

  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { data: {}, body: raw, raw };
  }

  const yamlBlock = match[1] ?? "";
  const body = match[2] ?? "";
  const data = (parseYaml(yamlBlock) ?? {}) as OkfFrontmatter;
  return { data, body, raw };
}

function formatYamlValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((v) => `  - ${JSON.stringify(String(v))}`).join("\n");
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(String(value));
}

export function mergeMetadata(
  ...layers: Array<Record<string, unknown> | OkfFrontmatter>
): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  for (const layer of layers) {
    for (const [key, value] of Object.entries(layer)) {
      if (value === undefined || value === null || value === "") continue;
      meta[key] = value;
    }
  }
  return meta;
}

export function okfToPandocMeta(data: OkfFrontmatter): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  if (data.title) meta.title = data.title;
  if (data.description) meta.subtitle = data.description;
  if (data.timestamp) meta.date = data.timestamp;
  if (Array.isArray(data.tags) && data.tags.length > 0) {
    meta.keywords = data.tags;
  }
  return meta;
}

/** Build a temporary Markdown file body with Pandoc-friendly YAML metadata. */
export function toPandocMarkdown(
  body: string,
  meta: Record<string, unknown>,
  coverPage = false,
): string {
  let nextBody = body;
  if (coverPage) {
    const title = String(meta.title ?? "Untitled");
    const subtitle = meta.subtitle ? String(meta.subtitle) : "";
    const date = meta.date ? String(meta.date) : "";
    const author = meta.author ? String(meta.author) : "";
    const coverLines = [
      `# ${title}`,
      "",
      ...(subtitle ? [`*${subtitle}*`, ""] : []),
      ...(author ? [`Author: ${author}`, ""] : []),
      ...(date ? [`Date: ${date}`, ""] : []),
      "---",
      "",
    ];
    nextBody = `${coverLines.join("\n")}${nextBody}`;
  }

  if (Object.keys(meta).length === 0) {
    return nextBody;
  }

  const yaml = Object.entries(meta)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return `${key}:\n${formatYamlValue(value)}`;
      }
      return `${key}: ${formatYamlValue(value)}`;
    })
    .join("\n");

  return `---\n${yaml}\n---\n\n${nextBody}`;
}
