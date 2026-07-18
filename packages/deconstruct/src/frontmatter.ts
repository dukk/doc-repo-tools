import { stringify as stringifyYaml } from "yaml";

export type OkfFrontmatter = {
  type: string;
  title: string;
  description: string;
  tags: string[];
  timestamp: string;
  status: string;
  audience?: string;
  resource: string;
};

const DESCRIPTION_MAX = 240;

export function descriptionFromBody(body: string): string {
  const text = body
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "")
    .replace(/^#{1,6}\s+.*$/gm, "")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[[^\]]*\]\([^)]+\)/g, "$1")
    .trim();

  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const first = paragraphs[0] ?? "";
  if (!first) return "";
  if (first.length <= DESCRIPTION_MAX) return first;
  return `${first.slice(0, DESCRIPTION_MAX - 1).trimEnd()}…`;
}

export function buildFrontmatter(opts: {
  type: string;
  title: string;
  description: string;
  resource: string;
  timestamp?: string;
  tags?: string[];
}): OkfFrontmatter {
  const tags = [...(opts.tags ?? ["deconstructed"])];
  if (!tags.includes("deconstructed")) tags.unshift("deconstructed");
  return {
    type: opts.type,
    title: opts.title,
    description: opts.description,
    tags,
    timestamp: opts.timestamp ?? new Date().toISOString(),
    status: "draft",
    resource: opts.resource,
  };
}

export function renderDocumentMd(
  frontmatter: OkfFrontmatter,
  body: string,
): string {
  const fm = stringifyYaml(frontmatter, {
    lineWidth: 0,
    defaultKeyType: "PLAIN",
    defaultStringType: "PLAIN",
  }).trimEnd();
  const cleaned = body
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "")
    .trimStart();
  return `---\n${fm}\n---\n\n${cleaned}`;
}

export function titleFromMetadata(
  metadata: Record<string, unknown>,
): string | undefined {
  for (const key of ["title", "Title"]) {
    const v = metadata[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}
